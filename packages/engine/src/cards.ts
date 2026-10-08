/**
 * Cards are two-character strings: rank then suit, e.g. "As", "Td", "7c".
 * Ranks: 2-9, T, J, Q, K, A. Suits: s h d c.
 */
export type Suit = 's' | 'h' | 'd' | 'c';
export type Card = string;

export const RANKS = '23456789TJQKA';
export const SUITS: readonly Suit[] = ['s', 'h', 'd', 'c'];

/** Rank value 2..14 (ace high). */
export function rankOf(card: Card): number {
  const i = RANKS.indexOf(card[0] ?? '');
  if (i < 0) throw new Error(`Bad card: ${card}`);
  return i + 2;
}

export function suitOf(card: Card): Suit {
  const s = card[1];
  if (s !== 's' && s !== 'h' && s !== 'd' && s !== 'c') throw new Error(`Bad card: ${card}`);
  return s;
}

export function isCard(value: unknown): value is Card {
  return (
    typeof value === 'string' && value.length === 2 && RANKS.includes(value[0]!) && 'shdc'.includes(value[1]!)
  );
}

export function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(r + s);
  return deck;
}

/** Returns an integer in [0, n). Must be uniform. */
export type RandomInt = (n: number) => number;

/** Fisher-Yates shuffle; returns a new array. */
export function shuffle<T>(items: readonly T[], randomInt: RandomInt): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i) throw new Error(`randomInt out of range: ${j}`);
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  return a;
}

/** Uniform random integer from crypto.getRandomValues, without modulo bias. */
export const cryptoRandomInt: RandomInt = (n) => {
  if (!Number.isInteger(n) || n <= 0 || n > 2 ** 32) throw new Error(`Bad range: ${n}`);
  const limit = Math.floor(2 ** 32 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    const x = buf[0]!;
    if (x < limit) return x % n;
  }
};

/** Deterministic PRNG for tests and replays (mulberry32). */
export function seededRandomInt(seed: number): RandomInt {
  let t = seed >>> 0;
  return (n) => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    const r = ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    return Math.floor(r * n);
  };
}

const RANK_NAMES: Record<string, string> = {
  '2': 'Two',
  '3': 'Three',
  '4': 'Four',
  '5': 'Five',
  '6': 'Six',
  '7': 'Seven',
  '8': 'Eight',
  '9': 'Nine',
  T: 'Ten',
  J: 'Jack',
  Q: 'Queen',
  K: 'King',
  A: 'Ace',
};
const SUIT_NAMES: Record<Suit, string> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };

/** "King of spades", for screen readers. */
export function cardName(card: Card): string {
  return `${RANK_NAMES[card[0]!]} of ${SUIT_NAMES[suitOf(card)]}`;
}
