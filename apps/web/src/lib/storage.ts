/**
 * Seat tokens live in localStorage, one per table. Storage can be unavailable (private mode,
 * blocked site data), so every access is guarded and the app keeps working for the session.
 */
export interface StoredSeat {
  seat: number;
  token: string;
}

export interface Profile {
  name: string;
  color: string;
  phrase: string;
}

const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    const v = window.localStorage.getItem(key);
    if (v !== null) return v;
  } catch {
    // fall through to memory
  }
  return memory.get(key) ?? null;
}

function write(key: string, value: string | null): void {
  if (value === null) memory.delete(key);
  else memory.set(key, value);
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // memory copy is enough for this session
  }
}

function parse<T>(raw: string | null, valid: (v: unknown) => v is T): T | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    return valid(v) ? v : null;
  } catch {
    return null;
  }
}

function isSeat(v: unknown): v is StoredSeat {
  const o = v as StoredSeat;
  return !!o && typeof o.seat === 'number' && typeof o.token === 'string' && o.token.length > 20;
}

function isProfile(v: unknown): v is Profile {
  const o = v as Profile;
  return !!o && typeof o.name === 'string' && typeof o.color === 'string' && typeof o.phrase === 'string';
}

export function getSeat(slug: string): StoredSeat | null {
  return parse(read(`holdem:seat:${slug}`), isSeat);
}

export function setSeat(slug: string, seat: StoredSeat): void {
  write(`holdem:seat:${slug}`, JSON.stringify(seat));
}

export function clearSeat(slug: string): void {
  write(`holdem:seat:${slug}`, null);
}

export function getProfile(): Profile | null {
  return parse(read('holdem:profile'), isProfile);
}

export function setProfile(p: Profile): void {
  write('holdem:profile', JSON.stringify(p));
}
