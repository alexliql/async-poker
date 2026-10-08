import type { Card } from './cards';
import { currentHandLabel } from './evaluate';
import { computePots, legalActions } from './engine';
import type {
  ActionKind,
  HandResult,
  LegalActions,
  LogEntry,
  PreAction,
  SeatStatus,
  Standing,
  Street,
  TablePhase,
  TableState,
} from './types';

export const VIEW_LOG_LIMIT = 120;

export interface SeatView {
  seat: number;
  name: string;
  color: string;
  phrase: string;
  stack: number;
  status: SeatStatus;
  left: boolean;
  isHost: boolean;
  buyIns: number;
  inHand: boolean;
  folded: boolean;
  allIn: boolean;
  bet: number;
  lastAction: string | null;
  isButton: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  isTurn: boolean;
  turnStartedAt: number | null;
  deadlineAt: number | null;
  /** Cards shown at showdown. */
  shown: Card[] | null;
}

export interface YouView {
  seat: number;
  hole: Card[] | null;
  handLabel: string | null;
  legal: LegalActions | null;
  toCall: number;
  pending: { action: ActionKind; amount: number | null; commitAt: number; auto: boolean } | null;
  pre: PreAction | null;
  /** True while you're in the hand, waiting on others: pre-actions are available. */
  canPre: boolean;
}

export interface HandView {
  no: number;
  street: Street;
  board: Card[];
  /** Chips collected from finished streets. */
  pot: number;
  /** Everything in the middle, including this street's bets. */
  potTotal: number;
  /** Main and side pots once someone is all in; empty otherwise. */
  sidePots: number[];
  currentBet: number;
  toAct: number | null;
  result: HandResult | null;
  overAt: number | null;
}

export interface TableView {
  config: {
    name: string;
    smallBlind: number;
    bigBlind: number;
    buyIn: number;
    turnTimerMs: number;
    maxSeats: number;
    undoMs: number;
    handPauseMs: number;
  };
  phase: TablePhase;
  createdAt: number;
  hostSeat: number;
  handNo: number;
  seats: SeatView[];
  you: YouView | null;
  hand: HandView | null;
  nextDealAt: number | null;
  log: LogEntry[];
  standings: Standing[] | null;
  handsPlayed: number;
  biggestPot: { seat: number; amount: number } | null;
}

/**
 * What one seat is allowed to see. This is the only way table state should leave the server:
 * the deck, other players' hole cards, and other players' pending moves and pre-actions never appear.
 * Pass `null` for a spectator view (link previews).
 */
export function viewFor(s: TableState, viewer: number | null): TableView {
  const hand = s.hand;
  const betting = !!hand && hand.street !== 'over';
  const viewerPending = s.pending && s.pending.seat === viewer ? s.pending : null;

  const seats: SeatView[] = s.seats.map((x) => {
    const p = hand?.players.find((hp) => hp.seat === x.seat);
    const isTurn = betting && hand!.toAct === x.seat;
    return {
      seat: x.seat,
      name: x.name,
      color: x.color,
      phrase: x.phrase,
      stack: x.stack,
      status: x.status,
      left: x.left,
      isHost: s.hostSeat === x.seat,
      buyIns: x.buyIns,
      inHand: !!p,
      folded: p?.folded ?? false,
      allIn: p?.allIn ?? false,
      bet: betting ? (p?.bet ?? 0) : 0,
      lastAction: p?.lastAction ?? null,
      isButton: !!hand && hand.button === x.seat,
      isSmallBlind: !!hand && hand.smallBlindSeat === x.seat,
      isBigBlind: !!hand && hand.bigBlindSeat === x.seat,
      isTurn,
      turnStartedAt: isTurn ? hand!.turnStartedAt : null,
      deadlineAt: isTurn ? hand!.deadlineAt : null,
      shown: hand?.result?.shown[x.seat] ?? null,
    };
  });

  let you: YouView | null = null;
  const me = viewer === null ? undefined : s.seats[viewer];
  if (me && viewer !== null) {
    const p = hand?.players.find((hp) => hp.seat === viewer);
    const hole = p ? (s.secret.hole[viewer] ?? null) : null;
    const legal = viewerPending ? null : legalActions(s, viewer);
    you = {
      seat: viewer,
      hole: hole ? hole.slice() : null,
      handLabel: hole && hand ? currentHandLabel(hole, hand.board) : null,
      legal,
      toCall: p && betting ? Math.max(0, Math.min(hand!.currentBet - p.bet, me.stack)) : 0,
      pending: viewerPending
        ? {
            action: viewerPending.action,
            amount: viewerPending.amount,
            commitAt: viewerPending.commitAt,
            auto: viewerPending.auto,
          }
        : null,
      pre: s.pre[viewer] ?? null,
      canPre: !!p && betting && !p.folded && !p.allIn && hand!.toAct !== viewer,
    };
  }

  let handView: HandView | null = null;
  if (hand) {
    const bets = betting ? hand.players.reduce((sum, p) => sum + p.bet, 0) : 0;
    const anyAllIn = betting && hand.players.some((p) => p.allIn && !p.folded);
    const pots = anyAllIn ? computePots(hand.players).map((p) => p.amount) : [];
    handView = {
      no: hand.no,
      street: hand.street,
      board: hand.board.slice(),
      pot: betting ? hand.pot : 0,
      potTotal: betting ? hand.pot + bets : 0,
      sidePots: pots.length > 1 ? pots : [],
      currentBet: betting ? hand.currentBet : 0,
      toAct: betting ? hand.toAct : null,
      result: hand.result,
      overAt: hand.overAt,
    };
  }

  return {
    config: { ...s.config },
    phase: s.phase,
    createdAt: s.createdAt,
    hostSeat: s.hostSeat,
    handNo: s.handNo,
    seats,
    you,
    hand: handView,
    nextDealAt: s.nextDealAt,
    log: s.log.slice(-VIEW_LOG_LIMIT),
    standings: s.standings,
    handsPlayed: s.handsPlayed,
    biggestPot: s.biggestPot,
  };
}
