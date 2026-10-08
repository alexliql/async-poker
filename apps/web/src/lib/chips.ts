/** Chip denominations and how a bet is drawn as a stack: fewest chips, biggest at the bottom. */
export interface Denom {
  v: number;
  color: string;
  light: boolean;
}

export const DENOMS: Denom[] = [
  { v: 100, color: '#2A2F38', light: false },
  { v: 25, color: '#4E7A64', light: false },
  { v: 5, color: '#B65F55', light: false },
  { v: 1, color: '#ECE8DF', light: true },
];

export const STACK_MAX = 10;

export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v * (1 - f)));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

export interface ChipPaint {
  bg: string;
  side: string;
  spot: string;
}

export function chipPaint(d: Denom): ChipPaint {
  return {
    bg: d.color,
    side: shade(d.color, d.light ? 0.16 : 0.3),
    spot: d.light ? 'rgba(21,24,29,.5)' : 'rgba(255,255,255,.85)',
  };
}

/** Chips for an amount, biggest first, capped so tall bets stay tidy. */
export function stackOf(amount: number): Denom[] {
  const out: Denom[] = [];
  let rest = Math.max(0, Math.floor(amount));
  for (const d of DENOMS) {
    let n = Math.floor(rest / d.v);
    rest -= n * d.v;
    while (n-- > 0 && out.length < STACK_MAX) out.push(d);
  }
  return out.slice(0, STACK_MAX);
}

/** Count of each denomination for an amount (the raise sheet's towers). */
export function breakdown(amount: number): { d: Denom; n: number }[] {
  let rest = Math.max(0, Math.floor(amount));
  return DENOMS.map((d) => {
    const n = Math.floor(rest / d.v);
    rest -= n * d.v;
    return { d, n };
  });
}
