import { fullDeck, shuffle } from './cards';
import { evaluate } from './evaluate';
import { isColorId } from './palette';
import {
  type ActionKind,
  type ApplyResult,
  type Command,
  type Ctx,
  type Hand,
  type HandPlayer,
  type HandResult,
  type LegalActions,
  type LogEntry,
  type Pot,
  type PotResult,
  type PreAction,
  type RejectCode,
  type Seat,
  type TableConfig,
  type TableState,
  LOG_LIMIT,
  MAX_SEATS,
  MIN_SEATS,
  MISSED_TURNS_TO_SIT_OUT,
} from './types';

export const NAME_MAX = 16;
export const PHRASE_MAX = 40;
const TABLE_NAME_MAX = 24;

class Reject extends Error {
  constructor(
    readonly code: RejectCode,
    message: string,
  ) {
    super(message);
  }
}

function fail(code: RejectCode, message: string): never {
  throw new Reject(code, message);
}

export interface HostInfo {
  name: string;
  color: string;
  phrase: string;
}

export function validateConfig(config: TableConfig): string | null {
  const ints: (keyof TableConfig)[] = [
    'smallBlind',
    'bigBlind',
    'buyIn',
    'turnTimerMs',
    'maxSeats',
    'undoMs',
    'handPauseMs',
  ];
  for (const k of ints) {
    const v = config[k];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) return `${k} must be a non-negative integer`;
  }
  if (typeof config.name !== 'string' || !config.name.trim() || config.name.trim().length > TABLE_NAME_MAX)
    return `name must be 1-${TABLE_NAME_MAX} characters`;
  if (config.smallBlind < 1 || config.bigBlind < config.smallBlind)
    return 'blinds must satisfy 1 <= small <= big';
  if (config.buyIn < config.bigBlind * 10) return 'buy-in must be at least 10 big blinds';
  if (config.maxSeats < MIN_SEATS || config.maxSeats > MAX_SEATS)
    return `seats must be ${MIN_SEATS}-${MAX_SEATS}`;
  if (config.turnTimerMs < 1000) return 'turn timer must be at least one second';
  return null;
}

function cleanName(raw: unknown, max: number, field: string): string {
  if (typeof raw !== 'string') fail('bad_command', `${field} is required`);
  const v = raw.trim().replace(/\s+/g, ' ');
  if (!v) fail('bad_command', `${field} is required`);
  if (v.length > max) fail('bad_command', `${field} must be at most ${max} characters`);
  return v;
}

function cleanPhrase(raw: unknown): string {
  if (raw == null || raw === '') return '';
  if (typeof raw !== 'string') fail('bad_command', 'catchphrase must be text');
  const v = raw.trim().replace(/\s+/g, ' ');
  if (v.length > PHRASE_MAX) fail('bad_command', `catchphrase must be at most ${PHRASE_MAX} characters`);
  return v;
}

function cleanColor(raw: unknown): string {
  if (!isColorId(raw)) fail('bad_command', 'color must be one of the palette colors');
  return raw;
}

export function createTable(config: TableConfig, host: HostInfo, now: number): TableState {
  const problem = validateConfig(config);
  if (problem) throw new Error(problem);
  const seat: Seat = {
    seat: 0,
    name: cleanName(host.name, NAME_MAX, 'name'),
    color: cleanColor(host.color),
    phrase: cleanPhrase(host.phrase),
    stack: config.buyIn,
    status: 'active',
    missedTurns: 0,
    buyIns: 1,
    left: false,
  };
  return {
    v: 1,
    config: { ...config, name: config.name.trim() },
    phase: 'lobby',
    createdAt: now,
    seats: [seat],
    hostSeat: 0,
    handNo: 0,
    button: -1,
    hand: null,
    nextDealAt: null,
    pending: null,
    pre: {},
    secret: { deck: [], hole: {} },
    log: [{ k: 'seat', at: now, seat: 0, verb: 'joined' }],
    standings: null,
    handsPlayed: 0,
    biggestPot: null,
  };
}

// ---------- small helpers ----------

export function presentSeats(s: TableState): Seat[] {
  return s.seats.filter((x) => !x.left);
}

function seatOf(s: TableState, seat: number): Seat {
  const x = s.seats[seat];
  if (!x) throw new Error(`No seat ${seat}`);
  return x;
}

