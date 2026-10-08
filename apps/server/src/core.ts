import {
  type ApplyResult,
  type ClientCommand,
  type Command,
  type CommandRequest,
  type CommandResponse,
  type CreateTableRequest,
  type DeviceLink,
  type JoinRequest,
  type LogEntry,
  type RandomInt,
  type SeatGrant,
  type ServerMessage,
  type TableConfig,
  type TablePreview,
  type TableState,
  type ViewResponse,
  BLIND_OPTIONS,
  MAX_SEATS,
  MIN_SEATS,
  STACK_OPTIONS,
  TURN_TIMERS,
  apply,
  createTable,
  nextDeadline,
  presentSeats,
  validateConfig,
  viewFor,
} from '@holdem/engine';
import { newDeviceCode, newToken, sha256Hex } from './security';
import type { Store } from './store';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface CoreSettings {
  undoMs: number;
  handPauseMs: number;
  /** Testing only: replaces the chosen turn timer. */
  turnTimerOverrideMs: number | null;
}

export const DEFAULT_SETTINGS: CoreSettings = {
  undoMs: 5_000,
  handPauseMs: 8_000,
  turnTimerOverrideMs: null,
};

const DEVICE_CODE_TTL_MS = 10 * 60_000;
const CLIENT_COMMANDS = new Set<ClientCommand['type']>([
  'start',
  'act',
  'undo',
  'setPre',
  'rebuy',
  'sitOut',
  'sitIn',
  'leave',
  'kick',
  'transferHost',
  'endGame',
]);

interface CreatedMeta {
  slug: string;
  config: TableConfig;
  host: { name: string; color: string; phrase: string };
  createdAt: number;
}

