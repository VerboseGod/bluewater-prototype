/**
 * W3C Standard Gamepad mapping, the one Edge on Xbox reports.
 * https://w3c.github.io/gamepad/#remapping
 *
 * A 0, B 1, X 2, Y 3, LB 4, RB 5, LT 6, RT 7,
 * View 8, Menu 9, LS 10, RS 11, D-pad up 12, down 13, left 14, right 15.
 */
export const PAD = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  VIEW: 8,
  MENU: 9,
  LS: 10,
  RS: 11,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
} as const;

export type PadLayout = 'sail' | 'dock' | 'menu' | 'coop';

export interface Remap {
  sheetIn: number;
  sheetOut: number;
  hike: number;
  moveIn: number;
}

export const DEFAULT_REMAP: Remap = {
  sheetIn: PAD.RT,
  sheetOut: PAD.LT,
  hike: PAD.A,
  moveIn: PAD.B,
};

export interface MenuRepeat {
  dir: -1 | 0 | 1;
  /** Seconds the stick has been held in this direction since the last step. */
  held: number;
}

export function freshRepeat(): MenuRepeat {
  return { dir: 0, held: 0 };
}

/** One rising edge. A button held across frames must not repeat. */
export function risingEdge(prev: boolean, now: boolean): boolean {
  return now && !prev;
}

export function edgesOf(prev: readonly boolean[], now: readonly boolean[]): boolean[] {
  const out: boolean[] = [];
  for (let i = 0; i < 16; i++) out.push(risingEdge(!!prev[i], !!now[i]));
  return out;
}

const STICK_DEAD = 0.14;
const MENU_DEAD = 0.5;
const MENU_REPEAT = 0.22;

export interface PadSample {
  axes: readonly number[];
  /** 0..1 analog value for each standard button. Missing buttons are 0. */
  buttons: readonly number[];
}

export interface PadActions {
  rudder: number;
  sheetIn: number;
  sheetOut: number;
  hike: number;
  moveIn: number;
  orbitX: number;
  orbitY: number;
  assistPressed: boolean;
  pausePressed: boolean;
  qualityPressed: boolean;
  controlsPressed: boolean;
  confirmPressed: boolean;
  backPressed: boolean;
  camera: 'chase' | 'cockpit' | 'top' | 'cinema' | null;
  anchorPressed: boolean;
  moorPressed: boolean;
  scopeOut: boolean;
  scopeIn: boolean;
  windPressed: boolean;
  tidePressed: boolean;
  paddle: boolean;
  menuUp: boolean;
  menuDown: boolean;
  menuConfirm: boolean;
  menuBack: boolean;
  /** First button that rose this frame, for the remap screen. */
  changedButton: number | null;
  nextPrev: boolean[];
  nextRepeat: MenuRepeat;
}