function canBeDealt(x: Seat): boolean {
  return !x.left && x.status === 'active' && x.stack > 0;
}

/** Still has chips at stake in the hand being played (an all-in player has a zero stack but is not out). */
function inLiveHand(s: TableState, seat: number): boolean {
  const hand = s.hand;
  if (!hand || hand.street === 'over') return false;
  const p = hand.players.find((x) => x.seat === seat);
  return !!p && !p.folded;
}

function playerOf(hand: Hand, seat: number): HandPlayer | undefined {
  return hand.players.find((p) => p.seat === seat);
}

/** Seat numbers in clockwise order starting just after `from` (wrapping), filtered. */
function clockwiseFrom(s: TableState, from: number, include: (seat: number) => boolean): number[] {
  const n = s.seats.length;
  const out: number[] = [];
  for (let i = 1; i <= n; i++) {
    const seat = (((from + i) % n) + n) % n;
    if (include(seat)) out.push(seat);
  }
  return out;
}

function pushLog(s: TableState, entries: LogEntry[], e: LogEntry): void {
  s.log.push(e);
  entries.push(e);
  if (s.log.length > LOG_LIMIT) s.log.splice(0, s.log.length - LOG_LIMIT);
}

function inBetting(hand: Hand | null): hand is Hand {
  return (
    !!hand &&
    (hand.street === 'preflop' || hand.street === 'flop' || hand.street === 'turn' || hand.street === 'river')
  );
}

// ---------- legality ----------

export function legalActions(s: TableState, seat: number): LegalActions | null {
  const hand = s.hand;
  if (s.phase !== 'playing' || !inBetting(hand) || hand.toAct !== seat) return null;
  const p = playerOf(hand, seat);
  if (!p || p.folded || p.allIn) return null;
  const stack = seatOf(s, seat).stack;
  const toCall = Math.max(0, hand.currentBet - p.bet);
  const maxTo = p.bet + stack;
  const reopened = !p.acted || p.actedAtRaise < hand.fullRaiseId;
  const out: LegalActions = {
    canFold: true,
    canCheck: toCall === 0,
    canCall: toCall > 0,
    callAmount: Math.min(toCall, stack),
    canBet: false,
    canRaise: false,
    minTo: 0,
    maxTo,
  };
  if (hand.currentBet === 0) {
    out.canBet = stack > 0;
    out.minTo = Math.min(s.config.bigBlind, maxTo);
  } else {
    out.canRaise = reopened && maxTo > hand.currentBet;
    out.minTo = Math.min(hand.currentBet + hand.minRaise, maxTo);
  }
  return out;
}

function checkLegal(
  s: TableState,
  seat: number,
  action: ActionKind,
  amount: number | undefined,
): number | null {
  const legal = legalActions(s, seat);
  if (!legal) fail('not_your_turn', 'It is not your turn');
  switch (action) {
    case 'fold':
      return null;
    case 'check':
      if (!legal.canCheck) fail('illegal_action', 'You cannot check facing a bet');
      return null;
    case 'call':
      if (!legal.canCall) fail('illegal_action', 'There is nothing to call');
      return null;
    case 'bet':
    case 'raise': {
      const ok = action === 'bet' ? legal.canBet : legal.canRaise;
      if (!ok) fail('illegal_action', action === 'bet' ? 'You cannot bet now' : 'You cannot raise now');
      if (typeof amount !== 'number' || !Number.isInteger(amount))
        fail('bad_command', 'amount must be an integer');
      if (amount < legal.minTo || amount > legal.maxTo)
        fail(
          'illegal_action',
          `${action === 'bet' ? 'Bet' : 'Raise'} must be between $${legal.minTo} and $${legal.maxTo}`,
        );
      return amount;
    }
    case 'allin': {
      const hand = s.hand!;
      const raises = legal.maxTo > hand.currentBet;
      if (raises && !(legal.canRaise || legal.canBet)) fail('illegal_action', 'Betting is not open to you');
      return legal.maxTo;
    }
    default:
      fail('bad_command', 'Unknown action');
  }
}

// ---------- the hand ----------

interface Run {
  s: TableState;
  ctx: Ctx;
  entries: LogEntry[];
}

function maybeScheduleDeal(s: TableState, now: number): void {
  if (s.phase !== 'playing' || s.nextDealAt !== null) return;
  if (s.hand && s.hand.street !== 'over') return;
  if (presentSeats(s).filter(canBeDealt).length < 2) return;
  const after = s.hand?.overAt != null ? s.hand.overAt + s.config.handPauseMs : now;
  s.nextDealAt = Math.max(now, after);
}

