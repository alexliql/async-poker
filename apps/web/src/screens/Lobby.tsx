import { MIN_SEATS, type TableView } from '@holdem/engine';
import { useEffect, useState } from 'react';
import type { SendResult } from '../client/types';
import { SeatGrid } from '../components/SeatGrid';
import { Avatar, Dots, Icon } from '../components/ui';
import { money, timerLabel } from '../lib/format';
import { copyText, shareOrCopy, tableUrl } from '../lib/share';

interface LobbyProps {
  slug: string;
  view: TableView;
  send: (cmd: { type: 'start' } | { type: 'kick'; seat: number }) => Promise<SendResult>;
}

function useTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

/** The host's waiting room: the invite link, who's arrived, and the button that deals. */
export function Lobby({ slug, view, send }: LobbyProps) {
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useTitle(`${view.config.name} · Lobby`);
  const url = tableUrl(slug);
  const seated = view.seats.filter((s) => !s.left);
  const host = view.you?.seat;
  const c = view.config;

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <main className="screen">
      <div className="screen-col" style={{ paddingTop: 36, gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="caps">Lobby · you’re hosting</span>
          <h1 className="h1">{c.name}</h1>
          <div className="mono" style={{ fontSize: 13, color: 'var(--muted)' }}>
            Blinds {money(c.smallBlind)}/{money(c.bigBlind)} · {money(c.buyIn)} buy-in ·{' '}
            {timerLabel(c.turnTimerMs)} turns
          </div>
        </div>

        <div
          className="neu"
          style={{ borderRadius: 24, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <span className="caps">Invite link</span>
          <div style={{ display: 'flex', gap: 10 }}>
            <div
              className="inset mono"
              data-testid="invite-link"
              style={{
                flex: 1,
                minWidth: 0,
                height: 46,
                borderRadius: 15,
                padding: '0 14px',
                display: 'flex',
                alignItems: 'center',
                fontSize: 14,
                fontWeight: 500,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {url.replace(/^https?:\/\//, '')}
            </div>
            <button
              className="btn neu-sm"
              onClick={async () => setCopied(await copyText(url))}
              style={{
                width: 92,
                height: 46,
                borderRadius: 15,
                fontSize: 14,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <span
                key={String(copied)}
                className={copied ? 'pop' : undefined}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Icon name={copied ? 'check' : 'copy'} size={16} width={copied ? 2.6 : 2.2} />
                {copied ? 'Copied' : 'Copy'}
              </span>
            </button>
            <button
              className="btn neu-sm"
              aria-label="Share invite"
              onClick={async () => {
                const r = await shareOrCopy({
                  title: c.name,
                  text: `Pull up a chair at ${c.name}. Free chips.`,
                  url,
                });
                if (r === 'copied') setCopied(true);
              }}
              style={{
                width: 46,
                height: 46,
                borderRadius: 15,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="share" />
            </button>
          </div>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            Drop it in the group chat. Anyone with the link can grab a seat.
          </span>
        </div>

        <div
          className="neu"
          style={{
            flex: 1,
            minHeight: 0,
            borderRadius: 24,
            padding: '16px 16px 8px',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              paddingBottom: 6,
            }}
          >
            <span className="caps">Seated</span>
            <span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
              {seated.length} of {c.maxSeats}
            </span>
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {seated.map((s, i) => (
              <li
                key={s.seat}
                className="rowIn"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  height: 58,
                  borderTop: i ? '1px solid var(--line)' : 'none',
                }}
              >
                <Avatar name={s.name} color={s.color} size={38} fontSize={15} />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em' }}>{s.name}</span>
                    {s.seat === host && <span className="pill">Host · you</span>}
                  </div>
                  <span
                    style={{
                      fontSize: 12,
                      color: 'var(--muted)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {s.phrase ? `“${s.phrase}”` : 'No catchphrase. Mysterious.'}
                  </span>
                </div>
                <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
                  {money(s.stack)}
                </span>
                {s.seat !== host && (
                  <button
                    className="btn neu-sm hit"
                    aria-label={`Remove ${s.name}`}
                    onClick={() => void send({ type: 'kick', seat: s.seat })}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--muted)',
                    }}
                  >
                    <Icon name="close" size={12} width={3} />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {seated.length < c.maxSeats && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                height: 52,
                borderTop: '1px solid var(--line)',
                color: 'var(--muted)',
                fontSize: 14,
                flex: 'none',
              }}
            >
              <div className="inset" style={{ width: 38, height: 38, borderRadius: '50%', flex: 'none' }} />
              <span>Waiting for players</span>
              <Dots />
            </div>
          )}
        </div>

        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        {seated.length >= MIN_SEATS ? (
          <button
            className="btn accentBtn cta popUp"
            disabled={starting}
            onClick={async () => {
              setStarting(true);
              setError(null);
              const r = await send({ type: 'start' });
              if (!r.ok) {
                setError(r.message);
                setStarting(false);
              }
            }}
          >
            {starting ? 'Shuffling…' : `Deal the first hand · ${seated.length} players`}
          </button>
        ) : (
          <button className="btn neu cta" disabled>
            Need at least 2 players
          </button>
        )}
      </div>
    </main>
  );
}

/** A guest's waiting room, until the host deals. Then it says so and sends them in. */
export function Waiting({ view, started, onGo }: { view: TableView; started: boolean; onGo: () => void }) {
  useTitle(`${view.config.name} · Lobby`);
  const me = view.seats.find((s) => s.seat === view.you?.seat);
  const host = view.seats.find((s) => s.seat === view.hostSeat);
  const c = view.config;
  const people = view.seats
    .filter((s) => !s.left)
    .map((s) => ({
      key: s.seat,
      name: s.seat === me?.seat ? 'You' : s.name,
      color: s.color,
      bold: s.seat === me?.seat,
    }));
  return (
    <main className="screen">
      <div className="screen-col" style={{ paddingTop: 36, gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="caps">Lobby</span>
          <h1 className="h1">{c.name}</h1>
          <div className="mono" style={{ fontSize: 13, color: 'var(--muted)' }}>
            Hosted by {host?.name} · Blinds {money(c.smallBlind)}/{money(c.bigBlind)} ·{' '}
            {timerLabel(c.turnTimerMs)} turns
          </div>
        </div>
        <div
          className="neu"
          style={{
            borderRadius: 28,
            padding: '26px 20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
            textAlign: 'center',
          }}
        >
          <div style={{ position: 'relative', width: 72, height: 72 }}>
            {!started && me && (
              <div
                className="ripple"
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  border: `2px solid var(--muted)`,
                }}
              />
            )}
            {me && (
              <Avatar
                name={me.name}
                color={me.color}
                size={72}
                fontSize={28}
                style={{ position: 'relative' }}
              />
            )}
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05 }}>
            You’re in, {me?.name}.
          </div>
          {started ? (
            <div className="pop" role="status" style={{ fontSize: 15, fontWeight: 700 }}>
              {host?.name} started the game. You’re dealt in.
            </div>
          ) : (
            <div style={{ fontSize: 15, color: 'var(--muted)' }}>
              Waiting for {host?.name}, the host, to start the game <Dots />
            </div>
          )}
        </div>
        <SeatGrid people={people} max={c.maxSeats} />
        <div
          className="neu"
          style={{ borderRadius: 24, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}
        >
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span id="notif-label" style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em' }}>
                Ping me on my turn
              </span>
              <span
                className="mono"
                style={{
                  height: 18,
                  padding: '0 7px',
                  borderRadius: 9,
                  fontSize: 10,
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  color: 'var(--muted)',
                  boxShadow: 'inset 0 0 0 1px var(--muted)',
                }}
              >
                LATER
              </span>
            </div>
            <span style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.35 }}>
              Coming soon. Until then, whoever moves before you can send you a nudge link.
            </span>
          </div>
          <button
            className="btn switch inset"
            role="switch"
            aria-checked="false"
            aria-labelledby="notif-label"
            disabled
          >
            <span className="knob" />
          </button>
        </div>
        <div className="spacer" />
        {started ? (
          <button className="btn accentBtn cta popUp" onClick={onGo} autoFocus>
            Go to the table
          </button>
        ) : (
          <button className="btn neu cta" disabled>
            Waiting for host to start
          </button>
        )}
      </div>
    </main>
  );
}
