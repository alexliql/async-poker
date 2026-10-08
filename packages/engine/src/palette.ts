/** Player colors, shared by the server (validation) and the app (rendering). */
export const PALETTE = [
  { id: 'sage', label: 'Sage', hex: '#9DB8A0' },
  { id: 'dusk', label: 'Dusty blue', hex: '#93AAC7' },
  { id: 'clay', label: 'Clay', hex: '#C9A08C' },
  { id: 'mauve', label: 'Mauve', hex: '#B59BB8' },
  { id: 'sand', label: 'Sand', hex: '#CDB98A' },
  { id: 'teal', label: 'Sea glass', hex: '#8FB3B5' },
  { id: 'rose', label: 'Rose', hex: '#C79A9E' },
  { id: 'iris', label: 'Iris', hex: '#A6A3C9' },
] as const;

export type ColorId = (typeof PALETTE)[number]['id'];

export function isColorId(value: unknown): value is ColorId {
  return PALETTE.some((c) => c.id === value);
}

export function colorHex(id: string): string {
  return PALETTE.find((c) => c.id === id)?.hex ?? '#9AA1AD';
}

export const TURN_TIMERS = [
  { ms: 5 * 60_000, label: '5m', long: '5 minutes', hint: 'Basically live. Good for a game night together.' },
  {
    ms: 30 * 60_000,
    label: '30m',
    long: '30 minutes',
    hint: 'Live-ish. Fine if people step away for a bit.',
  },
  { ms: 60 * 60_000, label: '1h', long: '1 hour', hint: 'Quick async. Check in between meetings.' },
  {
    ms: 6 * 3_600_000,
    label: '6h',
    long: '6 hours',
    hint: 'A couple of moves a day. Missed turns auto-check or fold.',
  },
  {
    ms: 12 * 3_600_000,
    label: '12h',
    long: '12 hours',
    hint: 'Play around your day. Missed turns auto-check or fold.',
  },
] as const;

export const BLIND_OPTIONS = [
  { sb: 1, bb: 2, label: '$1/$2' },
  { sb: 2, bb: 5, label: '$2/$5' },
  { sb: 5, bb: 10, label: '$5/$10' },
] as const;

export const STACK_OPTIONS = [100, 200, 500] as const;
