const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
/** No 0/o/1/l/i: easy to read aloud and type from a screenshot. */
const SLUG_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

function randomString(length: number, alphabet: string): string {
  const out: string[] = [];
  const limit = 256 - (256 % alphabet.length);
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of bytes) {
      if (b < limit && out.length < length) out.push(alphabet[b % alphabet.length]!);
    }
  }
  return out.join('');
}

/** 256 bits of randomness. */
export function newToken(): string {
  return randomString(43, B64URL);
}

export function newSlug(): string {
  return randomString(6, SLUG_ALPHABET);
}

export function newDeviceCode(): string {
  return randomString(8, SLUG_ALPHABET);
}

export function isSlug(value: string): boolean {
  return /^[a-hjkmnp-z2-9]{6}$/.test(value);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Small fixed-window limiter, per isolate. Good enough to blunt scripted abuse of create/join. */
export class RateLimiter {
  private hits = new Map<string, { windowStart: number; count: number }>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string, now: number): boolean {
    const h = this.hits.get(key);
    if (!h || now - h.windowStart >= this.windowMs) {
      this.hits.set(key, { windowStart: now, count: 1 });
      if (this.hits.size > 10_000) this.prune(now);
      return true;
    }
    h.count += 1;
    return h.count <= this.limit;
  }

  private prune(now: number) {
    for (const [k, h] of this.hits) if (now - h.windowStart >= this.windowMs) this.hits.delete(k);
  }
}