function startHand(run: Run): void {
  const { s, ctx } = run;
  s.nextDealAt = null;
  const eligible = s.seats.filter(canBeDealt).map((x) => x.seat);
  if (eligible.length < 2) {
    return;
  }
  const isEligible = (seat: number) => eligible.includes(seat);
  const button = s.button < 0 ? eligible[0]! : clockwiseFrom(s, s.button, isEligible)[0]!;
  const headsUp = eligible.length === 2;
  const afterButton = clockwiseFrom(s, button, isEligible);
  const sbSeat = headsUp ? button : afterButton[0]!;
  const bbSeat = headsUp ? afterButton[0]! : afterButton[1]!;

  s.handNo += 1;
  s.button = button;
  s.pending = null;
  s.pre = {};
  const deck = shuffle(fullDeck(), ctx.randomInt);
  const hole: Record<number, string[]> = {};
  const dealOrder = clockwiseFrom(s, button, isEligible);
  for (let round = 0; round < 2; round++) {
    for (const seat of dealOrder) (hole[seat] ??= []).push(deck.pop()!);
  }
  s.secret = { deck, hole };

  const hand: Hand = {
    no: s.handNo,
    button,
    smallBlindSeat: sbSeat,
    bigBlindSeat: bbSeat,
    street: 'preflop',
    board: [],
    players: eligible.map((seat) => ({
      seat,
      bet: 0,
      committed: 0,
      folded: false,
      allIn: false,
      acted: false,
      actedAtRaise: -1,
      lastAction: null,
    })),
    pot: 0,
    currentBet: s.config.bigBlind,
    minRaise: s.config.bigBlind,
    fullRaiseId: 0,
    toAct: null,
    turnStartedAt: null,
    deadlineAt: null,
    result: null,
    overAt: null,
  };
  s.hand = hand;
  pushLog(s, run.entries, { k: 'hand', at: ctx.now, no: hand.no });
  postBlind(run, sbSeat, s.config.smallBlind, 'SB');
  postBlind(run, bbSeat, s.config.bigBlind, 'BB');

  // Preflop action starts left of the big blind; heads-up the button (small blind) acts first.
  const first = nextToAct(s, hand, bbSeat);
  if (first === null) streetComplete(run);
  else beginTurn(run, first);
}

function postBlind(run: Run, seat: number, amount: number, label: string): void {
  const { s } = run;
  const hand = s.hand!;
  const p = playerOf(hand, seat)!;
  const x = seatOf(s, seat);
  const paid = Math.min(amount, x.stack);
  x.stack -= paid;
  p.bet += paid;
  p.committed += paid;
  if (x.stack === 0) p.allIn = true;
  p.lastAction = label;
  pushLog(s, run.entries, { k: 'act', at: run.ctx.now, seat, verb: 'posted', amount: paid, tag: null });
}

/** Next seat after `from` that still owes an action this street, or null. */
function nextToAct(s: TableState, hand: Hand, from: number): number | null {
  const order = clockwiseFrom(s, from, (seat) => !!playerOf(hand, seat));
  for (const seat of order) {
    const p = playerOf(hand, seat)!;
    if (p.folded || p.allIn) continue;
    if (!p.acted || p.bet < hand.currentBet) return seat;
  }
  return null;
}

function beginTurn(run: Run, seat: number): void {
  const { s, ctx } = run;
  const hand = s.hand!;
  hand.toAct = seat;
  hand.turnStartedAt = ctx.now;
  hand.deadlineAt = ctx.now + s.config.turnTimerMs;
  const x = seatOf(s, seat);
  const legal = legalActions(s, seat)!;

  // Players who left or are sitting out never hold up the table.
  if (x.left || x.status !== 'active') {
    commit(run, seat, legal.canCheck ? 'check' : 'fold', null, 'away');
    return;
  }

  const pre = s.pre[seat];
  if (pre) {
    const action = resolvePre(pre, legal);
    delete s.pre[seat];
    if (action) {
      s.pending = {
        seat,
        action,
        amount: null,
        submittedAt: ctx.now,
        commitAt: ctx.now + s.config.undoMs,
        auto: true,
      };
      if (s.config.undoMs === 0) commitPending(run);
    }
  }
}

