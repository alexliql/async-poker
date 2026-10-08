import { describe, expect, it } from 'vitest';
import { apply, createTable, nextDeadline, viewFor } from '../src';
import { COLORS, Table, config } from './helpers';

describe('lobby', () => {
  it('seats players in join order with a free buy-in', () => {
    const t = new Table(3);
    expect(t.state.seats.map((s) => [s.name, s.stack, s.buyIns])).toEqual([
      ['Mia', 200, 1],
      ['Jay', 200, 1],
      ['Priya', 200, 1],
    ]);
    expect(t.state.phase).toBe('lobby');
  });

  it('rejects duplicate names and colors, and a full table', () => {
    const t = new Table(2, { maxSeats: 3 });
    expect(t.run({ type: 'join', name: 'mia', color: 'mauve', phrase: '' }, null)).toMatchObject({
      ok: false,
      code: 'name_taken',
    });
    expect(t.run({ type: 'join', name: 'Zed', color: COLORS[0], phrase: '' }, null)).toMatchObject({
      ok: false,
      code: 'color_taken',
    });
    t.must({ type: 'join', name: 'Zed', color: 'mauve', phrase: '' }, null);
    expect(t.run({ type: 'join', name: 'Ann', color: 'sand', phrase: '' }, null)).toMatchObject({
      ok: false,
      code: 'table_full',
    });
  });

  it('validates names, colors and catchphrases', () => {
    const t = new Table(1);
    expect(t.run({ type: 'join', name: '   ', color: 'dusk', phrase: '' }, null)).toMatchObject({
      code: 'bad_command',
    });
    expect(t.run({ type: 'join', name: 'A'.repeat(17), color: 'dusk', phrase: '' }, null)).toMatchObject({
      code: 'bad_command',
    });
    expect(t.run({ type: 'join', name: 'Jay', color: 'neon', phrase: '' }, null)).toMatchObject({
      code: 'bad_command',
    });
    expect(t.run({ type: 'join', name: 'Jay', color: 'dusk', phrase: 'x'.repeat(41) }, null)).toMatchObject({
      code: 'bad_command',
    });
  });

  it('only the host starts, and only with two players', () => {
    const solo = new Table(1);
    expect(solo.run({ type: 'start' }, 0)).toMatchObject({ ok: false, code: 'not_enough_players' });
    const t = new Table(2);
    expect(t.run({ type: 'start' }, 1)).toMatchObject({ ok: false, code: 'not_host' });
    t.must({ type: 'start' }, 0);
    expect(t.state.phase).toBe('playing');
    expect(t.run({ type: 'start' }, 0)).toMatchObject({ ok: false, code: 'wrong_phase' });
  });

  it('lets the host remove a guest before the game starts', () => {
    const t = new Table(3);
    t.must({ type: 'kick', seat: 2 }, 0);
    expect(t.state.seats[2]!.left).toBe(true);
    expect(t.run({ type: 'kick', seat: 1 }, 1)).toMatchObject({ code: 'not_host' });
  });

  it('rejects bad table configs', () => {
    expect(() =>
      createTable(config({ maxSeats: 9 }), { name: 'Mia', color: 'sage', phrase: '' }, 0),
    ).toThrow();
    expect(() => createTable(config({ buyIn: 10 }), { name: 'Mia', color: 'sage', phrase: '' }, 0)).toThrow();
  });
});

