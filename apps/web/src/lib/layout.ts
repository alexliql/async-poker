/**
 * The five table surfaces from the design (design/screens: Main, FoldCover, FoldOpen, Tablet, Desktop).
 * Every surface renders the same table; only these numbers differ. The stage is drawn at the
 * layout's native size and scaled to fit the viewport, so every device gets the same composition.
 */

export type LayoutId = 'phone' | 'cover' | 'foldopen' | 'tablet' | 'desktop';

type Rect = [number, number, number, number];

interface LayoutSpec {
  W: number;
  H: number;
  pad: number;
  wide: boolean;
  /** 0 = no rails, 1 = activity rail on the right, 2 = both rails. */
  rails: 0 | 1 | 2;
  /** Phones and fold screens slide the recap over the table; wide screens keep it in the rail. */
  autoRecap: boolean;
  /** The table column: [left, width]. */
  col: [number, number];
  /** Narrow layouts: [x, y, chipX, chipY] per slot (top, topLeft, topRight, left, right). */
  seats?: [number, number, number, number][];
  /** Wide layouts: felt ellipse [cx, cy, rx, ry, seat offset]. */
  geo?: [number, number, number, number, number];
  av: number;
  seatW: number;
  seatGap: number;
  nameF: number;
  stackF: number;
  felt?: Rect;
  card: [number, number, number];
  boardT?: number;
  potT?: number;
  toCallT?: number;
  myChipY?: number;
  labelT: number;
  mine: [number, number];
  mineT: number;
  plateT: number;
  bar: Rect;
  sheetW: number;
  recapH: number;
  rr?: Rect;
  lr?: Rect;
}

export const LAYOUTS: Record<LayoutId, LayoutSpec> = {
  phone: {
    W: 390,
    H: 844,
    pad: 20,
    wide: false,
    rails: 0,
    autoRecap: true,
    col: [0, 390],
    seats: [
      [195, 98, 195, 188],
      [120, 114, 120, 203],
      [270, 114, 270, 203],
      [44, 158, 44, 244],
      [346, 158, 346, 244],
    ],
    av: 52,
    seatW: 84,
    seatGap: 12,
    nameF: 13,
    stackF: 12,
    felt: [16, 254, 358, 268],
    card: [52, 72, 8],
    boardT: 300,
    potT: 384,
    toCallT: 436,
    myChipY: 480,
    labelT: 540,
    mine: [86, 120],
    mineT: 592,
    plateT: 722,
    bar: [16, 772, 358, 56],
    sheetW: 390,
    recapH: 760,
  },
  cover: {
    W: 344,
    H: 972,
    pad: 16,
    wide: false,
    rails: 0,
    autoRecap: true,
    col: [0, 344],
    seats: [
      [172, 104, 172, 190],
      [105, 118, 105, 204],
      [239, 118, 239, 204],
      [38, 148, 38, 236],
      [306, 148, 306, 236],
    ],
    av: 40,
    seatW: 68,
    seatGap: 14,
    nameF: 12,
    stackF: 11,
    felt: [12, 258, 320, 298],
    card: [50, 70, 6],
    boardT: 312,
    potT: 394,
    toCallT: 446,
    myChipY: 516,
    labelT: 580,
    mine: [80, 112],
    mineT: 634,
    plateT: 764,
    bar: [14, 872, 316, 56],
    sheetW: 344,
    recapH: 880,
  },
  foldopen: {
    W: 720,
    H: 840,
    pad: 24,
    wide: true,
    rails: 0,
    autoRecap: true,
    col: [0, 720],
    geo: [360, 312, 250, 140, 66],
    av: 52,
    seatW: 96,
    seatGap: 12,
    nameF: 13,
    stackF: 12,
    card: [52, 74, 8],
    labelT: 470,
    mine: [80, 112],
    mineT: 526,
    plateT: 652,
    bar: [80, 752, 560, 56],
    sheetW: 520,
    recapH: 760,
  },
  tablet: {
    W: 1180,
    H: 820,
    pad: 24,
    wide: true,
    rails: 1,
    autoRecap: false,
    col: [0, 840],
    geo: [420, 312, 280, 140, 70],
    av: 56,
    seatW: 100,
    seatGap: 13,
    nameF: 14,
    stackF: 12,
    card: [58, 82, 9],
    labelT: 470,
    mine: [84, 118],
    mineT: 526,
    plateT: 658,
    bar: [140, 714, 560, 56],
    sheetW: 520,
    recapH: 740,
    rr: [864, 84, 292, 716],
  },
  desktop: {
    W: 1440,
    H: 900,
    pad: 24,
    wide: true,
    rails: 2,
    autoRecap: false,
    col: [304, 812],
    geo: [710, 360, 300, 160, 74],
    av: 60,
    seatW: 100,
    seatGap: 14,
    nameF: 14,
    stackF: 12,
    card: [64, 90, 10],
    labelT: 538,
    mine: [90, 126],
    mineT: 596,
    plateT: 734,
    bar: [430, 794, 560, 56],
    sheetW: 520,
    recapH: 800,
    rr: [1116, 92, 300, 784],
    lr: [24, 92, 280, 784],
  },
};

