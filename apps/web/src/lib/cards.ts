import type { Card } from '@holdem/engine';

export const SUIT_GLYPH: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
const TWO_COLOR: Record<string, string> = { s: '#15181D', h: '#C9303C', d: '#C9303C', c: '#15181D' };
const FOUR_COLOR: Record<string, string> = { s: '#15181D', h: '#C9303C', d: '#2563A8', c: '#2E7D4F' };

export interface CardFace {
  id: Card;
  rank: string;
  suit: string;
  color: string;
}

export function face(card: Card, fourColor = false): CardFace {
  const r = card[0]!;
  const s = card[1]!;
  return {
    id: card,
    rank: r === 'T' ? '10' : r,
    suit: SUIT_GLYPH[s] ?? '?',
    color: (fourColor ? FOUR_COLOR : TWO_COLOR)[s] ?? '#15181D',
  };
}

/** Example hands for the rankings sheet, strongest first. */
export const RANKINGS: { name: string; cards: Card[] }[] = [
  { name: 'Royal Flush', cards: ['As', 'Ks', 'Qs', 'Js', 'Ts'] },
  { name: 'Straight Flush', cards: ['9h', '8h', '7h', '6h', '5h'] },
  { name: 'Four of a Kind', cards: ['Qc', 'Qd', 'Qh', 'Qs', '3d'] },
  { name: 'Full House', cards: ['7s', '7d', '7c', 'Kh', 'Ks'] },
  { name: 'Flush', cards: ['Ad', 'Jd', '8d', '6d', '2d'] },
  { name: 'Straight', cards: ['Tc', '9d', '8s', '7h', '6c'] },
  { name: 'Three of a Kind', cards: ['5s', '5h', '5d', 'Kc', '2s'] },
  { name: 'Two Pair', cards: ['Jh', 'Jc', '4s', '4d', 'As'] },
  { name: 'Pair', cards: ['9s', '9d', 'Kh', '6c', '3s'] },
  { name: 'High Card', cards: ['Ac', 'Qd', '8s', '5h', '2c'] },
];