export interface InterpretOpts {
  layout: PadLayout;
  invert: boolean;
  remap: Remap;
  repeat: MenuRepeat;
  /** Seconds since the previous poll. Used for stick-menu repeat. */
  dt: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function axis(v: number, dead: number): number {
  if (!Number.isFinite(v) || Math.abs(v) <= dead) return 0;
  return clamp(v, -1, 1);
}

function analog(buttons: readonly number[], index: number): number {
  const v = buttons[index] ?? 0;
  if (!Number.isFinite(v)) return 0;
  return clamp(v, 0, 1);
}

/**
 * Left stick Y is negative when the stick is pushed up (W3C).
 * The first frame of a push steps once. Holding repeats after a short delay.
 */
export function stickMenu(
  axisY: number,
  repeat: MenuRepeat,
  dt: number,
): { up: boolean; down: boolean; next: MenuRepeat } {
  const y = axis(axisY, MENU_DEAD);
  const dir: -1 | 0 | 1 = y < 0 ? -1 : y > 0 ? 1 : 0;
  if (dir === 0) return { up: false, down: false, next: { dir: 0, held: 0 } };
  if (dir !== repeat.dir) return { up: dir < 0, down: dir > 0, next: { dir, held: 0 } };
  const held = repeat.held + Math.max(0, dt);
  if (held >= MENU_REPEAT) return { up: dir < 0, down: dir > 0, next: { dir, held: 0 } };
  return { up: false, down: false, next: { dir, held } };
}

function blank(prev: boolean[], repeat: MenuRepeat): PadActions {
  return {
    rudder: 0,
    sheetIn: 0,
    sheetOut: 0,
    hike: 0,
    moveIn: 0,
    orbitX: 0,
    orbitY: 0,
    assistPressed: false,
    pausePressed: false,
    qualityPressed: false,
    controlsPressed: false,
    confirmPressed: false,
    backPressed: false,
    camera: null,
    anchorPressed: false,
    moorPressed: false,
    scopeOut: false,
    scopeIn: false,
    windPressed: false,
    tidePressed: false,
    paddle: false,
    menuUp: false,
    menuDown: false,
    menuConfirm: false,
    menuBack: false,
    changedButton: null,
    nextPrev: prev,
    nextRepeat: repeat,
  };
}

/**
 * Turn one poll of a Standard Gamepad into the actions the sim and the menus share.
 * Discrete actions are rising edges. The sheet, the hike, the move-in, the paddle,
 * and the anchor rode are levels, so holding them keeps working.
 */
export function interpretPad(sample: PadSample, prevDown: readonly boolean[], opts: InterpretOpts): PadActions {
  const down = Array.from({ length: 16 }, (_, i) => analog(sample.buttons, i) > 0.5);
  const edge = edgesOf(prevDown, down);
  const menu = stickMenu(sample.axes[1] ?? 0, opts.repeat, opts.dt);
  const layout = opts.layout;
  const remap = opts.remap;
  let rudder = axis(sample.axes[0] ?? 0, STICK_DEAD);
  if (opts.invert) rudder = -rudder;

  const menuMode = layout === 'menu';
  let camera: PadActions['camera'] = null;
  if (!menuMode && layout !== 'dock') {
    if (edge[PAD.UP]) camera = 'chase';
    if (edge[PAD.DOWN]) camera = 'top';
    if (edge[PAD.RIGHT]) camera = 'cockpit';
    if (edge[PAD.LEFT]) camera = 'cinema';
  } else if (layout === 'dock') {
    if (edge[PAD.RIGHT]) camera = 'cockpit';
  }

  const menuUp = menuMode && (edge[PAD.UP] || menu.up);
  const menuDown = menuMode && (edge[PAD.DOWN] || menu.down);
  const confirm = edge[PAD.A];
  const back = edge[PAD.B];
  let changedButton: number | null = null;
  for (let i = 0; i < 16; i++) {
    if (edge[i]) {
      changedButton = i;
      break;
    }
  }

  return {
    rudder,
    sheetIn: analog(sample.buttons, remap.sheetIn),
    sheetOut: analog(sample.buttons, remap.sheetOut),
    hike: menuMode ? 0 : analog(sample.buttons, remap.hike),
    moveIn: menuMode ? 0 : analog(sample.buttons, remap.moveIn),
    orbitX: axis(sample.axes[2] ?? 0, STICK_DEAD),
    orbitY: axis(sample.axes[3] ?? 0, STICK_DEAD),
    assistPressed: edge[PAD.Y],
    pausePressed: edge[PAD.MENU],
    qualityPressed: edge[PAD.X],
    controlsPressed: edge[PAD.VIEW],
    confirmPressed: confirm,
    backPressed: back,
    camera,
    anchorPressed: edge[PAD.RS],
    moorPressed: edge[PAD.RB],
    scopeOut: layout === 'dock' && down[PAD.UP],
    scopeIn: layout === 'dock' && down[PAD.DOWN],
    windPressed: layout === 'dock' && edge[PAD.LB],
    tidePressed: edge[PAD.LS],
    paddle: layout === 'dock' && down[PAD.LEFT],
    menuUp,
    menuDown,
    menuConfirm: menuMode && confirm,
    menuBack: menuMode && back,
    changedButton,
    nextPrev: down,
    nextRepeat: menu.next,
  };
}

export function emptyPadActions(): PadActions {
  return blank(Array(16).fill(false), freshRepeat());
}
