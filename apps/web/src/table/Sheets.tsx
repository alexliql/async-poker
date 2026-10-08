import type { TableView } from '@holdem/engine';
import { useState } from 'react';
import { Icon, MiniCards, Sheet } from '../components/ui';
import { RANKINGS } from '../lib/cards';
import { DENOMS } from '../lib/chips';
import type { Geometry } from '../lib/layout';
import { Feed, Tiles } from './Feed';
import type { FeedRow } from './derive';
import { rulesList } from './derive';
import { copyText } from '../lib/share';

function sheetBox(g: Geometry) {
  return { left: g.col[0] + (g.col[1] - g.sheetW) / 2, width: g.sheetW };
}

export function RanksSheet({ g, mine, onClose }: { g: Geometry; mine: string | null; onClose: () => void }) {
  return (
    <Sheet label="Hand rankings" onClose={onClose} {...sheetBox(g)} gap={12}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em' }}>Hand rankings</span>
        <span className="caps">Strongest first</span>
      </div>
      <ol
        style={{ display: 'flex', flexDirection: 'column', gap: 2, margin: 0, padding: 0, listStyle: 'none' }}
      >
        {RANKINGS.map((r, i) => {
          const isMine = r.name === mine;
          return (
            <li
              key={r.name}
              className={isMine ? 'inset rowIn' : 'rowIn'}
              aria-current={isMine ? 'true' : undefined}
              style={{
                height: 44,
                borderRadius: 14,
                padding: '0 10px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                animationDelay: `${60 + i * 35}ms`,
              }}
            >
              <span className="mono" style={{ width: 18, fontSize: 12, color: 'var(--muted)' }}>
                {i + 1}
              </span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 15,
                  fontWeight: 800,
                  letterSpacing: '-0.01em',
                  whiteSpace: 'nowrap',
                }}
              >
                {r.name}
              </span>
              {isMine && (
                <span
                  className="mono"
                  style={{
                    height: 20,
                    padding: '0 7px',
                    borderRadius: 10,
                    fontSize: 10,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    background: 'var(--accent)',
                    color: 'var(--accent-ink)',
                  }}
                >
                  YOU
                </span>
              )}
              <MiniCards cards={r.cards} />
            </li>
          );
        })}
      </ol>
    </Sheet>
  );
}

export function Denominations({ size = 13, padding = '12px 10px' }: { size?: number; padding?: string }) {
  return (
    <div
      className="inset"
      style={{
        borderRadius: 16,
        padding,
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: 8,
      }}
    >
      {DENOMS.slice()
        .reverse()
        .map((d) => (
          <div key={d.v} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <span className={d.light ? 'dchip light' : 'dchip'} style={{ backgroundColor: d.color }} />
            <span className="mono" style={{ fontSize: size, fontWeight: 700 }}>
              ${d.v}
            </span>
          </div>
        ))}
    </div>
  );
}

export function Rules({ view, compact = false }: { view: TableView; compact?: boolean }) {
  const rules = rulesList(view, compact);
  if (compact)
    return (
      <>
        {rules.map((u) => (
          <div
            key={u.k}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
              fontSize: 13,
            }}
          >
            <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{u.k}</span>
            <span
              className="mono"
              style={{ color: 'var(--muted)', textAlign: 'right', whiteSpace: 'nowrap' }}
            >
              {u.v}
            </span>
          </div>
        ))}
      </>
    );
  return (
    <div className="neu-sm" style={{ borderRadius: 18, padding: '4px 16px' }}>
      {rules.map((u, i) => (
        <div
          key={u.k}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            minHeight: 42,
            borderTop: i ? '1px solid var(--line)' : 'none',
            fontSize: 14,
          }}
        >
          <span style={{ fontWeight: 700 }}>{u.k}</span>
          <span className="mono" style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'right' }}>
            {u.v}
          </span>
        </div>
      ))}
    </div>
  );
}

export interface InfoActions {
  onDevice: () => void;
  onSitOut: () => void;
  onSitIn: () => void;
  onLeave: () => void;
  onEnd: () => void;
}

