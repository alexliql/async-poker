import { seededRandomInt } from '@holdem/engine';
import { describe, expect, it } from 'vitest';
import { HttpError, TableCore } from '../src/core';
import { MemoryStore } from '../src/store';

const CREATE = {
  tableName: 'Friday Night',
  name: 'Mia',
  color: 'sage',
  phrase: 'Mia never bluffs. Mostly.',
  smallBlind: 1,
  bigBlind: 2,
  buyIn: 200,
  turnTimerMs: 12 * 3_600_000,
  maxSeats: 6,
};

function setup() {
  const store = new MemoryStore();
  const clock = { now: 1_700_000_000_000 };
  const core = new TableCore(store, () => clock.now, seededRandomInt(9), {
    undoMs: 5_000,
    handPauseMs: 8_000,
    turnTimerOverrideMs: null,
  });
  return { store, clock, core };
}

let n = 0;
const cid = () => `client-${++n}-xxxxxxxx`;

async function table() {
  const t = setup();
  const host = await t.core.init('k7q2mn', CREATE);
  const jay = (await t.core.join({ name: 'Jay', color: 'dusk', phrase: '' })).grant;
  const priya = (await t.core.join({ name: 'Priya', color: 'clay', phrase: 'Priya saw that coming.' })).grant;
  return { ...t, host, jay, priya };
}

async function expectHttp(p: Promise<unknown>, status: number, code: string) {
  await expect(p).rejects.toSatisfy(
    (e: unknown) => e instanceof HttpError && e.status === status && e.code === code,
  );
}

