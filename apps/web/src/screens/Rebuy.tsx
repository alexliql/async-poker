import type { TableView } from '@holdem/engine';
import { useEffect, useMemo, useState } from 'react';
import type { SendResult } from '../client/types';
import { Avatar, Chip, MiniCards, PotIcon } from '../components/ui';
import { DENOMS } from '../lib/chips';
import { money, plural } from '../lib/format';
import { roastFor } from '../lib/quips';
import { useTween } from '../table/hooks';
import { topWinner } from '../table/derive';

interface RebuyProps {
  view: TableView;
  send: (cmd: { type: 'rebuy' } | { type: 'sitOut' }) => Promise<SendResult>;
  onBack: () => void;
}

/** Out of chips: a roast, the free rebuy, or sitting out to lick your wounds. */
export function Rebuy({ view, send, onBack }: RebuyProps) {
  const me = view.seats.find((s) => s.seat === view.you?.seat);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const roast = useMemo(() => roastFor(me?.buyIns ?? 1), [me?.buyIns]);
  const mode: 'broke' | 'out' | 'back' =
    !me || me.stack > 0 ? 'back' : me.status === 'sittingOut' ? 'out' : 'broke';
  const stack = useTween(me?.stack ?? 0);

  useEffect(() => {
    document.title = `${view.config.name} · Out of chips`;
  }, [view.config.name]);

  const run = async (cmd: { type: 'rebuy' } | { type: 'sitOut' }) => {
    setBusy(true);
    setError(null);
    const r = await send(cmd);
    if (!r.ok) setError(r.message);
    setBusy(false);
  };

  // The hand that did it, if it's the last one played.
  const result = view.hand?.result ?? null;
  const top = topWinner(view);
  const winner = top ? view.seats.find((s) => s.seat === top.seat) : null;
  const myShown = me && result ? (result.shown[me.seat] ?? null) : null;
  const buyIns = me?.buyIns ?? 1;
  const shownBuyIns = Math.min(8, buyIns + (mode === 'back' ? 0 : 1));

  return (
    <main className="screen">
      <div className="screen-col" style={{ paddingTop: 36, gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="caps">
            {view.config.name} · Hand #{Math.max(1, view.handNo)}
          </span>
          <h1 className="h1" style={{ fontSize: 40, lineHeight: 1 }}>
            {mode === 'back' ? 'Chips restored.' : 'You’re out of chips.'}
          </h1>
        </div>

        {result && winner && me && top!.seat !== me.seat && (
          <div
            className="neu"
            style={{
              borderRadius: 24,
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar name={winner.name} color={winner.color} size={32} fontSize={13} />
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 15 }}>
                  <b>{winner.name}</b> won <b>{money(top!.amount)}</b>
                </span>
                {result.labels[winner.seat] && (
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{result.labels[winner.seat]}</span>
                )}
              </div>
              {result.shown[winner.seat] && <MiniCards cards={result.shown[winner.seat]!} />}
            </div>
            {myShown && (
              <>
                <div style={{ height: 1, background: 'var(--line)' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Avatar name={me.name} color={me.color} size={32} fontSize={13} />
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 15 }}>
                      <b>You</b> went all in
                    </span>
                    {result.labels[me.seat] && (
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{result.labels[me.seat]}</span>
                    )}
                  </div>
                  <MiniCards cards={myShown} />
                </div>
              </>
            )}
          </div>
        )}

        <div
          className="inset"
          style={{
            borderRadius: 24,
            padding: '18px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="caps">Your stack</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <PotIcon width={28} />
              <span
                className="mono"
                style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1 }}
              >
                {money(stack)}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <span className="caps">Buy-ins tonight</span>
            <div
              aria-label={plural(buyIns, 'buy-in')}
              role="img"
              style={{ display: 'flex', alignItems: 'center', gap: 6, height: 22 }}
            >
              {Array.from({ length: shownBuyIns }, (_, i) =>
                i < buyIns ? (
                  <Chip
                    key={i}
                    d={DENOMS[1]!}
                    width={30}
                    className="chipIn"
                    style={{ filter: 'drop-shadow(0 1px 0.8px rgba(0,0,0,.28))' }}
                  />
                ) : (
                  <span
                    key={i}
                    className="inset"
                    style={{
                      display: 'block',
                      width: 30,
                      height: 8,
                      marginTop: 2,
                      borderRadius: '50%',
                      boxShadow: 'inset 1px 1px 3px var(--sd), inset -1px -1px 3px var(--sl)',
                    }}
                  />
                ),
              )}
            </div>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {mode === 'broke' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 14,
                textAlign: 'center',
                padding: '0 8px',
              }}
            >
              <span className="caps">The table has thoughts</span>
              <span
                className="wobble"
                style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.02 }}
              >
                “{roast}”
              </span>
            </div>
          )}
          {mode === 'back' && (
            <div
              className="neu popUp"
              role="status"
              style={{
                borderRadius: 24,
                padding: '20px 22px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em' }}>You’re back in.</span>
              <span style={{ fontSize: 15, color: 'var(--muted)' }}>
                Fresh {money(view.config.buyIn)}. You’re dealt into the next hand.
              </span>
            </div>
          )}
          {mode === 'out' && (
            <div
              className="neu popUp"
              role="status"
              style={{
                borderRadius: 24,
                padding: '20px 22px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em' }}>Sitting out.</span>
              <span style={{ fontSize: 15, color: 'var(--muted)' }}>
                Your seat’s saved. The cards will be here when your pride recovers.
              </span>
            </div>
          )}
        </div>

        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        {mode === 'broke' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button className="btn accentBtn cta" disabled={busy} onClick={() => void run({ type: 'rebuy' })}>
              Rebuy for free
              <span className="mono" style={{ fontSize: 14, fontWeight: 600, opacity: 0.75 }}>
                · {money(view.config.buyIn)}
              </span>
            </button>
            <button className="btn neu cta-2" disabled={busy} onClick={() => void run({ type: 'sitOut' })}>
              Sit out for now
            </button>
          </div>
        )}
        {mode === 'back' && (
          <button className="btn accentBtn cta popUp" onClick={onBack} autoFocus>
            Back to the table
          </button>
        )}
        {mode === 'out' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button
              className="btn accentBtn cta popUp"
              disabled={busy}
              onClick={() => void run({ type: 'rebuy' })}
            >
              Rebuy and deal me in
              <span className="mono" style={{ fontSize: 14, fontWeight: 600, opacity: 0.75 }}>
                · {money(view.config.buyIn)}
              </span>
            </button>
            <button
              className="btn ghost"
              onClick={onBack}
              style={{
                alignSelf: 'center',
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--muted)',
                padding: '6px 10px',
              }}
            >
              Watch the table
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
