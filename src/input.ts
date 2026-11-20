import type { CoopKeys, PadAxes } from '../core/coop/route';
import { neutralInput, withSheetNet, type BoatInput } from '../core/input';
import {
  freshRepeat,
  interpretPad,
  type MenuRepeat,
  type PadLayout,
  type Remap,
  DEFAULT_REMAP,
} from './input/standard';

/** Map the shell's device state onto the engine-free input struct. */
export function toBoatInput(input: InputState): BoatInput {
  return withSheetNet({
    ...neutralInput(),
    steer: input.rudder,
    sheetIn: input.sheetIn,
    sheetOut: input.sheetOut,
    hike: input.hike,
    moveIn: input.moveIn,
    anchor: input.anchorPressed,
    moor: input.moorPressed,
    scopeOut: input.scopeOut,
    scopeIn: input.scopeIn,
    paddle: !!input.paddle,
    cycleWind: input.windPressed,
    toggleTide: input.tidePressed,
  });
}

export interface InputState {
  rudder: number;
  sheetIn: number;
  sheetOut: number;
  hike: number;
  moveIn: number;
  orbitX: number;
  orbitY: number;
  assistPressed: boolean;
  resetPressed: boolean;
  pausePressed: boolean;
  qualityPressed: boolean;
  camera: 'chase' | 'cockpit' | 'top' | 'cinema' | null;
  cycleCamera: boolean;
  usingGamepad: boolean;
  /** H, from the debrief. Opens docking practice. LB no longer does this. */
  dockPressed: boolean;
  /** Right stick click, or F. Drop or weigh the anchor in the dock. */
  anchorPressed: boolean;
  /** Right bumper. Throw or let go the mooring line. */
  moorPressed: boolean;
  /** D-pad up, held. Pay out anchor scope. */
  scopeOut: boolean;
  /** D-pad down, held. Take scope in. */
  scopeIn: boolean;
  /** Left bumper, dock and harbour. Cycle the wind. */
  windPressed: boolean;
  /** Left stick click. Toggle the light tide. */
  tidePressed: boolean;
  /** Held. D-pad left in the dock and harbour, or Q. A short paddle. */
  paddle?: boolean;
  /** Learn menu and the shell. D-pad up or left stick up, one press. */
  menuUp?: boolean;
  /** Learn menu and the shell. D-pad down or left stick down, one press. */
  menuDown?: boolean;
  /** Learn menu. A, one press. */
  menuConfirm?: boolean;
  /** Learn menu. B, one press. */
  menuBack?: boolean;
  /** View button. Opens the controls diagram. One press. */
  controlsPressed?: boolean;
  /** A, one press, in every layout. Menus select. Assisted sailing tacks. */
  confirmPressed?: boolean;
  /** B, one press, in every layout. Menus go back. The intro skips. */
  backPressed?: boolean;
  /** First rising button this frame. The remap screen listens for it. */
  changedButton?: number | null;
}

const keys = new Set<string>();

export function attachKeyboard(target: Window): void {
  target.addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (e.key) keys.add(e.key.toLowerCase());
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
  });
  target.addEventListener('keyup', (e) => {
    keys.delete(e.code);
    if (e.key) keys.delete(e.key.toLowerCase());
  });
  target.addEventListener('blur', () => keys.clear());
}

/** In the dock, D-pad up and down pay the anchor rode. In a menu they move the list. */
let padLayout: PadLayout = 'sail';
let invertSteer = false;
let remap: Remap = { ...DEFAULT_REMAP };
let prevDown = Array(16).fill(false);
let menuRepeat: MenuRepeat = freshRepeat();
let lastPoll = 0;

export function setPadLayout(layout: PadLayout): void {
  padLayout = layout;
}

export function setInputOptions(opts: { invert?: boolean; remap?: Remap }): void {
  if (opts.invert != null) invertSteer = opts.invert;
  if (opts.remap) remap = { ...opts.remap };
}