function resolvePre(pre: PreAction, legal: LegalActions): ActionKind | null {
  switch (pre) {
    case 'check':
      return legal.canCheck ? 'check' : null;
    case 'checkFold':
      return legal.canCheck ? 'check' : 'fold';
    case 'callAny':
      return legal.canCheck ? 'check' : 'call';
  }
}

type CommitKind = 'manual' | 'pre' | 'timer' | 'away';

function commitPending(run: Run): void {
  const pending = run.s.pending!;
  run.s.pending = null;
  commit(run, pending.seat, pending.action, pending.amount, pending.auto ? 'pre' : 'manual');
}

function putChips(s: TableState, p: HandPlayer, chips: number): void {
  const x = seatOf(s, p.seat);
  const paid = Math.min(chips, x.stack);
  x.stack -= paid;
  p.bet += paid;
  p.committed += paid;
  if (x.stack === 0) p.allIn = true;
}

/** Applies an already-validated action, logs it and moves the hand on. */
function commit(run: Run, seat: number, action: ActionKind, amount: number | null, kind: CommitKind): void {
  const { s, ctx } = run;
  const hand = s.hand!;
  const p = playerOf(hand, seat)!;
  const x = seatOf(s, seat);
  let verb: string;
  let logAmount: number | null = null;

  const raiseTo = (to: number) => {
    const increment = to - hand.currentBet;
    putChips(s, p, to - p.bet);
    if (increment >= hand.minRaise) {
      hand.minRaise = increment;
      hand.fullRaiseId += 1;
    }
    hand.currentBet = Math.max(hand.currentBet, to);
  };

  switch (action) {
    case 'fold':
      p.folded = true;
      verb = 'folded';
      p.lastAction = 'Fold';
      break;
    case 'check':
      verb = 'checked';
      p.lastAction = 'Check';
      break;
    case 'call': {
      const before = p.bet;
      putChips(s, p, hand.currentBet - p.bet);
      logAmount = p.bet - before;
      verb = p.allIn ? 'called all in' : 'called';
      p.lastAction = p.allIn ? 'All in' : 'Call';
      break;
    }
    case 'bet':
    case 'raise':
    case 'allin': {
      const to = action === 'allin' ? p.bet + x.stack : amount!;
      if (to <= hand.currentBet) {
        // An all-in that doesn't exceed the current bet is a call for less.
        const before = p.bet;
        putChips(s, p, to - p.bet);
        logAmount = p.bet - before;
        verb = 'called all in';
        p.lastAction = 'All in';
      } else {
        const wasOpen = hand.currentBet === 0;
        raiseTo(to);
        logAmount = to;
        verb = p.allIn ? 'went all in' : wasOpen ? 'bet' : 'raised to';
        p.lastAction = p.allIn ? 'All in' : wasOpen ? `Bet $${to}` : `Raise $${to}`;
      }
      break;
    }
  }

  p.acted = true;
  p.actedAtRaise = hand.fullRaiseId;
  delete s.pre[seat];
  if (s.pending?.seat === seat) s.pending = null;

  if (kind === 'timer') {
    x.missedTurns += 1;
  } else if (kind === 'manual' || kind === 'pre') {
    x.missedTurns = 0;
  }
  const tag = kind === 'timer' ? 'timer' : kind === 'manual' ? null : 'auto';
  pushLog(s, run.entries, { k: 'act', at: ctx.now, seat, verb, amount: logAmount, tag });

  if (kind === 'timer' && x.missedTurns >= MISSED_TURNS_TO_SIT_OUT && x.status === 'active') {
    x.status = 'sittingOut';
    pushLog(s, run.entries, { k: 'seat', at: ctx.now, seat, verb: 'sat out' });
  }

  advance(run, seat);
}

function advance(run: Run, from: number): void {
  const { s } = run;
  const hand = s.hand!;
  const live = hand.players.filter((p) => !p.folded);
  if (live.length === 1) {
    settle(run, false);
    return;
  }
  const next = nextToAct(s, hand, from);
  if (next !== null) beginTurn(run, next);
  else streetComplete(run);
}

function collectBets(hand: Hand): void {
  for (const p of hand.players) {
    hand.pot += p.bet;
    p.bet = 0;
    p.acted = false;
    p.actedAtRaise = -1;
  }
  hand.currentBet = 0;
}

