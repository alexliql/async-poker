import type { TableView } from '@holdem/engine';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Icon } from '../components/ui';
import { duration, money, plural, signedMoney } from '../lib/format';
import { copyText } from '../lib/share';
import type { CreatePrefill } from './Create';

export function standingsText(view: TableView): string {
  const me = view.you?.seat;
  const lines = (view.standings ?? []).map(
    (p, i) => `${i + 1}. ${p.name}${p.seat === me ? ' (me)' : ''} ${signedMoney(p.net)}`,
  );
  return `${view.config.name} · final\n${lines.join('\n')}`;
}

/** Final standings. Chips were free, so the nets always add up to zero. */
export function Ended({ view }: { view: TableView }) {
  const navigate = useNavigate();
  const [shared, setShared] = useState<'shared' | 'copied' | null>(null);
  const standings = view.standings ?? [];
  const me = view.you?.seat;
  const top = standings[0];
  const rest = standings.slice(1);
  const ended = view.log.findLast((e) => e.k === 'ended');
  const endedBy = ended ? view.seats.find((s) => s.seat === ended.seat) : null;
  const span = ended ? ended.at - view.createdAt : 0;
  const biggest = view.biggestPot
    ? { who: standings.find((s) => s.seat === view.biggestPot!.seat), amount: view.biggestPot.amount }
    : null;
  const rebuyer = standings.reduce<(typeof standings)[number] | null>(
    (a, b) => (b.buyIns > (a?.buyIns ?? 1) ? b : a),
    null,
  );

  useEffect(() => {
    document.title = `${view.config.name} · Final standings`;
  }, [view.config.name]);

  useEffect(() => {
    if (!shared) return;
    const t = setTimeout(() => setShared(null), 2400);
    return () => clearTimeout(t);
  }, [shared]);

  const awards = [
    biggest?.who
      ? {
          k: 'Biggest pot',
          who: biggest.who.seat === me ? 'You' : biggest.who.name,
          v: money(biggest.amount),
        }
      : null,
    rebuyer
      ? { k: 'Most rebuys', who: rebuyer.seat === me ? 'You' : rebuyer.name, v: `×${rebuyer.buyIns - 1}` }
      : { k: 'Rebuys', who: 'None', v: 'clean game' },
  ].filter((a): a is { k: string; who: string; v: string } => !!a);

  const share = async () => {
    const text = standingsText(view);
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ text });
        setShared('shared');
        return;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
    }
    if (await copyText(text)) setShared('copied');
  };

  const prefill: CreatePrefill = {
    tableName: view.config.name,
    smallBlind: view.config.smallBlind,
    buyIn: view.config.buyIn,
    turnTimerMs: view.config.turnTimerMs,
    maxSeats: view.config.maxSeats,
  };

  return (
    <main className="screen">
      <div className="screen-col" style={{ paddingTop: 36 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="caps">
            {view.config.name}
            {endedBy ? ` · ${endedBy.seat === me ? 'You' : endedBy.name} ended the game` : ''}
          </span>
          <h1 className="h1">Good game.</h1>
          <div className="mono" style={{ fontSize: 13, color: 'var(--muted)' }}>
            {duration(span)} · {plural(view.handsPlayed, 'hand')} · {plural(standings.length, 'player')}
          </div>
        </div>
        {top && (
          <ol
            className="neu"
            aria-label="Final standings"
            style={{
              borderRadius: 24,
              padding: '8px 10px',
              display: 'flex',
              flexDirection: 'column',
              margin: 0,
              listStyle: 'none',
            }}
          >
            <li
              className="inset"
              style={{
                borderRadius: 18,
                padding: '14px 12px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ position: 'relative' }}>
                  <Avatar name={top.name} color={top.color} size={48} fontSize={19} />
                  <svg
                    className="crown"
                    aria-hidden="true"
                    width="22"
                    height="18"
                    viewBox="0 0 22 18"
                    style={{ position: 'absolute', left: -9, top: -11 }}
                  >
                    <path
                      d="M2 15 L1 4 L7 9 L11 1 L15 9 L21 4 L20 15 Z"
                      fill="var(--accent)"
                      stroke="var(--fg)"
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em' }}>
                    {top.seat === me ? 'You' : top.name}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {top.net > 0 ? 'Took the night' : 'Nobody lost. Suspicious.'}
                  </span>
                </div>
                <span className="mono" style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em' }}>
                  {signedMoney(top.net)}
                </span>
              </div>
              {top.phrase && (
                <div style={{ fontSize: 15, fontWeight: 700, fontStyle: 'italic', paddingLeft: 60 }}>
                  “{top.phrase}”
                </div>
              )}
            </li>
            {rest.map((p, i) => (
              <li
                key={p.seat}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  height: 50,
                  padding: '0 12px',
                  borderTop: i ? '1px solid var(--line)' : '0',
                }}
              >
                <span className="mono" style={{ width: 14, fontSize: 13, color: 'var(--muted)' }}>
                  {i + 2}
                </span>
                <Avatar name={p.name} color={p.color} size={30} fontSize={12} />
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 15,
                    fontWeight: p.seat === me ? 800 : 600,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {p.seat === me ? 'You' : p.name}
                </span>
                {p.buyIns > 1 && (
                  <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {p.buyIns} buy-ins
                  </span>
                )}
                <span
                  className="mono"
                  style={{
                    width: 70,
                    textAlign: 'right',
                    fontSize: 15,
                    fontWeight: 700,
                    color: p.net < 0 ? 'var(--muted)' : 'var(--fg)',
                  }}
                >
                  {signedMoney(p.net)}
                </span>
              </li>
            ))}
          </ol>
        )}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${awards.length}, minmax(0, 1fr))`,
            gap: 12,
          }}
        >
          {awards.map((a) => (
            <div
              key={a.k}
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
                {a.k}
              </span>
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 800,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {a.who}{' '}
                <span className="mono" style={{ fontWeight: 600, color: 'var(--muted)' }}>
                  {a.v}
                </span>
              </span>
            </div>
          ))}
        </div>
        <div className="spacer" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button className="btn accentBtn cta" onClick={() => void share()}>
            {shared && <Icon name="check" width={2.8} />}
            <span>
              {shared === 'copied'
                ? 'Copied for the group chat'
                : shared === 'shared'
                  ? 'Shared'
                  : 'Share to group chat'}
            </span>
          </button>
          <button className="btn neu cta-2" onClick={() => navigate('/', { state: prefill })}>
            Run it back
          </button>
        </div>
      </div>
    </main>
  );
}