describe('dealing and blinds', () => {
  it('posts blinds and starts preflop left of the big blind', () => {
    const t = new Table(3);
    t.must({ type: 'start' }, 0);
    const h = t.hand;
    expect([h.button, h.smallBlindSeat, h.bigBlindSeat]).toEqual([0, 1, 2]);
    expect([t.stack(0), t.stack(1), t.stack(2)]).toEqual([200, 199, 198]);
    expect(h.toAct).toBe(0);
    expect(Object.values(t.state.secret.hole).every((c) => c.length === 2)).toBe(true);
    expect(t.state.secret.deck).toHaveLength(52 - 6);
  });

  it('heads-up: the button posts the small blind and acts first preflop, last after', () => {
    const t = new Table(2);
    t.must({ type: 'start' }, 0);
    expect([t.hand.button, t.hand.smallBlindSeat, t.hand.bigBlindSeat, t.toAct]).toEqual([0, 0, 1, 0]);
    t.act(0, 'call');
    t.act(1, 'check');
    expect(t.hand.street).toBe('flop');
    expect(t.toAct).toBe(1);
  });

  it('gives the big blind the option when everyone limps', () => {
    const t = new Table(3);
    t.must({ type: 'start' }, 0);
    t.act(0, 'call');
    t.act(1, 'call');
    expect(t.toAct).toBe(2);
    expect(viewFor(t.state, 2).you!.legal).toMatchObject({ canCheck: true, canRaise: true, minTo: 4 });
  });

  it('moves the button each hand', () => {
    const t = new Table(3);
    t.must({ type: 'start' }, 0);
    t.act(0, 'fold');
    t.act(1, 'fold');
    expect(t.hand.street).toBe('over');
    t.advance(8_000);
    expect([t.state.handNo, t.hand.button, t.hand.smallBlindSeat, t.hand.bigBlindSeat]).toEqual([2, 1, 2, 0]);
  });
});

describe('betting rules', () => {
  it('minimum raise is the size of the last raise', () => {
    const t = new Table(3);
    t.must({ type: 'start' }, 0);
    t.act(0, 'raise', 6);
    const legal = viewFor(t.state, 1).you!.legal!;
    expect(legal).toMatchObject({ canRaise: true, minTo: 10, maxTo: 200, callAmount: 5 });
    expect(t.run({ type: 'act', action: 'raise', amount: 9 }, 1)).toMatchObject({
      ok: false,
      code: 'illegal_action',
    });
    t.act(1, 'raise', 10);
    expect(viewFor(t.state, 2).you!.legal!.minTo).toBe(14);
  });

  it('rejects acting out of turn and checking facing a bet', () => {
    const t = new Table(3);
    t.must({ type: 'start' }, 0);
    expect(t.run({ type: 'act', action: 'call' }, 1)).toMatchObject({ ok: false, code: 'not_your_turn' });
    expect(t.run({ type: 'act', action: 'check' }, 0)).toMatchObject({ ok: false, code: 'illegal_action' });
    expect(t.run({ type: 'act', action: 'raise', amount: 6.5 }, 0)).toMatchObject({
      ok: false,
      code: 'bad_command',
    });
  });

  it('a short all-in does not reopen betting for players who already acted', () => {
    const t = new Table(3);
    t.state.seats[2]!.stack = 11; // Priya will post the big blind from 11
    t.must({ type: 'start' }, 0);
    t.act(0, 'raise', 8); // full raise, increment 6
    t.act(1, 'call');
    t.act(2, 'allin'); // to 11: increment 3, short of a full raise
    expect(t.hand.currentBet).toBe(11);
    const mia = viewFor(t.state, 0).you!.legal!;
    expect(mia).toMatchObject({ canRaise: false, canCall: true, callAmount: 3 });
    expect(t.run({ type: 'act', action: 'allin' }, 0)).toMatchObject({ ok: false, code: 'illegal_action' });
    t.act(0, 'call');
    t.act(1, 'call');
    expect(t.hand.street).toBe('flop');
  });

  it('a player who has not acted may still raise a short all-in', () => {
    const t = new Table(3);
    t.state.seats[0]!.stack = 5;
    t.must({ type: 'start' }, 0);
    t.act(0, 'allin'); // 5 vs big blind 2: increment 3 >= 2, a full raise
    expect(viewFor(t.state, 1).you!.legal).toMatchObject({ canRaise: true, minTo: 8 });
  });

  it('bets after the flop start at the big blind', () => {
    const t = new Table(2);
    t.must({ type: 'start' }, 0);
    t.act(0, 'call');
    t.act(1, 'check');
    expect(viewFor(t.state, 1).you!.legal).toMatchObject({ canBet: true, canCheck: true, minTo: 2 });
    expect(t.run({ type: 'act', action: 'bet', amount: 1 }, 1)).toMatchObject({ code: 'illegal_action' });
    t.act(1, 'bet', 10);
    expect(viewFor(t.state, 0).you!.legal).toMatchObject({ canRaise: true, minTo: 20, callAmount: 10 });
  });
});