function dealStreet(run: Run): void {
  const { s, ctx } = run;
  const hand = s.hand!;
  const deck = s.secret.deck;
  const next = hand.street === 'preflop' ? 'flop' : hand.street === 'flop' ? 'turn' : 'river';
  deck.pop(); // burn
  const count = next === 'flop' ? 3 : 1;
  const cards: string[] = [];
  for (let i = 0; i < count; i++) cards.push(deck.pop()!);
  hand.board.push(...cards);
  hand.street = next;
  pushLog(s, run.entries, { k: 'board', at: ctx.now, street: next, cards });
}

function streetComplete(run: Run): void {
  const { s } = run;
  const hand = s.hand!;
  collectBets(hand);
  hand.minRaise = s.config.bigBlind;
  hand.toAct = null;
  hand.turnStartedAt = null;
  hand.deadlineAt = null;
  s.pre = {};
  if (hand.street === 'river') {
    settle(run, true);
    return;
  }
  dealStreet(run);
  const canAct = hand.players.filter((p) => !p.folded && !p.allIn);
  if (canAct.length <= 1) {
    // Nobody left to bet against: run the board out.
    while ((hand.street as string) !== 'river') dealStreet(run);
    settle(run, true);
    return;
  }
  const first = nextToAct(s, hand, hand.button);
  if (first === null) streetComplete(run);
  else beginTurn(run, first);
}

/** Side pots from each player's total commitment. Only players still in can win a pot. */
export function computePots(players: readonly HandPlayer[]): Pot[] {
  const live = players.filter((p) => !p.folded);
  const levels = [...new Set(live.map((p) => p.committed))].sort((a, b) => a - b);
  const pots: Pot[] = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const p of players) amount += Math.min(p.committed, level) - Math.min(p.committed, prev);
    const eligible = live.filter((p) => p.committed >= level).map((p) => p.seat);
    if (amount > 0) {
      const last = pots[pots.length - 1];
      if (
        last &&
        last.eligible.length === eligible.length &&
        last.eligible.every((x, i) => x === eligible[i])
      )
        last.amount += amount;
      else pots.push({ amount, eligible });
    }
    prev = level;
  }
  // Chips folded players put in above the top live level (cannot happen after the uncalled refund, but keep chips safe).
  const top = levels[levels.length - 1] ?? 0;
  const extra = players.reduce((sum, p) => sum + Math.max(0, p.committed - top), 0);
  if (extra > 0 && pots.length) pots[pots.length - 1]!.amount += extra;
  return pots;
}

