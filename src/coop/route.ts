/** Xbox pads and the one-keyboard fallback, split into helm and crew. */

export interface PadAxes {
  connected: boolean;
  axes: readonly number[];
  buttons: readonly number[];
}

export interface CoopKeys {
  helmLeft: boolean;
  helmRight: boolean;
  helmOut: boolean;
  helmIn: boolean;
  helmCall: boolean;
  crewSheetIn: boolean;
  crewSheetOut: boolean;
  crewOut: boolean;
  crewIn: boolean;
  crewReady: boolean;
  crewVang: boolean;
  crewJoin: boolean;
  aiStart: boolean;
}

export interface HelmRole {
  rudder: number;
  hikeOut: number;
  hikeIn: number;
  call: boolean;
  connected: boolean;
}

export interface CrewRole {
  sheetIn: number;
  sheetOut: number;
  hikeOut: number;
  hikeIn: number;
  ready: boolean;
  vangDown: boolean;
  joinDown: boolean;
  connected: boolean;
}

export const EMPTY_KEYS: CoopKeys = {
  helmLeft: false,
  helmRight: false,
  helmOut: false,
  helmIn: false,
  helmCall: false,
  crewSheetIn: false,
  crewSheetOut: false,
  crewOut: false,
  crewIn: false,
  crewReady: false,
  crewVang: false,
  crewJoin: false,
  aiStart: false,
};

const DEAD = 0.14;

export function emptyPad(): PadAxes {
  return { connected: false, axes: [0, 0, 0, 0], buttons: Array(16).fill(0) };
}

/** Helm owns the tiller and the call. Crew owns the sheet, the vang, and their own weight. */
export function routeRoles(helmPad: PadAxes | null, crewPad: PadAxes | null, keys: CoopKeys): { helm: HelmRole; crew: CrewRole } {
  const helm = helmPad && helmPad.connected ? helmPad : emptyPad();
  const crew = crewPad && crewPad.connected ? crewPad : emptyPad();
  const stick = axis(helm.axes[0] ?? 0);
  const keyRudder = (keys.helmRight ? 0.55 : 0) - (keys.helmLeft ? 0.55 : 0);
  return {
    helm: {
      rudder: clamp(stick + keyRudder, -1, 1),
      hikeOut: Math.max(button(helm.buttons, 0), keys.helmOut ? 1 : 0),
      hikeIn: Math.max(button(helm.buttons, 1), keys.helmIn ? 1 : 0),
      call: button(helm.buttons, 5) > 0.5 || keys.helmCall,
      connected: !!(helmPad && helmPad.connected),
    },
    crew: {
      sheetIn: Math.max(button(crew.buttons, 7), keys.crewSheetIn ? 1 : 0),
      sheetOut: Math.max(button(crew.buttons, 6), keys.crewSheetOut ? 1 : 0),
      hikeOut: Math.max(button(crew.buttons, 0), keys.crewOut ? 1 : 0),
      hikeIn: Math.max(button(crew.buttons, 1), keys.crewIn ? 1 : 0),
      ready: button(crew.buttons, 3) > 0.5 || keys.crewReady,
      vangDown: button(crew.buttons, 2) > 0.5 || keys.crewVang,
      joinDown: button(crew.buttons, 0) > 0.5 || keys.crewJoin,
      connected: !!(crewPad && crewPad.connected),
    },
  };
}

function axis(v: number): number {
  if (!Number.isFinite(v) || Math.abs(v) < DEAD) return 0;
  return clamp(v, -1, 1);
}

function button(buttons: readonly number[], index: number): number {
  const v = buttons[index] ?? 0;
  if (!Number.isFinite(v)) return 0;
  return clamp(v, 0, 1);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
