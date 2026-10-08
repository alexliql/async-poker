import {
  type ActionKind,
  type Card,
  type Command,
  type TableConfig,
  type TableState,
  apply,
  createTable,
  seededRandomInt,
} from '../src';

export const COLORS = ['sage', 'dusk', 'clay', 'mauve', 'sand', 'teal'] as const;
export const NAMES = ['Mia', 'Jay', 'Priya', 'Sam', 'Theo', 'Kai'] as const;

export function config(overrides: Partial<TableConfig> = {}): TableConfig {
  return {
    name: 'Friday Night',
    smallBlind: 1,
    bigBlind: 2,
    buyIn: 200,
    turnTimerMs: 12 * 3_600_000,
    maxSeats: 6,
    undoMs: 0,
    handPauseMs: 8_000,
    ...overrides,
  };
}

/** A small driver around the pure engine with a controllable clock. */
export class Table {
  state: TableState;
  now = 1_000_000;
  private readonly rng: (n: number) => number;

  constructor(players: number, overrides: Partial<TableConfig> = {}, seed = 42) {
    this.rng = seededRandomInt(seed);
    this.state = createTable(
      config(overrides),
      { name: NAMES[0], color: COLORS[0], phrase: 'Mia never bluffs.' },
      this.now,
    );
    for (let i = 1; i < players; i++) {
      this.must({ type: 'join', name: NAMES[i]!, color: COLORS[i]!, phrase: '' }, null);
    }
  }

  run(cmd: Command, actor: number | null) {
    const r = apply(this.state, cmd, actor, { now: this.now, randomInt: this.rng });
    if (r.ok) this.state = r.state;
    return r;
  }

  must(cmd: Command, actor: number | null) {
    const r = this.run(cmd, actor);
    if (!r.ok) throw new Error(`${cmd.type} by ${actor} rejected: ${r.code} ${r.message}`);
    return r;
  }

  act(seat: number, action: ActionKind, amount?: number) {
    return this.must(amount === undefined ? { type: 'act', action } : { type: 'act', action, amount }, seat);
  }

  advance(ms: number) {
    this.now += ms;
    return this.must({ type: 'tick' }, null);
  }

  get hand() {
    const h = this.state.hand;
    if (!h) throw new Error('no hand');
    return h;
  }

  get toAct(): number {
    const t = this.hand.toAct;
    if (t === null) throw new Error('nobody to act');
    return t;
  }

  stack(seat: number) {
    return this.state.seats[seat]!.stack;
  }

  player(seat: number) {
    const p = this.hand.players.find((x) => x.seat === seat);
    if (!p) throw new Error(`seat ${seat} not in hand`);
    return p;
  }

  /** Total chips: stacks plus anything committed to a hand still being played. */
  chips() {
    const h = this.state.hand;
    const live = h && h.street !== 'over' ? h.players.reduce((s, p) => s + p.committed, 0) : 0;
    return this.state.seats.reduce((s, x) => s + x.stack, 0) + live;
  }

  /**
   * Replaces the dealt cards of the current hand. `board` is the five community cards in order.
   * Must be called right after a deal, before the flop.
   */
  rig(holes: Record<number, [Card, Card]>, board: [Card, Card, Card, Card, Card]) {
    const used = new Set<string>([...Object.values(holes).flat(), ...board]);
    const filler = [] as Card[];
    for (const s of 'shdc') for (const r of '23456789TJQKA') if (!used.has(r + s)) filler.push(r + s);
    // Dealing pops from the end: burn, flop x3, burn, turn, burn, river.
    const order = ['XX', board[0], board[1], board[2], 'XX', board[3], 'XX', board[4]];
    const tail = order.map((c) => (c === 'XX' ? filler.pop()! : c)).reverse();
    this.state.secret = { hole: { ...holes }, deck: [...filler, ...tail] };
  }
}