function settle(run: Run, showdown: boolean): void {
  const { s, ctx } = run;
  const hand = s.hand!;
  // Return the part of the biggest commitment that nobody matched.
  const sorted = hand.players.map((p) => p.committed).sort((a, b) => b - a);
  let uncalled: HandResult['uncalled'] = null;
  const topPlayer = hand.players.find((p) => p.committed === sorted[0]);
  if (topPlayer && sorted.length > 1 && sorted[0]! > sorted[1]!) {
    const diff = sorted[0]! - sorted[1]!;
    topPlayer.committed -= diff;
    if (topPlayer.bet >= diff) topPlayer.bet -= diff;
    else {
      hand.pot -= diff - topPlayer.bet;
      topPlayer.bet = 0;
    }
    seatOf(s, topPlayer.seat).stack += diff;
    if (seatOf(s, topPlayer.seat).stack > 0) topPlayer.allIn = false;
    uncalled = { seat: topPlayer.seat, amount: diff };
  }
  collectBets(hand);

  const pots = computePots(hand.players);
  const live = hand.players.filter((p) => !p.folded);
  const evals = new Map<number, ReturnType<typeof evaluate>>();
  if (showdown) {
    for (const p of live) evals.set(p.seat, evaluate([...s.secret.hole[p.seat]!, ...hand.board]));
  }
  const oddChipOrder = clockwiseFrom(s, hand.button, () => true);
  const won: Record<number, number> = {};
  const potResults: PotResult[] = [];
  for (const pot of pots) {
    let winners: number[];
    if (!showdown) winners = pot.eligible;
    else {
      const best = Math.max(...pot.eligible.map((seat) => evals.get(seat)!.score));
      winners = pot.eligible.filter((seat) => evals.get(seat)!.score === best);
    }
    winners.sort((a, b) => oddChipOrder.indexOf(a) - oddChipOrder.indexOf(b));
    const share = Math.floor(pot.amount / winners.length);
    let remainder = pot.amount - share * winners.length;
    for (const seat of winners) {
      const extra = remainder > 0 ? 1 : 0;
      remainder -= extra;
      won[seat] = (won[seat] ?? 0) + share + extra;
    }
    potResults.push({
      amount: pot.amount,
      winners,
      label: showdown ? evals.get(winners[0]!)!.label : null,
    });
  }
  for (const [seat, amount] of Object.entries(won)) seatOf(s, Number(seat)).stack += amount;

  const shown: Record<number, string[]> = {};
  const best: Record<number, string[]> = {};
  const labels: Record<number, string> = {};
  if (showdown) {
    for (const p of live) {
      shown[p.seat] = s.secret.hole[p.seat]!.slice();
      const e = evals.get(p.seat)!;
      best[p.seat] = e.best;
      labels[p.seat] = e.label;
    }
  }
  hand.result = { pots: potResults, won, shown, best, labels, uncalled };
  hand.pot = 0;
  hand.street = 'over';
  hand.toAct = null;
  hand.turnStartedAt = null;
  hand.deadlineAt = null;
  hand.overAt = ctx.now;
  s.pending = null;
  s.pre = {};

  const total = potResults.reduce((sum, p) => sum + p.amount, 0);
  s.handsPlayed += 1;
  const topWinner = Object.entries(won).sort((a, b) => b[1] - a[1])[0];
  if (topWinner && (!s.biggestPot || total > s.biggestPot.amount))
    s.biggestPot = { seat: Number(topWinner[0]), amount: total };

  for (const [seatKey, amount] of Object.entries(won)) {
    const seat = Number(seatKey);
    pushLog(s, run.entries, {
      k: 'result',
      at: ctx.now,
      seat,
      amount,
      label: showdown ? labels[seat]! : null,
      shown: showdown ? shown[seat]! : null,
    });
  }
  for (const p of hand.players) {
    const x = seatOf(s, p.seat);
    if (x.stack === 0 && !x.left && x.status !== 'busted') {
      x.status = 'busted';
      pushLog(s, run.entries, { k: 'seat', at: ctx.now, seat: p.seat, verb: 'busted' });
    }
  }
  s.nextDealAt = null;
  maybeScheduleDeal(s, ctx.now);
}

function voidHand(s: TableState): void {
  const hand = s.hand;
  if (!hand || hand.street === 'over') return;
  for (const p of hand.players) seatOf(s, p.seat).stack += p.committed;
  s.hand = null;
  s.pending = null;
  s.pre = {};
}

function computeStandings(s: TableState) {
  return s.seats
    .map((x) => ({
      seat: x.seat,
      name: x.name,
      color: x.color,
      phrase: x.phrase,
      stack: x.stack,
      buyIns: x.buyIns,
      net: x.stack - x.buyIns * s.config.buyIn,
    }))
    .sort((a, b) => b.net - a.net || a.seat - b.seat);
}

function passHost(run: Run, leaving: number): void {
  const { s } = run;
  if (s.hostSeat !== leaving) return;
  const next = clockwiseFrom(s, leaving, (seat) => !seatOf(s, seat).left)[0];
  if (next === undefined || next === leaving) return;
  s.hostSeat = next;
  pushLog(s, run.entries, { k: 'host', at: run.ctx.now, seat: next });
}

// ---------- commands ----------

function requireSeat(s: TableState, actor: number | null): Seat {
  if (actor === null || !s.seats[actor] || s.seats[actor]!.left)
    fail('not_seated', 'You are not seated at this table');
  return s.seats[actor]!;
}

function requireHost(s: TableState, actor: number | null): void {
  requireSeat(s, actor);
  if (actor !== s.hostSeat) fail('not_host', 'Only the host can do that');
}

function runTick(run: Run): void {
  const { s, ctx } = run;
  for (let guard = 0; guard < 64; guard++) {
    if (s.phase !== 'playing') return;
    const hand = s.hand;
    if (s.pending && s.pending.commitAt <= ctx.now) {
      commitPending(run);
      continue;
    }
    if (
      inBetting(hand) &&
      hand.toAct !== null &&
      !s.pending &&
      hand.deadlineAt !== null &&
      hand.deadlineAt <= ctx.now
    ) {
      const legal = legalActions(s, hand.toAct)!;
      commit(run, hand.toAct, legal.canCheck ? 'check' : 'fold', null, 'timer');
      continue;
    }
    if (s.nextDealAt !== null && s.nextDealAt <= ctx.now) {
      startHand(run);
      continue;
    }
    return;
  }
}