describe('settling pots', () => {
  it('pays the best hand at showdown and shows cards', () => {
    const t = new Table(3);
    t.must({ type: 'start' }, 0);
    t.rig({ 0: ['Ks', '7h'], 1: ['2c', '3d'], 2: ['Qc', 'Jd'] }, ['Kd', '7c', '2s', 'Qh', '7s']);
    t.act(0, 'call');
    t.act(1, 'call');
    t.act(2, 'check');
    for (let street = 0; street < 3; street++) {
      t.act(1, 'check');
      t.act(2, 'check');
      t.act(0, 'check');
    }
    const r = t.hand.result!;
    expect(t.hand.street).toBe('over');
    expect(r.pots).toEqual([{ amount: 6, winners: [0], label: 'Full House' }]);
    expect(r.shown[1]).toEqual(['2c', '3d']);
    expect(t.stack(0)).toBe(204);
    expect(t.chips()).toBe(600);
    expect(t.state.log.at(-1)).toMatchObject({ k: 'result', seat: 0, amount: 6, label: 'Full House' });
  });

  it('builds side pots and refunds the uncalled part', () => {
    const t = new Table(3);
    t.state.seats[1]!.stack = 50;
    t.state.seats[2]!.stack = 20;
    t.must({ type: 'start' }, 0);
    t.rig({ 0: ['Qs', 'Qd'], 1: ['Ks', 'Kd'], 2: ['As', 'Ad'] }, ['2c', '7d', '9h', '3s', '4c']);
    t.act(0, 'allin');
    t.act(1, 'allin');
    t.act(2, 'allin');
    const r = t.hand.result!;
    expect(r.uncalled).toEqual({ seat: 0, amount: 150 });
    expect(r.pots).toEqual([
      { amount: 60, winners: [2], label: 'Pair' },
      { amount: 60, winners: [1], label: 'Pair' },
    ]);
    expect([t.stack(0), t.stack(1), t.stack(2)]).toEqual([150, 60, 60]);
    expect(t.hand.board).toHaveLength(5);
  });

  it('splits a pot and gives the odd chip to the first winner left of the button', () => {
    const t = new Table(3);
    t.must({ type: 'start' }, 0);
    t.rig({ 0: ['2c', '3d'], 1: ['4c', '5d'], 2: ['2h', '3h'] }, ['As', 'Ks', 'Qs', 'Js', 'Ts']);
    t.act(0, 'call');
    t.act(1, 'fold');
    t.act(2, 'check');
    for (let street = 0; street < 3; street++) {
      t.act(2, 'check');
      t.act(0, 'check');
    }
    expect(t.hand.result!.pots).toEqual([{ amount: 5, winners: [2, 0], label: 'Royal Flush' }]);
    expect([t.stack(0), t.stack(1), t.stack(2)]).toEqual([200, 199, 201]);
  });

  it('ends on folds without a showdown and returns the uncalled raise', () => {
    const t = new Table(3);
    t.must({ type: 'start' }, 0);
    t.act(0, 'raise', 10);
    t.act(1, 'fold');
    t.act(2, 'fold');
    const r = t.hand.result!;
    expect(r.uncalled).toEqual({ seat: 0, amount: 8 });
    expect(r.shown).toEqual({});
    expect(r.pots).toEqual([{ amount: 5, winners: [0], label: null }]);
    expect(t.stack(0)).toBe(203);
  });

  it('records the biggest pot and hands played', () => {
    const t = new Table(2);
    t.must({ type: 'start' }, 0);
    t.act(0, 'raise', 20);
    t.act(1, 'call');
    t.act(1, 'check');
    t.act(0, 'bet', 30);
    t.act(1, 'fold');
    expect(t.state.handsPlayed).toBe(1);
    expect(t.state.biggestPot).toEqual({ seat: 0, amount: 40 });
  });
});

