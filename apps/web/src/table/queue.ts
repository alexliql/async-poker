import type { LogEntry, TableView } from '@holdem/engine';
import type { TableUpdate } from '../client/types';

/** What the table is drawing right now. */
export interface Frame {
  seq: number;
  view: TableView;
  entries: LogEntry[];
  /** Arrived while watching: play its animations. False for a first load or a catch-up. */
  live: boolean;
  /** Bets are sliding into the pot. */
  collecting: boolean;
}

export const TIMING = {
  act: 320,
  collect: 460,
  dealBase: 480,
  dealPerCard: 110,
  newHand: 640,
  showdownHold: 2_300,
  foldHold: 1_100,
  reduced: 120,
  /** Above this many waiting updates, play them three times faster. */
  backlog: 4,
  fast: 3,
} as const;

function hasBets(view: TableView): boolean {
  return view.seats.some((s) => s.bet > 0);
}

/** How long to hold a frame so its animations finish before the next one replaces it. */
export function holdFor(entries: readonly LogEntry[]): number {
  let ms = 0;
  for (const e of entries) {
    if (e.k === 'act' && e.verb !== 'posted') ms = Math.max(ms, TIMING.act);
    else if (e.k === 'board') ms += TIMING.dealBase + (e.cards.length - 1) * TIMING.dealPerCard + 120;
    else if (e.k === 'hand') ms = Math.max(ms, TIMING.newHand);
  }
  const results = entries.filter((e): e is Extract<LogEntry, { k: 'result' }> => e.k === 'result');
  if (results.length) ms += results.some((r) => r.shown) ? TIMING.showdownHold : TIMING.foldHold;
  return ms;
}

/**
 * The moves in an update that happened before its street closed, applied to the previous view,
 * so their chips appear on the felt before everything slides into the pot.
 */
export function applyActs(view: TableView, entries: readonly LogEntry[]): TableView | null {
  const end = entries.findIndex((e) => e.k === 'board' || e.k === 'result');
  const acts = entries
    .slice(0, end < 0 ? entries.length : end)
    .filter((e): e is Extract<LogEntry, { k: 'act' }> => e.k === 'act');
  if (!acts.length || !view.hand) return null;
  const seats = view.seats.map((s) => ({ ...s }));
  let added = 0;
  for (const a of acts) {
    const s = seats.find((x) => x.seat === a.seat);
    if (!s) continue;
    s.isTurn = false;
    s.deadlineAt = null;
    if (a.verb === 'folded') {
      s.folded = true;
      s.lastAction = 'Fold';
      continue;
    }
    if (a.verb === 'checked') {
      s.lastAction = 'Check';
      continue;
    }
    if (a.amount === null) continue;
    // calls log the chips added; bets and raises log the new total
    const delta =
      a.verb === 'called' || a.verb === 'called all in' ? a.amount : Math.max(0, a.amount - s.bet);
    s.bet += delta;
    s.stack = Math.max(0, s.stack - delta);
    added += delta;
    s.lastAction =
      a.verb === 'called'
        ? 'Call'
        : a.verb === 'bet'
          ? `Bet $${a.amount}`
          : a.verb === 'raised to'
            ? `Raise $${a.amount}`
            : 'All in';
  }
  const you = view.you ? { ...view.you, legal: null, pending: null, canPre: false } : null;
  return {
    ...view,
    seats,
    you,
    hand: { ...view.hand, potTotal: view.hand.potTotal + added, toAct: null },
  };
}

/**
 * Plays table updates one at a time so each move gets its moment: bets land, slide into the pot,
 * cards deal. A backlog plays faster; a catch-up (first load, reconnect, a hidden tab) jumps
 * straight to the latest state.
 */
export class DisplayQueue {
  private queue: TableUpdate[] = [];
  private current: Frame | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly onFrame: (f: Frame) => void,
    private readonly opts: { reducedMotion?: () => boolean; hidden?: () => boolean } = {},
  ) {}

  get frame(): Frame | null {
    return this.current;
  }

  push(u: TableUpdate): void {
    if (this.current && u.seq <= this.current.seq && !this.queue.length) return;
    const hidden = this.opts.hidden?.() ?? false;
    if (u.jump || !this.current || hidden) {
      this.clear();
      this.show({ seq: u.seq, view: u.view, entries: u.entries, live: false, collecting: false });
      return;
    }
    this.queue.push(u);
    this.pump();
  }

  /** Skip whatever is still animating and show the latest state. */
  flush(): void {
    const last = this.queue[this.queue.length - 1];
    this.clear();
    if (last)
      this.show({ seq: last.seq, view: last.view, entries: last.entries, live: false, collecting: false });
  }

  dispose(): void {
    this.clear();
  }

  private clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.queue = [];
  }

  private show(f: Frame): void {
    this.current = f;
    this.onFrame(f);
  }

  private scale(ms: number): number {
    if (this.opts.reducedMotion?.()) return Math.min(ms, TIMING.reduced);
    return this.queue.length >= TIMING.backlog ? ms / TIMING.fast : ms;
  }

  private after(ms: number, fn: () => void): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      fn();
    }, this.scale(ms));
  }

  private pump(): void {
    if (this.timer || !this.queue.length) return;
    const u = this.queue.shift()!;
    const prev = this.current!;
    const final: Frame = { seq: u.seq, view: u.view, entries: u.entries, live: true, collecting: false };
    const closesStreet = u.entries.some((e) => e.k === 'board' || e.k === 'result');
    const finish = () => {
      this.show(final);
      this.after(holdFor(u.entries), () => this.pump());
    };
    if (!closesStreet) {
      finish();
      return;
    }
    const acted = applyActs(prev.view, u.entries);
    const before = acted ?? prev.view;
    const collect = () => {
      if (!hasBets(before)) {
        finish();
        return;
      }
      this.show({ ...prev, view: before, entries: u.entries, live: true, collecting: true });
      this.after(TIMING.collect, finish);
    };
    if (acted) {
      this.show({ ...prev, view: acted, entries: u.entries, live: true, collecting: false });
      this.after(TIMING.act, collect);
    } else collect();
  }
}
