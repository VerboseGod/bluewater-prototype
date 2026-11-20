import {
  BOOM_IN,
  BOOM_OUT,
  LUFF_AOA,
  OPT_AOA,
  RHO_AIR,
  SAIL_AREA,
  TWIST,
} from './constants';
import { clamp, smoothstep } from './math';

export type SailMode = 'luffing' | 'trimmed' | 'stalled' | 'aback';

export interface SailForce {
  drive: number;
  side: number;
  cl: number;
  cd: number;
  aoa: number;
  aback: boolean;
  mode: SailMode;
}

export function boomForSheet(sheet: number): number {
  return BOOM_IN + (1 - clamp(sheet, 0, 1)) * (BOOM_OUT - BOOM_IN);
}

export function sheetForBoom(boom: number): number {
  const t = clamp((Math.abs(boom) - BOOM_IN) / (BOOM_OUT - BOOM_IN), 0, 1);
  return 1 - t;
}

/** Sheet-in fraction that puts the sail near the best angle of attack. */
export function suggestedSheet(awaAbs: number): number {
  const desired = clamp(awaAbs - OPT_AOA - TWIST, BOOM_IN, BOOM_OUT);
  return sheetForBoom(desired);
}

export function sailAngleOfAttack(awa: number, boom: number): { aoa: number; aback: boolean } {
  const wrongSide =
    Math.abs(awa) > 0.12 &&
    Math.abs(boom) > 0.08 &&
    Math.sign(boom) !== Math.sign(awa);
  if (wrongSide) {
    return { aoa: Math.abs(awa) + Math.abs(boom), aback: true };
  }
  return { aoa: Math.abs(awa) - Math.abs(boom) - TWIST, aback: false };
}

export function sailCoefficients(aoa: number, stallAngle: number): { cl: number; cd: number } {
  if (aoa <= 0.02) {
    return { cl: 0, cd: 0.015 * clamp(aoa / 0.02, 0, 1) };
  }
  if (aoa < stallAngle) {
    const fill = smoothstep(0.05, LUFF_AOA + 0.06, aoa);
    const cl = Math.min(1.52, 4.9 * Math.max(0, aoa - 0.045)) * fill;
    const cd = (0.03 + 0.1 * cl * cl) * (0.3 + 0.7 * fill);
    return { cl, cd };
  }
  const clStall = Math.min(1.52, 4.9 * Math.max(0, stallAngle - 0.045));
  const ex = aoa - stallAngle;
  const cl = Math.max(0, clStall * Math.exp(-ex / 0.24) * Math.max(0, Math.cos(ex * 0.85)));
  const cd = 0.1 + 1.22 * Math.sin(Math.min(aoa, Math.PI / 2)) ** 2;
  return { cl, cd };
}

/**
 * Sail force in boat axes.
 * `drive` is forward-positive. `side` is starboard-positive.
 * Positive `awa` means the apparent wind is coming from the port side.
 */
export function sailForces(
  awa: number,
  boom: number,
  aws: number,
  heel: number,
  stallAngle: number,
): SailForce {
  const { aoa, aback } = sailAngleOfAttack(awa, boom);
  const { cl, cd } = sailCoefficients(aback ? Math.min(aoa, 1.2) : Math.max(0, aoa), stallAngle);
  const q = 0.5 * RHO_AIR * aws * aws * SAIL_AREA;
  const heelAbs = Math.abs(heel);
  const cosH = Math.cos(heelAbs);
  const spill =
    Math.max(0.22, cosH) *
    (heelAbs > 0.21 ? Math.max(0.42, 1 - (heelAbs - 0.21) * 1.25) : 1);
  const lift = q * cl * spill;
  const drag = q * cd * Math.max(0.3, cosH);
  const beta = Math.abs(awa);
  let drive = lift * Math.sin(beta) - drag * Math.cos(beta);
  let leeward = lift * Math.cos(beta) + drag * Math.sin(beta);
  if (aback) {
    drive = -Math.abs(drag) * 0.7 - Math.abs(lift) * 0.2;
    leeward = -Math.abs(leeward) * 0.4;
  }
  const sideSign = Math.sign(awa) || Math.sign(boom) || 1;
  const mode: SailMode = aback
    ? 'aback'
    : aoa < LUFF_AOA
      ? 'luffing'
      : aoa > stallAngle
        ? 'stalled'
        : 'trimmed';
  return { drive, side: sideSign * leeward, cl, cd, aoa, aback, mode };
}