function applyCommand(run: Run, cmd: Command, actor: number | null): number | undefined {
  const { s, ctx } = run;
  if (s.phase === 'ended' && cmd.type !== 'tick') fail('wrong_phase', 'This game has ended');

  switch (cmd.type) {
    case 'join': {
      if (actor !== null) fail('bad_command', 'Already seated');
      const name = cleanName(cmd.name, NAME_MAX, 'name');
      const color = cleanColor(cmd.color);
      const phrase = cleanPhrase(cmd.phrase);
      const present = presentSeats(s);
      if (present.length >= s.config.maxSeats) fail('table_full', 'This table is full');
      if (present.some((x) => x.name.toLowerCase() === name.toLowerCase()))
        fail('name_taken', 'Someone here already has that name');
      if (present.some((x) => x.color === color)) fail('color_taken', 'That color is taken');
      const seat = s.seats.length;
      s.seats.push({
        seat,
        name,
        color,
        phrase,
        stack: s.config.buyIn,
        status: 'active',
        missedTurns: 0,
        buyIns: 1,
        left: false,
      });
      pushLog(s, run.entries, { k: 'seat', at: ctx.now, seat, verb: 'joined' });
      maybeScheduleDeal(s, ctx.now);
      return seat;
    }
    case 'start': {
      requireHost(s, actor);
      if (s.phase !== 'lobby') fail('wrong_phase', 'The game has already started');
      if (presentSeats(s).filter(canBeDealt).length < MIN_SEATS)
        fail('not_enough_players', 'Need at least 2 players');
      s.phase = 'playing';
      startHand(run);
      return undefined;
    }
    case 'act': {
      requireSeat(s, actor);
      if (s.pending)
        fail(
          'illegal_action',
          s.pending.seat === actor ? 'Undo your last move first' : 'It is not your turn',
        );
      const amount = checkLegal(s, actor!, cmd.action, cmd.amount);
      s.pending = {
        seat: actor!,
        action: cmd.action,
        amount,
        submittedAt: ctx.now,
        commitAt: ctx.now + s.config.undoMs,
        auto: false,
      };
      if (s.config.undoMs === 0) commitPending(run);
      return undefined;
    }
    case 'undo': {
      requireSeat(s, actor);
      if (!s.pending || s.pending.seat !== actor) fail('nothing_to_undo', 'Nothing to undo');
      if (ctx.now >= s.pending.commitAt) fail('too_late', 'That move already went through');
      s.pending = null;
      return undefined;
    }
    case 'setPre': {
      requireSeat(s, actor);
      const hand = s.hand;
      if (cmd.pre !== null && cmd.pre !== 'check' && cmd.pre !== 'checkFold' && cmd.pre !== 'callAny')
        fail('bad_command', 'Unknown pre-action');
      if (cmd.pre === null) {
        delete s.pre[actor!];
        return undefined;
      }
      const p = inBetting(hand) ? playerOf(hand, actor!) : undefined;
      if (!p || p.folded || p.allIn) fail('illegal_action', 'You are not in this hand');
      if (hand!.toAct === actor) fail('illegal_action', 'It is already your turn');
      s.pre[actor!] = cmd.pre;
      return undefined;
    }
    case 'rebuy': {
      const x = requireSeat(s, actor);
      if (x.stack > 0 || inLiveHand(s, x.seat)) fail('not_busted', 'You still have chips in play');
      x.stack += s.config.buyIn;
      x.buyIns += 1;
      x.status = 'active';
      x.missedTurns = 0;
      pushLog(s, run.entries, { k: 'seat', at: ctx.now, seat: x.seat, verb: 'rebought' });
      maybeScheduleDeal(s, ctx.now);
      return undefined;
    }
    case 'sitOut': {
      const x = requireSeat(s, actor);
      if (x.status !== 'active') return undefined;
      x.status = 'sittingOut';
      pushLog(s, run.entries, { k: 'seat', at: ctx.now, seat: x.seat, verb: 'sat out' });
      const hand = s.hand;
      if (inBetting(hand) && hand.toAct === x.seat && !s.pending) {
        const legal = legalActions(s, x.seat)!;
        commit(run, x.seat, legal.canCheck ? 'check' : 'fold', null, 'away');
      }
      return undefined;
    }
    case 'sitIn': {
      const x = requireSeat(s, actor);
      if (x.status !== 'sittingOut') return undefined;
      x.status = x.stack > 0 || inLiveHand(s, x.seat) ? 'active' : 'busted';
      x.missedTurns = 0;
      pushLog(s, run.entries, { k: 'seat', at: ctx.now, seat: x.seat, verb: 'is back' });
      maybeScheduleDeal(s, ctx.now);
      return undefined;
    }
    case 'leave': {
      const x = requireSeat(s, actor);
      x.left = true;
      delete s.pre[x.seat];
      pushLog(s, run.entries, { k: 'seat', at: ctx.now, seat: x.seat, verb: 'left' });
      passHost(run, x.seat);
      const hand = s.hand;
      if (inBetting(hand)) {
        const p = playerOf(hand, x.seat);
        if (p && !p.folded && hand.toAct === x.seat) {
          if (s.pending?.seat === x.seat) s.pending = null;
          commit(run, x.seat, 'fold', null, 'away');
        }
      }
      return undefined;
    }
    case 'kick': {
      requireHost(s, actor);
      if (s.phase !== 'lobby') fail('wrong_phase', 'Players can only be removed before the game starts');
      const target = s.seats[cmd.seat];
      if (!target || target.left || cmd.seat === s.hostSeat) fail('bad_command', 'No such guest');
      target.left = true;
      pushLog(s, run.entries, { k: 'seat', at: ctx.now, seat: target.seat, verb: 'left' });
      return undefined;
    }
    case 'transferHost': {
      requireHost(s, actor);
      const target = s.seats[cmd.seat];
      if (!target || target.left) fail('bad_command', 'No such player');
      s.hostSeat = target.seat;
      pushLog(s, run.entries, { k: 'host', at: ctx.now, seat: target.seat });
      return undefined;
    }
    case 'endGame': {
      requireHost(s, actor);
      voidHand(s);
      s.phase = 'ended';
      s.nextDealAt = null;
      s.pending = null;
      s.pre = {};
      s.standings = computeStandings(s);
      pushLog(s, run.entries, { k: 'ended', at: ctx.now, seat: actor! });
      return undefined;
    }
    case 'tick':
      return undefined;
    default:
      fail('bad_command', 'Unknown command');
  }
}