export function InfoSheet({
  g,
  view,
  actions,
  onClose,
}: {
  g: Geometry;
  view: TableView;
  actions: InfoActions;
  onClose: () => void;
}) {
  const me = view.seats.find((s) => s.seat === view.you?.seat);
  const host = view.seats.find((s) => s.seat === view.hostSeat);
  const isHost = view.you?.seat === view.hostSeat;
  const small = {
    height: 46,
    borderRadius: 15,
    fontSize: 14,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  } as const;
  return (
    <Sheet label="Table info" onClose={onClose} {...sheetBox(g)} gap={14}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em' }}>{view.config.name}</span>
        <span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
          No-limit Hold’em · hosted by {host ? (isHost ? 'you' : host.name) : 'nobody'}
        </span>
      </div>
      <span className="caps">Chip denominations</span>
      <Denominations />
      <span className="caps">Rules</span>
      <Rules view={view} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        <button className="btn neu-sm" style={small} onClick={actions.onDevice}>
          <Icon name="phone" size={16} /> Other device
        </button>
        {me?.status === 'sittingOut' ? (
          <button className="btn neu-sm" style={small} onClick={actions.onSitIn}>
            I’m back
          </button>
        ) : (
          <button
            className="btn neu-sm"
            style={small}
            onClick={actions.onSitOut}
            disabled={me?.status !== 'active'}
          >
            Sit out
          </button>
        )}
        <button className="btn neu-sm" style={small} onClick={actions.onLeave}>
          Leave table
        </button>
        {isHost && (
          <button className="btn neu-sm" style={small} onClick={actions.onEnd}>
            End the game
          </button>
        )}
      </div>
      <button
        className="btn neu"
        onClick={onClose}
        style={{ height: 54, flex: 'none', borderRadius: 18, fontSize: 16, fontWeight: 800 }}
      >
        Done
      </button>
    </Sheet>
  );
}

export function RecapSheet({
  g,
  rows,
  tiles,
  cta,
  onClose,
}: {
  g: Geometry;
  rows: FeedRow[];
  tiles: { k: string; v: string }[];
  cta: string;
  onClose: () => void;
}) {
  return (
    <Sheet label="While you were away" onClose={onClose} {...sheetBox(g)} height={g.recapH} gap={14}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 'none' }}>
        <span className="caps">While you were away</span>
        <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1 }}>
          Welcome back
        </span>
      </div>
      <Tiles tiles={tiles} />
      <div
        className="neu"
        style={{
          flex: 1,
          minHeight: 0,
          borderRadius: 20,
          padding: '0 14px 8px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column-reverse',
        }}
      >
        <Feed rows={rows} />
      </div>
      <button
        className="btn accentBtn"
        onClick={onClose}
        style={{ height: 56, flex: 'none', borderRadius: 18, fontSize: 17, fontWeight: 800 }}
      >
        {cta}
      </button>
    </Sheet>
  );
}

export function ConfirmSheet({
  g,
  title,
  body,
  confirm,
  onConfirm,
  onClose,
}: {
  g: Geometry;
  title: string;
  body: string;
  confirm: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet label={title} onClose={onClose} {...sheetBox(g)} gap={16}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05 }}>
          {title}
        </span>
        <span style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.4 }}>{body}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 12 }}>
        <button
          className="btn neu"
          onClick={onClose}
          style={{ height: 56, borderRadius: 18, fontSize: 16, fontWeight: 800 }}
        >
          Cancel
        </button>
        <button
          className="btn accentBtn"
          onClick={onConfirm}
          style={{ height: 56, borderRadius: 18, fontSize: 16, fontWeight: 800 }}
        >
          {confirm}
        </button>
      </div>
    </Sheet>
  );
}

export function DeviceSheet({
  g,
  link,
  error,
  onClose,
}: {
  g: Geometry;
  link: string | null;
  error: string | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Sheet label="Open on another device" onClose={onClose} {...sheetBox(g)} gap={16}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05 }}>
          Open on another device
        </span>
        <span style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.4 }}>
          This link puts your seat on another phone or computer. It works once and expires in 10 minutes. Keep
          it to yourself.
        </span>
      </div>
      <div
        className="inset mono"
        style={{
          minHeight: 46,
          borderRadius: 15,
          padding: '12px 14px',
          fontSize: 13,
          fontWeight: 500,
          overflowWrap: 'anywhere',
        }}
      >
        {error ?? link ?? 'Making a link…'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <button
          className="btn neu"
          onClick={onClose}
          style={{ height: 56, borderRadius: 18, fontSize: 16, fontWeight: 800 }}
        >
          Done
        </button>
        <button
          className="btn accentBtn"
          disabled={!link}
          onClick={async () => {
            if (link && (await copyText(link))) {
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            }
          }}
          style={{
            height: 56,
            borderRadius: 18,
            fontSize: 16,
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <Icon name={copied ? 'check' : 'copy'} size={16} width={2.4} />
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
    </Sheet>
  );
}
