/** Silly lines for buying in. They get meaner with every rebuy. */
export const JOIN_QUIPS = [
  'Be safe, buddy.',
  'Damn, you’re poor.',
  'Free chips. Try not to cry.',
  'The house believes in you. Barely.',
  'Bold of you to show up.',
];

/** Index = buy-ins already burned tonight. */
export const REBUY_ROASTS = [
  'Damn, you’re poor.',
  'Back already? Bold.',
  'The chips miss you. Not really.',
  'At this point it’s a subscription.',
  'We’ve alerted your family.',
];

export function pick<T>(items: readonly T[], avoid?: T): T {
  if (items.length === 1) return items[0]!;
  for (;;) {
    const v = items[Math.floor(Math.random() * items.length)]!;
    if (v !== avoid) return v;
  }
}

export function roastFor(buyIns: number): string {
  return REBUY_ROASTS[Math.min(Math.max(0, buyIns - 1), REBUY_ROASTS.length - 1)]!;
}