/**
 * The one way table state changes. Pure: returns a new state and the log entries the change produced.
 * Every command first settles anything that fell due (undo commits, timeouts, deals) so the table
 * is never acted on in a stale state.
 */
export function apply(state: TableState, cmd: Command, actor: number | null, ctx: Ctx): ApplyResult {
  const s = structuredClone(state);
  const run: Run = { s, ctx, entries: [] };
  try {
    if (!cmd || typeof cmd !== 'object' || typeof (cmd as { type?: unknown }).type !== 'string')
      fail('bad_command', 'Malformed command');
    runTick(run);
    const seat = applyCommand(run, cmd, actor);
    runTick(run);
    return seat === undefined
      ? { ok: true, state: s, entries: run.entries }
      : { ok: true, state: s, entries: run.entries, seat };
  } catch (err) {
    if (err instanceof Reject) return { ok: false, code: err.code, message: err.message };
    throw err;
  }
}

/** The earliest moment the table needs a `tick`, or null when it is waiting on nobody. */
export function nextDeadline(s: TableState): number | null {
  if (s.phase !== 'playing') return null;
  const times: number[] = [];
  if (s.pending) times.push(s.pending.commitAt);
  else if (inBetting(s.hand) && s.hand.toAct !== null && s.hand.deadlineAt !== null)
    times.push(s.hand.deadlineAt);
  if (s.nextDealAt !== null) times.push(s.nextDealAt);
  return times.length ? Math.min(...times) : null;
}

/** Total chips in play: stacks plus everything committed to the current hand. */
export function chipsInPlay(s: TableState): number {
  const stacks = s.seats.reduce((sum, x) => sum + x.stack, 0);
  const hand = s.hand;
  const committed = hand && inBetting(hand) ? hand.players.reduce((sum, p) => sum + p.committed, 0) : 0;
  return stacks + committed;
}
