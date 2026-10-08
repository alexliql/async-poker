import type { ClientCommand, DeviceLink, ServerMessage, TableView } from '@holdem/engine';
import { ApiError, api, isNetworkError, liveUrl, newClientId } from './api';
import {
  type ClientSnapshot,
  type Connection,
  EMPTY_SNAPSHOT,
  type SendResult,
  type TableClient,
  type TableUpdate,
} from './types';

const PING_MS = 25_000;
/** No message for this long means the socket is dead even if it claims to be open. */
const SILENCE_MS = 65_000;
const BACKOFF_MIN_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
/** If a command's update hasn't arrived over the socket by now, fetch it. */
const UPDATE_GRACE_MS = 1_200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Talks to one table on the server: one GET for the first view, then a WebSocket that pushes every
 * change as this seat's view. Reconnects with backoff and catches up from a fresh view each time.
 */
export class RemoteTableClient implements TableClient {
  private snap: ClientSnapshot = EMPTY_SNAPSHOT;
  private readonly listeners = new Set<() => void>();
  private readonly updateListeners = new Set<(u: TableUpdate) => void>();
  private ws: WebSocket | null = null;
  private retries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastMessageAt = 0;
  private offset = 0;
  private closed = false;
  private freshSocket = false;

  constructor(
    readonly slug: string,
    private readonly token: string,
  ) {
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
    document.addEventListener('visibilitychange', this.onVisibility);
    void this.connect(false);
  }

  // ---------- TableClient ----------

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): ClientSnapshot {
    return this.snap;
  }

  onUpdate(listener: (u: TableUpdate) => void): () => void {
    this.updateListeners.add(listener);
    return () => this.updateListeners.delete(listener);
  }

  now(): number {
    return Date.now() + this.offset;
  }

  refresh(): void {
    void this.load(true);
  }

  deviceLink(): Promise<DeviceLink> {
    return api.deviceLink(this.slug, this.token);
  }

  async send(command: ClientCommand): Promise<SendResult> {
    // One id for every retry, so a retried move can never be applied twice.
    const body = { clientId: newClientId(), command };
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await api.command(this.slug, this.token, body);
        if (res.ok) this.expect(res.seq);
        else if (res.seq !== undefined && res.seq > this.snap.seq) this.refresh();
        return res;
      } catch (err) {
        if (isNetworkError(err) && attempt < 2 && !this.closed) {
          await sleep(700 * (attempt + 1));
          continue;
        }
        if (err instanceof ApiError) {
          if (err.status === 401) this.revoke();
          if (err.code === 'network') return { ok: false, code: 'network', message: err.message };
          return { ok: false, code: err.code as 'bad_request', message: err.message };
        }
        return { ok: false, code: 'network', message: 'Something went wrong' };
      }
    }
  }

  close(): void {
    this.closed = true;
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
    document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.stopPing();
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000, 'bye');
  }

  // ---------- internals ----------

  private set(patch: Partial<ClientSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    for (const l of this.listeners) l();
  }

  private setConnection(c: Connection): void {
    if (this.snap.connection !== c) this.set({ connection: c });
  }

  private accept(seq: number, view: TableView, entries: TableUpdate['entries'], jump: boolean): void {
    if (this.snap.view && seq <= this.snap.seq) return;
    this.set({ status: 'ready', seq, view, error: null });
    const u: TableUpdate = { seq, view, entries, jump };
    for (const l of this.updateListeners) l(u);
  }

  private revoke(): void {
    this.set({ status: 'unauthorized' });
    this.close();
  }

  /** Fetches the view. `peek` leaves "last seen" alone; a full load also reports when we were last here. */
  private async load(peek: boolean): Promise<boolean> {
    try {
      const r = await api.view(this.slug, this.token, peek);
      if (this.closed) return false;
      this.offset = r.serverNow - Date.now();
      if (!peek) this.set({ lastSeenAt: r.lastSeenAt });
      this.accept(r.seq, r.view, [], true);
      return true;
    } catch (err) {
      if (this.closed) return false;
      if (err instanceof ApiError && err.status === 401) this.revoke();
      else if (err instanceof ApiError && err.status === 404) {
        this.set({ status: 'not_found' });
        this.close();
      } else if (!this.snap.view) {
        this.set({ status: 'error', error: err instanceof Error ? err.message : 'Could not load the table' });
      }
      return false;
    }
  }

  private async connect(peek: boolean): Promise<void> {
    if (this.closed) return;
    const ok = await this.load(peek);
    if (this.closed) return;
    if (!ok) {
      this.scheduleReconnect();
      return;
    }
    this.openSocket();
  }

  private openSocket(): void {
    if (this.closed) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(liveUrl(this.slug, this.token));
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    this.freshSocket = true;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.retries = 0;
      this.lastMessageAt = Date.now();
      this.setConnection('live');
      this.startPing();
    };
    ws.onmessage = (ev) => {
      if (this.ws !== ws || typeof ev.data !== 'string') return;
      this.lastMessageAt = Date.now();
      let msg: ServerMessage;
      try {
        msg = JSON.parse(ev.data) as ServerMessage;
      } catch {
        return;
      }
      if (msg.type === 'revoked') {
        this.revoke();
        return;
      }
      this.offset = msg.serverNow - Date.now();
      if (msg.type === 'update') {
        // The first message on a new socket is a catch-up snapshot, not a live change.
        const jump = this.freshSocket;
        this.freshSocket = false;
        this.accept(msg.seq, msg.view, msg.entries, jump);
      }
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.stopPing();
      if (this.closed) return;
      if (ev.code === 4001) {
        this.revoke();
        return;
      }
      this.scheduleReconnect();
    };
    ws.onerror = () => {
      // onclose follows and handles it
    };
  }

  private scheduleReconnect(): void {
    if (this.closed || this.retryTimer) return;
    this.setConnection(navigator.onLine === false ? 'offline' : 'reconnecting');
    const base = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** this.retries);
    const delay = Math.round(base * (0.6 + Math.random() * 0.4));
    this.retries += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.connect(true);
    }, delay);
  }

  private reconnectNow(): void {
    if (this.closed) return;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.retries = 0;
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    void this.connect(true);
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      const ws = this.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (Date.now() - this.lastMessageAt > SILENCE_MS) {
        this.reconnectNow();
        return;
      }
      ws.send(JSON.stringify({ type: 'ping' }));
    }, PING_MS);
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  /** The socket normally delivers the update for our own command; fall back to a fetch. */
  private expect(seq: number): void {
    if (this.snap.seq >= seq) return;
    setTimeout(() => {
      if (!this.closed && this.snap.seq < seq) this.refresh();
    }, UPDATE_GRACE_MS);
  }

  private readonly onOnline = () => this.reconnectNow();

  private readonly onOffline = () => this.setConnection('offline');

  private readonly onVisibility = () => {
    if (this.closed) return;
    if (document.visibilityState === 'hidden') {
      // Marks when we left, so the next visit can recap what happened since.
      void api.view(this.slug, this.token, false).catch(() => undefined);
      return;
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.reconnectNow();
      return;
    }
    // Phones freeze background sockets; a fresh view is cheap and settles any doubt.
    void (async () => {
      try {
        const r = await api.view(this.slug, this.token, false);
        if (this.closed) return;
        this.offset = r.serverNow - Date.now();
        this.set({ lastSeenAt: r.lastSeenAt });
        this.accept(r.seq, r.view, [], true);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) this.revoke();
      }
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'ping' }));
    })();
  };
}
