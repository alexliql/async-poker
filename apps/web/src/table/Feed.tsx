import { colorHex } from '@holdem/engine';
import { useRef } from 'react';
import { MiniCards, PotIcon } from '../components/ui';
import { initial } from '../lib/format';
import type { FeedRow } from './derive';

/**
 * The table's history: hands, moves, boards and results, newest at the bottom.
 * Put it in a `column-reverse` scroller so it opens, and stays, at the latest row.
 */
export function Feed({ rows }: { rows: FeedRow[] }) {
  // Stagger the last few rows on open; rows that arrive later just slide in.
  const firstCount = useRef(rows.length);
  const from = Math.max(0, firstCount.current - 10);
  return (
    <div role="log" aria-label="Table activity">
      {rows.map((r, i) => (
        <div
          key={r.key}
          className="rowIn"
          style={{ animationDelay: i < from || i >= firstCount.current ? '0ms' : `${(i - from) * 40}ms` }}
        >
          <Row r={r} />
        </div>
      ))}
    </div>
  );
}

function Row({ r }: { r: FeedRow }) {
  switch (r.k) {
    case 'away':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0 4px' }}>
          <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
          <span className="caps">While you were away</span>
          <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
        </div>
      );
    case 'hand':
      return (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            padding: '12px 0 4px',
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 800 }}>{r.title}</span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
            {r.note}
          </span>
        </div>
      );
    case 'act':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 36 }}>
          <div
            className="avatar"
            aria-hidden="true"
            style={{ width: 24, height: 24, fontSize: 10, background: colorHex(r.color), boxShadow: 'none' }}
          >
            {initial(r.who)}
          </div>
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 14,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            <span style={{ fontWeight: 800 }}>{r.who}</span> {r.verb}{' '}
            <span className="mono" style={{ fontWeight: 700 }}>
              {r.amt}
            </span>
          </span>
          {r.tag && <span className="tagS">{r.tag}</span>}
          <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
            {r.ago}
          </span>
        </div>
      );
    case 'board':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 42 }}>
          <span className="caps" style={{ width: 46 }}>
            {r.street}
          </span>
          <MiniCards cards={r.cards} gap={4} label={`${r.street}: ${r.cards.join(' ')}`} />
        </div>
      );
    case 'result':
      return (
        <div
          className="inset"
          style={{
            margin: '6px 0 4px',
            borderRadius: 14,
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <PotIcon width={18} />
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 14 }}>
              <span style={{ fontWeight: 800 }}>{r.who}</span> won{' '}
              <span className="mono" style={{ fontWeight: 700 }}>
                {r.amt}
              </span>
            </span>
            {r.hand && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{r.hand}</span>}
          </div>
          {r.shown && <MiniCards cards={r.shown} label={`Showed ${r.shown.join(' ')}`} />}
        </div>
      );
    case 'turn':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 40 }}>
          <span
            className="breathe"
            style={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: 'var(--accent)',
              margin: '0 7px',
              flex: 'none',
            }}
          />
          <span style={{ fontSize: 15, fontWeight: 800 }}>You’re up</span>
          <span className="mono" style={{ fontSize: 13, color: 'var(--muted)' }}>
            {r.text}
          </span>
        </div>
      );
  }
}

export function Tiles({ tiles, size = 18 }: { tiles: { k: string; v: string }[]; size?: number }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))`,
        gap: size > 16 ? 10 : 8,
        flex: 'none',
      }}
    >
      {tiles.map((t) => (
        <div
          key={t.k}
          className="inset"
          style={{
            borderRadius: size > 16 ? 16 : 14,
            padding: size > 16 ? '10px 12px' : '9px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
            minWidth: 0,
          }}
        >
          <span className="caps" style={size > 16 ? undefined : { fontSize: 10 }}>
            {t.k}
          </span>
          <span
            className="mono"
            style={{ fontSize: size, fontWeight: 700, letterSpacing: '-0.03em', whiteSpace: 'nowrap' }}
          >
            {t.v}
          </span>
        </div>
      ))}
    </div>
  );
}
