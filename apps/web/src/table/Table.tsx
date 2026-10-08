import type { ActionKind, ClientCommand, PreAction, SeatView, TableView } from '@holdem/engine';
import { colorHex } from '@holdem/engine';
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ClientSnapshot, SendResult, TableClient } from '../client/types';
import { useNow, useUpdates } from '../client/hooks';
import { Avatar, BetChip, Icon, PotIcon, Ring } from '../components/ui';
import { face } from '../lib/cards';
import { ago, money, timeLeft } from '../lib/format';
import { type LayoutId, geometry } from '../lib/layout';
import { shareOrCopy, tableUrl } from '../lib/share';
import { Feed, Tiles } from './Feed';
import { RaiseSheet } from './RaiseSheet';
import { Seat } from './Seat';
import { ConfirmSheet, Denominations, DeviceSheet, InfoSheet, RanksSheet, RecapSheet, Rules } from './Sheets';
import {
  arrangeSeats,
  badgeStyle,
  headsUpBadge,
  awaySummary,
  feedRows,
  nameOf,
  potOf,
  seatTags,
  topWinner,
  winningCards,
} from './derive';
import { STAGE_MS, useResultStage, useTween } from './hooks';
import { toastFor, turnMessage } from './messages';
import type { Frame } from './queue';

type SheetKind = 'raise' | 'ranks' | 'info' | 'recap' | 'leave' | 'end' | 'device';

export interface TableProps {
  client: TableClient;
  frame: Frame;
  snapshot: ClientSnapshot;
  layout: LayoutId;
  /** Opened from a "you're up" nudge link. */
  fromNudge: boolean;
  onRebuy: () => void;
  onLeft: () => void;
}

const PRE_OPTIONS: { id: PreAction; label: string }[] = [
  { id: 'checkFold', label: 'Check/Fold' },
  { id: 'check', label: 'Check' },
  { id: 'callAny', label: 'Call any' },
];

const AWAY_RECAP_MS = 10 * 60_000;
const NUDGE_MS = 30_000;

const REJECTIONS: Record<string, string> = {
  not_your_turn: 'Too late, the table moved on.',
  too_late: 'That move already went through.',
  nothing_to_undo: 'That move already went through.',
  rate_limited: 'Easy there. Try again in a moment.',
  network: 'You seem to be offline. Try again.',
};

function pendingText(action: ActionKind, amount: number | null, toCall: number): string {
  switch (action) {
    case 'fold':
      return 'Folded';
    case 'check':
      return 'Checked';
    case 'call':
      return `Called ${money(toCall)}`;
    case 'bet':
      return `Bet ${money(amount ?? 0)}`;
    case 'raise':
      return `Raised to ${money(amount ?? 0)}`;
    case 'allin':
      return 'All in';
  }
}

