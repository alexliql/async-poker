import type { ClientCommand, CommandResponse, DeviceLink, LogEntry, TableView } from '@holdem/engine';

export type Connection = 'live' | 'reconnecting' | 'offline';

export type ClientStatus = 'loading' | 'ready' | 'unauthorized' | 'not_found' | 'error';

export interface ClientSnapshot {
  status: ClientStatus;
  seq: number;
  view: TableView | null;
  /** When this seat last opened the table before now: drives "While you were away". */
  lastSeenAt: number | null;
  connection: Connection;
  error: string | null;
}

/** One accepted change to the table, as this seat sees it. */
export interface TableUpdate {
  seq: number;
  view: TableView;
  entries: LogEntry[];
  /** Updates were missed or this is the first view: show it without replaying animations. */
  jump: boolean;
}

export type SendResult = CommandResponse | { ok: false; code: 'network'; message: string; seq?: number };

/**
 * The table as the app sees it. The server is authoritative: clients never apply a move locally,
 * they send it and wait for the update. `RemoteTableClient` talks to the Worker;
 * `LocalTableClient` runs the engine in the page against bots, for the demo and for development.
 */
export interface TableClient {
  readonly slug: string;
  subscribe(listener: () => void): () => void;
  getSnapshot(): ClientSnapshot;
  onUpdate(listener: (u: TableUpdate) => void): () => void;
  send(command: ClientCommand): Promise<SendResult>;
  /** Server time, estimated from the last message. */
  now(): number;
  /** A one-time link that opens this seat on another device. Absent for practice tables. */
  deviceLink?(): Promise<DeviceLink>;
  /** Ask for a fresh view now (after returning to the tab, say). */
  refresh(): void;
  close(): void;
}

export const EMPTY_SNAPSHOT: ClientSnapshot = {
  status: 'loading',
  seq: -1,
  view: null,
  lastSeenAt: null,
  connection: 'live',
  error: null,
};