describe('the undo window', () => {
  it('holds a move for its owner until it commits', () => {
    const t = new Table(3, { undoMs: 5_000 });
    t.must({ type: 'start' }, 0);
    t.act(0, 'call');
    expect(t.state.pending).toMatchObject({ seat: 0, action: 'call' });
    expect(t.hand.toAct).toBe(0);
    expect(viewFor(t.state, 0).you!.pending).toMatchObject({ action: 'call', commitAt: t.now + 5_000 });
    expect(viewFor(t.state, 1).you!.pending).toBeNull();
    expect(JSON.stringify(viewFor(t.state, 1))).not.toContain('"pending":{');
    t.advance(4_999);
    expect(t.hand.toAct).toBe(0);
    t.advance(1);
    expect(t.state.pending).toBeNull();
    expect(t.hand.toAct).toBe(1);
  });

  it('undo cancels the move and the player acts again', () => {
    const t = new Table(3, { undoMs: 5_000 });
    t.must({ type: 'start' }, 0);
    t.act(0, 'fold');
    t.advance(2_000);
    t.must({ type: 'undo' }, 0);
    expect(t.state.pending).toBeNull();
    expect(t.player(0).folded).toBe(false);
    t.act(0, 'call');
    t.advance(5_000);
    expect(t.player(0).bet).toBe(2);
  });

  it('cannot undo after the move went through, or another player’s move', () => {
    const t = new Table(3, { undoMs: 5_000 });
    t.must({ type: 'start' }, 0);
    t.act(0, 'call');
    expect(t.run({ type: 'undo' }, 1)).toMatchObject({ code: 'nothing_to_undo' });
    t.now += 5_000;
    expect(t.run({ type: 'undo' }, 0)).toMatchObject({ code: 'nothing_to_undo' });
    t.advance(0);
    expect(t.hand.toAct).toBe(1);
  });

  it('a move made before the deadline is not a timeout', () => {
    const t = new Table(3, { undoMs: 5_000, turnTimerMs: 10_000 });
    t.must({ type: 'start' }, 0);
    t.now += 9_000;
    t.act(0, 'call');
    t.advance(5_000);
    expect(t.player(0).bet).toBe(2);
    expect(t.state.seats[0]!.missedTurns).toBe(0);
  });
});

describe('pre-actions', () => {
  it('call any, and check that drops when someone bets', () => {
    const t = new Table(3);
    t.must({ type: 'start' }, 0);
    t.must({ type: 'setPre', pre: 'callAny' }, 1);
    t.must({ type: 'setPre', pre: 'check' }, 2);
    t.act(0, 'raise', 6);
    expect(t.player(1).bet).toBe(6);
    expect(t.toAct).toBe(2);
    expect(t.state.pre[2]).toBeUndefined();
    expect(t.state.log.at(-1)).toMatchObject({ k: 'act', seat: 1, verb: 'called', tag: 'auto' });
  });

  it('check/fold folds to a bet and checks otherwise', () => {
    const t = new Table(3);
    t.must({ type: 'start' }, 0);
    t.must({ type: 'setPre', pre: 'checkFold' }, 2);
    t.act(0, 'raise', 6);
    t.act(1, 'call');
    expect(t.player(2).folded).toBe(true);
  });

  it('is only available while waiting in the hand', () => {
    const t = new Table(3);
    t.must({ type: 'start' }, 0);
    expect(t.run({ type: 'setPre', pre: 'check' }, 0)).toMatchObject({ code: 'illegal_action' });
    t.act(0, 'fold');
    expect(t.run({ type: 'setPre', pre: 'check' }, 0)).toMatchObject({ code: 'illegal_action' });
  });

  it('gets an undo window too', () => {
    const t = new Table(3, { undoMs: 5_000 });
    t.must({ type: 'start' }, 0);
    t.must({ type: 'setPre', pre: 'callAny' }, 1);
    t.act(0, 'call');
    t.advance(5_000);
    expect(t.state.pending).toMatchObject({ seat: 1, action: 'call', auto: true });
    t.must({ type: 'undo' }, 1);
    expect(t.toAct).toBe(1);
  });
});