export function readInput(): InputState {
  const nowMs = typeof performance === 'undefined' ? 0 : performance.now();
  const dt = lastPoll ? Math.min(0.1, (nowMs - lastPoll) / 1000) : 1 / 60;
  lastPoll = nowMs;
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const pad = pads[0];
  let rudder = 0;
  let sheetIn = 0;
  let sheetOut = 0;
  let hike = 0;
  let moveIn = 0;
  let orbitX = 0;
  let orbitY = 0;
  let assistPressed = false;
  let pausePressed = false;
  let qualityPressed = false;
  let camera: InputState['camera'] = null;
  let usingGamepad = false;
  let anchorPressed = false;
  let moorPressed = false;
  let scopeOut = false;
  let scopeIn = false;
  let windPressed = false;
  let tidePressed = false;
  let paddle = false;
  let menuUp = false;
  let menuDown = false;
  let menuConfirm = false;
  let menuBack = false;
  let controlsPressed = false;
  let confirmPressed = false;
  let backPressed = false;
  let changedButton: number | null = null;

  if (pad && pad.connected) {
    usingGamepad = true;
    const actions = interpretPad(
      {
        axes: pad.axes,
        buttons: Array.from({ length: 16 }, (_, i) => {
          const b = pad.buttons[i];
          return b ? b.value || (b.pressed ? 1 : 0) : 0;
        }),
      },
      prevDown,
      { layout: padLayout, invert: invertSteer, remap, repeat: menuRepeat, dt },
    );
    prevDown = actions.nextPrev;
    menuRepeat = actions.nextRepeat;
    rudder = actions.rudder;
    sheetIn = actions.sheetIn;
    sheetOut = actions.sheetOut;
    hike = actions.hike;
    moveIn = actions.moveIn;
    orbitX = actions.orbitX;
    orbitY = actions.orbitY;
    assistPressed = actions.assistPressed;
    pausePressed = actions.pausePressed;
    qualityPressed = actions.qualityPressed;
    camera = actions.camera;
    anchorPressed = actions.anchorPressed;
    moorPressed = actions.moorPressed;
    scopeOut = actions.scopeOut;
    scopeIn = actions.scopeIn;
    windPressed = actions.windPressed;
    tidePressed = actions.tidePressed;
    paddle = actions.paddle;
    menuUp = actions.menuUp;
    menuDown = actions.menuDown;
    menuConfirm = actions.menuConfirm;
    menuBack = actions.menuBack;
    controlsPressed = actions.controlsPressed;
    confirmPressed = actions.confirmPressed;
    backPressed = actions.backPressed;
    changedButton = actions.changedButton;
  } else {
    prevDown = Array(16).fill(false);
    menuRepeat = freshRepeat();
  }

  const menuKeys = padLayout === 'menu';
  const coopKeys = padLayout === 'coop';
  if (!menuKeys && !coopKeys && (keys.has('ArrowLeft') || keys.has('KeyA') || keys.has('a'))) rudder -= invertSteer ? -0.5 : 0.5;
  if (!menuKeys && !coopKeys && (keys.has('ArrowRight') || keys.has('KeyD') || keys.has('d'))) rudder += invertSteer ? -0.5 : 0.5;
  if (!menuKeys && !coopKeys && (keys.has('ArrowUp') || keys.has('KeyW') || keys.has('w'))) sheetIn = Math.max(sheetIn, 1);
  if (!menuKeys && !coopKeys && (keys.has('ArrowDown') || keys.has('KeyS') || keys.has('s'))) sheetOut = Math.max(sheetOut, 1);
  if (menuKeys) {
    const enter = consumeKey('Enter');
    const back = consumeKey('Backspace') || consumeKey('Escape') || consumeKey('KeyB') || consumeKey('b');
    menuUp = menuUp || consumeKey('ArrowUp');
    menuDown = menuDown || consumeKey('ArrowDown');
    menuConfirm = menuConfirm || enter;
    menuBack = menuBack || back;
    confirmPressed = confirmPressed || enter;
    backPressed = backPressed || back;
  }
  if (!coopKeys && !menuKeys && keys.has('Space')) hike = Math.max(hike, 1);
  if (!coopKeys && !menuKeys && (keys.has('KeyB') || keys.has('b'))) moveIn = Math.max(moveIn, 1);
  if (!coopKeys && keys.has('KeyJ')) orbitX -= 1;
  if (!coopKeys && keys.has('KeyL')) orbitX += 1;
  if (!coopKeys && keys.has('KeyI')) orbitY -= 1;
  if (!coopKeys && keys.has('KeyK')) orbitY += 1;
  if (keys.has('KeyU') || keys.has('u')) scopeOut = true;
  if (keys.has('KeyN') || keys.has('n')) scopeIn = true;
  if (keys.has('KeyQ') || keys.has('q')) paddle = true;
  if (!menuKeys && (consumeKey('Backspace') || consumeKey('KeyB') || consumeKey('b'))) backPressed = true;

  return {
    rudder: Math.max(-1, Math.min(1, rudder)),
    sheetIn,
    sheetOut,
    hike,
    moveIn,
    orbitX,
    orbitY,
    assistPressed: assistPressed || consumeKey('KeyY') || consumeKey('y'),
    resetPressed: consumeKey('KeyR'),
    pausePressed: pausePressed || consumeKey('KeyP') || consumeKey('p') || (!menuKeys && consumeKey('Escape')),
    qualityPressed: qualityPressed || consumeKey('KeyG') || consumeKey('KeyX'),
    camera: camera ?? consumeCamera(),
    cycleCamera: consumeKey('KeyC'),
    usingGamepad,
    dockPressed: consumeKey('KeyH') || consumeKey('h'),
    anchorPressed: anchorPressed || consumeKey('KeyF') || consumeKey('f'),
    moorPressed: moorPressed || consumeKey('KeyM') || consumeKey('m'),
    scopeOut,
    scopeIn,
    windPressed: windPressed || consumeKey('KeyZ') || consumeKey('z'),
    tidePressed: tidePressed || consumeKey('KeyT') || consumeKey('t'),
    paddle,
    menuUp,
    menuDown,
    menuConfirm,
    menuBack,
    controlsPressed: controlsPressed || consumeKey('Tab'),
    confirmPressed,
    backPressed,
    changedButton,
  };
}

