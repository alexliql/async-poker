import type { TableState } from '@holdem/engine';
import type { CommandRecord, Store } from './store';

const SCHEMA_VERSION = 1;

/** Store backed by a Durable Object's SQLite database. */
export class SqlStore implements Store {
  constructor(private readonly storage: DurableObjectStorage) {
    this.migrate();
  }

  private get sql() {
    return this.storage.sql;
  }

  private migrate() {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`);
    const row = [...this.sql.exec<{ v: string }>(`SELECT v FROM meta WHERE k = 'schema'`)][0];
    const version = row ? Number(row.v) : 0;
    if (version < 1) {
      this.storage.transactionSync(() => {
        this.sql.exec(`CREATE TABLE IF NOT EXISTS commands (
          seq INTEGER PRIMARY KEY, at INTEGER NOT NULL, seat INTEGER, client_id TEXT,
          command TEXT NOT NULL, draws TEXT NOT NULL)`);
        this.sql.exec(
          `CREATE UNIQUE INDEX IF NOT EXISTS commands_client ON commands (seat, client_id) WHERE client_id IS NOT NULL`,
        );
        this.sql.exec(
          `CREATE TABLE IF NOT EXISTS snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), seq INTEGER NOT NULL, state TEXT NOT NULL)`,
        );
        this.sql.exec(
          `CREATE TABLE IF NOT EXISTS tokens (token_hash TEXT PRIMARY KEY, seat INTEGER NOT NULL)`,
        );
        this.sql.exec(`CREATE TABLE IF NOT EXISTS seen (seat INTEGER PRIMARY KEY, at INTEGER NOT NULL)`);
        this.sql.exec(
          `CREATE TABLE IF NOT EXISTS device_codes (code_hash TEXT PRIMARY KEY, seat INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
        );
        this.sql.exec(`INSERT OR REPLACE INTO meta (k, v) VALUES ('schema', ?)`, String(SCHEMA_VERSION));
      });
    }
  }

  getMeta(key: string) {
    const row = [...this.sql.exec<{ v: string }>(`SELECT v FROM meta WHERE k = ?`, key)][0];
    return row ? row.v : null;
  }

  setMeta(key: string, value: string) {
    this.sql.exec(`INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)`, key, value);
  }

  loadSnapshot() {
    const row = [
      ...this.sql.exec<{ seq: number; state: string }>(`SELECT seq, state FROM snapshot WHERE id = 1`),
    ][0];
    return row ? { seq: row.seq, state: JSON.parse(row.state) as TableState } : null;
  }

  commit(record: CommandRecord, state: TableState) {
    this.storage.transactionSync(() => {
      this.sql.exec(
        `INSERT INTO commands (seq, at, seat, client_id, command, draws) VALUES (?, ?, ?, ?, ?, ?)`,
        record.seq,
        record.at,
        record.seat,
        record.clientId,
        JSON.stringify(record.command),
        JSON.stringify(record.draws),
      );
      this.sql.exec(
        `INSERT OR REPLACE INTO snapshot (id, seq, state) VALUES (1, ?, ?)`,
        record.seq,
        JSON.stringify(state),
      );
    });
  }

  commands(): CommandRecord[] {
    return [
      ...this.sql.exec<{
        seq: number;
        at: number;
        seat: number | null;
        client_id: string | null;
        command: string;
        draws: string;
      }>(`SELECT seq, at, seat, client_id, command, draws FROM commands ORDER BY seq`),
    ].map((r) => ({
      seq: r.seq,
      at: r.at,
      seat: r.seat,
      clientId: r.client_id,
      command: JSON.parse(r.command),
      draws: JSON.parse(r.draws),
    }));
  }

  seqForClientId(seat: number, clientId: string) {
    const row = [
      ...this.sql.exec<{ seq: number }>(
        `SELECT seq FROM commands WHERE seat = ? AND client_id = ?`,
        seat,
        clientId,
      ),
    ][0];
    return row ? row.seq : null;
  }

  putToken(seat: number, tokenHash: string) {
    this.sql.exec(`INSERT OR REPLACE INTO tokens (token_hash, seat) VALUES (?, ?)`, tokenHash, seat);
  }

  seatForToken(tokenHash: string) {
    const row = [
      ...this.sql.exec<{ seat: number }>(`SELECT seat FROM tokens WHERE token_hash = ?`, tokenHash),
    ][0];
    return row ? row.seat : null;
  }

  revokeSeat(seat: number) {
    this.sql.exec(`DELETE FROM tokens WHERE seat = ?`, seat);
  }

  lastSeen(seat: number) {
    const row = [...this.sql.exec<{ at: number }>(`SELECT at FROM seen WHERE seat = ?`, seat)][0];
    return row ? row.at : null;
  }

  setLastSeen(seat: number, at: number) {
    this.sql.exec(`INSERT OR REPLACE INTO seen (seat, at) VALUES (?, ?)`, seat, at);
  }

  putDeviceCode(codeHash: string, seat: number, expiresAt: number) {
    this.sql.exec(
      `INSERT OR REPLACE INTO device_codes (code_hash, seat, expires_at) VALUES (?, ?, ?)`,
      codeHash,
      seat,
      expiresAt,
    );
  }

  takeDeviceCode(codeHash: string, now: number) {
    const row = [
      ...this.sql.exec<{ seat: number; expires_at: number }>(
        `SELECT seat, expires_at FROM device_codes WHERE code_hash = ?`,
        codeHash,
      ),
    ][0];
    if (!row) return null;
    this.sql.exec(`DELETE FROM device_codes WHERE code_hash = ?`, codeHash);
    return row.expires_at > now ? row.seat : null;
  }
}
