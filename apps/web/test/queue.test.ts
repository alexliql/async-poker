import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DisplayQueue, type Frame, TIMING, applyActs, holdFor } from '../src/table/queue';
import { TestTable } from './helpers';

describe('display queue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows the first view at once, without animating', () => {
    const t = new TestTable(3);
    t.do({ type: 'start' }, 0);
    const frames: Frame[] = [];
    const q = new DisplayQueue((f) => frames.push(f));
    q.push({ seq: 1, view: t.view(0), entries: [], jump: true });
    expect(frames).toHaveLength(1);
    expect(frames[0]!.live).toBe(false);
  });

  it('slides bets into the pot before dealing the flop', () => {
    const t = new TestTable(3);
    t.do({ type: 'start' }, 0);
    const frames: Frame[] = [];
    const q = new DisplayQueue((f) => frames.push(f));
    q.push({ seq: 1, view: t.view(0), entries: [], jump: true });
    // preflop: everyone calls, the big blind checks -> flop
    let seq = 1;
    let entries = t.do({ type: 'act', action: 'call' }, t.toAct);
    q.push({ seq: ++seq, view: t.view(0), entries, jump: false });
    expect(frames.at(-1)!.live).toBe(true);
    vi.advanceTimersByTime(holdFor(entries));
    entries = [
      ...t.do({ type: 'act', action: 'call' }, t.toAct),
      ...t.do({ type: 'act', action: 'check' }, t.toAct),
    ];
    expect(entries.some((e) => e.k === 'board')).toBe(true);
    const before = frames.length;
    q.push({ seq: ++seq, view: t.view(0), entries, jump: false });
    // 1) the closing moves appear on the felt
    const acted = frames[before]!;
    expect(acted.collecting).toBe(false);
    expect(acted.view.hand!.board).toHaveLength(0);
    expect(acted.view.seats.every((s) => s.bet === 2)).toBe(true);
    vi.advanceTimersByTime(TIMING.act);
    // 2) they slide to the pot
    expect(frames.at(-1)!.collecting).toBe(true);
    vi.advanceTimersByTime(TIMING.collect);
    // 3) the flop
    const flop = frames.at(-1)!;
    expect(flop.collecting).toBe(false);
    expect(flop.view.hand!.board).toHaveLength(3);
    expect(flop.view.hand!.potTotal).toBe(6);
  });

  it('jumps straight to the latest state on a catch-up', () => {
    const t = new TestTable(3);
    t.do({ type: 'start' }, 0);
    const frames: Frame[] = [];
    const q = new DisplayQueue((f) => frames.push(f));
    q.push({ seq: 1, view: t.view(0), entries: [], jump: true });
    t.do({ type: 'act', action: 'call' }, t.toAct);
    q.push({ seq: 2, view: t.view(0), entries: [], jump: true });
    expect(frames).toHaveLength(2);
    expect(frames[1]!.seq).toBe(2);
  });

  it('plays a backlog faster and in order', () => {
    const t = new TestTable(6);
    t.do({ type: 'start' }, 0);
    const frames: Frame[] = [];
    const q = new DisplayQueue((f) => frames.push(f));
    q.push({ seq: 1, view: t.view(0), entries: [], jump: true });
    for (let i = 0; i < 5; i++) {
      const entries = t.do({ type: 'act', action: 'call' }, t.toAct);
      q.push({ seq: i + 2, view: t.view(0), entries, jump: false });
    }
    vi.advanceTimersByTime(TIMING.act * 2.5);
    // five updates at 320ms each would take 1.6s; the backlog plays faster
    expect(frames.at(-1)!.seq).toBeGreaterThanOrEqual(4);
    vi.advanceTimersByTime(5_000);
    expect(frames.map((f) => f.seq)).toEqual([...frames.map((f) => f.seq)].sort((a, b) => a - b));
    expect(frames.at(-1)!.seq).toBe(6);
  });

  it('flushes to the latest on demand', () => {
    const t = new TestTable(3);
    t.do({ type: 'start' }, 0);
    const frames: Frame[] = [];
    const q = new DisplayQueue((f) => frames.push(f));
    q.push({ seq: 1, view: t.view(0), entries: [], jump: true });
    const e1 = t.do({ type: 'act', action: 'call' }, t.toAct);
    q.push({ seq: 2, view: t.view(0), entries: e1, jump: false });
    const e2 = t.do({ type: 'act', action: 'call' }, t.toAct);
    q.push({ seq: 3, view: t.view(0), entries: e2, jump: false });
    q.flush();
    expect(frames.at(-1)!.seq).toBe(3);
    expect(frames.at(-1)!.live).toBe(false);
  });
});

describe('applyActs', () => {
  it('puts a call on the felt and takes it from the stack', () => {
    const t = new TestTable(3);
    t.do({ type: 'start' }, 0);
    const prev = t.view(0);
    const caller = t.toAct;
    const entries = t.do({ type: 'act', action: 'call' }, caller);
    const v = applyActs(prev, [...entries, { k: 'board', at: 0, street: 'flop', cards: [] }])!;
    const s = v.seats.find((x) => x.seat === caller)!;
    expect(s.bet).toBe(2);
    expect(s.stack).toBe(198);
    expect(v.hand!.potTotal).toBe(prev.hand!.potTotal + 2);
  });
  it('marks a fold', () => {
    const t = new TestTable(3);
    t.do({ type: 'start' }, 0);
    const prev = t.view(0);
    const who = t.toAct;
    const entries = t.do({ type: 'act', action: 'fold' }, who);
    const v = applyActs(prev, entries)!;
    expect(v.seats.find((x) => x.seat === who)!.folded).toBe(true);
  });
});
