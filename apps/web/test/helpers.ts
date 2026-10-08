import {
  type Command,
  type TableConfig,
  type TableState,
  type TableView,
  apply,
  createTable,
  seededRandomInt,
  viewFor,
} from '@holdem/engine';

const PEOPLE = [
  ['Mia', 'sage'],
  ['Jay', 'dusk'],
  ['Priya', 'clay'],
  ['Sam', 'mauve'],
  ['Theo', 'sand'],
  ['Kai', 'teal'],
] as const;

/** A real engine table with a hand clock, for building views in tests. */
export class TestTable {
  state: TableState;
  now = 1_000_000;
  private rng = seededRandomInt(7);

  constructor(players: number, overrides: Partial<TableConfig> = {}) {
    this.state = createTable(
      {
        name: 'Friday Night',
        smallBlind: 1,
        bigBlind: 2,
        buyIn: 200,
        turnTimerMs: 12 * 3_600_000,
        maxSeats: 6,
        undoMs: 0,
        handPauseMs: 8_000,
        ...overrides,
      },
      { name: PEOPLE[0][0], color: PEOPLE[0][1], phrase: 'Mia never bluffs.' },
      this.now,
    );
    for (let i = 1; i < players; i++)
      this.do({ type: 'join', name: PEOPLE[i]![0], color: PEOPLE[i]![1], phrase: '' }, null);
  }

  do(cmd: Command, actor: number | null) {
    const r = apply(this.state, cmd, actor, { now: this.now, randomInt: this.rng });
    if (!r.ok) throw new Error(`${cmd.type}: ${r.code} ${r.message}`);
    this.state = r.state;
    return r.entries;
  }

  view(seat: number): TableView {
    return viewFor(this.state, seat);
  }

  get toAct(): number {
    return this.state.hand!.toAct!;
  }
}