describe('timers and sitting out', () => {
  it('auto-folds on timeout, and sits a player out after two misses', () => {
    const t = new Table(3, { turnTimerMs: 60_000 });
    t.must({ type: 'start' }, 0);
    expect(nextDeadline(t.state)).toBe(t.now + 60_000);
    t.advance(60_000);
    expect(t.player(0).folded).toBe(true);
    expect(t.state.seats[0]!.missedTurns).toBe(1);
    expect(t.state.log.at(-1)).toMatchObject({ k: 'act', seat: 0, verb: 'folded', tag: 'timer' });
    t.act(1, 'fold');
    t.advance(8_000); // hand 2: button Jay, SB Priya, BB Mia
    t.act(1, 'call');
    t.act(2, 'call');
    expect(t.toAct).toBe(0);
    t.advance(60_000); // Mia auto-checks her option
    expect(t.state.seats[0]!.status).toBe('sittingOut');
    expect(t.hand.street).toBe('flop');
    t.act(2, 'check');
    t.act(1, 'check'); // Mia's turn passes immediately while sitting out
    expect(t.hand.street).toBe('turn');
    t.act(2, 'bet', 2);
    t.act(1, 'fold');
    t.advance(8_000);
    expect(t.hand.players.map((p) => p.seat)).toEqual([1, 2]);
  });

  it('acting resets missed turns; sitting back in deals you in next hand', () => {
    const t = new Table(3, { turnTimerMs: 60_000 });
    t.must({ type: 'start' }, 0);
    t.must({ type: 'sitOut' }, 2);
    t.act(0, 'call');
    t.act(1, 'call');
    // Priya's big-blind option is taken for her while sitting out
    expect(t.hand.street).toBe('flop');
    t.must({ type: 'sitIn' }, 2);
    expect(t.state.seats[2]!.status).toBe('active');
  });
});

describe('busting and rebuys', () => {
  it('marks a busted player, deals around them, and lets them rebuy', () => {
    const t = new Table(3);
    t.state.seats[2]!.stack = 20;
    t.must({ type: 'start' }, 0);
    t.rig({ 0: ['As', 'Ad'], 1: ['7c', '2d'], 2: ['Ks', 'Kd'] }, ['3c', '8d', '9h', 'Js', '4c']);
    t.act(0, 'raise', 20);
    t.act(1, 'fold');
    t.act(2, 'allin');
    expect(t.state.seats[2]).toMatchObject({ stack: 0, status: 'busted' });
    t.advance(8_000);
    expect(t.hand.players.map((p) => p.seat)).toEqual([0, 1]);
    expect(t.run({ type: 'rebuy' }, 1)).toMatchObject({ code: 'not_busted' });
    t.must({ type: 'rebuy' }, 2);
    expect(t.state.seats[2]).toMatchObject({ stack: 200, buyIns: 2, status: 'active' });
    expect(t.chips()).toBe(200 + 200 + 20 + 200);
  });
});

describe('chips at stake', () => {
  it('refuses a rebuy, and keeps you active, while you are all in', () => {
    const t = new Table(3);
    t.state.seats[2]!.stack = 20;
    t.must({ type: 'start' }, 0);
    t.act(0, 'call');
    t.act(1, 'call');
    t.act(2, 'allin');
    expect(t.stack(2)).toBe(0);
    expect(t.run({ type: 'rebuy' }, 2)).toMatchObject({ ok: false, code: 'not_busted' });
    t.must({ type: 'sitOut' }, 2);
    t.must({ type: 'sitIn' }, 2);
    expect(t.state.seats[2]!.status).toBe('active');
  });
});

