import {
  type ApplyResult,
  type ClientCommand,
  type Command,
  type LegalActions,
  type LogEntry,
  type RandomInt,
  type TableConfig,
  type TableState,
  apply,
  createTable,
  cryptoRandomInt,
  evaluate,
  legalActions,
  nextDeadline,
  rankOf,
  suitOf,
  viewFor,
} from '@holdem/engine';
import type { Profile } from '../lib/storage';
import {
  type ClientSnapshot,
  EMPTY_SNAPSHOT,
  type SendResult,
  type TableClient,
  type TableUpdate,
} from './types';

export const BOTS: Profile[] = [
  { name: 'Mia', color: 'sage', phrase: 'Mia never bluffs. Mostly.' },
  { name: 'Jay', color: 'dusk', phrase: 'Jay sends his regards.' },
  { name: 'Priya', color: 'clay', phrase: 'Priya saw that coming.' },
  { name: 'Sam', color: 'mauve', phrase: 'Sam is just here for snacks.' },
  { name: 'Theo', color: 'sand', phrase: 'Fortune favors the bold.' },
  { name: 'Ruby', color: 'rose', phrase: 'Ruby is counting your chips.' },
  { name: 'Ivy', color: 'iris', phrase: 'Ivy will remember this.' },
  { name: 'Kai', color: 'teal', phrase: 'Read ’em and weep.' },
];

export interface LocalOptions {
  you: Profile;
  opponents?: number;
  random?: RandomInt;
  /** Bot thinking time range in ms. */
  think?: [number, number];
  config?: Partial<TableConfig>;
}

const DEFAULT_CONFIG: TableConfig = {
  name: 'Practice table',
  smallBlind: 1,
  bigBlind: 2,
  buyIn: 200,
  turnTimerMs: 5 * 60_000,
  maxSeats: 6,
  undoMs: 5_000,
  handPauseMs: 8_000,
};

/** 0..1, a rough idea of how good a bot's hand is. */
export function handStrength(hole: string[], board: string[]): number {
  if (board.length === 0) {
    const [a, b] = hole.map(rankOf) as [number, number];
    const hi = Math.max(a, b);
    const lo = Math.min(a, b);
    if (a === b) return 0.55 + (a - 2) / 30;
    let s = (hi + lo - 4) / 48;
    if (suitOf(hole[0]!) === suitOf(hole[1]!)) s += 0.06;
    if (hi - lo === 1) s += 0.04;
    if (hi >= 13) s += 0.08;
    return Math.min(0.75, s);
  }
  const e = evaluate([...hole, ...board]);
  const kicker = ((e.score >> 16) & 0xf) / 14;
  return Math.min(1, e.category / 7 + 0.12 + kicker * 0.1);
}

export function botDecision(
  legal: LegalActions,
  strength: number,
  potTotal: number,
  bigBlind: number,
  roll: () => number,
): { action: ClientCommand & { type: 'act' } } {
  const toCall = legal.callAmount;
  const sizeTo = (fraction: number, base: number) =>
    Math.max(legal.minTo, Math.min(legal.maxTo, Math.round(base + potTotal * fraction)));
  const open = legal.canBet || legal.canRaise;
  if (toCall === 0) {
    if (open && (strength > 0.62 || roll() < 0.12)) {
      const to = sizeTo(0.5 + roll() * 0.4, legal.canBet ? 0 : legal.minTo - bigBlind);
      return {
        action: {
          type: 'act',
          action: to >= legal.maxTo ? 'allin' : legal.canBet ? 'bet' : 'raise',
          amount: to,
        },
      };
    }
    return { action: { type: 'act', action: 'check' } };
  }
  const price = toCall / (potTotal + toCall);
  if (legal.canRaise && strength > 0.78 && roll() < 0.45) {
    const to = sizeTo(0.6, legal.minTo);
    return { action: { type: 'act', action: to >= legal.maxTo ? 'allin' : 'raise', amount: to } };
  }
  if (strength > price + 0.08 || roll() < 0.1) return { action: { type: 'act', action: 'call' } };
  return { action: { type: 'act', action: 'fold' } };
}

/**
 * A whole table in the page: you against bots, run by the real engine. Time is virtual so bots
 * skip the undo window instead of everyone waiting five seconds per move.
 */
export class LocalTableClient implements TableClient {
  readonly slug = 'demo';
  private state: TableState;
  private seq = 0;
  private skew = 0;
  private snap: ClientSnapshot = EMPTY_SNAPSHOT;
  private readonly listeners = new Set<() => void>();
  private readonly updateListeners = new Set<(u: TableUpdate) => void>();
  private tickTimer: ReturnType<typeof setTimeout> | null = null;
  private botTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private readonly random: RandomInt;
  private readonly think: [number, number];
  private readonly bots: Set<number>;

