export interface InputState {
  rudder: number;
  sheetIn: number;
  sheetOut: number;
  hike: number;
  orbitX: number;
  orbitY: number;
  assistPressed: boolean;
  resetPressed: boolean;
  pausePressed: boolean;
  qualityPressed: boolean;
  camera: 'chase' | 'cockpit' | 'top' | null;
  cycleCamera: boolean;
  usingGamepad: boolean;
}

const keys = new Set<string>();

export function attachKeyboard(target: Window): void {
  target.addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
  });
  target.addEventListener('keyup', (e) => keys.delete(e.code));
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

export function readInput(): InputState {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const pad = pads[0];
  let rudder = 0;
  let sheetIn = 0;
  let sheetOut = 0;
  let hike = 0;
  let orbitX = 0;
  let orbitY = 0;
  let assistPressed = false;
  let resetPressed = false;
  let pausePressed = false;
  let qualityPressed = false;
  let camera: InputState['camera'] = null;
  let usingGamepad = false;

  if (pad && pad.connected) {
    usingGamepad = true;
    const dz = 0.14;
    const ax = Math.abs(pad.axes[0]) > dz ? pad.axes[0] : 0;
    rudder = Math.max(-1, Math.min(1, ax));
    sheetOut = buttonValue(pad, 6);
    sheetIn = buttonValue(pad, 7);
    hike = buttonValue(pad, 0);
    orbitX = Math.abs(pad.axes[2] ?? 0) > dz ? pad.axes[2] : 0;
    orbitY = Math.abs(pad.axes[3] ?? 0) > dz ? pad.axes[3] : 0;
    const now = pad.buttons.map((b) => b.pressed);
    assistPressed = edge(prevButtons[1], now[1] ?? false);
    resetPressed = edge(prevButtons[8], now[8] ?? false);
    pausePressed = edge(prevButtons[9], now[9] ?? false);
    qualityPressed = edge(prevButtons[2], now[2] ?? false);
    if (edge(prevButtons[12], now[12] ?? false)) camera = 'chase';
    if (edge(prevButtons[15], now[15] ?? false)) camera = 'cockpit';
    if (edge(prevButtons[13], now[13] ?? false)) camera = 'top';
    if (edge(prevButtons[14], now[14] ?? false)) camera = 'chase';
    for (let i = 0; i < 16; i++) prevButtons[i] = now[i] ?? false;
  }

  if (keys.has('ArrowLeft') || keys.has('KeyA')) rudder -= 1;
  if (keys.has('ArrowRight') || keys.has('KeyD')) rudder += 1;
  if (keys.has('ArrowUp') || keys.has('KeyW')) sheetIn = Math.max(sheetIn, 1);
  if (keys.has('ArrowDown') || keys.has('KeyS')) sheetOut = Math.max(sheetOut, 1);
  if (keys.has('Space')) hike = Math.max(hike, 1);
  if (keys.has('KeyJ')) orbitX -= 1;
  if (keys.has('KeyL')) orbitX += 1;
  if (keys.has('KeyI')) orbitY -= 1;
  if (keys.has('KeyK')) orbitY += 1;

  return {
    rudder: Math.max(-1, Math.min(1, rudder)),
    sheetIn,
    sheetOut,
    hike,
    orbitX,
    orbitY,
    assistPressed: assistPressed || consumeKey('KeyB'),
    resetPressed: resetPressed || consumeKey('KeyR'),
    pausePressed: pausePressed || consumeKey('KeyP') || consumeKey('Escape'),
    qualityPressed: qualityPressed || consumeKey('KeyG') || consumeKey('KeyX'),
    camera: camera ?? consumeCamera(),
    cycleCamera: consumeKey('KeyC'),
    usingGamepad,
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
