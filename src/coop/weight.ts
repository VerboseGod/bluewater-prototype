import { CREW_RATE } from '../sim/constants';
import type { Controls } from '../sim/sim';

/** Tight vang holds the leach: the mainsheet still eases, just more slowly. */
export function sheetWithVang(sheetIn: number, sheetOut: number, vang: number): { sheetIn: number; sheetOut: number } {
  const ease = 1 - 0.65 * clamp(vang, 0, 1);
  return { sheetIn: clamp(sheetIn, 0, 1), sheetOut: clamp(sheetOut, 0, 1) * ease };
}

/** Move one person in the boat frame. Starboard-positive meters. Holding still leaves them where they are. */
export function moveBody(pos: number, hikeOut: number, hikeIn: number, windward: number, dt: number): number {
  const side = windward || 1;
  let target = pos;
  let drive = 0;
  if (hikeOut >= hikeIn && hikeOut > 0.04) {
    target = side * 1.02;
    drive = hikeOut;
  } else if (hikeIn > 0.04) {
    target = -side * 0.42;
    drive = hikeIn;
  }
  if (drive <= 0) return pos;
  const step = Math.sign(target - pos) * drive * CREW_RATE * dt;
  const next = pos + step;
  if ((target - pos) * (target - next) <= 0) return clamp(target, -1.05, 1.05);
  return clamp(next, -1.05, 1.05);
}

/**
 * The sim still has one weight. Helm and crew share it as a center of mass,
 * driven with the same hike / move-in the singlehanded boat already uses.
 */
export function weightDrive(comStbd: number, simCrew: number, windward: number): { hike: number; moveIn: number } {
  const side = windward || 1;
  const err = (comStbd - simCrew) * side;
  if (err > 0.03) return { hike: clamp(err / 0.32, 0, 1), moveIn: 0 };
  if (err < -0.03) return { hike: 0, moveIn: clamp(-err / 0.32, 0, 1) };
  return { hike: 0, moveIn: 0 };
}

export function composeControls(rudder: number, sheetIn: number, sheetOut: number, hike: number, moveIn: number): Controls {
  return {
    rudder: clamp(rudder, -1, 1),
    sheetIn: clamp(sheetIn, 0, 1),
    sheetOut: clamp(sheetOut, 0, 1),
    hike: clamp(hike, 0, 1),
    moveIn: clamp(moveIn, 0, 1),
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