export interface Change {
  seq: number;
  entries: LogEntry[];
  /** Seats whose access was revoked by this change (kicked from the lobby). */
  revoked: number[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Everything a table does, independent of Cloudflare: authentication, the command pipeline,
 * timers and per-seat views. The Durable Object wraps this with HTTP, WebSockets and alarms.
 *
 * Methods that need hashing are async, but every state change happens synchronously after the
 * last await, so concurrent requests can never interleave inside a read-apply-write.
 */
export class TableCore {
  private state: TableState | null = null;
  private seq = 0;
  private slugValue: string | null = null;

  constructor(
    private readonly store: Store,
    private readonly clock: () => number,
    private readonly random: RandomInt,
    private readonly settings: CoreSettings = DEFAULT_SETTINGS,
  ) {
    const snap = store.loadSnapshot();
    if (snap) {
      this.state = snap.state;
      this.seq = snap.seq;
    }
    const meta = store.getMeta('created');
    if (meta) this.slugValue = (JSON.parse(meta) as CreatedMeta).slug;
  }

  get initialized(): boolean {
    return this.state !== null;
  }

  get slug(): string {
    return this.slugValue ?? '';
  }

  private requireState(): TableState {
    if (!this.state) throw new HttpError(404, 'not_found', 'No such table');
    return this.state;
  }

  // ---------- creation and joining ----------

  async init(slug: string, body: unknown): Promise<SeatGrant> {
    if (this.state) throw new HttpError(409, 'exists', 'Table already exists');
    const req = parseCreate(body);
    const now = this.clock();
    const config: TableConfig = {
      name: req.tableName,
      smallBlind: req.smallBlind,
      bigBlind: req.bigBlind,
      buyIn: req.buyIn,
      turnTimerMs: this.settings.turnTimerOverrideMs ?? req.turnTimerMs,
      maxSeats: req.maxSeats,
      undoMs: this.settings.undoMs,
      handPauseMs: this.settings.handPauseMs,
    };
    const problem = validateConfig(config);
    if (problem) throw new HttpError(400, 'bad_request', problem);
    let state: TableState;
    try {
      state = createTable(config, { name: req.name, color: req.color, phrase: req.phrase }, now);
    } catch (err) {
      throw new HttpError(400, 'bad_request', (err as Error).message);
    }
    const token = newToken();
    const hash = await sha256Hex(token);
    const meta: CreatedMeta = {
      slug,
      config,
      host: { name: req.name, color: req.color, phrase: req.phrase },
      createdAt: now,
    };
    this.store.setMeta('created', JSON.stringify(meta));
    this.store.putToken(0, hash);
    this.store.commit(
      { seq: 0, at: now, seat: null, clientId: null, command: { type: 'tick' }, draws: [] },
      state,
    );
    this.state = state;
    this.seq = 0;
    this.slugValue = slug;
    return { slug, seat: 0, token };
  }

  async join(body: unknown): Promise<{ grant: SeatGrant; change: Change }> {
    this.requireState();
    if (!isRecord(body)) throw new HttpError(400, 'bad_request', 'Expected a JSON object');
    const req: JoinRequest = {
      name: String(body.name ?? ''),
      color: String(body.color ?? ''),
      phrase: typeof body.phrase === 'string' ? body.phrase : '',
    };
    const token = newToken();
    const hash = await sha256Hex(token);
    const { change, ticked, seat } = this.execute({ type: 'join', ...req }, null, null);
    this.store.putToken(seat!, hash);
    return { grant: { slug: this.slug, seat: seat!, token }, change: mergeChanges(ticked, change)! };
  }

  async authenticate(token: string | null): Promise<number> {
    this.requireState();
    if (!token) throw new HttpError(401, 'unauthorized', 'Missing seat token');
    const seat = this.store.seatForToken(await sha256Hex(token));
    if (seat === null) throw new HttpError(401, 'unauthorized', 'Unknown seat token');
    return seat;
  }

  async deviceLink(seat: number): Promise<DeviceLink> {
    this.requireState();
    const code = newDeviceCode();
    const expiresAt = this.clock() + DEVICE_CODE_TTL_MS;
    this.store.putDeviceCode(await sha256Hex(code), seat, expiresAt);
    return { code, expiresAt };
  }

  async claim(code: unknown): Promise<SeatGrant> {
    this.requireState();
    if (typeof code !== 'string' || !/^[a-z0-9]{8}$/.test(code))
      throw new HttpError(400, 'bad_request', 'Bad code');
    const codeHash = await sha256Hex(code);
    const token = newToken();
    const tokenHash = await sha256Hex(token);
    const seat = this.store.takeDeviceCode(codeHash, this.clock());
    if (seat === null) throw new HttpError(410, 'expired', 'That link has expired or was already used');
    this.store.putToken(seat, tokenHash);
    return { slug: this.slug, seat, token };
  }

  // ---------- reading ----------

  preview(): TablePreview {
    const s = this.requireState();
    const present = presentSeats(s);
    const hand = s.hand;
    let toAct: TablePreview['toAct'] = null;
    if (hand && hand.street !== 'over' && hand.toAct !== null) {
      const p = hand.players.find((x) => x.seat === hand.toAct)!;
      const seat = s.seats[hand.toAct]!;
      const start = s.log.findLastIndex((e) => e.k === 'hand' && e.no === hand.no);
      const last = s.log
        .slice(Math.max(0, start))
        .findLast((e): e is Extract<LogEntry, { k: 'act' }> => e.k === 'act' && e.seat !== hand.toAct);
      toAct = {
        seat: hand.toAct,
        name: seat.name,
        toCall: Math.max(0, Math.min(hand.currentBet - p.bet, seat.stack)),
        deadlineAt: hand.deadlineAt,
        lastAction: last
          ? `${s.seats[last.seat]!.name} ${last.verb}${last.amount !== null ? ` $${last.amount}` : ''}.`
          : null,
      };
    }
    return {
      slug: this.slug,
      name: s.config.name,
      phase: s.phase,
      hostName: s.seats[s.hostSeat]!.name,
      smallBlind: s.config.smallBlind,
      bigBlind: s.config.bigBlind,
      buyIn: s.config.buyIn,
      turnTimerMs: s.config.turnTimerMs,
      maxSeats: s.config.maxSeats,
      seats: present.map((x) => ({
        seat: x.seat,
        name: x.name,
        color: x.color,
        phrase: x.phrase,
        isHost: x.seat === s.hostSeat,
      })),
      open: Math.max(0, s.config.maxSeats - present.length),
      handNo: s.handNo,
      toAct,
    };
  }

  view(seat: number, markSeen = true): ViewResponse {
    const s = this.requireState();
    const now = this.clock();
    const lastSeenAt = this.store.lastSeen(seat);
    if (markSeen) this.store.setLastSeen(seat, now);
    return { seq: this.seq, serverNow: now, view: viewFor(s, seat), lastSeenAt };
  }

  message(seat: number, entries: LogEntry[]): ServerMessage {
    const s = this.requireState();
    return { type: 'update', seq: this.seq, serverNow: this.clock(), view: viewFor(s, seat), entries };
  }

  // ---------- changing ----------

  /** Runs anything that fell due. Returns the change, or null if nothing happened. */
  tick(): Change | null {
    if (!this.state) return null;
    const r = this.run({ type: 'tick' }, null);
    if (!r.result.ok) throw new Error(`tick rejected: ${r.result.code}`);
    if (r.result.entries.length === 0) return null;
    return this.persist(r.result, { type: 'tick' }, null, null, r.draws);
  }

  async command(
    token: string | null,
    body: unknown,
  ): Promise<{ response: CommandResponse; change: Change | null; ticked: Change | null }> {
    const seat = await this.authenticate(token);
    if (!isRecord(body) || typeof body.clientId !== 'string' || !isRecord(body.command))
      throw new HttpError(400, 'bad_request', 'Expected { clientId, command }');
    const req = body as unknown as CommandRequest;
    if (req.clientId.length < 8 || req.clientId.length > 64)
      throw new HttpError(400, 'bad_request', 'Bad clientId');
    if (!CLIENT_COMMANDS.has(req.command.type)) throw new HttpError(400, 'bad_request', 'Unknown command');

    const dupe = this.store.seqForClientId(seat, req.clientId);
    if (dupe !== null) return { response: { ok: true, seq: dupe }, change: null, ticked: null };

    const ticked = this.tick();
    const r = this.run(req.command, seat);
    if (!r.result.ok) {
      return {
        response: { ok: false, code: r.result.code, message: r.result.message, seq: this.seq },
        change: null,
        ticked,
      };
    }
    const change = this.persist(r.result, req.command, seat, req.clientId, r.draws);
    if (req.command.type === 'kick') {
      this.store.revokeSeat(req.command.seat);
      change.revoked.push(req.command.seat);
    }
    return { response: { ok: true, seq: change.seq }, change, ticked };
  }

  private execute(
    cmd: Command,
    seat: number | null,
    clientId: string | null,
  ): { change: Change; ticked: Change | null; seat?: number } {
    const ticked = this.tick();
    const r = this.run(cmd, seat);
    if (!r.result.ok) {
      const status = r.result.code === 'table_full' ? 409 : 400;
      throw new HttpError(status, r.result.code, r.result.message);
    }
    const change = this.persist(r.result, cmd, seat, clientId, r.draws);
    return r.result.seat === undefined ? { change, ticked } : { change, ticked, seat: r.result.seat };
  }

  private run(cmd: Command, seat: number | null): { result: ApplyResult; draws: number[] } {
    const state = this.requireState();
    const draws: number[] = [];
    const randomInt: RandomInt = (n) => {
      const v = this.random(n);
      draws.push(v);
      return v;
    };
    return { result: apply(state, cmd, seat, { now: this.clock(), randomInt }), draws };
  }

  private persist(
    result: Extract<ApplyResult, { ok: true }>,
    command: Command,
    seat: number | null,
    clientId: string | null,
    draws: number[],
  ): Change {
    const seq = this.seq + 1;
    this.store.commit({ seq, at: this.clock(), seat, clientId, command, draws }, result.state);
    this.store.setMeta('touched', String(this.clock()));
    this.state = result.state;
    this.seq = seq;
    return { seq, entries: result.entries, revoked: [] };
  }

  /** When the table next needs a tick. */
  nextAlarm(): number | null {
    return this.state ? nextDeadline(this.state) : null;
  }

  /** Last time anything happened at this table. */
  get touchedAt(): number {
    return Number(this.store.getMeta('touched') ?? this.state?.createdAt ?? 0);
  }

  get currentSeq(): number {
    return this.seq;
  }

  /** Rebuilds the table from its command log; used to verify the log is a complete record. */
  replay(): TableState {
    const meta = this.store.getMeta('created');
    if (!meta) throw new Error('No table');
    const created = JSON.parse(meta) as CreatedMeta;
    let state = createTable(created.config, created.host, created.createdAt);
    for (const rec of this.store.commands()) {
      if (rec.seq === 0) continue;
      let i = 0;
      const randomInt: RandomInt = () => {
        const v = rec.draws[i++];
        if (v === undefined) throw new Error(`replay ran out of draws at seq ${rec.seq}`);
        return v;
      };
      const r = apply(state, rec.command, rec.seat, { now: rec.at, randomInt });
      if (!r.ok) throw new Error(`replay rejected seq ${rec.seq}: ${r.code}`);
      state = r.state;
    }
    return state;
  }
}

/** Combines a tick that ran first with the command that followed, for one broadcast. */
export function mergeChanges(a: Change | null, b: Change | null): Change | null {
  if (!a) return b;
  if (!b) return a;
  return { seq: b.seq, entries: [...a.entries, ...b.entries], revoked: [...a.revoked, ...b.revoked] };
}

function parseCreate(body: unknown): CreateTableRequest {
  if (!isRecord(body)) throw new HttpError(400, 'bad_request', 'Expected a JSON object');
  const num = (k: string) => {
    const v = body[k];
    if (typeof v !== 'number' || !Number.isInteger(v))
      throw new HttpError(400, 'bad_request', `${k} must be an integer`);
    return v;
  };
  const req: CreateTableRequest = {
    tableName: String(body.tableName ?? ''),
    name: String(body.name ?? ''),
    color: String(body.color ?? ''),
    phrase: typeof body.phrase === 'string' ? body.phrase : '',
    smallBlind: num('smallBlind'),
    bigBlind: num('bigBlind'),
    buyIn: num('buyIn'),
    turnTimerMs: num('turnTimerMs'),
    maxSeats: num('maxSeats'),
  };
  if (!BLIND_OPTIONS.some((b) => b.sb === req.smallBlind && b.bb === req.bigBlind))
    throw new HttpError(400, 'bad_request', 'Unsupported blinds');
  if (!(STACK_OPTIONS as readonly number[]).includes(req.buyIn))
    throw new HttpError(400, 'bad_request', 'Unsupported buy-in');
  if (!TURN_TIMERS.some((t) => t.ms === req.turnTimerMs))
    throw new HttpError(400, 'bad_request', 'Unsupported turn timer');
  if (req.maxSeats < MIN_SEATS || req.maxSeats > MAX_SEATS)
    throw new HttpError(400, 'bad_request', 'Unsupported seat count');
  return req;
}
