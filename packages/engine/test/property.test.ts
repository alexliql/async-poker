import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { type TableState, legalActions, nextDeadline, seededRandomInt, viewFor } from '../src';
import { Table } from './helpers';

/** Every invariant that must hold after any accepted command. */
function checkInvariants(t: Table, totalChips: number) {
  const s: TableState = t.state;
  expect(t.chips()).toBe(totalChips);
  for (const x of s.seats) expect(x.stack).toBeGreaterThanOrEqual(0);

  const hand = s.hand;
  if (hand && hand.street !== 'over') {
    expect(hand.board.length).toBe({ preflop: 0, flop: 3, turn: 4, river: 5 }[hand.street]);
    if (hand.toAct !== null) {
      const p = hand.players.find((x) => x.seat === hand.toAct)!;
      expect(p.folded || p.allIn).toBe(false);
      expect(nextDeadline(s)).not.toBeNull();
    }
    // Hidden information: no viewer sees another seat's hole cards before showdown.
    for (const viewer of [null, ...s.seats.map((x) => x.seat)]) {
      // Earlier hands' log entries legitimately mention cards that are back in the deck now,
      // so check the view without its log, plus the log entries since this hand began.
      const { log, ...rest } = viewFor(s, viewer);
      const since = log.slice(log.findLastIndex((e) => e.k === 'hand' && e.no === hand.no));
      const json = JSON.stringify(rest) + JSON.stringify(since);
      for (const [seat, cards] of Object.entries(s.secret.hole)) {
        if (Number(seat) === viewer) continue;
        for (const c of cards) expect(json.includes(`"${c}"`)).toBe(false);
      }
    }
    // All cards in play are distinct.
    const cards = [...s.secret.deck, ...hand.board, ...Object.values(s.secret.hole).flat()];
    expect(new Set(cards).size).toBe(cards.length);
  }
  if (hand?.result) {
    const paid = hand.result.pots.reduce((sum, p) => sum + p.amount, 0);
    const won = Object.values(hand.result.won).reduce((sum, n) => sum + n, 0);
    expect(won).toBe(paid);
  }
}

describe('random games', () => {
  it('keep every invariant', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 6 }),
        fc.integer({ min: 0, max: 2 ** 31 - 1 }),
        fc.boolean(),
        (players, seed, withUndo) => {
          const t = new Table(
            players,
            { undoMs: withUndo ? 5_000 : 0, turnTimerMs: 60_000, handPauseMs: 1_000 },
            seed,
          );
          const pick = seededRandomInt(seed ^ 0x5bd1e995);
          // Uneven stacks make side pots and busts common.
          for (const x of t.state.seats) x.stack = [200, 40, 13, 90, 200, 7][x.seat]!;
          let total = t.chips();
          t.must({ type: 'start' }, 0);
          checkInvariants(t, total);

          for (let step = 0; step < 300 && t.state.phase === 'playing'; step++) {
            const s = t.state;
            const roll = pick(100);
            const hand = s.hand;
            const toAct = hand && hand.street !== 'over' ? hand.toAct : null;

            if (roll < 3) {
              // Someone busted takes the free rebuy.
              const busted = s.seats.find((x) => x.status === 'busted' && !x.left);
              if (busted) {
                t.must({ type: 'rebuy' }, busted.seat);
                total += s.config.buyIn;
              }
              const allIn =
                hand && hand.street !== 'over' ? hand.players.find((p) => p.allIn && !p.folded) : undefined;
              if (allIn)
                expect(t.run({ type: 'rebuy' }, allIn.seat)).toMatchObject({ ok: false, code: 'not_busted' });
            } else if (roll < 6 && hand && hand.street !== 'over') {
              const seat = pick(s.seats.length);
              const v = viewFor(s, seat).you;
              if (v?.canPre)
                t.must({ type: 'setPre', pre: (['check', 'checkFold', 'callAny'] as const)[pick(3)]! }, seat);
            } else if (roll < 8) {
              const seat = pick(s.seats.length);
              t.run({ type: s.seats[seat]!.status === 'sittingOut' ? 'sitIn' : 'sitOut' }, seat);
            } else if (roll < 10 && s.pending) {
              t.run({ type: 'undo' }, s.pending.seat);
            } else if (toAct !== null && !s.pending && roll < 85) {
              const legal = legalActions(s, toAct)!;
              const options: (() => void)[] = [() => t.act(toAct, 'fold')];
              if (legal.canCheck) options.push(() => t.act(toAct, 'check'));
              if (legal.canCall) options.push(() => t.act(toAct, 'call'));
              if (legal.canBet)
                options.push(() => t.act(toAct, 'bet', legal.minTo + pick(legal.maxTo - legal.minTo + 1)));
              if (legal.canRaise)
                options.push(() => t.act(toAct, 'raise', legal.minTo + pick(legal.maxTo - legal.minTo + 1)));
              if (legal.canRaise || legal.canBet || legal.maxTo <= hand!.currentBet)
                options.push(() => t.act(toAct, 'allin'));
              options[pick(options.length)]!();
            } else {
              const due = nextDeadline(s);
              if (due === null) {
                // Waiting on nobody: everyone may be busted or sitting out. Bring someone back.
                const out = s.seats.find((x) => x.status === 'sittingOut' && !x.left);
                if (out) t.must({ type: 'sitIn' }, out.seat);
                else {
                  const busted = s.seats.find((x) => x.status === 'busted');
                  if (!busted) throw new Error('table stuck with nobody to wait on');
                  t.must({ type: 'rebuy' }, busted.seat);
                  total += s.config.buyIn;
                }
              } else t.advance(Math.max(0, due - t.now));
            }
            checkInvariants(t, total);
          }
          expect(t.state.handsPlayed).toBeGreaterThan(0);
        },
      ),
      { numRuns: 150 },
    );
  });
});
