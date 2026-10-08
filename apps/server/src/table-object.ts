import { DurableObject } from 'cloudflare:workers';
import { cryptoRandomInt, type ClientMessage, type ServerMessage } from '@holdem/engine';
import { type Change, HttpError, TableCore, mergeChanges } from './core';
import { error, json } from './http';
import { SqlStore } from './sql-store';
import type { Env } from './env';
import { settingsFromEnv } from './env';

const IDLE_DELETE_MS = 30 * 24 * 3_600_000;

interface Attachment {
  seat: number;
}

/**
 * One poker table. Durable Objects are single-threaded, so this object is the table's only writer;
 * its alarm drives every deadline (turn timers, undo commits, the next deal).
 */
export class TableObject extends DurableObject<Env> {
  private readonly core: TableCore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.core = new TableCore(
      new SqlStore(ctx.storage),
      () => Date.now(),
      cryptoRandomInt,
      settingsFromEnv(env),
    );
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    try {
      const token = bearer(request) ?? url.searchParams.get('token');
      switch (`${request.method} ${url.pathname}`) {
        case 'POST /init': {
          const grant = await this.core.init(url.searchParams.get('slug') ?? '', await readJson(request));
          await this.reschedule();
          return json(grant, 201);
        }
        case 'GET /preview':
          return json(this.core.preview());
        case 'POST /join': {
          const { grant, change } = await this.core.join(await readJson(request));
          await this.afterChange(change);
          return json(grant, 201);
        }
        case 'GET /view': {
          const seat = await this.core.authenticate(token);
          await this.afterChange(this.core.tick());
          return json(this.core.view(seat, url.searchParams.get('peek') !== '1'));
        }
        case 'POST /commands': {
          const { response, change, ticked } = await this.core.command(token, await readJson(request));
          await this.afterChange(mergeChanges(ticked, change));
          return json(response, response.ok ? 200 : 409);
        }
        case 'POST /device-link':
          return json(await this.core.deviceLink(await this.core.authenticate(token)), 201);
        case 'POST /claim': {
          const body = (await readJson(request)) as { code?: unknown } | null;
          return json(await this.core.claim(body?.code), 201);
        }
        case 'GET /live':
          return await this.acceptSocket(request, token);
        default:
          return error(404, 'not_found', 'No such route');
      }
    } catch (err) {
      if (err instanceof HttpError) return error(err.status, err.code, err.message);
      console.error('table error', err);
      return error(500, 'internal', 'Something went wrong');
    }
  }

  private async acceptSocket(request: Request, token: string | null): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
      return error(426, 'upgrade_required', 'Expected a WebSocket');
    const seat = await this.core.authenticate(token);
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [`seat:${seat}`]);
    server.serializeAttachment({ seat } satisfies Attachment);
    // Catch up immediately; the client may have been offline for hours.
    server.send(JSON.stringify(this.core.message(seat, [])));
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string' || message.length > 1024) return;
    let msg: ClientMessage;
    try {
      msg = JSON.parse(message) as ClientMessage;
    } catch {
      return;
    }
    if (msg.type === 'ping')
      ws.send(JSON.stringify({ type: 'pong', serverNow: Date.now() } satisfies ServerMessage));
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      ws.close(code === 1005 ? 1000 : code, reason);
    } catch {
      // already closed
    }
  }

  override async alarm(): Promise<void> {
    try {
      const change = this.core.tick();
      if (change) this.broadcast(change);
      if (
        this.core.initialized &&
        this.core.nextAlarm() === null &&
        Date.now() - this.core.touchedAt >= IDLE_DELETE_MS
      ) {
        for (const ws of this.ctx.getWebSockets()) ws.close(1001, 'table expired');
        await this.ctx.storage.deleteAll();
        return;
      }
    } catch (err) {
      console.error('alarm error', err);
    }
    // Always reschedule: alarm retries are capped, and a missed deadline would freeze the table.
    await this.reschedule();
  }

  private async afterChange(change: Change | null): Promise<void> {
    if (change) this.broadcast(change);
    await this.reschedule();
  }

  private async reschedule(): Promise<void> {
    const next = this.core.nextAlarm();
    const when = next ?? (this.core.initialized ? this.core.touchedAt + IDLE_DELETE_MS : null);
    if (when === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(Math.max(when, Date.now() + 1));
  }

  private broadcast(change: Change): void {
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att) continue;
      try {
        if (change.revoked.includes(att.seat)) {
          ws.send(JSON.stringify({ type: 'revoked' } satisfies ServerMessage));
          ws.close(4001, 'removed from table');
        } else {
          ws.send(JSON.stringify(this.core.message(att.seat, change.entries)));
        }
      } catch {
        // A dead socket is cleaned up by the runtime.
      }
    }
  }
}

function bearer(request: Request): string | null {
  const h = request.headers.get('Authorization');
  return h?.startsWith('Bearer ') ? h.slice(7) : null;
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > 4096) throw new HttpError(413, 'too_large', 'Request too large');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'bad_request', 'Invalid JSON');
  }
}