describe('creating and joining', () => {
  it('creates a table with the host in seat 0', async () => {
    const { core } = setup();
    const grant = await core.init('k7q2mn', CREATE);
    expect(grant).toMatchObject({ slug: 'k7q2mn', seat: 0 });
    expect(grant.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(core.preview()).toMatchObject({ name: 'Friday Night', hostName: 'Mia', open: 5, phase: 'lobby' });
    await expectHttp(core.init('k7q2mn', CREATE), 409, 'exists');
  });

  it('rejects unsupported settings', async () => {
    await expectHttp(setup().core.init('aaaaaa', { ...CREATE, smallBlind: 3 }), 400, 'bad_request');
    await expectHttp(setup().core.init('aaaaaa', { ...CREATE, turnTimerMs: 1234 }), 400, 'bad_request');
    await expectHttp(setup().core.init('aaaaaa', { ...CREATE, maxSeats: 9 }), 400, 'bad_request');
    await expectHttp(setup().core.init('aaaaaa', { ...CREATE, name: '' }), 400, 'bad_request');
    await expectHttp(setup().core.init('aaaaaa', null), 400, 'bad_request');
  });

  it('joins, and refuses taken names and colors', async () => {
    const { core, jay } = await table();
    expect(jay.seat).toBe(1);
    await expectHttp(core.join({ name: 'jay', color: 'mauve', phrase: '' }), 400, 'name_taken');
    await expectHttp(core.join({ name: 'Sam', color: 'dusk', phrase: '' }), 400, 'color_taken');
    expect(core.preview().seats.map((s) => s.name)).toEqual(['Mia', 'Jay', 'Priya']);
  });

  it('authenticates seat tokens', async () => {
    const { core, jay } = await table();
    expect(await core.authenticate(jay.token)).toBe(1);
    await expectHttp(core.authenticate('nope'), 401, 'unauthorized');
    await expectHttp(core.authenticate(null), 401, 'unauthorized');
  });

  it('stores only token hashes', async () => {
    const { store, host } = await table();
    expect(JSON.stringify(store)).not.toContain(host.token);
  });

  it('404s on a table that does not exist', async () => {
    const { core } = setup();
    expect(() => core.preview()).toThrow(HttpError);
  });
});

describe('commands', () => {
  it('applies commands, numbers them, and rejects illegal ones with 409 data', async () => {
    const { core, host, jay } = await table();
    const r1 = await core.command(host.token, { clientId: cid(), command: { type: 'start' } });
    expect(r1.response).toEqual({ ok: true, seq: 3 }); // create 0, joins 1-2
    const bad = await core.command(jay.token, { clientId: cid(), command: { type: 'act', action: 'call' } });
    expect(bad.response).toMatchObject({ ok: false, code: 'not_your_turn', seq: 3 });
    expect(core.currentSeq).toBe(3);
  });

  it('ignores a retried command with the same client id', async () => {
    const { core, host } = await table();
    const clientId = cid();
    const a = await core.command(host.token, { clientId, command: { type: 'start' } });
    const b = await core.command(host.token, { clientId, command: { type: 'start' } });
    expect(b.response).toEqual(a.response);
    expect(b.change).toBeNull();
  });

  it('validates the request shape', async () => {
    const { core, host } = await table();
    await expectHttp(core.command(host.token, { command: { type: 'start' } }), 400, 'bad_request');
    await expectHttp(
      core.command(host.token, { clientId: 'short', command: { type: 'start' } }),
      400,
      'bad_request',
    );
    await expectHttp(
      core.command(host.token, {
        clientId: cid(),
        command: { type: 'join', name: 'x', color: 'iris', phrase: '' },
      }),
      400,
      'bad_request',
    );
    await expectHttp(
      core.command(host.token, { clientId: cid(), command: { type: 'tick' } }),
      400,
      'bad_request',
    );
  });

  it('commits undo windows and timeouts on tick, and tells the alarm when', async () => {
    const { core, clock, host } = await table();
    await core.command(host.token, { clientId: cid(), command: { type: 'start' } });
    await core.command(host.token, { clientId: cid(), command: { type: 'act', action: 'call' } });
    expect(core.nextAlarm()).toBe(clock.now + 5_000);
    clock.now += 5_000;
    const change = core.tick();
    expect(change?.entries).toEqual([expect.objectContaining({ k: 'act', seat: 0, verb: 'called' })]);
    expect(core.tick()).toBeNull();
    expect(core.nextAlarm()).toBe(clock.now + 12 * 3_600_000);
  });

  it('settles anything due before applying a command', async () => {
    const { core, clock, host, jay } = await table();
    await core.command(host.token, { clientId: cid(), command: { type: 'start' } });
    await core.command(host.token, { clientId: cid(), command: { type: 'act', action: 'call' } });
    clock.now += 6_000; // no alarm ran
    const r = await core.command(jay.token, { clientId: cid(), command: { type: 'act', action: 'call' } });
    expect(r.response.ok).toBe(true);
    expect(r.ticked?.entries[0]).toMatchObject({ verb: 'called', seat: 0 });
  });

  it('revokes a kicked guest', async () => {
    const { core, host, priya } = await table();
    const r = await core.command(host.token, { clientId: cid(), command: { type: 'kick', seat: 2 } });
    expect(r.change?.revoked).toEqual([2]);
    await expectHttp(core.authenticate(priya.token), 401, 'unauthorized');
  });
});

describe('views', () => {
  it('reports when you were last here, then marks you seen', async () => {
    const { core, clock, jay } = await table();
    expect(core.view(1).lastSeenAt).toBeNull();
    const first = clock.now;
    clock.now += 60_000;
    expect(core.view(1).lastSeenAt).toBe(first);
    expect(core.view(1, false).lastSeenAt).toBe(clock.now);
    expect(jay.seat).toBe(1);
  });

  it('never sends another seat its neighbour’s cards', async () => {
    const { core, host, store } = await table();
    await core.command(host.token, { clientId: cid(), command: { type: 'start' } });
    const state = store.loadSnapshot()!.state;
    const msg = JSON.stringify(core.message(1, []));
    for (const seat of [0, 2]) for (const c of state.secret.hole[seat]!) expect(msg).not.toContain(`"${c}"`);
    for (const c of state.secret.hole[1]!) expect(msg).toContain(`"${c}"`);
    expect(JSON.stringify(core.preview())).not.toMatch(/"hole"|"deck"/);
  });

  it('previews whose turn it is and what they face', async () => {
    const { core, host } = await table();
    await core.command(host.token, { clientId: cid(), command: { type: 'start' } });
    expect(core.preview().toAct).toMatchObject({
      seat: 0,
      name: 'Mia',
      toCall: 2,
      lastAction: 'Priya posted $2.',
    });
  });
});

describe('device links', () => {
  it('hands a seat to a new device once, within ten minutes', async () => {
    const { core, clock, jay } = await table();
    const link = await core.deviceLink(1);
    const grant = await core.claim(link.code);
    expect(grant.seat).toBe(1);
    expect(grant.token).not.toBe(jay.token);
    expect(await core.authenticate(grant.token)).toBe(1);
    expect(await core.authenticate(jay.token)).toBe(1);
    await expectHttp(core.claim(link.code), 410, 'expired');
    const late = await core.deviceLink(1);
    clock.now += 10 * 60_000;
    await expectHttp(core.claim(late.code), 410, 'expired');
    await expectHttp(core.claim('../etc'), 400, 'bad_request');
  });
});

describe('the command log', () => {
  it('replays to exactly the stored state, shuffles included', async () => {
    const { core, store, clock, host, jay, priya } = await table();
    const tokens = [host.token, jay.token, priya.token];
    await core.command(host.token, { clientId: cid(), command: { type: 'start' } });
    for (let i = 0; i < 40; i++) {
      const snap = store.loadSnapshot()!.state;
      const hand = snap.hand;
      if (hand && hand.street !== 'over' && hand.toAct !== null && !snap.pending) {
        const seat = hand.toAct;
        const action = i % 5 === 0 ? 'fold' : 'call';
        const r = await core.command(tokens[seat]!, { clientId: cid(), command: { type: 'act', action } });
        if (!r.response.ok)
          await core.command(tokens[seat]!, { clientId: cid(), command: { type: 'act', action: 'check' } });
      }
      clock.now += 9_000;
      core.tick();
    }
    expect(store.loadSnapshot()!.state.handNo).toBeGreaterThan(1);
    expect(core.replay()).toEqual(store.loadSnapshot()!.state);
  });
});
