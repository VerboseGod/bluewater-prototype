/**
 * Edge on Xbox only delivers the pad after
 * `navigator.gamepadInputEmulation = "gamepad"`. If a pad is connected and its
 * timestamp never moves, the page is still seeing the cursor, not the controller.
 */
export interface WatchState {
  stuckFor: number;
  lastStamp: number | null;
  show: boolean;
}

export function freshWatch(): WatchState {
  return { stuckFor: 0, lastStamp: null, show: false };
}

export interface WatchSample {
  connected: boolean;
  timestamp: number;
  /** Any stick or button off the rest position. */
  active: boolean;
}

const HINT_AFTER = 3.5;

export function watchGamepad(state: WatchState, sample: WatchSample | null, dt: number): WatchState {
  if (!sample || !sample.connected) return freshWatch();
  if (sample.active) return { stuckFor: 0, lastStamp: sample.timestamp, show: false };
  const moved = state.lastStamp != null && sample.timestamp !== state.lastStamp;
  if (moved) return { stuckFor: 0, lastStamp: sample.timestamp, show: false };
  const stuckFor = state.stuckFor + Math.max(0, dt);
  return {
    stuckFor,
    lastStamp: sample.timestamp,
    show: stuckFor >= HINT_AFTER,
  };
}

export function enableGamepadEmulation(nav: object): boolean {
  if (!('gamepadInputEmulation' in nav)) return false;
  try {
    (nav as { gamepadInputEmulation: string }).gamepadInputEmulation = 'gamepad';
    return true;
  } catch {
    return false;
  }
}
