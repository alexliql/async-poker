import { describe, expect, it } from 'vitest';
import { scoreRanksSuits } from '../src';

// All 133,784,560 seven-card hands. Takes a minute or two, so it only runs with EXHAUSTIVE=1
// (`pnpm --filter @holdem/engine test:exhaustive`).
const run = process.env.EXHAUSTIVE === '1';

describe.runIf(run)('every seven-card hand', () => {
  it('matches the published category counts', () => {
    const counts = new Array(9).fill(0);
    const ranks = new Int32Array(7);
    const suits = new Int32Array(7);
    const R = (i: number) => (i >> 2) + 2;
    const S = (i: number) => i & 3;
    for (let a = 0; a < 52; a++) {
      ranks[0] = R(a);
      suits[0] = S(a);
      for (let b = a + 1; b < 52; b++) {
        ranks[1] = R(b);
        suits[1] = S(b);
        for (let c = b + 1; c < 52; c++) {
          ranks[2] = R(c);
          suits[2] = S(c);
          for (let d = c + 1; d < 52; d++) {
            ranks[3] = R(d);
            suits[3] = S(d);
            for (let e = d + 1; e < 52; e++) {
              ranks[4] = R(e);
              suits[4] = S(e);
              for (let f = e + 1; f < 52; f++) {
                ranks[5] = R(f);
                suits[5] = S(f);
                for (let g = f + 1; g < 52; g++) {
                  ranks[6] = R(g);
                  suits[6] = S(g);
                  counts[scoreRanksSuits(ranks, suits, 7) >> 20]++;
                }
              }
            }
          }
        }
      }
    }
    // https://en.wikipedia.org/wiki/Poker_probability (royal flushes counted as straight flushes)
    expect(counts).toEqual([23294460, 58627800, 31433400, 6461620, 6180020, 4047644, 3473184, 224848, 41584]);
  }, 600_000);
});
