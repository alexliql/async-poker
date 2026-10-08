import { describe, expect, it } from 'vitest';
import { CATEGORY, categoryOf, currentHandLabel, evaluate, scoreCards, scoreRanksSuits } from '../src';

const cat = (cards: string) => categoryOf(scoreCards(cards.split(' ')));
const beats = (a: string, b: string) => scoreCards(a.split(' ')) > scoreCards(b.split(' '));

describe('categories', () => {
  it.each([
    ['As Ks Qs Js Ts', CATEGORY.StraightFlush],
    ['5d 4d 3d 2d Ad', CATEGORY.StraightFlush],
    ['9c 9d 9h 9s 2c', CATEGORY.Quads],
    ['Kc Kd Kh 2s 2c', CATEGORY.FullHouse],
    ['Ah 9h 7h 4h 2h', CATEGORY.Flush],
    ['5c 4d 3h 2s Ac', CATEGORY.Straight],
    ['Ac Kd Qh Js Tc', CATEGORY.Straight],
    ['7c 7d 7h Ks 2c', CATEGORY.Trips],
    ['7c 7d 5h 5s 2c', CATEGORY.TwoPair],
    ['7c 7d 5h 4s 2c', CATEGORY.Pair],
    ['Ac Jd 8h 4s 2c', CATEGORY.HighCard],
  ])('%s', (cards, expected) => {
    expect(cat(cards)).toBe(expected);
  });

  it('does not wrap straights around the ace', () => {
    expect(cat('Qc Kd Ah 2s 3c')).toBe(CATEGORY.HighCard);
  });

  it('picks the best five of seven', () => {
    expect(cat('Kd 7c 2s Qh 7s Ks 7h')).toBe(CATEGORY.FullHouse);
    expect(cat('2h 3h 4h 5h 9c 9d 6h')).toBe(CATEGORY.StraightFlush);
    expect(cat('As Ad Ah Ac Kd Kc Ks')).toBe(CATEGORY.Quads);
    expect(cat('Ah Kh 2h 3c 9h 8d 5h')).toBe(CATEGORY.Flush);
    expect(cat('Ts Td 9c 9h 4s 4d 2c')).toBe(CATEGORY.TwoPair);
  });
});

describe('tie-breaks', () => {
  it('compares kickers', () => {
    expect(beats('Ac Ad Kh 4s 2c', 'As Ah Qh Js Tc')).toBe(true);
    expect(beats('9c 9d 5h 5s Ac', '9h 9s 5c 5d Kc')).toBe(true);
    expect(beats('6c 5d 4h 3s 2c', '5c 4d 3h 2s Ac')).toBe(true);
    expect(beats('Kc Kd Kh 3s 3c', 'Qc Qd Qh As Ac')).toBe(true);
  });

  it('uses the best pair from two trips in a full house', () => {
    const a = scoreCards('9c 9d 9h 4s 4c 4d Ac'.split(' '));
    expect(categoryOf(a)).toBe(CATEGORY.FullHouse);
    expect(a).toBe(scoreCards('9c 9d 9h 4s 4c'.split(' ')));
  });

  it('counts the best kicker beyond a third pair', () => {
    expect(scoreCards('Ac Ad Kc Kd Qc Qd 2s'.split(' '))).toBe(scoreCards('Ac Ad Kc Kd Qc'.split(' ')));
  });

  it('splits identical boards', () => {
    expect(scoreCards('2c 3d Ah Kh Qh Jh Th'.split(' '))).toBe(scoreCards('4c 5d Ah Kh Qh Jh Th'.split(' ')));
  });
});

describe('evaluate', () => {
  it('names a royal flush and returns its five cards', () => {
    const r = evaluate('As Ks 2d Qs Js 3c Ts'.split(' '));
    expect(r.label).toBe('Royal Flush');
    expect([...r.best].sort()).toEqual(['As', 'Js', 'Ks', 'Qs', 'Ts']);
  });

  it('returns the cards that make the hand', () => {
    const r = evaluate('Ks 7h Kd 7c 2s Qh 7s'.split(' '));
    expect(r.label).toBe('Full House');
    expect(scoreCards(r.best)).toBe(r.score);
  });
});

describe('currentHandLabel', () => {
  it('reads hole cards before the flop', () => {
    expect(currentHandLabel(['Ks', 'Kd'], [])).toBe('Pair');
    expect(currentHandLabel(['Ks', '7h'], [])).toBe('High Card');
  });
  it('uses the board once there is one', () => {
    expect(currentHandLabel(['Ks', '7h'], ['Kd', '7c', '2s'])).toBe('Two Pair');
  });
});

describe('every five-card hand', () => {
  it('matches the published category counts (2,598,960 hands)', () => {
    const counts = new Array(9).fill(0);
    const ranks = new Int32Array(5);
    const suits = new Int32Array(5);
    for (let a = 0; a < 52; a++)
      for (let b = a + 1; b < 52; b++)
        for (let c = b + 1; c < 52; c++)
          for (let d = c + 1; d < 52; d++)
            for (let e = d + 1; e < 52; e++) {
              const idx = [a, b, c, d, e];
              for (let i = 0; i < 5; i++) {
                ranks[i] = (idx[i]! >> 2) + 2;
                suits[i] = idx[i]! & 3;
              }
              counts[scoreRanksSuits(ranks, suits, 5) >> 20]++;
            }
    // https://en.wikipedia.org/wiki/Poker_probability
    expect(counts).toEqual([1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 40]);
  });
});
