/** "$1,234". */
export function money(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

/** "+$212", "−$40", "$0" (a real minus sign). */
export function signedMoney(n: number): string {
  if (n > 0) return '+' + money(n);
  if (n < 0) return '−' + money(-n);
  return '$0';
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Time remaining on a clock, compact: "11h 42m", "7h", "18m", "45s". */
export function timeLeft(ms: number): string {
  if (ms <= 0) return '0s';
  if (ms < MIN) return `${Math.ceil(ms / 1000)}s`;
  if (ms < HOUR) return `${Math.ceil(ms / MIN)}m`;
  const h = Math.floor(ms / HOUR);
  const m = Math.floor((ms % HOUR) / MIN);
  if (h >= 10 || m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** How long ago, compact: "now", "4m", "3h", "2d". */
export function ago(ms: number): string {
  if (ms < MIN) return 'now';
  if (ms < HOUR) return `${Math.floor(ms / MIN)}m`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h`;
  return `${Math.floor(ms / DAY)}d`;
}

/** A duration in words for summaries: "2 days", "3 hours", "40 minutes". */
export function duration(ms: number): string {
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  if (ms >= DAY) return plural(Math.round(ms / DAY), 'day');
  if (ms >= HOUR) return plural(Math.round(ms / HOUR), 'hour');
  return plural(Math.max(1, Math.round(ms / MIN)), 'minute');
}

/** Turn timer for headers: "12h turns", "30m turns". */
export function timerLabel(ms: number): string {
  if (ms >= HOUR && ms % HOUR === 0) return `${ms / HOUR}h`;
  if (ms >= MIN && ms % MIN === 0) return `${ms / MIN}m`;
  return `${Math.round(ms / 1000)}s`;
}

export function initial(name: string): string {
  const ch = [...name.trim()][0];
  return ch ? ch.toUpperCase() : '?';
}

export function plural(n: number, one: string, many = one + 's'): string {
  return `${n} ${n === 1 ? one : many}`;
}
