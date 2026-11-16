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

/** In the dock, D-pad up and down pay the anchor rode instead of moving the camera. */
let padLayout: 'sail' | 'dock' = 'sail';

export function setPadLayout(layout: 'sail' | 'dock'): void {
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
    if (padLayout === 'dock') {
      scopeOut = up;
      scopeIn = down;
    } else {
      if (edge(prevButtons[12], up)) camera = 'chase';
      if (edge(prevButtons[13], down)) camera = 'top';
    }
    if (edge(prevButtons[15], now[15] ?? false)) camera = 'cockpit';
    if (edge(prevButtons[14], now[14] ?? false)) camera = 'chase';
    for (let i = 0; i < 16; i++) prevButtons[i] = now[i] ?? false;
  }

  if (keys.has('ArrowLeft') || keys.has('KeyA') || keys.has('a')) rudder -= 0.5;
  if (keys.has('ArrowRight') || keys.has('KeyD') || keys.has('d')) rudder += 0.5;
  if (keys.has('ArrowUp') || keys.has('KeyW') || keys.has('w')) sheetIn = Math.max(sheetIn, 1);
  if (keys.has('ArrowDown') || keys.has('KeyS') || keys.has('s')) sheetOut = Math.max(sheetOut, 1);
  if (keys.has('Space')) hike = Math.max(hike, 1);
  if (keys.has('KeyB') || keys.has('b')) moveIn = Math.max(moveIn, 1);
  if (keys.has('KeyJ')) orbitX -= 1;
  if (keys.has('KeyL')) orbitX += 1;
  if (keys.has('KeyI')) orbitY -= 1;
  if (keys.has('KeyK')) orbitY += 1;
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