  constructor(opts: LocalOptions) {
    this.random = opts.random ?? cryptoRandomInt;
    this.think = opts.think ?? [600, 1500];
    const config = { ...DEFAULT_CONFIG, ...opts.config };
    let s = createTable(config, opts.you, this.now());
    const others = BOTS.filter(
      (b) => b.color !== opts.you.color && b.name.toLowerCase() !== opts.you.name.toLowerCase(),
    );
    const count = Math.min(opts.opponents ?? 5, config.maxSeats - 1, others.length);
    for (const bot of others.slice(0, count))
      s = this.must(apply(s, { type: 'join', ...bot }, null, this.ctx()));
    this.bots = new Set(s.seats.filter((x) => x.seat !== 0).map((x) => x.seat));
    s = this.must(apply(s, { type: 'start' }, 0, this.ctx()));
    this.state = s;
    this.snap = { ...EMPTY_SNAPSHOT, status: 'ready', seq: 0, view: viewFor(s, 0) };
    this.schedule();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): ClientSnapshot {
    return this.snap;
  }

  onUpdate(listener: (u: TableUpdate) => void): () => void {
    this.updateListeners.add(listener);
    return () => this.updateListeners.delete(listener);
  }

  now(): number {
    return Date.now() + this.skew;
  }

  refresh(): void {
    // Nothing to fetch: the table lives here.
  }

  async send(command: ClientCommand): Promise<SendResult> {
    if (this.closed) return { ok: false, code: 'network', message: 'Table closed' };
    const r = apply(this.state, command, 0, this.ctx());
    if (!r.ok) return { ok: false, code: r.code, message: r.message, seq: this.seq };
    this.commit(r.state, r.entries);
    return { ok: true, seq: this.seq };
  }

  close(): void {
    this.closed = true;
    if (this.tickTimer) clearTimeout(this.tickTimer);
    if (this.botTimer) clearTimeout(this.botTimer);
  }

  /** The full state, for tests. */
  get table(): TableState {
    return this.state;
  }

  // ---------- internals ----------

  private ctx() {
    return { now: this.now(), randomInt: this.random };
  }

  private must(r: ApplyResult): TableState {
    if (!r.ok) throw new Error(`local table: ${r.code} ${r.message}`);
    return r.state;
  }

  private commit(state: TableState, entries: LogEntry[]): void {
    this.state = state;
    this.seq += 1;
    const view = viewFor(state, 0);
    this.snap = { ...this.snap, seq: this.seq, view };
    for (const l of this.listeners) l();
    const u: TableUpdate = { seq: this.seq, view, entries, jump: false };
    for (const l of this.updateListeners) l(u);
    this.schedule();
  }

  private run(cmd: Command, actor: number | null): boolean {
    const r = apply(this.state, cmd, actor, this.ctx());
    if (!r.ok) return false;
    if (r.entries.length || cmd.type !== 'tick') this.commit(r.state, r.entries);
    else this.state = r.state;
    return true;
  }

  private schedule(): void {
    if (this.closed) return;
    if (this.tickTimer) clearTimeout(this.tickTimer);
    if (this.botTimer) clearTimeout(this.botTimer);
    this.tickTimer = null;
    this.botTimer = null;
    const s = this.state;
    const due = nextDeadline(s);
    if (due !== null) {
      this.tickTimer = setTimeout(
        () => {
          this.tickTimer = null;
          this.run({ type: 'tick' }, null);
          if (!this.tickTimer && !this.botTimer) this.schedule();
        },
        Math.max(0, due - this.now()) + 20,
      );
    }
    const busted = s.seats.find((x) => this.bots.has(x.seat) && !x.left && x.status === 'busted');
    const toAct = s.hand && s.hand.street !== 'over' ? s.hand.toAct : null;
    if (busted && (!s.hand || s.hand.street === 'over')) {
      this.botTimer = setTimeout(() => this.run({ type: 'rebuy' }, busted.seat), 1_500);
    } else if (toAct !== null && this.bots.has(toAct) && !s.pending) {
      const [lo, hi] = this.think;
      this.botTimer = setTimeout(() => this.botAct(toAct), lo + Math.random() * (hi - lo));
    }
  }

  private botAct(seat: number): void {
    this.botTimer = null;
    const s = this.state;
    const legal = legalActions(s, seat);
    if (!legal || !s.hand || s.pending) {
      this.schedule();
      return;
    }
    const hole = s.secret.hole[seat] ?? [];
    const potTotal = s.hand.pot + s.hand.players.reduce((sum, p) => sum + p.bet, 0);
    const { action } = botDecision(
      legal,
      handStrength(hole, s.hand.board),
      potTotal,
      s.config.bigBlind,
      () => this.random(1000) / 1000,
    );
    const placed = apply(s, action, seat, this.ctx());
    const r = placed.ok
      ? placed
      : apply(s, { type: 'act', action: legal.canCheck ? 'check' : 'fold' }, seat, this.ctx());
    if (!r.ok) {
      this.schedule();
      return;
    }
    // Bots don't need an undo window: jump the clock past it and commit in one step.
    this.state = r.state;
    if (this.state.pending) this.skew += Math.max(0, this.state.pending.commitAt - this.now());
    const t = apply(this.state, { type: 'tick' }, null, this.ctx());
    if (t.ok) this.commit(t.state, [...r.entries, ...t.entries]);
    else this.commit(this.state, r.entries);
  }
}
