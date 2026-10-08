import type { SeatView } from '@holdem/engine';
import { Alembic, Avatar, BetChip, Ring } from '../components/ui';
import { face } from '../lib/cards';
import { money, timeLeft } from '../lib/format';
import type { Geometry, SeatPos } from '../lib/layout';
import { badgeStyle, headsUpBadge } from './derive';

export interface SeatProps {
  seat: SeatView;
  pos: SeatPos;
  g: Geometry;
  handNo: number;
  tag: string | null;
  /** Stack to draw (holds back winnings until the pot lands). */
  stack: number;
  now: number;
  turnTimerMs: number;
  collecting: boolean;
  /** Cards that won, at showdown; others dim. */
  winners: Set<string> | null;
}

export function Seat({
  seat: s,
  pos,
  g,
  handNo,
  tag,
  stack,
  now,
  turnTimerMs,
  collecting,
  winners,
}: SeatProps) {
  const av = g.av;
  const out = s.folded || (!s.inHand && s.status !== 'active') || s.left;
  const badge = s.inHand ? headsUpBadge(s) : null;
  const bs = badge ? badgeStyle(badge) : null;
  const backs = s.inHand && !s.folded && !s.shown;
  const remaining = s.deadlineAt !== null ? Math.min(turnTimerMs, s.deadlineAt - now) : 0;
  const statusTag =
    !s.inHand && s.status === 'sittingOut' ? 'Away' : !s.inHand && s.status === 'busted' ? 'Out' : null;
  const shownTag = s.isTurn ? null : (tag ?? statusTag);
  const label = [
    s.name,
    money(stack),
    s.isTurn ? `thinking, ${timeLeft(remaining)} left` : null,
    s.folded ? 'folded' : null,
    shownTag && !s.folded ? shownTag : null,
    s.bet > 0 ? `bet ${money(s.bet)}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <>
      <div
        role="group"
        aria-label={label}
        data-seat={s.seat}
        style={{
          position: 'absolute',
          left: pos.x - g.seatW / 2,
          top: pos.y - av / 2,
          width: g.seatW,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: g.seatGap,
          opacity: out ? 0.38 : 1,
          transition: 'opacity 320ms ease',
        }}
      >
        <div style={{ position: 'relative', width: av, height: av }}>
          {s.isTurn && <Ring size={av} fraction={remaining / turnTimerMs} />}
          <Avatar name={s.name} color={s.color} size={av} fontSize={Math.round(av * 0.34)} />
          {badge && bs && (
            <div
              className="badge"
              style={{
                position: 'absolute',
                left: -8,
                top: -4,
                background: bs.bg,
                color: bs.fg,
                boxShadow: bs.sh,
              }}
            >
              {badge}
            </div>
          )}
          {backs && (
            <div
              key={`backs-${handNo}`}
              aria-hidden="true"
              className="fade"
              style={{
                position: 'absolute',
                right: -Math.round(av * 0.27),
                top: -Math.round(av * 0.15),
                width: Math.round(av * 0.56),
                height: Math.round(av * 0.56),
              }}
            >
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="back"
                  style={{
                    position: 'absolute',
                    left: i ? Math.round(av * 0.17) : 0,
                    top: i ? 0 : 2,
                    width: Math.round(av * 0.33),
                    height: Math.round(av * 0.46),
                    borderRadius: 4,
                    transform: `rotate(${i ? 8 : -9}deg)`,
                  }}
                >
                  <Alembic size={Math.round(av * 0.21)} />
                </div>
              ))}
            </div>
          )}
          {s.shown && !s.folded && (
            <div
              aria-label={`Shows ${s.shown.join(' ')}`}
              style={{
                position: 'absolute',
                left: '50%',
                top: -40,
                width: 44,
                height: 34,
                transform: 'translateX(-50%)',
              }}
            >
              {s.shown.map((c, i) => {
                const f = face(c);
                const dim = winners && !winners.has(c);
                return (
                  <div
                    key={`${handNo}-${c}`}
                    className="card flip"
                    style={{
                      position: 'absolute',
                      left: i ? 19 : 0,
                      top: i ? 0 : 2,
                      width: 22,
                      height: 31,
                      borderRadius: 4,
                      color: f.color,
                      opacity: dim ? 0.6 : 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      lineHeight: 1,
                      transform: i ? undefined : 'rotate(-7deg)',
                      animationDelay: i ? '90ms' : undefined,
                      transition: 'opacity 300ms ease',
                    }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 800 }}>{f.rank}</span>
                    <span style={{ fontSize: 10 }}>{f.suit}</span>
                  </div>
                );
              })}
            </div>
          )}
          {s.isTurn && (
            <div style={{ position: 'absolute', left: '50%', bottom: -11, transform: 'translateX(-50%)' }}>
              <div className="tag pop" style={{ boxShadow: 'inset 0 0 0 1.5px var(--accent)' }}>
                {timeLeft(remaining)} left
              </div>
            </div>
          )}
          {shownTag && (
            <div style={{ position: 'absolute', left: '50%', bottom: -11, transform: 'translateX(-50%)' }}>
              <div key={`${handNo}-${shownTag}`} className="tag pop">
                {shownTag}
              </div>
            </div>
          )}
        </div>
        <div
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, maxWidth: '100%' }}
        >
          <span
            style={{
              fontSize: g.nameF,
              fontWeight: 800,
              maxWidth: '100%',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {s.name}
          </span>
          <span className="mono" style={{ fontSize: g.stackF, color: 'var(--muted)' }}>
            {money(stack)}
          </span>
        </div>
      </div>
      {s.bet > 0 && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: pos.cx,
            top: pos.cy,
            transform: collecting
              ? `translate(-50%, -50%) translate(${g.CX - pos.cx}px, ${g.CY - pos.cy}px) scale(.5)`
              : 'translate(-50%, -50%)',
            opacity: collecting ? 0 : 1,
            transition: 'transform 440ms cubic-bezier(.3,.7,.2,1), opacity 440ms ease',
            zIndex: 2,
          }}
        >
          <BetChip amount={s.bet} label={money(s.bet)} />
        </div>
      )}
    </>
  );
}