export function Table({ client, frame, snapshot, layout, fromNudge, onRebuy, onLeft }: TableProps) {
  const g = geometry(layout);
  const v: TableView = frame.view;
  const you = v.you;
  const hand = v.hand;
  const now = useNow(client, 1_000);
  const stage = useResultStage(frame);

  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [toast, setToast] = useState<{ text: string; v: number } | null>(null);
  const [confirmFold, setConfirmFold] = useState(false);
  const [inflight, setInflight] = useState<{ text: string; seq: number | null } | null>(null);
  const [preLocal, setPreLocal] = useState<PreAction | null | undefined>(undefined);
  const [nudge, setNudge] = useState<{ seat: number; name: string; until: number; handNo: number } | null>(
    null,
  );
  const [device, setDevice] = useState<{ link: string | null; error: string | null }>({
    link: null,
    error: null,
  });
  const [bubble, setBubble] = useState<{ seat: number; key: number } | null>(null);
  const toastV = useRef(0);
  const prevView = useRef<TableView | null>(null);
  const recapChecked = useRef<number | null | undefined>(undefined);

  const showToast = useCallback((text: string) => {
    toastV.current += 1;
    setToast({ text, v: toastV.current });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast((cur) => (cur?.v === toast.v ? null : cur)), 2_800);
    return () => clearTimeout(t);
  }, [toast]);

  // Messages and nudges follow every update as it arrives, not the paced animation.
  useUpdates(client, (u) => {
    const msg = toastFor(prevView.current, u);
    if (msg) showToast(msg);
    const meSeat = u.view.you?.seat;
    const h = u.view.hand;
    const mine = u.entries.some((e) => e.k === 'act' && e.seat === meSeat && e.tag !== 'timer');
    if (!u.jump && mine && h && h.street !== 'over' && h.toAct !== null && h.toAct !== meSeat) {
      const seat = u.view.seats.find((s) => s.seat === h.toAct);
      if (seat) setNudge({ seat: seat.seat, name: seat.name, until: Date.now() + NUDGE_MS, handNo: h.no });
    }
    setPreLocal(undefined);
    prevView.current = u.view;
  });

  useEffect(() => {
    if (prevView.current === null) prevView.current = snapshot.view;
  }, [snapshot.view]);

  // Opening the table on your turn says what you're facing.
  useEffect(() => {
    if (frame.view.you?.legal) showToast(turnMessage(frame.view));
    // only on arrival
  }, []);

  // A sheet that no longer applies closes itself (the raise sheet when the turn passes, say).
  useEffect(() => {
    if (sheet === 'raise' && !you?.legal) setSheet(null);
    if (confirmFold && !you?.legal) setConfirmFold(false);
  }, [sheet, confirmFold, you?.legal]);

  // "While you were away" opens by itself on narrow screens after a real absence.
  const summary = awaySummary(v, now, snapshot.lastSeenAt);
  useEffect(() => {
    if (recapChecked.current === snapshot.lastSeenAt) return;
    recapChecked.current = snapshot.lastSeenAt;
    if (!g.autoRecap || !summary) return;
    if ((fromNudge && summary.happened > 0) || (summary.awayMs >= AWAY_RECAP_MS && summary.happened >= 2))
      setSheet('recap');
  }, [snapshot.lastSeenAt, g.autoRecap, fromNudge, summary]);

  // The winner's catchphrase pops when the pot reaches them.
  const winner = topWinner(v);
  useEffect(() => {
    if (stage !== 'award' || !winner || !hand) return;
    setBubble({ seat: winner.seat, key: hand.no });
    const t = setTimeout(() => setBubble(null), STAGE_MS.bubble);
    return () => clearTimeout(t);
  }, [stage, winner?.seat, hand?.no]);

  useEffect(() => {
    if (!nudge) return;
    const t = setTimeout(() => setNudge(null), Math.max(0, nudge.until - Date.now()));
    return () => clearTimeout(t);
  }, [nudge]);

  const send = useCallback(
    async (cmd: ClientCommand): Promise<SendResult> => {
      const res = await client.send(cmd);
      if (!res.ok) showToast(REJECTIONS[res.code] ?? res.message);
      return res;
    },
    [client, showToast],
  );

  const act = useCallback(
    async (action: ActionKind, amount?: number) => {
      if (!you) return;
      setSheet(null);
      setConfirmFold(false);
      setInflight({ text: pendingText(action, amount ?? null, you.toCall), seq: null });
      const res = await send(
        amount === undefined ? { type: 'act', action } : { type: 'act', action, amount },
      );
      // Keep "sending" up until the update for this move is on screen, so the buttons don't flash back.
      setInflight(res.ok ? (cur) => (cur ? { ...cur, seq: res.seq } : cur) : null);
    },
    [send, you],
  );

  useEffect(() => {
    if (inflight?.seq != null && frame.seq >= inflight.seq) setInflight(null);
  }, [inflight, frame.seq]);

  // ---------- layout of everything ----------

  const { me, others } = useMemo(() => arrangeSeats(v), [v]);
  const tags = useMemo(() => seatTags(v), [v]);
  const winners = hand?.street === 'over' ? winningCards(v) : null;
  const won = hand?.result?.won ?? {};
  const holdBack = stage === 'reveal' || stage === 'award';
  const stackOf = (s: SeatView) => s.stack - (holdBack ? (won[s.seat] ?? 0) : 0);
  const myStack = me ? stackOf(me) : 0;
  const dStack = useTween(myStack);
  const potValue = potOf(v);
  const dPot = useTween(potValue);
  const potVisible =
    !!hand && (hand.street !== 'over' ? hand.potTotal > 0 : stage === 'reveal' || stage === 'award');
  const potTarget = (() => {
    if (stage !== 'award' || !winner) return null;
    if (winner.seat === you?.seat) return { x: g.cx, y: g.mineT + 30 };
    const p = others.find((o) => o.seat.seat === winner.seat);
    return p ? g.slot[p.slot] : null;
  })();
  const potTr = potTarget ? `translate(${potTarget.x - g.CX}px, ${potTarget.y - g.CY}px) scale(.55)` : 'none';

  const myTurn = !!you?.legal;
  const legal = you?.legal ?? null;
  const toCall = you?.toCall ?? 0;
  const pre = preLocal !== undefined ? preLocal : (you?.pre ?? null);
  const myRemaining = me?.deadlineAt ? Math.min(v.config.turnTimerMs, me.deadlineAt - now) : 0;
  const folded = !!me?.folded;
  const inHand = !!me?.inHand && !!hand && hand.street !== 'over';
  const handOver = !hand || hand.street === 'over';
  const busted = me?.status === 'busted' || (me?.status === 'sittingOut' && me.stack === 0 && !inHand);
  const nextIn = v.nextDealAt !== null ? Math.max(0, Math.ceil((v.nextDealAt - now) / 1000)) : null;
  const nudgeLive =
    nudge && hand && hand.no === nudge.handNo && hand.toAct === nudge.seat && nudge.until > now;

  // ---------- the bar at the bottom ----------

  let bar: JSX.Element;
  const barBox = { height: '100%', borderRadius: 18, fontSize: 16, fontWeight: 800 } as const;
  if (you?.pending || (inflight && legal)) {
    const p = you?.pending;
    const text = p ? `${pendingText(p.action, p.amount, toCall)} · sending` : `${inflight!.text} · sending`;
    const total = v.config.undoMs;
    const left = p ? Math.max(0, p.commitAt - client.now()) : total;
    bar = (
      <div
        className="neu pop"
        role="status"
        style={{
          position: 'relative',
          height: '100%',
          borderRadius: 18,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '0 6px 0 18px',
        }}
      >
        <Icon name="check" width={2.6} />
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 16,
            fontWeight: 800,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {text}
        </span>
        <button
          className="btn inset"
          disabled={!p}
          onClick={() => void send({ type: 'undo' })}
          style={{ height: 44, padding: '0 18px', borderRadius: 14, fontSize: 15, fontWeight: 800 }}
        >
          Undo
        </button>
        {p && (
          <span
            key={p.commitAt}
            className="drain"
            style={{
              position: 'absolute',
              left: 0,
              bottom: 0,
              height: 3,
              width: '100%',
              background: 'var(--accent)',
              animationDuration: `${total}ms`,
              animationDelay: `${left - total}ms`,
            }}
          />
        )}
      </div>
    );
  } else if (confirmFold && legal) {
    bar = (
      <div
        className="neu pop"
        role="alertdialog"
        aria-label="Fold when you could check?"
        style={{
          height: '100%',
          borderRadius: 18,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 6px 0 16px',
        }}
      >
        <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, lineHeight: 1.2 }}>
          Checking is free. Fold anyway?
        </span>
        <button
          className="btn inset"
          onClick={() => setConfirmFold(false)}
          style={{ height: 44, padding: '0 14px', borderRadius: 14, fontSize: 14, fontWeight: 800 }}
        >
          Cancel
        </button>
        <button
          className="btn neu-sm"
          onClick={() => void act('fold')}
          style={{ height: 44, padding: '0 14px', borderRadius: 14, fontSize: 14, fontWeight: 800 }}
        >
          Fold
        </button>
      </div>
    );
  } else if (legal) {
    const canRaise = legal.canBet || legal.canRaise;
    bar = (
      <div
        className="fade"
        style={{
          height: '100%',
          display: 'grid',
          gridTemplateColumns: canRaise ? '1fr 1.25fr 1fr' : '1fr 1.25fr',
          gap: 12,
        }}
      >
        <button
          className="btn neu"
          style={barBox}
          onClick={() => (legal.canCheck ? setConfirmFold(true) : void act('fold'))}
        >
          Fold
        </button>
        <button
          className="btn accentBtn"
          style={barBox}
          onClick={() => void act(legal.canCheck ? 'check' : 'call')}
        >
          {legal.canCheck
            ? 'Check'
            : legal.callAmount >= (me?.stack ?? 0)
              ? `All in ${money(legal.callAmount)}`
              : `Call ${money(legal.callAmount)}`}
        </button>
        {canRaise && (
          <button className="btn neu" style={barBox} onClick={() => setSheet('raise')}>
            {legal.canBet ? 'Bet' : 'Raise'}
          </button>
        )}
      </div>
    );
  } else if (busted && handOver) {
    bar = (
      <button
        className="btn accentBtn pop"
        onClick={onRebuy}
        style={{ width: '100%', ...barBox, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        Out of chips · free rebuy
      </button>
    );
  } else if (me?.status === 'sittingOut') {
    bar = (
      <div
        className="inset fade"
        style={{
          height: '100%',
          borderRadius: 18,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 6px 0 18px',
        }}
      >
        <span style={{ flex: 1, fontSize: 15, fontWeight: 700, color: 'var(--muted)' }}>
          You’re sitting out
        </span>
        <button
          className="btn accentBtn"
          onClick={() => void send({ type: 'sitIn' })}
          style={{ height: 44, padding: '0 16px', borderRadius: 14, fontSize: 15, fontWeight: 800 }}
        >
          I’m back
        </button>
      </div>
    );
  } else if (you?.canPre) {
    bar = (
      <div
        className="fade"
        role="group"
        aria-label="Pre-select your next move"
        style={{ height: '100%', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}
      >
        {PRE_OPTIONS.map((o) => {
          const on = pre === o.id;
          return (
            <button
              key={o.id}
              className={on ? 'btn inset pre' : 'btn neu-sm pre'}
              aria-pressed={on}
              onClick={() => {
                const next = on ? null : o.id;
                setPreLocal(next);
                void send({ type: 'setPre', pre: next });
              }}
              style={{ height: '100%' }}
            >
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '.12em',
                  textTransform: 'uppercase',
                  color: 'var(--muted)',
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: on ? 'var(--accent)' : 'var(--line)',
                  }}
                />
                Auto
              </span>
              <span style={{ fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap' }}>{o.label}</span>
            </button>
          );
        })}
      </div>
    );
  } else {
    let text = 'Waiting';
    if (handOver && nextIn !== null) text = nextIn > 0 ? `Next hand in ${nextIn}s` : 'Dealing';
    else if (handOver) text = 'Waiting for more players';
    else if (!me?.inHand) text = 'You’re in next hand';
    else if (folded) text = 'You folded · next hand soon';
    else if (me?.allIn) text = 'All in · good luck';
    bar = (
      <div
        className="inset fade"
        role="status"
        style={{
          height: '100%',
          borderRadius: 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 15,
          fontWeight: 700,
          color: 'var(--muted)',
        }}
      >
        {text}
      </div>
    );
  }

  // ---------- the plate: your stack and status ----------

  let plate: JSX.Element | string;
  if (you?.pending) plate = `Sending in ${Math.max(0, Math.ceil((you.pending.commitAt - now) / 1000))}s`;
  else if (myTurn) plate = `Your turn · ${timeLeft(myRemaining)}`;
  else if (nudgeLive && nudge) {
    plate = (
      <button
        className="btn ghost pop"
        onClick={async () => {
          const url = `${tableUrl(client.slug)}?turn=${hand!.no}.${snapshot.seq}`;
          const r = await shareOrCopy({ title: v.config.name, text: `You’re up, ${nudge.name}.`, url });
          if (r === 'copied') showToast(`Nudge link copied. Paste it for ${nudge.name}.`);
          if (r === 'shared' || r === 'copied') setNudge(null);
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          height: 30,
          padding: '0 10px',
          borderRadius: 15,
          fontSize: 13,
          fontWeight: 800,
          boxShadow: 'inset 0 0 0 1.5px var(--accent)',
        }}
      >
        <Icon name="bell" size={14} width={2.4} />
        Nudge {nudge.name}
      </button>
    );
  } else if (handOver && hand?.result && you && won[you.seat] && stage === 'done')
    plate = `Won ${money(won[you.seat]!)}`;
  else if (handOver && hand) plate = 'Hand over';
  else if (me?.status === 'sittingOut') plate = 'Sitting out';
  else if (busted) plate = 'Out of chips';
  else if (folded) plate = 'Folded';
  else if (hand?.toAct != null) plate = `Waiting on ${nameOf(v, hand.toAct)}`;
  else plate = 'Waiting';

  // ---------- rails ----------

  const minute = Math.floor(now / 30_000);
  const rows = useMemo(
    () => feedRows(v, minute * 30_000, snapshot.lastSeenAt),
    [v, minute, snapshot.lastSeenAt],
  );
  const tiles = [
    { k: 'Stack', v: money(me?.stack ?? 0) },
    { k: 'Away', v: summary ? ago(summary.awayMs).replace('now', '0m') : '—' },
    { k: 'Missed', v: summary ? `${summary.missed} turn${summary.missed === 1 ? '' : 's'}` : '0 turns' },
  ];

  const myBadge = me ? headsUpBadge(me) : null;
  const handLabel = you?.hole ? (folded ? 'Folded' : you.handLabel) : null;
  const sheetL = g.col[0] + (g.col[1] - g.sheetW) / 2;
  const fx = g.felt;
  const present = v.seats.filter((s) => !s.left);

  // ---------- board and hole cards ----------

  const cw = g.card[0];
  const ch = g.card[1];
  const bsz = {
    r: Math.round(cw * 0.19),
    pad: Math.round(cw * 0.12),
    padT: Math.round(ch * 0.055),
    padB: Math.round(ch * 0.04),
    rkF: Math.round(ch * 0.22),
    stF: Math.round(ch * 0.165),
    bgF: Math.round(ch * 0.33),
  };
  const board = hand?.board ?? [];
  const firstNew = useRef<{ hand: number; count: number }>({ hand: -1, count: 0 });
  if (firstNew.current.hand !== (hand?.no ?? -1))
    firstNew.current = { hand: hand?.no ?? -1, count: frame.live ? 0 : board.length };

  const [mw, mh] = g.mine;
  const msz = {
    r: Math.round(mw * 0.165),
    pad: Math.round(mw * 0.116),
    padT: Math.round(mh * 0.066),
    padB: Math.round(mh * 0.05),
    rkF: Math.round(mh * 0.215),
    stF: Math.round(mh * 0.15),
    bgF: Math.round(mh * 0.35),
  };

  const bubbleSeat = bubble ? v.seats.find((s) => s.seat === bubble.seat) : null;
  let bubbleL = g.cx - 125;
  let bubbleT = g.labelT - 70;
  if (bubble && bubbleSeat && bubble.seat !== you?.seat) {
    const p = others.find((o) => o.seat.seat === bubble.seat);
    if (p) {
      const o = g.slot[p.slot];
      bubbleL = Math.max(g.col[0] + 8, Math.min(g.col[0] + g.col[1] - 258, o.x - 125));
      bubbleT = o.y + g.av / 2 + 40;
    }
  }

  const abs = (style: CSSProperties): CSSProperties => ({ position: 'absolute', ...style });

  return (
    <div
      style={{
        position: 'relative',
        width: g.W,
        height: g.H,
        overflow: 'hidden',
        background: 'var(--bg)',
        color: 'var(--fg)',
      }}
    >
      {/* header */}
      <div
        style={abs({
          left: g.pad,
          width: g.W - 2 * g.pad,
          top: 16,
          height: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        })}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <h1
            style={{
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: '-0.03em',
              lineHeight: 1,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {v.config.name}
          </h1>
          <span className="mono" style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
            Hand #{Math.max(1, v.handNo)} · {money(v.config.smallBlind)}/{money(v.config.bigBlind)}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 2, flex: 'none', alignItems: 'center', marginRight: -10 }}>
          {snapshot.connection !== 'live' && (
            <span className="tag pop" role="status" style={{ gap: 6, marginRight: 6, color: 'var(--muted)' }}>
              <span
                className="breathe"
                style={{ width: 7, height: 7, borderRadius: '50%', background: '#B65F55' }}
              />
              {snapshot.connection === 'offline' ? 'Offline' : 'Reconnecting'}
            </span>
          )}
          {!g.rr && (
            <button
              className="btn ghost iconBtn"
              aria-label="While you were away"
              onClick={() => setSheet('recap')}
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                color: 'var(--muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="history" />
            </button>
          )}
          <button
            className="btn ghost iconBtn"
            aria-label="Share table link"
            onClick={async () => {
              const r = await shareOrCopy({
                title: v.config.name,
                text: `Pull up a chair at ${v.config.name}.`,
                url: tableUrl(client.slug),
              });
              if (r === 'copied') showToast('Invite link copied.');
            }}
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              color: 'var(--muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="share" />
          </button>
        </div>
      </div>

      {/* left rail: players, chips, rules */}
      {g.lr && (
        <div
          style={abs({
            left: g.lr[0],
            top: g.lr[1],
            width: g.lr[2],
            height: g.lr[3],
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          })}
        >
          <div className="neu" style={{ borderRadius: 24, padding: '14px 16px 6px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                paddingBottom: 4,
              }}
            >
              <span className="caps">Players</span>
              <span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
                {present.length} of {v.config.maxSeats}
              </span>
            </div>
            {[...(me ? [me] : []), ...others.map((o) => o.seat)].map((s, i) => {
              const isMe = s.seat === you?.seat;
              const status = isMe
                ? typeof plate === 'string'
                  ? plate
                  : `Waiting on ${nudge?.name ?? ''}`
                : s.isTurn
                  ? `Thinking · ${timeLeft(Math.min(v.config.turnTimerMs, (s.deadlineAt ?? now) - now))} left`
                  : s.folded
                    ? 'Folded'
                    : (tags.get(s.seat) ??
                      (s.status === 'sittingOut'
                        ? 'Sitting out'
                        : s.status === 'busted'
                          ? 'Out of chips'
                          : 'Waiting'));
              return (
                <div
                  key={s.seat}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    height: 46,
                    borderTop: i ? '1px solid var(--line)' : 'none',
                    opacity: s.folded ? 0.5 : 1,
                    transition: 'opacity 300ms ease',
                  }}
                >
                  <Avatar name={s.name} color={s.color} size={30} fontSize={12} />
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 14, fontWeight: 800 }}>{isMe ? 'You' : s.name}</span>
                    <span
                      style={{
                        fontSize: 12,
                        color: 'var(--muted)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {status}
                    </span>
                  </div>
                  <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
                    {money(stackOf(s))}
                  </span>
                </div>
              );
            })}
          </div>
          <div
            className="neu"
            style={{
              borderRadius: 24,
              padding: '14px 16px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <span className="caps">Chip denominations</span>
            <Denominations size={12} padding="12px 8px" />
            <Rules view={v} compact />
          </div>
        </div>
      )}

      {/* right rail: activity */}
      {g.rr && (
        <div
          className="neu"
          style={abs({
            left: g.rr[0],
            top: g.rr[1],
            width: g.rr[2],
            height: g.rr[3],
            borderRadius: 24,
            padding: '14px 16px 8px',
            display: 'flex',
            flexDirection: 'column',
          })}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingBottom: 4,
            }}
          >
            <span className="caps">Activity</span>
            <span
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}
            >
              <span
                className="breathe"
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: snapshot.connection === 'live' ? '#8FB3B5' : '#B65F55',
                }}
              />
              {snapshot.connection === 'live' ? 'Live' : 'Reconnecting'}
            </span>
          </div>
          <div style={{ padding: '8px 0 6px' }}>
            <Tiles tiles={tiles} size={16} />
          </div>
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column-reverse',
            }}
          >
            <Feed rows={rows} />
          </div>
        </div>
      )}

      {/* felt */}
      <div
        className="inset"
        style={abs({ left: fx[0], top: fx[1], width: fx[2], height: fx[3], borderRadius: fx[3] / 2 })}
      />
      <div
        style={abs({
          left: fx[0] + 16,
          top: fx[1] + 16,
          width: fx[2] - 32,
          height: fx[3] - 32,
          borderRadius: fx[3] / 2 - 16,
          border: '1px solid var(--line)',
        })}
      />

      {/* board */}
      <div
        aria-label={board.length ? `Board: ${board.join(' ')}` : 'No board cards yet'}
        role="img"
        style={abs({
          left: g.col[0],
          width: g.col[1],
          top: g.boardT,
          display: 'flex',
          justifyContent: 'center',
          gap: g.card[2],
        })}
      >
        {[0, 1, 2, 3, 4].map((i) => {
          const c = board[i];
          const f = c ? face(c) : null;
          const inW = !winners || (c ? winners.has(c) : false);
          const delay = i < firstNew.current.count ? 0 : i < 3 ? i * 110 : 0;
          return (
            <div
              key={i}
              className="inset"
              style={{ position: 'relative', width: cw, height: ch, borderRadius: bsz.r }}
            >
              {f && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    transform: `translateY(${winners && inW ? -8 : 0}px)`,
                    opacity: inW ? 1 : 0.28,
                    transition: 'transform 360ms cubic-bezier(.3,1.4,.5,1), opacity 300ms ease',
                  }}
                >
                  <div
                    key={`${hand?.no}-${c}`}
                    className={i < firstNew.current.count ? 'card' : 'card deal'}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: bsz.r,
                      color: f.color,
                      animationDelay: `${delay}ms`,
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        left: bsz.pad,
                        top: bsz.padT,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        lineHeight: 1,
                      }}
                    >
                      <span style={{ fontSize: bsz.rkF, fontWeight: 800, letterSpacing: '-0.03em' }}>
                        {f.rank}
                      </span>
                      <span style={{ fontSize: bsz.stF, marginTop: 2 }}>{f.suit}</span>
                    </div>
                    <span
                      style={{
                        position: 'absolute',
                        right: bsz.pad,
                        bottom: bsz.padB,
                        fontSize: bsz.bgF,
                        lineHeight: 1,
                      }}
                    >
                      {f.suit}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* pot */}
      {potVisible && (
        <div
          role="status"
          aria-label={`Pot ${money(potValue)}`}
          style={abs({
            left: g.col[0],
            width: g.col[1],
            top: g.potT,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            transform: potTr,
            opacity: stage === 'award' ? 0 : 1,
            transition: 'transform 500ms cubic-bezier(.3,.7,.2,1), opacity 500ms ease',
            pointerEvents: 'none',
            zIndex: 3,
          })}
        >
          <span className="caps">Pot</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <PotIcon />
            <span
              className="mono"
              style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.1 }}
            >
              {money(dPot)}
            </span>
          </div>
        </div>
      )}
      {(hand?.sidePots.length ?? 0) > 1 && hand!.street !== 'over' && (
        <div
          className="mono fade"
          style={abs({
            left: g.col[0],
            width: g.col[1],
            top: g.toCallT - 2,
            textAlign: 'center',
            fontSize: 11,
            color: 'var(--muted)',
          })}
        >
          {hand!.sidePots
            .map(
              (p, i) => `${i === 0 ? 'Main' : hand!.sidePots.length > 2 ? `Side ${i}` : 'Side'} ${money(p)}`,
            )
            .join(' · ')}
        </div>
      )}
      {myTurn && toCall > 0 && (
        <div
          className="mono fade"
          style={abs({
            left: g.col[0],
            width: g.col[1],
            top: (hand?.sidePots.length ?? 0) > 1 ? g.toCallT + 14 : g.toCallT,
            textAlign: 'center',
            fontSize: 12,
            color: 'var(--muted)',
          })}
        >
          to call {money(toCall)}
        </div>
      )}

      {/* everyone else */}
      {others.map(({ seat, slot }) => (
        <Seat
          key={seat.seat}
          seat={seat}
          pos={g.slot[slot]}
          g={g}
          handNo={hand?.no ?? 0}
          tag={tags.get(seat.seat) ?? null}
          stack={stackOf(seat)}
          now={now}
          turnTimerMs={v.config.turnTimerMs}
          collecting={frame.collecting}
          winners={winners}
        />
      ))}

      {/* your bet */}
      {me && me.bet > 0 && (
        <div
          aria-hidden="true"
          style={abs({
            left: g.cx,
            top: g.myChipY,
            transform: frame.collecting
              ? `translate(-50%, -50%) translate(0px, ${g.CY - g.myChipY}px) scale(.5)`
              : 'translate(-50%, -50%)',
            opacity: frame.collecting ? 0 : 1,
            transition: 'transform 440ms cubic-bezier(.3,.7,.2,1), opacity 440ms ease',
            zIndex: 2,
          })}
        >
          <BetChip amount={me.bet} label={money(me.bet)} />
        </div>
      )}

      {/* your hand name */}
      {handLabel && (
        <div
          style={abs({
            left: g.col[0],
            width: g.col[1],
            top: g.labelT,
            display: 'flex',
            justifyContent: 'center',
          })}
        >
          <button
            key={handLabel}
            className="btn ghost pop"
            onClick={() => setSheet('ranks')}
            aria-label={`${handLabel}. Show hand rankings`}
            style={{ height: 44, display: 'flex', alignItems: 'center' }}
          >
            <span
              className="neu-sm"
              style={{
                height: 34,
                padding: '0 14px',
                borderRadius: 17,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 14,
                fontWeight: 800,
                whiteSpace: 'nowrap',
              }}
            >
              <span>{handLabel}</span>
              <span style={{ color: 'var(--muted)', display: 'flex' }}>
                <Icon name="list" size={14} width={2.4} />
              </span>
            </span>
          </button>
        </div>
      )}

      {/* your cards */}
      {you?.hole && (
        <div
          aria-label={`Your cards: ${you.hole.join(' ')}`}
          role="img"
          style={abs({
            left: g.col[0],
            width: g.col[1],
            top: g.mineT,
            display: 'flex',
            justifyContent: 'center',
          })}
        >
          {you.hole.map((c, i) => {
            const f = face(c);
            const inW = !winners || winners.has(c);
            const lift = winners && inW ? -8 : 0;
            return (
              <div
                key={`${hand?.no}-${c}`}
                style={{
                  marginLeft: i ? -Math.round(mw * 0.16) : 0,
                  transform: `translateY(${folded ? 16 : lift}px) rotate(${i ? 5 : -5}deg)`,
                  opacity: folded ? 0.32 : inW ? 1 : 0.28,
                  transition: 'transform 380ms cubic-bezier(.3,1.4,.5,1), opacity 300ms ease',
                }}
              >
                <div
                  className="card flip"
                  style={{
                    position: 'relative',
                    width: mw,
                    height: mh,
                    borderRadius: msz.r,
                    color: f.color,
                    animationDelay: `${i * 120}ms`,
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: msz.pad,
                      top: msz.padT,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      lineHeight: 1,
                    }}
                  >
                    <span style={{ fontSize: msz.rkF, fontWeight: 800, letterSpacing: '-0.04em' }}>
                      {f.rank}
                    </span>
                    <span style={{ fontSize: msz.stF, marginTop: 3 }}>{f.suit}</span>
                  </div>
                  <span
                    style={{
                      position: 'absolute',
                      right: msz.pad,
                      bottom: msz.padB,
                      fontSize: msz.bgF,
                      lineHeight: 1,
                    }}
                  >
                    {f.suit}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* the plate */}
      <div
        style={abs({
          left: g.col[0],
          width: g.col[1],
          top: g.plateT,
          height: 44,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        })}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative', width: 34, height: 34, flex: 'none' }}>
            {(myTurn || !!you?.pending) && (
              <Ring size={34} fraction={myTurn ? myRemaining / v.config.turnTimerMs : 1} />
            )}
            {me && <Avatar name={me.name} color={me.color} size={34} fontSize={13} />}
            {me?.inHand && myBadge && (
              <div
                className="badge"
                style={{
                  position: 'absolute',
                  left: -12,
                  top: -6,
                  height: 18,
                  minWidth: 18,
                  fontSize: 9,
                  padding: '0 5px',
                  background: badgeStyle(myBadge).bg,
                  color: badgeStyle(myBadge).fg,
                  boxShadow: badgeStyle(myBadge).sh,
                }}
              >
                {myBadge}
              </div>
            )}
          </div>
          <span
            className="mono"
            aria-label={`Your stack ${money(myStack)}`}
            style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.03em' }}
          >
            {money(dStack)}
          </span>
          {typeof plate === 'string' ? (
            <span style={{ fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{plate}</span>
          ) : (
            plate
          )}
          <button
            className="btn ghost"
            aria-label="Table info and chip values"
            onClick={() => setSheet('info')}
            style={{
              width: 44,
              height: 44,
              margin: '0 -9px 0 -6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              className="neu-sm"
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--muted)',
              }}
            >
              <Icon name="info" size={14} width={2.6} />
            </span>
          </button>
        </div>
      </div>

      {/* actions */}
      <div style={abs({ left: g.bar[0], width: g.bar[2], top: g.bar[1], height: g.bar[3] })}>{bar}</div>

      {/* the winner's catchphrase */}
      {bubble && bubbleSeat && (
        <div
          key={bubble.key}
          style={abs({
            left: bubbleL,
            top: bubbleT,
            width: 250,
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 20,
          })}
        >
          <div
            className="neu bubble"
            role="status"
            style={{
              padding: '10px 16px 11px',
              borderRadius: 20,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              textAlign: 'center',
            }}
          >
            <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
              “{bubbleSeat.phrase || 'Ship it.'}”
            </span>
            <span
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}
            >
              <span
                style={{ width: 8, height: 8, borderRadius: '50%', background: colorHex(bubbleSeat.color) }}
              />
              {bubble.seat === you?.seat ? 'You take it' : `${bubbleSeat.name} takes it`}
            </span>
          </div>
        </div>
      )}

      {/* toast */}
      {toast && (
        <div
          style={abs({
            left: g.col[0] + 14,
            width: g.col[1] - 28,
            top: 12,
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 30,
          })}
        >
          <div
            key={toast.v}
            className="neu toastIn"
            role="status"
            aria-live="polite"
            style={{
              width: g.wide ? 'auto' : '100%',
              justifyContent: 'center',
              minHeight: 48,
              padding: '0 20px',
              borderRadius: 24,
              display: 'flex',
              alignItems: 'center',
              fontSize: 14,
              fontWeight: 600,
              textAlign: 'center',
            }}
          >
            {toast.text}
          </div>
        </div>
      )}

      {/* sheets */}
      {sheet === 'raise' && legal && hand && (
        <RaiseSheet
          left={sheetL}
          width={g.sheetW}
          legal={legal}
          currentBet={hand.currentBet}
          potTotal={hand.potTotal}
          bigBlind={v.config.bigBlind}
          onClose={() => setSheet(null)}
          onConfirm={(to) =>
            void act(
              to >= legal.maxTo ? 'allin' : legal.canBet ? 'bet' : 'raise',
              to >= legal.maxTo ? undefined : to,
            )
          }
        />
      )}
      {sheet === 'ranks' && <RanksSheet g={g} mine={you?.handLabel ?? null} onClose={() => setSheet(null)} />}
      {sheet === 'info' && (
        <InfoSheet
          g={g}
          view={v}
          onClose={() => setSheet(null)}
          actions={{
            onDevice: async () => {
              setDevice({ link: null, error: null });
              setSheet('device');
              if (!client.deviceLink) {
                setDevice({ link: null, error: 'Not available at a practice table.' });
                return;
              }
              try {
                const d = await client.deviceLink();
                setDevice({ link: `${location.origin}/t/${client.slug}/device/${d.code}`, error: null });
              } catch {
                setDevice({ link: null, error: 'Couldn’t make a link. Try again.' });
              }
            },
            onSitOut: () => {
              setSheet(null);
              void send({ type: 'sitOut' });
            },
            onSitIn: () => {
              setSheet(null);
              void send({ type: 'sitIn' });
            },
            onLeave: () => setSheet('leave'),
            onEnd: () => setSheet('end'),
          }}
        />
      )}
      {sheet === 'recap' && (
        <RecapSheet
          g={g}
          rows={rows}
          tiles={tiles}
          cta={myTurn ? 'Take your turn' : 'Back to the table'}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'leave' && (
        <ConfirmSheet
          g={g}
          title="Leave the table?"
          body={
            inHand && !folded
              ? 'You’ll fold this hand. Your chips stay in the standings, but your seat opens up.'
              : 'Your chips stay in the standings, but your seat opens up for someone else.'
          }
          confirm="Leave table"
          onClose={() => setSheet(null)}
          onConfirm={async () => {
            setSheet(null);
            const r = await send({ type: 'leave' });
            if (r.ok) onLeft();
          }}
        />
      )}
      {sheet === 'end' && (
        <ConfirmSheet
          g={g}
          title="End the game for everyone?"
          body={
            inHand
              ? 'The hand in progress is called off and its chips go back. Everyone sees the final standings.'
              : 'Everyone sees the final standings. This can’t be undone.'
          }
          confirm="End the game"
          onClose={() => setSheet(null)}
          onConfirm={() => {
            setSheet(null);
            void send({ type: 'endGame' });
          }}
        />
      )}
      {sheet === 'device' && (
        <DeviceSheet g={g} link={device.link} error={device.error} onClose={() => setSheet(null)} />
      )}
    </div>
  );
}
