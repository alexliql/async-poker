import { describe, expect, it } from 'vitest';
import { STACK_MAX, breakdown, shade, stackOf } from '../src/lib/chips';

describe('chips', () => {
  it('draws a bet with the fewest chips, biggest first', () => {
    expect(stackOf(12).map((d) => d.v)).toEqual([5, 5, 1, 1]);
    expect(stackOf(131).map((d) => d.v)).toEqual([100, 25, 5, 1]);
    expect(stackOf(0)).toEqual([]);
  });
  it('caps tall stacks', () => {
    expect(stackOf(1_999)).toHaveLength(STACK_MAX);
  });
  it('breaks an amount into towers that add back up', () => {
    for (const amount of [1, 6, 72, 200, 499]) {
      expect(breakdown(amount).reduce((s, { d, n }) => s + d.v * n, 0)).toBe(amount);
    }
  });
  it('darkens colors for chip edges', () => {
    expect(shade('#ffffff', 0.5)).toBe('#808080');
  });
});
