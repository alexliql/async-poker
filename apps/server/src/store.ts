import type { Command, TableState } from '@holdem/engine';

export interface CommandRecord {
  seq: number;
  at: number;
  seat: number | null;
  clientId: string | null;
  command: Command;
  /** Random numbers drawn while applying the command, so the log replays exactly. */
  draws: number[];
}

/**
 * Persistence for one table. Synchronous because Durable Object SQLite storage is synchronous,
 * which keeps every command's read-apply-write step atomic inside the object.
 */
export interface Store {
  getMeta(key: string): string | null;
  setMeta(key: string, value: string): void;
  loadSnapshot(): { seq: number; state: TableState } | null;
  /** Appends the command and replaces the snapshot in one transaction. */
  commit(record: CommandRecord, state: TableState): void;
  commands(): CommandRecord[];
  seqForClientId(seat: number, clientId: string): number | null;
  putToken(seat: number, tokenHash: string): void;
  seatForToken(tokenHash: string): number | null;
  revokeSeat(seat: number): void;
  lastSeen(seat: number): number | null;
  setLastSeen(seat: number, at: number): void;
  putDeviceCode(codeHash: string, seat: number, expiresAt: number): void;
  /** Returns the seat and deletes the code, if it exists and has not expired. */
  takeDeviceCode(codeHash: string, now: number): number | null;
}

/** In-memory store for tests and local tooling. */
export class MemoryStore implements Store {
  private meta = new Map<string, string>();
  private snapshot: { seq: number; json: string } | null = null;
  private log: CommandRecord[] = [];
  private tokens = new Map<string, number>();
  private seen = new Map<number, number>();
  private codes = new Map<string, { seat: number; expiresAt: number }>();

  getMeta(key: string) {
    return this.meta.get(key) ?? null;
  }
  setMeta(key: string, value: string) {
    this.meta.set(key, value);
  }
  loadSnapshot() {
    return this.snapshot
      ? { seq: this.snapshot.seq, state: JSON.parse(this.snapshot.json) as TableState }
      : null;
  }
  commit(record: CommandRecord, state: TableState) {
    this.log.push(structuredClone(record));
    this.snapshot = { seq: record.seq, json: JSON.stringify(state) };
  }
  commands() {
    return structuredClone(this.log);
  }
  seqForClientId(seat: number, clientId: string) {
    return this.log.find((r) => r.seat === seat && r.clientId === clientId)?.seq ?? null;
  }
  putToken(seat: number, tokenHash: string) {
    this.tokens.set(tokenHash, seat);
  }
  seatForToken(tokenHash: string) {
    return this.tokens.get(tokenHash) ?? null;
  }
  revokeSeat(seat: number) {
    for (const [hash, s] of this.tokens) if (s === seat) this.tokens.delete(hash);
  }
  lastSeen(seat: number) {
    return this.seen.get(seat) ?? null;
  }
  setLastSeen(seat: number, at: number) {
    this.seen.set(seat, at);
  }
  putDeviceCode(codeHash: string, seat: number, expiresAt: number) {
    this.codes.set(codeHash, { seat, expiresAt });
  }
  takeDeviceCode(codeHash: string, now: number) {
    const c = this.codes.get(codeHash);
    if (!c) return null;
    this.codes.delete(codeHash);
    return c.expiresAt > now ? c.seat : null;
  }
}