describe('leaving, host and ending', () => {
  it('passes host to the next player when the host leaves', () => {
    const t = new Table(3);
    t.must({ type: 'leave' }, 0);
    expect(t.state.hostSeat).toBe(1);
    expect(t.state.log.at(-1)).toMatchObject({ k: 'host', seat: 1 });
  });

  it('folds a player who leaves on their turn, and later turns of a left player', () => {
    const t = new Table(4);
    t.must({ type: 'start' }, 0);
    // button 0, SB 1, BB 2, first to act 3
    t.must({ type: 'leave' }, 1);
    t.must({ type: 'leave' }, 3);
    expect(t.player(3).folded).toBe(true);
    expect(t.toAct).toBe(0);
    t.act(0, 'raise', 6);
    expect(t.player(1).folded).toBe(true);
    expect(t.toAct).toBe(2);
  });

  it('host can hand over hosting', () => {
    const t = new Table(3);
    t.must({ type: 'transferHost', seat: 2 }, 0);
    expect(t.state.hostSeat).toBe(2);
    expect(t.run({ type: 'transferHost', seat: 1 }, 0)).toMatchObject({ code: 'not_host' });
  });

  it('ending mid-hand voids the hand; standings net to zero', () => {
    const t = new Table(3);
    t.must({ type: 'start' }, 0);
    t.act(0, 'raise', 6);
    t.must({ type: 'endGame' }, 0);
    expect(t.state.phase).toBe('ended');
    expect(t.state.hand).toBeNull();
    expect(t.state.standings!.map((s) => s.net)).toEqual([0, 0, 0]);
    expect(t.run({ type: 'act', action: 'call' }, 1)).toMatchObject({ code: 'wrong_phase' });
    expect(nextDeadline(t.state)).toBeNull();
  });

  it('standings count rebuys', () => {
    const t = new Table(2);
    t.state.seats[1]!.stack = 20;
    t.must({ type: 'start' }, 0);
    t.rig({ 0: ['As', 'Ad'], 1: ['7c', '2d'] }, ['3c', '8d', '9h', 'Js', '4c']);
    t.act(0, 'allin');
    t.act(1, 'call');
    t.must({ type: 'rebuy' }, 1);
    t.must({ type: 'endGame' }, 0);
    const st = t.state.standings!;
    expect(st.reduce((s, x) => s + x.net, 0)).toBe(-180); // seat 1 started 180 short in this test
    expect(st[0]).toMatchObject({ seat: 0, stack: 220, net: 20 });
    expect(st[1]).toMatchObject({ seat: 1, buyIns: 2, stack: 200, net: -200 });
  });
});

describe('views', () => {
  it('never show another player’s hole cards before showdown', () => {
    const t = new Table(3);
    t.must({ type: 'start' }, 0);
    const v = viewFor(t.state, 0);
    expect(v.you!.hole).toEqual(t.state.secret.hole[0]);
    const json = JSON.stringify(v);
    for (const seat of [1, 2])
      for (const c of t.state.secret.hole[seat]!) expect(json).not.toContain(`"${c}"`);
    expect(json).not.toContain('deck');
    const spectator = JSON.stringify(viewFor(t.state, null));
    for (const seat of [0, 1, 2])
      for (const c of t.state.secret.hole[seat]!) expect(spectator).not.toContain(`"${c}"`);
  });

  it('reports legal actions only on your turn and the amount to call', () => {
    const t = new Table(3);
    t.must({ type: 'start' }, 0);
    expect(viewFor(t.state, 1).you).toMatchObject({ legal: null, toCall: 1, canPre: true });
    expect(viewFor(t.state, 0).you).toMatchObject({ toCall: 2, canPre: false });
    expect(viewFor(t.state, 0).hand).toMatchObject({ potTotal: 3, pot: 0, currentBet: 2 });
  });

  it('shows side pots while someone is all in', () => {
    const t = new Table(3);
    t.state.seats[2]!.stack = 10;
    t.must({ type: 'start' }, 0);
    t.act(0, 'raise', 30);
    t.act(1, 'call');
    t.act(2, 'allin');
    expect(viewFor(t.state, 0).hand!.sidePots).toEqual([30, 40]);
  });
});

describe('purity', () => {
  it('never mutates the input state', () => {
    const t = new Table(3);
    const before = structuredClone(t.state);
    apply(t.state, { type: 'start' }, 0, { now: t.now, randomInt: () => 0 });
    expect(t.state).toEqual(before);
  });

  it('replays identically from the same commands and seed', () => {
    const play = () => {
      const t = new Table(3, {}, 7);
      t.must({ type: 'start' }, 0);
      t.act(0, 'raise', 6);
      t.act(1, 'call');
      t.act(2, 'call');
      return t.state;
    };
    expect(play()).toEqual(play());
  });

  it('rejects malformed commands', () => {
    const t = new Table(2);
    expect(t.run({ type: 'nope' } as never, 0)).toMatchObject({ code: 'bad_command' });
    expect(t.run(null as never, 0)).toMatchObject({ code: 'bad_command' });
  });
});
