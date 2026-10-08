import { type TableState, chipsInPlay, seededRandomInt } from '@holdem/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalTableClient, botDecision, handStrength } from '../src/client/local';

describe('bots', () => {
  it('rate hands sensibly', () => {
    expect(handStrength(['As', 'Ad'], [])).toBeGreaterThan(handStrength(['7c', '2d'], []));
    expect(handStrength(['As', 'Ad'], ['Ah', 'Ac', '2d'])).toBeGreaterThan(
      handStrength(['As', 'Kd'], ['2h', '7c', '9d']),
    );
  });
  it('only ever chooses legal amounts', () => {
    const legal = {
      canFold: true,
      canCheck: false,
      canCall: true,
      callAmount: 4,
      canBet: false,
      canRaise: true,
      minTo: 8,
      maxTo: 50,
    };
    for (let i = 0; i < 200; i++) {
      const { action } = botDecision(legal, i / 200, 30, 2, Math.random);
      if (action.action === 'raise') {
        expect(action.amount).toBeGreaterThanOrEqual(8);
        expect(action.amount).toBeLessThan(50);
      }
      expect(['fold', 'call', 'raise', 'allin']).toContain(action.action);
    }
  });
});

describe('practice table', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('plays many hands against bots and never loses a chip', async () => {
    const client = new LocalTableClient({
      you: { name: 'Kai', color: 'teal', phrase: '' },
      random: seededRandomInt(3),
      think: [10, 20],
    });
    const total = (s: TableState) =>
      chipsInPlay(s) - s.seats.reduce((sum, x) => sum + (x.buyIns - 1) * s.config.buyIn, 0);
    const start = total(client.table);
    let updates = 0;
    client.onUpdate(() => updates++);
    for (let step = 0; step < 4000 && client.table.handsPlayed < 25; step++) {
      const v = client.getSnapshot().view!;
      if (v.you?.legal) await client.send({ type: 'act', action: v.you.legal.canCheck ? 'check' : 'call' });
      if (v.you && v.seats[0]!.status === 'busted' && (!v.hand || v.hand.street === 'over'))
        await client.send({ type: 'rebuy' });
      await vi.advanceTimersByTimeAsync(2_000);
    }
    expect(client.table.handsPlayed).toBeGreaterThanOrEqual(25);
    expect(total(client.table)).toBe(start);
    expect(updates).toBeGreaterThan(100);
    client.close();
  });

  it('rejects moves out of turn with a reason', async () => {
    const client = new LocalTableClient({
      you: { name: 'Kai', color: 'teal', phrase: '' },
      random: seededRandomInt(5),
      think: [10, 20],
    });
    const v = client.getSnapshot().view!;
    if (!v.you?.legal) {
      const r = await client.send({ type: 'act', action: 'check' });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('not_your_turn');
    }
    client.close();
  });
});
