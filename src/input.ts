import type { CoopKeys, PadAxes } from './coop/route';

export interface InputState {
  rudder: number;
  sheetIn: number;
  sheetOut: number;
  hike: number;
  /** 0..1 move the sailor in, across the boat, and slightly to leeward. */
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
  /** H, or LB outside the dock. From the debrief, opens docking practice. */
  dockPressed: boolean;
  /** Right stick click, or F. Drop or weigh the anchor in the dock. */
  anchorPressed: boolean;
  /** Right bumper. Throw or let go the mooring line. */
  moorPressed: boolean;
  /** D-pad up, held. Pay out anchor scope. */
  scopeOut: boolean;
  /** D-pad down, held. Take scope in. */
  scopeIn: boolean;
  /** Left bumper. Cycle harbour wind. */
  windPressed: boolean;
  /** Left stick click. Toggle the light tide. */
  tidePressed: boolean;
  /** Held. A short paddle, used to leave a berth in the harbour scenario. */
  paddle?: boolean;
  /** Learn menu. D-pad up, one press. */
  menuUp?: boolean;
  /** Learn menu. D-pad down, one press. */
  menuDown?: boolean;
  /** Learn menu. A, one press. */
  menuConfirm?: boolean;
  /** Learn menu. B, one press. */
  menuBack?: boolean;
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

function buttonValue(pad: Gamepad, index: number): number {
  const b = pad.buttons[index];
  return b ? b.value || (b.pressed ? 1 : 0) : 0;
}

function edge(prev: boolean, now: boolean): boolean {
  return now && !prev;
}

const prevButtons = new Array(16).fill(false);

/** In the dock, D-pad up and down pay the anchor rode. In the learn menu they move the list. */
let padLayout: 'sail' | 'dock' | 'menu' | 'coop' = 'sail';

export function setPadLayout(layout: 'sail' | 'dock' | 'menu' | 'coop'): void {
  padLayout = layout;
}

export function readInput(): InputState {
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
  let resetPressed = false;
  let pausePressed = false;
  let qualityPressed = false;
  let camera: InputState['camera'] = null;
  let usingGamepad = false;
  let dockPressed = false;
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

  if (pad && pad.connected) {
    usingGamepad = true;
    const dz = 0.14;
    const ax = Math.abs(pad.axes[0]) > dz ? pad.axes[0] : 0;
    rudder = Math.max(-1, Math.min(1, ax));
    sheetOut = buttonValue(pad, 6);
    sheetIn = buttonValue(pad, 7);
    hike = buttonValue(pad, 0);
    moveIn = buttonValue(pad, 1);
    orbitX = Math.abs(pad.axes[2] ?? 0) > dz ? pad.axes[2] : 0;
    orbitY = Math.abs(pad.axes[3] ?? 0) > dz ? pad.axes[3] : 0;
    const now = pad.buttons.map((b) => b.pressed);
    assistPressed = edge(prevButtons[3], now[3] ?? false);
    resetPressed = edge(prevButtons[8], now[8] ?? false);
    pausePressed = edge(prevButtons[9], now[9] ?? false);
    qualityPressed = edge(prevButtons[2], now[2] ?? false);
    anchorPressed = edge(prevButtons[11], now[11] ?? false);
    moorPressed = edge(prevButtons[5], now[5] ?? false);
    tidePressed = edge(prevButtons[10], now[10] ?? false);
    if (padLayout === 'dock') windPressed = edge(prevButtons[4], now[4] ?? false);
    else dockPressed = edge(prevButtons[4], now[4] ?? false);
    const up = now[12] ?? false;
    const down = now[13] ?? false;
    const left = now[14] ?? false;
    const right = now[15] ?? false;
    if (padLayout === 'menu') {
      menuUp = edge(prevButtons[12], up);
      menuDown = edge(prevButtons[13], down);
      menuConfirm = edge(prevButtons[0], now[0] ?? false);
      menuBack = edge(prevButtons[1], now[1] ?? false);
    } else if (padLayout === 'dock') {
      scopeOut = up;
      scopeIn = down;
      if (edge(prevButtons[15], right)) camera = 'cockpit';
      if (edge(prevButtons[14], left)) camera = 'chase';
    } else {
      if (edge(prevButtons[12], up)) camera = 'chase';
      if (edge(prevButtons[13], down)) camera = 'top';
      if (edge(prevButtons[15], right)) camera = 'cockpit';
      if (edge(prevButtons[14], left)) camera = 'chase';
    }
    for (let i = 0; i < 16; i++) prevButtons[i] = now[i] ?? false;
  }

  const menuKeys = padLayout === 'menu';
  const coopKeys = padLayout === 'coop';
  if (!menuKeys && !coopKeys && (keys.has('ArrowLeft') || keys.has('KeyA') || keys.has('a'))) rudder -= 0.5;
  if (!menuKeys && !coopKeys && (keys.has('ArrowRight') || keys.has('KeyD') || keys.has('d'))) rudder += 0.5;
  if (!menuKeys && !coopKeys && (keys.has('ArrowUp') || keys.has('KeyW') || keys.has('w'))) sheetIn = Math.max(sheetIn, 1);
  if (!menuKeys && !coopKeys && (keys.has('ArrowDown') || keys.has('KeyS') || keys.has('s'))) sheetOut = Math.max(sheetOut, 1);
  if (menuKeys) {
    menuUp = menuUp || consumeKey('ArrowUp');
    menuDown = menuDown || consumeKey('ArrowDown');
    menuConfirm = menuConfirm || consumeKey('Enter');
    menuBack = menuBack || consumeKey('Backspace');
  }
  if (!coopKeys && keys.has('Space')) hike = Math.max(hike, 1);
  if (!coopKeys && (keys.has('KeyB') || keys.has('b'))) moveIn = Math.max(moveIn, 1);
  if (!coopKeys && keys.has('KeyJ')) orbitX -= 1;
  if (!coopKeys && keys.has('KeyL')) orbitX += 1;
  if (!coopKeys && keys.has('KeyI')) orbitY -= 1;
  if (!coopKeys && keys.has('KeyK')) orbitY += 1;
  if (keys.has('KeyU') || keys.has('u')) scopeOut = true;
  if (keys.has('KeyN') || keys.has('n')) scopeIn = true;
  if (keys.has('KeyQ') || keys.has('q')) paddle = true;

  return {
    rudder: Math.max(-1, Math.min(1, rudder)),
    sheetIn,
    sheetOut,
    hike,
    moveIn,
    orbitX,
    orbitY,
    assistPressed: assistPressed || consumeKey('KeyY') || consumeKey('y'),
    resetPressed: resetPressed || consumeKey('KeyR'),
    pausePressed: pausePressed || consumeKey('KeyP') || consumeKey('p') || consumeKey('Escape'),
    qualityPressed: qualityPressed || consumeKey('KeyG') || consumeKey('KeyX'),
    camera: camera ?? consumeCamera(),
    cycleCamera: consumeKey('KeyC'),
    usingGamepad,
    dockPressed: dockPressed || consumeKey('KeyH') || consumeKey('h'),
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
      buttons: Array.from({ length: 16 }, (_, button) => buttonValue(pad, button)),
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
