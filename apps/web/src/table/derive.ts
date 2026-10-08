import type { Card, LogEntry, SeatView, TableView } from '@holdem/engine';
import { MISSED_TURNS_TO_SIT_OUT } from '@holdem/engine';
import { type Slot, SLOTS_FOR } from '../lib/layout';
import { ago, money, timerLabel } from '../lib/format';

export interface PlacedSeat {
  seat: SeatView;
  slot: Slot;
}

/** Everyone but you, clockwise from your left, each given a spot around the felt. */
export function arrangeSeats(view: TableView): { me: SeatView | null; others: PlacedSeat[] } {
  const viewer = view.you?.seat ?? -1;
  const me = view.seats.find((s) => s.seat === viewer) ?? null;
  const n = Math.max(1, view.seats.length);
  const others = view.seats
    .filter((s) => s.seat !== viewer && !s.left)
    .sort((a, b) => ((a.seat - viewer + n) % n) - ((b.seat - viewer + n) % n))
    .slice(0, 5);
  const slots = SLOTS_FOR[others.length] ?? [];
  return { me, others: others.map((seat, i) => ({ seat, slot: slots[i]! })) };
}

export function nameOf(view: TableView, seat: number): string {
  if (view.you?.seat === seat) return 'You';
  return view.seats.find((s) => s.seat === seat)?.name ?? 'Someone';
}

export function colorOf(view: TableView, seat: number): string {
  return view.seats.find((s) => s.seat === seat)?.color ?? 'sage';
}

/** Entries of the hand being played (or the last one), oldest first. */
export function currentHandEntries(view: TableView): LogEntry[] {
  const no = view.hand?.no;
  if (no === undefined) return [];
  const start = view.log.findLastIndex((e) => e.k === 'hand' && e.no === no);
  return start < 0 ? [] : view.log.slice(start);
}

/** The tag over each seat: what they did on this street, or their hand at showdown. */
export function seatTags(view: TableView): Map<number, string> {
  const tags = new Map<number, string>();
  const hand = view.hand;
  if (!hand) return tags;
  if (hand.street === 'over') {
    for (const [seat, label] of Object.entries(hand.result?.labels ?? {})) tags.set(Number(seat), label);
    if (tags.size) return tags;
  }
  const entries = currentHandEntries(view);
  const streetStart = entries.findLastIndex((e) => e.k === 'board');
  for (const e of entries.slice(streetStart + 1)) {
    if (e.k !== 'act' || e.verb === 'posted') continue;
    tags.set(e.seat, actTag(e, view.seats.find((s) => s.seat === e.seat)?.bet ?? 0));
  }
  return tags;
}

function actTag(e: Extract<LogEntry, { k: 'act' }>, bet: number): string {
  switch (e.verb) {
    case 'folded':
      return 'Fold';
    case 'checked':
      return 'Check';
    case 'called':
      return bet > 0 ? `Call ${money(bet)}` : 'Call';
    case 'bet':
      return `Bet ${money(e.amount ?? 0)}`;
    case 'raised to':
      return `Raise ${money(e.amount ?? 0)}`;
    default:
      return 'All in';
  }
}

/** "Theo raised to $6." */
export function describeAct(view: TableView, e: Extract<LogEntry, { k: 'act' }>): string {
  const who = nameOf(view, e.seat);
  const amt = e.amount !== null && e.verb !== 'folded' && e.verb !== 'checked' ? ` ${money(e.amount)}` : '';
  return `${who} ${e.verb}${amt}.`;
}

// ---------- the activity feed ----------

export type FeedRow =
  | { k: 'away'; key: string }
  | { k: 'hand'; key: string; title: string; note: string }
  | {
      k: 'act';
      key: string;
      who: string;
      color: string;
      verb: string;
      amt: string;
      tag: string | null;
      ago: string;
    }
  | { k: 'board'; key: string; street: string; cards: Card[] }
  | { k: 'result'; key: string; who: string; amt: string; hand: string | null; shown: Card[] | null }
  | { k: 'turn'; key: string; text: string };

const STREET_NAME = { flop: 'Flop', turn: 'Turn', river: 'River' } as const;

