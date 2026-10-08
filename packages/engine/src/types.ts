import type { Card } from './cards';

export interface TableConfig {
  name: string;
  smallBlind: number;
  bigBlind: number;
  buyIn: number;
  /** How long a player has to act before the table auto-checks or folds for them. */
  turnTimerMs: number;
  maxSeats: number;
  /** The undo window after every move. */
  undoMs: number;
  /** How long the result of a hand stays up before the next deal. */
  handPauseMs: number;
}

export const MIN_SEATS = 2;
export const MAX_SEATS = 6;
export const MISSED_TURNS_TO_SIT_OUT = 2;
export const LOG_LIMIT = 300;

export type SeatStatus = 'active' | 'sittingOut' | 'busted';

export interface Seat {
  /** Stable seat number, assigned in join order. */
  seat: number;
  name: string;
  color: string;
  phrase: string;
  stack: number;
  status: SeatStatus;
  missedTurns: number;
  buyIns: number;
  /** Left the table; kept so the standings and history stay intact. */
  left: boolean;
}

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'over';

export interface HandPlayer {
  seat: number;
  /** Chips put in on the current street. */
  bet: number;
  /** Chips put in over the whole hand. */
  committed: number;
  folded: boolean;
  allIn: boolean;
  /** Acted voluntarily on this street. */
  acted: boolean;
  /** Value of `Hand.fullRaiseId` when this player last acted. */
  actedAtRaise: number;
  lastAction: string | null;
}

export interface Pot {
  amount: number;
  eligible: number[];
}

export interface PotResult {
  amount: number;
  winners: number[];
  /** Hand label of the winners, null when everyone else folded. */
  label: string | null;
}

export interface HandResult {
  pots: PotResult[];
  /** Net chips each winning seat collected. */
  won: Record<number, number>;
  /** Hole cards turned over at showdown. Empty when the hand ended on folds. */
  shown: Record<number, Card[]>;
  /** The five cards that made each shown hand. */
  best: Record<number, Card[]>;
  labels: Record<number, string>;
  /** Chips returned to the last aggressor because nobody called them. */
  uncalled: { seat: number; amount: number } | null;
}

export interface Hand {
  no: number;
  button: number;
  smallBlindSeat: number;
  bigBlindSeat: number;
  street: Street;
  board: Card[];
  players: HandPlayer[];
  /** Chips collected from finished streets. */
  pot: number;
  currentBet: number;
  /** Size of the last full bet or raise on this street; the minimum raise increment. */
  minRaise: number;
  /** Increments on every full bet or raise; a short all-in does not reopen the betting. */
  fullRaiseId: number;
  toAct: number | null;
  turnStartedAt: number | null;
  deadlineAt: number | null;
  result: HandResult | null;
  overAt: number | null;
}

export type ActionKind = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';

export interface PendingAction {
  seat: number;
  action: ActionKind;
  /** Raise-to / bet-to total for bet and raise. */
  amount: number | null;
  submittedAt: number;
  commitAt: number;
  /** Placed by a pre-action rather than a tap. */
  auto: boolean;
}

export type PreAction = 'checkFold' | 'check' | 'callAny';

export type LogEntry =
  | { k: 'hand'; at: number; no: number }
  | {
      k: 'act';
      at: number;
      seat: number;
      verb: string;
      amount: number | null;
      /** Why the table acted for them. */
      tag: 'timer' | 'auto' | null;
    }
  | { k: 'board'; at: number; street: 'flop' | 'turn' | 'river'; cards: Card[] }
  | {
      k: 'result';
      at: number;
      seat: number;
      amount: number;
      label: string | null;
      shown: Card[] | null;
    }
  | {
      k: 'seat';
      at: number;
      seat: number;
      verb: 'joined' | 'left' | 'sat out' | 'is back' | 'rebought' | 'busted';
    }
  | { k: 'host'; at: number; seat: number }
  | { k: 'ended'; at: number; seat: number };

export interface Standing {
  seat: number;
  name: string;
  color: string;
  phrase: string;
  stack: number;
  buyIns: number;
  net: number;
}

export interface TableSecret {
  deck: Card[];
  hole: Record<number, Card[]>;
}

export type TablePhase = 'lobby' | 'playing' | 'ended';

export interface TableState {
  v: 1;
  config: TableConfig;
  phase: TablePhase;
  createdAt: number;
  seats: Seat[];
  hostSeat: number;
  handNo: number;
  button: number;
  hand: Hand | null;
  nextDealAt: number | null;
  pending: PendingAction | null;
  pre: Record<number, PreAction>;
  secret: TableSecret;
  log: LogEntry[];
  standings: Standing[] | null;
  /** Hands played, for the end screen. */
  handsPlayed: number;
  biggestPot: { seat: number; amount: number } | null;
}

export type Command =
  | { type: 'join'; name: string; color: string; phrase: string }
  | { type: 'start' }
  | { type: 'act'; action: ActionKind; amount?: number }
  | { type: 'undo' }
  | { type: 'setPre'; pre: PreAction | null }
  | { type: 'rebuy' }
  | { type: 'sitOut' }
  | { type: 'sitIn' }
  | { type: 'leave' }
  | { type: 'kick'; seat: number }
  | { type: 'transferHost'; seat: number }
  | { type: 'endGame' }
  | { type: 'tick' };

export interface Ctx {
  now: number;
  randomInt: (n: number) => number;
}

export type RejectCode =
  | 'bad_command'
  | 'not_seated'
  | 'not_host'
  | 'wrong_phase'
  | 'table_full'
  | 'name_taken'
  | 'color_taken'
  | 'not_your_turn'
  | 'illegal_action'
  | 'nothing_to_undo'
  | 'too_late'
  | 'not_busted'
  | 'not_enough_players';

export type ApplyResult =
  | { ok: true; state: TableState; entries: LogEntry[]; seat?: number }
  | { ok: false; code: RejectCode; message: string };

export interface LegalActions {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  /** Chips needed to call, capped at the stack. */
  callAmount: number;
  canBet: boolean;
  canRaise: boolean;
  /** Smallest legal bet-to or raise-to total. */
  minTo: number;
  /** Largest bet-to or raise-to total: all chips in. */
  maxTo: number;
}
