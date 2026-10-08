import { describe, expect, it } from 'vitest';
import { LAYOUTS, SLOTS_FOR, type LayoutId, fitScale, geometry, pickLayout } from '../src/lib/layout';

const IDS = Object.keys(LAYOUTS) as LayoutId[];

describe('layout', () => {
  it('picks the surface for each kind of screen', () => {
    expect(pickLayout(390, 844)).toBe('phone');
    expect(pickLayout(412, 915)).toBe('phone');
    expect(pickLayout(344, 882)).toBe('cover');
    expect(pickLayout(720, 840)).toBe('foldopen');
    expect(pickLayout(820, 1180)).toBe('foldopen');
    expect(pickLayout(1180, 820)).toBe('tablet');
    expect(pickLayout(1280, 720)).toBe('tablet');
    expect(pickLayout(1440, 900)).toBe('desktop');
    expect(pickLayout(1920, 1080)).toBe('desktop');
  });

  it('scales the stage to fit', () => {
    expect(fitScale('phone', 390, 844)).toBe(1);
    expect(fitScale('phone', 195, 844)).toBe(0.5);
  });

  for (const id of IDS) {
    describe(id, () => {
      const g = geometry(id);
      it('keeps every seat on the stage and inside the table column', () => {
        for (const slot of SLOTS_FOR[5]!) {
          const p = g.slot[slot];
          expect(p.x - g.seatW / 2).toBeGreaterThanOrEqual(g.col[0]);
          expect(p.x + g.seatW / 2).toBeLessThanOrEqual(g.col[0] + g.col[1]);
          expect(p.y - g.av / 2).toBeGreaterThan(56); // clear of the header text
          expect(p.y + g.av / 2).toBeLessThan(g.mineT);
        }
      });
      it('never overlaps two seats (avatars, or names at their widest)', () => {
        const slots = SLOTS_FOR[5]!;
        for (let i = 0; i < slots.length; i++)
          for (let j = i + 1; j < slots.length; j++) {
            const a = g.slot[slots[i]!];
            const b = g.slot[slots[j]!];
            const apart = Math.abs(a.x - b.x) >= g.seatW - 10 || Math.abs(a.y - b.y) >= g.av;
            expect(apart, `${slots[i]} vs ${slots[j]}`).toBe(true);
          }
      });
      it('stacks the hand top to bottom without collisions', () => {
        expect(g.boardT + g.card[1]).toBeLessThanOrEqual(g.potT);
        expect(g.labelT + 44).toBeLessThanOrEqual(g.mineT + 6);
        expect(g.mineT + g.mine[1]).toBeLessThanOrEqual(g.plateT + 10);
        expect(g.plateT + 44).toBeLessThanOrEqual(g.bar[1]);
        expect(g.bar[1] + g.bar[3]).toBeLessThanOrEqual(g.H);
      });
      it('keeps rails clear of the table column', () => {
        if (g.rr) expect(g.rr[0]).toBeGreaterThanOrEqual(g.col[0] + g.col[1]);
        if (g.lr) expect(g.lr[0] + g.lr[2]).toBeLessThanOrEqual(g.col[0]);
      });
    });
  }

  it('uses each slot once, in clockwise order', () => {
    for (let n = 0; n <= 5; n++) {
      const s = SLOTS_FOR[n]!;
      expect(new Set(s).size).toBe(n);
    }
  });
});
