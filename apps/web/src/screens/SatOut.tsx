import type { LogEntry, TableView } from '@holdem/engine';
import { useEffect, useState } from 'react';
import type { SendResult } from '../client/types';
import { Avatar } from '../components/ui';
import { ago, money, timerLabel } from '../lib/format';

interface SatOutProps {
  view: TableView;
  now: number;
  send: (cmd: { type: 'sitIn' }) => Promise<SendResult>;
  onWatch: () => void;
}

interface Row {
  key: string;
  hand: string;
  what: string;
  why: string;
  timer: boolean;
  at: number;
}

/** What happened to you on the way out: the auto-moves and the sit-out itself. */
export function satOutRows(view: TableView): { rows: Row[]; byTimer: boolean; handsMissed: number } {
  const me = view.you?.seat;
  let hand = 0;
  let satOutAt = -1;
  const rows: Row[] = [];
  view.log.forEach((e: LogEntry, i) => {
    if (e.k === 'hand') hand = e.no;
    if (e.k === 'act' && e.seat === me && e.tag === 'timer') {
      rows.push({
        key: `t${i}`,
        hand: `#${hand}`,
        what: e.verb === 'checked' ? 'Auto-checked' : 'Auto-folded',
        why: e.verb === 'checked' ? 'Nothing to call' : 'Timer ran out facing a bet',
        timer: true,
        at: e.at,
      });
    }
    if (e.k === 'seat' && e.seat === me && e.verb === 'sat out') {
      satOutAt = i;
      rows.push({
        key: `s${i}`,
        hand: `#${hand}`,
        what: 'Sat out',
        why: 'Blinds skip you while you’re out',
        timer: false,
        at: e.at,
      });
    }
    if (e.k === 'seat' && e.seat === me && e.verb === 'is back') rows.length = 0;
  });
  const handsMissed = satOutAt < 0 ? 0 : view.log.slice(satOutAt).filter((e) => e.k === 'hand').length;
  const last = rows[rows.length - 1];
  const byTimer = rows.length >= 2 && rows[rows.length - 2]!.timer && !!last && !last.timer;
  return { rows: rows.slice(-4), byTimer, handsMissed };
}

export function SatOut({ view, now, send, onWatch }: SatOutProps) {
  const me = view.seats.find((s) => s.seat === view.you?.seat);
  const [mode, setMode] = useState<'out' | 'stay'>('out');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const back = me?.status === 'active';
  const { rows, byTimer, handsMissed } = satOutRows(view);

  useEffect(() => {
    document.title = `${view.config.name} · Sitting out`;
  }, [view.config.name]);

  return (
    <main className="screen">
      <div className="screen-col" style={{ paddingTop: 36, gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="caps">{view.config.name}</span>
            <span className="tag" style={{ gap: 6 }}>
              <span
                style={{ width: 8, height: 8, borderRadius: '50%', background: back ? '#4E7A64' : '#B65F55' }}
              />
              {back ? 'Back next hand' : 'Sitting out'}
            </span>
          </div>
          <h1 className="h1" style={{ fontSize: 40, lineHeight: 1 }}>
            We kept your seat warm.
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.4, color: 'var(--muted)' }}>
            {byTimer
              ? `Your ${timerLabel(view.config.turnTimerMs)} timer ran out twice, so the table moved on without you and sat you out. Nothing’s lost.`
              : 'You’re sitting out. Blinds skip you and your chips stay put until you’re back.'}
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
          {[
            { k: 'Stack', v: money(me?.stack ?? 0) },
            { k: 'Seat', v: 'Saved' },
            { k: 'Next hand', v: `#${view.handNo + 1}` },
          ].map((t) => (
            <div
              key={t.k}
              className="inset"
              style={{
                borderRadius: 18,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                minWidth: 0,
              }}
            >
              <span className="caps" style={{ fontSize: 10 }}>
                {t.k}
              </span>
              <span
                className="mono"
                style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}
              >
                {t.v}
              </span>
            </div>
          ))}
        </div>
        {rows.length > 0 && (
          <div
            className="neu"
            style={{ borderRadius: 24, padding: '16px 18px 6px', display: 'flex', flexDirection: 'column' }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                paddingBottom: 6,
              }}
            >
              <span className="caps">While you were out</span>
              <span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
                {handsMissed} hand{handsMissed === 1 ? '' : 's'}
              </span>
            </div>
            {rows.map((r, i) => (
              <div
                key={r.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  minHeight: 52,
                  borderTop: i ? '1px solid var(--line)' : '0',
                }}
              >
                <span className="mono" style={{ width: 34, fontSize: 13, color: 'var(--muted)' }}>
                  {r.hand}
                </span>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{r.what}</span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{r.why}</span>
                </div>
                {r.timer && <span className="tagS">Timer</span>}
                <span
                  className="mono"
                  style={{ width: 30, textAlign: 'right', fontSize: 12, color: 'var(--muted)' }}
                >
                  {ago(now - r.at)}
                </span>
              </div>
            ))}
          </div>
        )}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {back && me && (
            <div
              className="neu popUp"
              role="status"
              style={{
                borderRadius: 24,
                padding: '18px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
              }}
            >
              <Avatar name={me.name} color={me.color} size={44} fontSize={17} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>
                  You’re in from the next hand.
                </span>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                  Someone will nudge you when it’s your turn.
                </span>
              </div>
            </div>
          )}
          {!back && mode === 'stay' && (
            <div
              className="popUp"
              style={{
                textAlign: 'center',
                fontSize: 15,
                lineHeight: 1.4,
                color: 'var(--muted)',
                padding: '0 12px',
              }}
            >
              No rush. Blinds skip you while you’re out, and your {money(me?.stack ?? 0)} stays put.
            </div>
          )}
        </div>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        {back ? (
          <button className="btn accentBtn cta popUp" onClick={onWatch} autoFocus>
            Watch the table
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button
              className="btn accentBtn cta"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                const r = await send({ type: 'sitIn' });
                if (!r.ok) setError(r.message);
                setBusy(false);
              }}
            >
              I’m back · deal me in
            </button>
            {mode === 'stay' ? (
              <button className="btn neu cta-2" onClick={onWatch}>
                Watch the table
              </button>
            ) : (
              <button className="btn neu cta-2" onClick={() => setMode('stay')}>
                Stay out for now
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