const consumed = new Set<string>();

function consumeKey(code: string): boolean {
  if (keys.has(code) && !consumed.has(code)) {
    consumed.add(code);
    return true;
  }
  if (!keys.has(code)) consumed.delete(code);
  return false;
}

function consumeCamera(): InputState['camera'] {
  if (consumeKey('Digit1')) return 'chase';
  if (consumeKey('Digit2')) return 'cockpit';
  if (consumeKey('Digit3')) return 'top';
  if (consumeKey('Digit4') || consumeKey('KeyV')) return 'cinema';
  return null;
}

export function readPads(): PadAxes[] {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  return [0, 1].map((index) => {
    const pad = pads[index];
    if (!pad || !pad.connected) return { connected: false, axes: [0, 0, 0, 0], buttons: Array(16).fill(0) };
    return {
      connected: true,
      axes: [0, 1, 2, 3].map((axis) => pad.axes[axis] ?? 0),
      buttons: Array.from({ length: 16 }, (_, button) => {
        const b = pad.buttons[button];
        return b ? b.value || (b.pressed ? 1 : 0) : 0;
      }),
    };
  });
}

/** Helm is WASD. Crew is IJKL, with U to answer and O for the vang. */
export function readCoopKeys(): CoopKeys {
  const down = (code: string, key: string) => keys.has(code) || keys.has(key);
  return {
    helmLeft: down('ArrowLeft', 'arrowleft') || down('KeyA', 'a'),
    helmRight: down('ArrowRight', 'arrowright') || down('KeyD', 'd'),
    helmOut: down('ArrowUp', 'arrowup') || down('KeyW', 'w'),
    helmIn: down('ArrowDown', 'arrowdown') || down('KeyS', 's'),
    helmCall: down('KeyQ', 'q'),
    crewSheetIn: down('KeyI', 'i'),
    crewSheetOut: down('KeyK', 'k'),
    crewOut: down('KeyJ', 'j'),
    crewIn: down('KeyL', 'l'),
    crewReady: down('KeyU', 'u'),
    crewVang: down('KeyO', 'o'),
    crewJoin: down('KeyU', 'u'),
    aiStart: keys.has('Enter'),
  };
}

export function rumble(strong: number, weak: number, ms: number): void {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const pad = pads[0];
  const actuator = pad && 'vibrationActuator' in pad ? pad.vibrationActuator : undefined;
  if (actuator && typeof actuator.playEffect === 'function') {
    actuator.playEffect('dual-rumble', {
      startDelay: 0,
      duration: ms,
      strongMagnitude: Math.max(0, Math.min(1, strong)),
      weakMagnitude: Math.max(0, Math.min(1, weak)),
    }).catch(() => undefined);
  }
}
