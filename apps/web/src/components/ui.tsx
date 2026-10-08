import { colorHex } from '@holdem/engine';
import type { CSSProperties, ReactNode } from 'react';
import { face } from '../lib/cards';
import { type Denom, DENOMS, chipPaint, stackOf } from '../lib/chips';
import { initial } from '../lib/format';

// ---------- icons ----------

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function Icon({ name, size = 18, width = 2.2 }: { name: IconName; size?: number; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} strokeWidth={width} aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

const ICONS = {
  share: (
    <>
      <path d="M12 3v12" />
      <path d="M7 8l5-5 5 5" />
      <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </>
  ),
  history: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3.5 4.5v4h4" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  minus: <path d="M5 12h14" />,
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </>
  ),
  close: (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </>
  ),
  info: (
    <>
      <path d="M12 11v6" />
      <path d="M12 7h.01" />
    </>
  ),
  list: (
    <>
      <path d="M8 6h12" />
      <path d="M8 12h12" />
      <path d="M8 18h12" />
      <path d="M4 6h.01" />
      <path d="M4 12h.01" />
      <path d="M4 18h.01" />
    </>
  ),
  bell: (
    <>
      <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9" />
      <path d="M10.3 20a1.9 1.9 0 0 0 3.4 0" />
    </>
  ),
  phone: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M11 18h2" />
    </>
  ),
  wifiOff: (
    <>
      <path d="M2 8.8a15 15 0 0 1 4.2-2.6" />
      <path d="M10.7 5.1A15 15 0 0 1 22 8.8" />
      <path d="M5 12.6a10 10 0 0 1 5.2-2.5" />
      <path d="M16.9 10.9A10 10 0 0 1 19 12.6" />
      <path d="M8.5 16.4a5 5 0 0 1 7 0" />
      <path d="M12 20h.01" />
      <path d="M3 3l18 18" />
    </>
  ),
};
export type IconName = keyof typeof ICONS;

/** The alembic on every card back. `large` adds the stand, for bigger cards. */
export function Alembic({
  size,
  width = 2.4,
  large = false,
}: {
  size: number;
  width?: number;
  large?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0.8 1.75 24 24"
      {...stroke}
      strokeWidth={width}
      aria-hidden="true"
    >
      <circle cx="9" cy="16" r="4.5" />
      <path d="M9 11.5V8.5" />
      <path d="M6.5 8.5a2.5 2.5 0 0 1 5 0z" />
      <path d="M11.2 7.4l7.3 5.1" />
      {large && <path d="M18.5 12.5v1.4" />}
      <circle cx="18.5" cy="16.5" r="2.6" />
      {large && <path d="M5 21.5h8" />}
    </svg>
  );
}

/** Two dealt card backs, as on the Create and Join screens. */
export function CardPair() {
  return (
    <div
      aria-hidden="true"
      style={{ alignSelf: 'center', position: 'relative', width: 70, height: 58, flex: 'none' }}
    >
      <div style={{ position: 'absolute', left: 2, top: 6, transform: 'rotate(-11deg)' }}>
        <div className="cback dealIn" style={{ width: 36, height: 50, animationDelay: '120ms' }}>
          <div className="cframe" />
          <Alembic size={20} width={1.8} large />
        </div>
      </div>
      <div style={{ position: 'absolute', left: 32, top: 0, transform: 'rotate(9deg)' }}>
        <div className="cback dealIn" style={{ width: 36, height: 50, animationDelay: '240ms' }}>
          <div className="cframe" />
          <Alembic size={20} width={1.8} large />
        </div>
      </div>
    </div>
  );
}

// ---------- chips ----------

function ChipShape({ d }: { d: Denom }) {
  const p = chipPaint(d);
  return (
    <>
      <path d="M0.6 3V5.1A10.4 2.5 0 0 0 21.4 5.1V3Z" fill={p.side} />
      <path d="M3.6 4.9V6.7M9.8 5.45V7.5M16.2 5.2V7.2" stroke={p.spot} strokeWidth="1.6" />
      <ellipse cx="11" cy="3" rx="10.4" ry="2.5" fill={p.bg} />
      <ellipse
        cx="11"
        cy="3"
        rx="7"
        ry="1.6"
        fill="none"
        stroke={p.spot}
        strokeWidth="0.7"
        strokeDasharray="1.8 1.4"
      />
    </>
  );
}

/** One chip seen from the side. */
export function Chip({
  d,
  width = 20,
  className,
  style,
}: {
  d: Denom;
  width?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 22 8"
      width={width}
      height={(width * 8) / 22}
      aria-hidden="true"
      className={className}
      style={{ display: 'block', overflow: 'visible', ...style }}
    >
      <ChipShape d={d} />
    </svg>
  );
}

/** The three-chip icon used for the pot and anywhere money is shown big. */
export function PotIcon({ width = 26 }: { width?: number }) {
  const order = [DENOMS[1]!, DENOMS[2]!, DENOMS[3]!];
  return (
    <svg
      viewBox="0 0 22 12.4"
      width={width}
      height={(width * 12.4) / 22}
      aria-hidden="true"
      style={{
        display: 'block',
        flex: 'none',
        overflow: 'visible',
        filter: 'drop-shadow(0 1px 0.8px rgba(0,0,0,.28))',
      }}
    >
      {order.map((d, i) => (
        <g key={d.v} transform={`translate(0 ${(4.4 - i * 2.2).toFixed(1)})`}>
          <ChipShape d={d} />
        </g>
      ))}
    </svg>
  );
}

