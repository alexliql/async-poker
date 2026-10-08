import { type Card, rankOf, suitOf } from './cards';

/**
 * Hand categories, weakest first. The numeric score of a hand is
 * `category << 20 | k1 << 16 | k2 << 12 | k3 << 8 | k4 << 4 | k5`,
 * where k1..k5 are rank values (2..14) in tie-break order. Higher score wins.
 */
export const CATEGORY = {
  HighCard: 0,
  Pair: 1,
  TwoPair: 2,
  Trips: 3,
  Straight: 4,
  Flush: 5,
  FullHouse: 6,
  Quads: 7,
  StraightFlush: 8,
} as const;

export const CATEGORY_NAMES = [
  'High Card',
  'Pair',
  'Two Pair',
  'Three of a Kind',
  'Straight',
  'Flush',
  'Full House',
  'Four of a Kind',
  'Straight Flush',
] as const;

const SUIT_INDEX = { s: 0, h: 1, d: 2, c: 3 } as const;

function pack(category: number, k: number[]): number {
  return (
    (category << 20) |
    ((k[0] ?? 0) << 16) |
    ((k[1] ?? 0) << 12) |
    ((k[2] ?? 0) << 8) |
    ((k[3] ?? 0) << 4) |
    (k[4] ?? 0)
  );
}

/** Highest straight in a rank bitmask (bits 2..14), ace may play low. 0 if none. */
function straightTop(mask: number): number {
  const m = mask | (((mask >> 14) & 1) << 1);
  for (let top = 14; top >= 5; top--) {
    const need = 0b11111 << (top - 4);
    if ((m & need) === need) return top;
  }
  return 0;
}

/** Top n ranks present in a bitmask, high to low. */
function topRanks(mask: number, n: number, exclude = 0): number[] {
  const out: number[] = [];
  for (let r = 14; r >= 2 && out.length < n; r--) {
    if (mask & (1 << r) && !(exclude & (1 << r))) out.push(r);
  }
  return out;
}

const counts = new Int8Array(15);
const suitMasks = new Int32Array(4);
const suitCounts = new Int8Array(4);

/**
 * Scores 5 to 7 cards given as parallel rank (2..14) and suit (0..3) arrays.
 * Allocation-free in the hot path apart from small kicker arrays; used by the exhaustive test.
 */
export function scoreRanksSuits(ranks: ArrayLike<number>, suits: ArrayLike<number>, n: number): number {
  counts.fill(0);
  suitMasks.fill(0);
  suitCounts.fill(0);
  let all = 0;
  for (let i = 0; i < n; i++) {
    const r = ranks[i]!;
    const s = suits[i]!;
    counts[r]!++;
    suitMasks[s]! |= 1 << r;
    suitCounts[s]!++;
    all |= 1 << r;
  }

  let flushSuit = -1;
  for (let s = 0; s < 4; s++) if (suitCounts[s]! >= 5) flushSuit = s;
  if (flushSuit >= 0) {
    const sf = straightTop(suitMasks[flushSuit]!);
    if (sf) return pack(CATEGORY.StraightFlush, [sf]);
  }

  let quad = 0;
  let trip1 = 0;
  let trip2 = 0;
  let pair1 = 0;
  let pair2 = 0;
  for (let r = 14; r >= 2; r--) {
    const c = counts[r]!;
    if (c === 4 && !quad) quad = r;
    else if (c === 3) {
      if (!trip1) trip1 = r;
      else if (!trip2) trip2 = r;
    } else if (c === 2) {
      if (!pair1) pair1 = r;
      else if (!pair2) pair2 = r;
    }
  }

  if (quad) return pack(CATEGORY.Quads, [quad, ...topRanks(all, 1, 1 << quad)]);
  if (trip1 && (trip2 || pair1)) {
    const pairRank = Math.max(trip2, pair1);
    return pack(CATEGORY.FullHouse, [trip1, pairRank]);
  }
  if (flushSuit >= 0) return pack(CATEGORY.Flush, topRanks(suitMasks[flushSuit]!, 5));
  const st = straightTop(all);
  if (st) return pack(CATEGORY.Straight, [st]);
  if (trip1) return pack(CATEGORY.Trips, [trip1, ...topRanks(all, 2, 1 << trip1)]);
  if (pair1 && pair2) {
    return pack(CATEGORY.TwoPair, [pair1, pair2, ...topRanks(all, 1, (1 << pair1) | (1 << pair2))]);
  }
  if (pair1) return pack(CATEGORY.Pair, [pair1, ...topRanks(all, 3, 1 << pair1)]);
  return pack(CATEGORY.HighCard, topRanks(all, 5));
}

/** Score of the best five-card hand within 5 to 7 cards. */
export function scoreCards(cards: readonly Card[]): number {
  if (cards.length < 5 || cards.length > 7)
    throw new Error(`scoreCards needs 5-7 cards, got ${cards.length}`);
  const ranks = cards.map(rankOf);
  const suits = cards.map((c) => SUIT_INDEX[suitOf(c)]);
  return scoreRanksSuits(ranks, suits, cards.length);
}

export function categoryOf(score: number): number {
  return score >> 20;
}

export interface HandEval {
  score: number;
  category: number;
  /** "Two Pair", "Royal Flush"... */
  label: string;
  /** The five cards that make the hand. */
  best: Card[];
}

function combos5(n: number): number[][] {
  const out: number[][] = [];
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++) for (let e = d + 1; e < n; e++) out.push([a, b, c, d, e]);
  return out;
}
const COMBOS: Record<number, number[][]> = { 5: combos5(5), 6: combos5(6), 7: combos5(7) };

export function labelOf(score: number): string {
  const cat = categoryOf(score);
  if (cat === CATEGORY.StraightFlush && ((score >> 16) & 0xf) === 14) return 'Royal Flush';
  return CATEGORY_NAMES[cat]!;
}

/** Best hand from 5 to 7 cards, including which five cards make it. */
export function evaluate(cards: readonly Card[]): HandEval {
  const score = scoreCards(cards);
  let best: Card[] = cards.slice(0, 5);
  for (const idx of COMBOS[cards.length]!) {
    const five = idx.map((i) => cards[i]!);
    if (scoreCards(five) === score) {
      best = five;
      break;
    }
  }
  return { score, category: categoryOf(score), label: labelOf(score), best };
}

/**
 * Label for what a player holds right now: hole cards alone before the flop,
 * best five once there are at least five cards.
 */
export function currentHandLabel(hole: readonly Card[], board: readonly Card[]): string {
  const cards = [...hole, ...board];
  if (cards.length >= 5) return evaluate(cards).label;
  const ranks = cards.map(rankOf);
  const seen = new Map<number, number>();
  for (const r of ranks) seen.set(r, (seen.get(r) ?? 0) + 1);
  const max = Math.max(...seen.values());
  const pairs = [...seen.values()].filter((c) => c === 2).length;
  if (max >= 3) return CATEGORY_NAMES[CATEGORY.Trips];
  if (pairs >= 2) return CATEGORY_NAMES[CATEGORY.TwoPair];
  if (pairs === 1) return CATEGORY_NAMES[CATEGORY.Pair];
  return CATEGORY_NAMES[CATEGORY.HighCard];
}