/** Opponent slots, named by where they sit relative to you at the bottom. */
export type Slot = 'top' | 'topLeft' | 'topRight' | 'left' | 'right';
const SLOT_INDEX: Record<Slot, number> = { top: 0, topLeft: 1, topRight: 2, left: 3, right: 4 };
/** Angle on the felt ellipse for wide layouts (screen coordinates: y grows downward). */
const SLOT_DEG: Record<Slot, number> = { top: 270, topLeft: 210, topRight: 330, left: 150, right: 30 };

/** Which slots to fill for a number of opponents, in clockwise order starting on your left. */
export const SLOTS_FOR: Record<number, Slot[]> = {
  0: [],
  1: ['top'],
  2: ['topLeft', 'topRight'],
  3: ['left', 'top', 'right'],
  4: ['left', 'topLeft', 'topRight', 'right'],
  5: ['left', 'topLeft', 'top', 'topRight', 'right'],
};

export interface SeatPos {
  /** Avatar center. */
  x: number;
  y: number;
  /** Where this seat's bet sits on the felt. */
  cx: number;
  cy: number;
}

export interface Geometry extends Required<Omit<LayoutSpec, 'seats' | 'geo' | 'rr' | 'lr'>> {
  id: LayoutId;
  rr: Rect | null;
  lr: Rect | null;
  /** Table column center. */
  cx: number;
  /** Where collected chips land (the pot). */
  CX: number;
  CY: number;
  slot: Record<Slot, SeatPos>;
}

function build(id: LayoutId): Geometry {
  const l = LAYOUTS[id];
  let cx = l.col[0] + l.col[1] / 2;
  let felt = l.felt;
  let boardT = l.boardT;
  let potT = l.potT;
  let toCallT = l.toCallT;
  let myChipY = l.myChipY;
  const slot = {} as Record<Slot, SeatPos>;
  if (l.wide && l.geo) {
    const [gx, gy, rx, ry, off] = l.geo;
    cx = gx;
    felt = [gx - rx, gy - ry, 2 * rx, 2 * ry];
    boardT = gy - l.card[1] / 2 - 16;
    potT = boardT + l.card[1] + 12;
    toCallT = potT + 52;
    myChipY = gy + ry - 22;
    // the top seat's name and stack sit below its avatar, toward the felt: give it room to clear the rim
    const offTop = Math.max(off, l.av / 2 + l.seatGap + 42);
    for (const s of Object.keys(SLOT_DEG) as Slot[]) {
      const a = (SLOT_DEG[s] * Math.PI) / 180;
      const oy = Math.sin(a) < -0.9 ? offTop : off;
      slot[s] = {
        x: Math.round(gx + (rx + off) * Math.cos(a)),
        y: Math.round(gy + (ry + oy) * Math.sin(a)),
        cx: Math.round(gx + rx * 0.8 * Math.cos(a)),
        cy: Math.round(gy + ry * 0.8 * Math.sin(a)),
      };
    }
  } else if (l.seats) {
    for (const s of Object.keys(SLOT_INDEX) as Slot[]) {
      const [x, y, chipX, chipY] = l.seats[SLOT_INDEX[s]]!;
      slot[s] = { x, y, cx: chipX, cy: chipY };
    }
  }
  return {
    ...l,
    id,
    felt: felt!,
    boardT: boardT!,
    potT: potT!,
    toCallT: toCallT!,
    myChipY: myChipY!,
    rr: l.rr ?? null,
    lr: l.lr ?? null,
    cx,
    CX: cx,
    CY: potT! + 24,
    slot,
  };
}

const CACHE = new Map<LayoutId, Geometry>();
export function geometry(id: LayoutId): Geometry {
  let g = CACHE.get(id);
  if (!g) {
    g = build(id);
    CACHE.set(id, g);
  }
  return g;
}

/** Picks the surface for a viewport, as specified in the build plan. */
export function pickLayout(w: number, h: number): LayoutId {
  if (w >= 1360 && h >= 800) return 'desktop';
  if (w >= 1100) return 'tablet';
  if (w >= 680) return 'foldopen';
  if (h / w >= 2.4) return 'cover';
  return 'phone';
}

/** Uniform scale that fits the stage in the viewport. */
export function fitScale(id: LayoutId, w: number, h: number): number {
  const l = LAYOUTS[id];
  return Math.min(w / l.W, h / l.H);
}