/** A bet on the felt: a real stack of chips plus the amount. */
export function BetChip({ amount, label }: { amount: number; label: string }) {
  const chips = stackOf(amount);
  return (
    <div className="chip chipIn" key={amount}>
      <span className="tstack">
        {chips.map((d, i) => (
          <span key={i} className="tchip" style={{ bottom: +(i * 2.1).toFixed(1) }}>
            <Chip d={d} />
          </span>
        ))}
      </span>
      <span className="mono">{label}</span>
    </div>
  );
}

// ---------- people and cards ----------

export function Avatar({
  name,
  color,
  size,
  fontSize,
  className = 'avatar',
  style,
}: {
  name: string;
  color: string;
  size: number;
  fontSize?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={className}
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        fontSize: fontSize ?? Math.round(size * 0.4),
        background: colorHex(color),
        ...style,
      }}
    >
      {initial(name)}
    </div>
  );
}

export function MiniCard({ card, fourColor }: { card: string; fourColor?: boolean }) {
  const f = face(card, fourColor);
  return (
    <div className="mini" style={{ color: f.color }}>
      <span>{f.rank}</span>
      <span style={{ fontSize: 9, marginTop: 1 }}>{f.suit}</span>
    </div>
  );
}

export function MiniCards({ cards, gap = 3, label }: { cards: string[]; gap?: number; label?: string }) {
  return (
    <div style={{ display: 'flex', gap }} role={label ? 'img' : undefined} aria-label={label}>
      {cards.map((c) => (
        <MiniCard key={c} card={c} />
      ))}
    </div>
  );
}

// ---------- layout helpers ----------

export function Sheet({
  label,
  onClose,
  left,
  width,
  height,
  gap = 14,
  children,
}: {
  label: string;
  onClose: () => void;
  left: number;
  width: number;
  height?: number;
  gap?: number;
  children: ReactNode;
}) {
  return (
    <>
      <button
        className="fade"
        aria-label={`Close ${label.toLowerCase()}`}
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          border: 0,
          padding: 0,
          background: 'var(--scrim)',
          cursor: 'pointer',
          zIndex: 40,
        }}
      />
      <div
        className="sheetUp"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
        style={{
          position: 'absolute',
          left,
          width,
          bottom: 0,
          height,
          maxHeight: '100%',
          padding: '12px 20px 26px',
          borderRadius: '30px 30px 0 0',
          background: 'var(--bg)',
          boxShadow: '0 -10px 30px var(--sd)',
          display: 'flex',
          flexDirection: 'column',
          gap,
          zIndex: 41,
          overflowY: height ? undefined : 'auto',
        }}
      >
        <div
          style={{
            alignSelf: 'center',
            width: 36,
            height: 5,
            borderRadius: 3,
            background: 'var(--muted)',
            opacity: 0.4,
            flex: 'none',
          }}
        />
        {children}
      </div>
    </>
  );
}

export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  columns,
  fontSize,
}: {
  label: string;
  options: { value: T; label: string; long?: string }[];
  value: T;
  onChange: (v: T) => void;
  columns?: number;
  fontSize?: number;
}) {
  return (
    <div
      className="inset"
      role="group"
      aria-label={label}
      style={{
        borderRadius: 16,
        padding: 4,
        display: 'grid',
        gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))`,
        gap: 3,
      }}
    >
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          className={o.value === value ? 'btn seg on' : 'btn seg'}
          aria-pressed={o.value === value}
          aria-label={o.long}
          onClick={() => onChange(o.value)}
          style={fontSize ? { fontSize } : undefined}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Dots() {
  return (
    <span className="dots" aria-hidden="true" style={{ fontWeight: 800, letterSpacing: 2 }}>
      <span>.</span>
      <span>.</span>
      <span>.</span>
    </span>
  );
}

export function Field({ id, label, children }: { id?: string; label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {id ? (
        <label htmlFor={id} className="caps">
          {label}
        </label>
      ) : (
        <span className="caps">{label}</span>
      )}
      {children}
    </div>
  );
}

/** A small ring timer around an avatar. */
export function Ring({
  size,
  fraction,
  color = 'var(--accent)',
}: {
  size: number;
  fraction: number;
  color?: string;
}) {
  const rs = size + 12;
  const r = size / 2 + 4.5;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fraction));
  return (
    <svg
      className="fade"
      aria-hidden="true"
      width={rs}
      height={rs}
      viewBox={`0 0 ${rs} ${rs}`}
      style={{ position: 'absolute', left: -6, top: -6, transform: 'rotate(-90deg)' }}
    >
      <circle cx={rs / 2} cy={rs / 2} r={r} fill="none" strokeWidth="2.5" style={{ stroke: 'var(--line)' }} />
      <circle
        cx={rs / 2}
        cy={rs / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={c.toFixed(1)}
        strokeDashoffset={(c * (1 - f)).toFixed(1)}
        style={{ transition: 'stroke-dashoffset 1s linear' }}
      />
    </svg>
  );
}
