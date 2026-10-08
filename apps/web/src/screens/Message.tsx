import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CardPair } from '../components/ui';

/** A simple full-screen message: not found, table full, loading, errors. */
export function Message({
  caps,
  title,
  body,
  action,
  busy = false,
}: {
  caps?: string;
  title: string;
  body?: ReactNode;
  action?: { label: string; to?: string; onClick?: () => void };
  busy?: boolean;
}) {
  useEffect(() => {
    document.title = `${title} · Async Hold’em`;
  }, [title]);
  return (
    <main className="screen">
      <div className="screen-col" style={{ justifyContent: 'center', gap: 20 }} aria-busy={busy}>
        <CardPair />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            textAlign: 'center',
            alignItems: 'center',
          }}
        >
          {caps && <span className="caps">{caps}</span>}
          <h1 className="h1" style={{ fontSize: 38 }}>
            {title}
          </h1>
          {body && (
            <p style={{ fontSize: 15, lineHeight: 1.45, color: 'var(--muted)', maxWidth: 320 }}>{body}</p>
          )}
        </div>
        {action &&
          (action.to ? (
            <Link to={action.to} className="btn accentBtn cta" style={{ marginTop: 12 }}>
              {action.label}
            </Link>
          ) : (
            <button className="btn accentBtn cta" onClick={action.onClick} style={{ marginTop: 12 }}>
              {action.label}
            </button>
          ))}
      </div>
    </main>
  );
}

export function NotFound() {
  return (
    <Message
      caps="404"
      title="No table here."
      body="The link may be mistyped, or the table was cleared after a month of quiet."
      action={{ label: 'Host a table', to: '/' }}
    />
  );
}

export function Loading() {
  return <Message title="Shuffling…" busy />;
}
