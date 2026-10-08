import { colorHex } from '@holdem/engine';
import { initial } from '../lib/format';

export interface GridPerson {
  key: string | number;
  name: string;
  color: string;
  bold?: boolean;
  pop?: boolean;
}

/** "At the table": everyone seated, then the open seats. */
export function SeatGrid({ people, max }: { people: GridPerson[]; max: number }) {
  const open = Math.max(0, max - people.length);
  const cols = Math.max(6, max);
  return (
    <div
      className="neu"
      style={{ borderRadius: 24, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="caps">At the table</span>
        <span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
          {people.length} of {max}
        </span>
      </div>
      <ul
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gap: 4,
          margin: 0,
          padding: 0,
          listStyle: 'none',
        }}
      >
        {people.map((p) => (
          <li
            key={p.key}
            className={p.pop ? 'pop' : undefined}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, minWidth: 0 }}
          >
            <div
              className="avatar"
              aria-hidden="true"
              style={{
                width: 32,
                height: 32,
                fontSize: 13,
                fontWeight: 700,
                background: colorHex(p.color),
                transition: 'background 260ms ease',
              }}
            >
              {initial(p.name)}
            </div>
            <span
              style={{
                maxWidth: '100%',
                fontSize: 11,
                fontWeight: p.bold ? 800 : 500,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {p.name}
            </span>
          </li>
        ))}
        {Array.from({ length: open }, (_, i) => (
          <li
            key={`open-${i}`}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, minWidth: 0 }}
          >
            <div
              className="inset"
              aria-hidden="true"
              style={{ width: 32, height: 32, borderRadius: '50%' }}
            />
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Open</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