export function feedRows(view: TableView, now: number, lastSeenAt: number | null): FeedRow[] {
  const rows: FeedRow[] = [];
  let awayPlaced = false;
  const liveHand = view.hand && view.hand.street !== 'over' ? view.hand.no : null;
  const seen = new Map<string, number>();
  view.log.forEach((e, i) => {
    // Stable across the log being trimmed from the front, so rows don't re-animate.
    const base = `${e.at}-${e.k}-${'seat' in e ? e.seat : ''}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    const key = `${base}-${n}`;
    if (!awayPlaced && lastSeenAt !== null && e.at > lastSeenAt && i > 0) {
      rows.push({ k: 'away', key: 'away' });
      awayPlaced = true;
    }
    switch (e.k) {
      case 'hand':
        rows.push({ k: 'hand', key, title: `Hand #${e.no}`, note: e.no === liveHand ? 'live' : 'finished' });
        break;
      case 'act':
        rows.push({
          k: 'act',
          key,
          who: nameOf(view, e.seat),
          color: colorOf(view, e.seat),
          verb: e.verb,
          amt: e.amount !== null && e.verb !== 'folded' && e.verb !== 'checked' ? money(e.amount) : '',
          tag: e.tag === 'timer' ? 'Timer' : e.tag === 'auto' ? 'Auto' : null,
          ago: ago(now - e.at),
        });
        break;
      case 'board':
        rows.push({ k: 'board', key, street: STREET_NAME[e.street], cards: e.cards });
        break;
      case 'result':
        rows.push({
          k: 'result',
          key,
          who: nameOf(view, e.seat),
          amt: money(e.amount),
          hand: e.label,
          shown: e.shown,
        });
        break;
      case 'seat':
        rows.push({
          k: 'act',
          key,
          who: nameOf(view, e.seat),
          color: colorOf(view, e.seat),
          verb: view.you?.seat === e.seat && e.verb === 'is back' ? 'are back' : e.verb,
          amt: '',
          tag: null,
          ago: ago(now - e.at),
        });
        break;
      case 'host':
        rows.push({
          k: 'act',
          key,
          who: nameOf(view, e.seat),
          color: colorOf(view, e.seat),
          verb: view.you?.seat === e.seat ? 'are the host now' : 'is the host now',
          amt: '',
          tag: null,
          ago: ago(now - e.at),
        });
        break;
      case 'ended':
        rows.push({
          k: 'act',
          key,
          who: nameOf(view, e.seat),
          color: colorOf(view, e.seat),
          verb: 'ended the game',
          amt: '',
          tag: null,
          ago: ago(now - e.at),
        });
        break;
    }
  });
  if (view.you?.legal) {
    const toCall = view.you.toCall;
    rows.push({ k: 'turn', key: 'turn', text: toCall > 0 ? `${money(toCall)} to call` : 'check or bet' });
  }
  return rows;
}

export interface AwaySummary {
  awayMs: number;
  missed: number;
  /** Things other players did since you left. */
  happened: number;
}

export function awaySummary(view: TableView, now: number, lastSeenAt: number | null): AwaySummary | null {
  if (lastSeenAt === null) return null;
  const me = view.you?.seat;
  const since = view.log.filter((e) => e.at > lastSeenAt);
  return {
    awayMs: Math.max(0, now - lastSeenAt),
    missed: since.filter((e) => e.k === 'act' && e.seat === me && e.tag === 'timer').length,
    happened: since.filter((e) => 'seat' in e && e.seat !== me).length,
  };
}

export function rulesList(view: TableView, compact = false): { k: string; v: string }[] {
  const c = view.config;
  return [
    { k: 'Blinds', v: `${money(c.smallBlind)} / ${money(c.bigBlind)}` },
    { k: 'Buy-in', v: `${money(c.buyIn)}, free` },
    { k: 'Min raise', v: compact ? 'Last raise or more' : 'At least the last raise' },
    {
      k: 'Turn timer',
      v: compact
        ? `${timerLabel(c.turnTimerMs)}, then auto`
        : `${timerLabel(c.turnTimerMs)}, then auto check/fold`,
    },
    { k: 'Missed turns', v: `Sat out after ${MISSED_TURNS_TO_SIT_OUT}` },
    { k: 'Rebuys', v: 'Free, unlimited' },
  ];
}

/** Winning five cards of the main pot, to highlight at showdown. */
export function winningCards(view: TableView): Set<Card> | null {
  const r = view.hand?.result;
  if (!r || !Object.keys(r.shown).length) return null;
  const main = r.pots[0];
  if (!main) return null;
  const set = new Set<Card>();
  for (const w of main.winners) for (const c of r.best[w] ?? []) set.add(c);
  return set;
}

/** Who took the most chips this hand. */
export function topWinner(view: TableView): { seat: number; amount: number } | null {
  const won = view.hand?.result?.won;
  if (!won) return null;
  let best: { seat: number; amount: number } | null = null;
  for (const [seat, amount] of Object.entries(won)) {
    if (!best || amount > best.amount) best = { seat: Number(seat), amount };
  }
  return best;
}

export function potOf(view: TableView): number {
  const hand = view.hand;
  if (!hand) return 0;
  if (hand.street === 'over') return hand.result?.pots.reduce((s, p) => s + p.amount, 0) ?? 0;
  return hand.potTotal;
}

export function headsUpBadge(s: SeatView): string | null {
  if (s.isButton && s.isSmallBlind) return 'D · SB';
  if (s.isButton) return 'D';
  if (s.isSmallBlind) return 'SB';
  if (s.isBigBlind) return 'BB';
  return null;
}

export const BADGE_STYLE: Record<string, { bg: string; fg: string; sh: string }> = {
  D: { bg: '#F4F1EA', fg: '#15181D', sh: 'inset 0 0 0 1.5px rgba(21,24,29,.22), 0 1px 3px rgba(0,0,0,.25)' },
  SB: { bg: '#4F6F91', fg: '#FFFFFF', sh: '0 1px 3px rgba(0,0,0,.25)' },
  BB: { bg: '#9A4E45', fg: '#FFFFFF', sh: '0 1px 3px rgba(0,0,0,.25)' },
};

export function badgeStyle(badge: string) {
  return BADGE_STYLE[badge.startsWith('D') ? 'D' : badge]!;
}
