import type { Command, LogEntry, RejectCode } from './types';
import type { TableView } from './view';

/** Wire types shared by the server and the web app. */

export interface CreateTableRequest {
  tableName: string;
  name: string;
  color: string;
  phrase: string;
  smallBlind: number;
  bigBlind: number;
  buyIn: number;
  turnTimerMs: number;
  maxSeats: number;
}

export interface JoinRequest {
  name: string;
  color: string;
  phrase: string;
}

export interface SeatGrant {
  slug: string;
  seat: number;
  token: string;
}

export interface PreviewSeat {
  seat: number;
  name: string;
  color: string;
  phrase: string;
  isHost: boolean;
}

/** Public facts about a table: what the Join screen and link previews show. Never secret. */
export interface TablePreview {
  slug: string;
  name: string;
  phase: 'lobby' | 'playing' | 'ended';
  hostName: string;
  smallBlind: number;
  bigBlind: number;
  buyIn: number;
  turnTimerMs: number;
  maxSeats: number;
  seats: PreviewSeat[];
  open: number;
  handNo: number;
  toAct: {
    seat: number;
    name: string;
    toCall: number;
    deadlineAt: number | null;
    lastAction: string | null;
  } | null;
}

export interface ViewResponse {
  seq: number;
  serverNow: number;
  view: TableView;
  /** When this seat last opened the table, before this request. Drives the "while you were away" recap. */
  lastSeenAt: number | null;
}

export type ClientCommand = Exclude<Command, { type: 'join' } | { type: 'tick' }>;

export interface CommandRequest {
  clientId: string;
  command: ClientCommand;
}

export type CommandResponse =
  | { ok: true; seq: number }
  | {
      ok: false;
      code: RejectCode | 'unauthorized' | 'not_found' | 'rate_limited' | 'bad_request';
      message: string;
      seq?: number;
    };

export interface DeviceLink {
  code: string;
  expiresAt: number;
}

export type ServerMessage =
  | { type: 'update'; seq: number; serverNow: number; view: TableView; entries: LogEntry[] }
  | { type: 'pong'; serverNow: number }
  | { type: 'revoked' };

export type ClientMessage = { type: 'ping' };

export interface ApiError {
  ok: false;
  code: string;
  message: string;
}
