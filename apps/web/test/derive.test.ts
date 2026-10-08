import { describe, expect, it } from 'vitest';
import { arrangeSeats, feedRows, headsUpBadge, potOf, seatTags, winningCards } from '../src/table/derive';
import { toastFor, turnMessage } from '../src/table/messages';
import { TestTable } from './helpers';

describe('seats around the felt', () => {
  it('puts everyone else clockwise from your left', () => {
    const t = new TestTable(6);
    const { me, others } = arrangeSeats(t.view(2));
    expect(me!.seat).toBe(2);
    expect(others.map((o) => o.seat.seat)).toEqual([3, 4, 5, 0, 1]);
    expect(others.map((o) => o.slot)).toEqual(['left', 'topLeft', 'top', 'topRight', 'right']);
  });
  it('sits a lone opponent at the top', () => {
    const t = new TestTable(2);
    expect(arrangeSeats(t.view(0)).others.map((o) => o.slot)).toEqual(['top']);
  });
  it('leaves out players who left', () => {
    const t = new TestTable(4);
    t.do({ type: 'leave' }, 2);
    expect(arrangeSeats(t.view(0)).others.map((o) => o.seat.seat)).toEqual([1, 3]);
  });
});

describe('tags and badges', () => {
  it('shows this street’s moves only', () => {
    const t = new TestTable(3);
    t.do({ type: 'start' }, 0);
    const first = t.toAct;
    t.do({ type: 'act', action: 'raise', amount: 6 }, first);
    expect(seatTags(t.view(0)).get(first)).toBe('Raise $6');
    t.do({ type: 'act', action: 'call' }, t.toAct);
    t.do({ type: 'act', action: 'call' }, t.toAct);
    expect(t.state.hand!.street).toBe('flop');
    expect(seatTags(t.view(0)).size).toBe(0);
  });
  it('marks the heads-up button as D · SB', () => {
    const t = new TestTable(2);
    t.do({ type: 'start' }, 0);
    const v = t.view(0);
    const button = v.seats.find((s) => s.isButton)!;
    expect(headsUpBadge(button)).toBe('D · SB');
    expect(headsUpBadge(v.seats.find((s) => !s.isButton)!)).toBe('BB');
  });
});

describe('showdown', () => {
  it('knows the pot, the winning cards and the labels', () => {
    const t = new TestTable(2);
    t.do({ type: 'start' }, 0);
    // check it down
    t.do({ type: 'act', action: 'call' }, t.toAct);
    t.do({ type: 'act', action: 'check' }, t.toAct);
    for (let i = 0; i < 3; i++) {
      t.do({ type: 'act', action: 'check' }, t.toAct);
      t.do({ type: 'act', action: 'check' }, t.toAct);
    }
    const v = t.view(0);
    expect(v.hand!.street).toBe('over');
    expect(potOf(v)).toBe(4);
    const win = winningCards(v)!;
    expect(win.size).toBeGreaterThanOrEqual(5);
    expect(seatTags(v).size).toBe(2);
  });
});

describe('messages', () => {
  it('says what you face when your turn comes', () => {
    const t = new TestTable(3);
    t.do({ type: 'start' }, 0);
    // seat 0 is the button; seat 0 acts first preflop with 3 players (left of BB is the button)
    const me = t.toAct;
    expect(turnMessage(t.view(me))).toBe('$2 to call. Your move.');
    const prev = t.view(me);
    t.do({ type: 'act', action: 'raise', amount: 6 }, me);
    const next = t.toAct;
    const before = t.view(next);
    void before;
    const view = t.view(next);
    expect(turnMessage(view)).toMatch(/raised to \$6\. Your move\./);
    expect(toastFor(prev, { seq: 2, view: t.view(me), entries: [], jump: false })).toBeNull();
  });
  it('announces a winner', () => {
    const t = new TestTable(2);
    t.do({ type: 'start' }, 0);
    const prev = t.view(0);
    const folder = t.toAct;
    const entries = t.do({ type: 'act', action: 'fold' }, folder);
    const winner = folder === 0 ? 1 : 0;
    const msg = toastFor(prev, { seq: 2, view: t.view(winner), entries, jump: false });
    expect(msg).toBe('Everyone folded. Pot’s yours.');
    const other = toastFor(prev, { seq: 2, view: t.view(folder), entries, jump: false });
    expect(other).toMatch(/takes the pot\.$/);
  });
  it('lists the feed with a "while you were away" divider', () => {
    const t = new TestTable(3);
    const seen = t.now;
    t.now += 60_000;
    t.do({ type: 'start' }, 0);
    const rows = feedRows(t.view(0), t.now, seen);
    const away = rows.findIndex((r) => r.k === 'away');
    const hand = rows.findIndex((r) => r.k === 'hand');
    expect(away).toBeGreaterThan(0);
    expect(away).toBeLessThan(hand);
  });
});
