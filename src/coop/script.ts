import { LEFT_MARK, RIGHT_MARK } from './drill';
import { clamp, wrapPi } from '../sim/math';

export interface ScriptView {
  joined: boolean;
  x: number;
  y: number;
  heading: number;
  twa: number;
  windFrom: number;
  sheet: number;
  /** Forward speed, m/s. */
  vFwd: number;
  /** Combined weight, starboard-positive meters. */
  crew: number;
  callPhase: string;
  vang: number;
}

export interface ScriptMemory {
  mode: 'sail' | 'call' | 'ready' | 'turn';
  since: number;
  leg: number;
}

export interface ScriptPads {
  helmAxes: number[];
  helmButtons: number[];
  crewAxes: number[];
  crewButtons: number[];
  memory: ScriptMemory;
}

export function freshMemory(): ScriptMemory {
  return { mode: 'sail', since: 0, leg: 0 };
}

/**
 * Two virtual pads sailing the beat. Helm calls, waits, then turns.
 * Crew answers, eases, crosses once the bow is through, and trims.
 */
export function scriptedPads(view: ScriptView, memory: ScriptMemory, now: number): ScriptPads {
  const helmButtons = zeros();
  const crewButtons = zeros();
  const helmAxes = [0, 0, 0, 0];
  const mem = { ...memory };
  if (!view.joined) {
    crewButtons[0] = 1;
    return { helmAxes, helmButtons, crewAxes: [0, 0, 0, 0], crewButtons, memory: mem };
  }

  const age = now - mem.since;
  if (mem.mode === 'sail' && mem.leg < 3 && timeToTack(view, mem.leg, age)) {
    mem.mode = 'call';
    mem.since = now;
  } else if (mem.mode === 'call' && age > 0.32) {
    mem.mode = 'ready';
    mem.since = now;
  } else if (mem.mode === 'ready' && age > 0.42) {
    mem.mode = 'turn';
    mem.since = now;
  } else if (mem.mode === 'turn' && age > 0.9 && tackFlipped(view.twa, mem.leg)) {
    mem.mode = 'sail';
    mem.leg += 1;
    mem.since = now;
  } else if (mem.mode === 'turn' && age > 6.5) {
    mem.mode = 'sail';
    mem.since = now;
  }

  const turnAge = now - mem.since;
  if (mem.mode === 'call') helmButtons[5] = 1;
  if (mem.mode === 'ready') crewButtons[3] = 1;
  if (mem.mode === 'turn' && (turnAge < 0.14 || (turnAge > 1.25 && turnAge < 1.4))) crewButtons[2] = 1;

  if (mem.leg >= 3) {
    helmAxes[0] = steer(view.heading, Math.atan2(-view.y, -view.x));
    if (view.sheet > 0.36) crewButtons[6] = 1;
    else if (view.sheet < 0.22) crewButtons[7] = 1;
  } else if (mem.mode === 'turn') {
    const toPort = mem.leg % 2 === 0;
    let rudder = toPort ? -0.34 : 0.34;
    if (Math.abs(view.twa) < 0.9) rudder *= 0.55;
    helmAxes[0] = rudder;
    const crossed = tackFlipped(view.twa, mem.leg) || (mem.leg % 2 === 0 ? view.twa < -0.08 : view.twa > 0.08);
    if (!crossed) {
      if (view.sheet > 0.42) crewButtons[6] = 1;
      crewButtons[1] = 1;
      helmButtons[1] = 1;
    } else {
      if (view.sheet < 0.86) crewButtons[7] = 1;
      if (needsHike(view)) {
        crewButtons[0] = 1;
        helmButtons[0] = 1;
      }
    }
  } else {
    const sign = mem.leg === 1 ? -1 : 1;
    const desired = wrapPi(view.windFrom - sign * 0.8);
    let rudder = steer(view.heading, desired);
    if (mem.mode === 'call' || mem.mode === 'ready') rudder = clamp(rudder, -0.16, 0.16);
    helmAxes[0] = rudder;
    if (view.sheet < 0.86) crewButtons[7] = 1;
    else if (view.sheet > 0.94) crewButtons[6] = 1;
    if (needsHike(view)) {
      helmButtons[0] = 1;
      crewButtons[0] = 1;
    }
  }

  return { helmAxes, helmButtons, crewAxes: [0, 0, 0, 0], crewButtons, memory: mem };
}

function timeToTack(view: ScriptView, leg: number, legAge: number): boolean {
  if (view.vFwd < 1.45 || legAge < 5) return false;
  if (leg === 0) return view.y > 8;
  if (leg === 1) return dist(view, LEFT_MARK) < 10 || view.y > 26;
  return dist(view, RIGHT_MARK) < 10 || view.y > 40;
}

function dist(view: ScriptView, mark: { x: number; y: number }): number {
  return Math.hypot(view.x - mark.x, view.y - mark.y);
}

function needsHike(view: ScriptView): boolean {
  const windward = -(Math.sign(view.twa) || 1);
  const onSide = view.crew * windward > 0.28;
  if (!onSide) return true;
  return view.vFwd > 2.05;
}

function tackFlipped(twa: number, leg: number): boolean {
  return leg % 2 === 0 ? twa < -0.48 : twa > 0.48;
}

function steer(heading: number, desired: number): number {
  return clamp(-wrapPi(desired - heading) * 1.25, -0.42, 0.42);
}

function zeros(): number[] {
  return Array(16).fill(0);
}
