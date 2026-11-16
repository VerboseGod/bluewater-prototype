import {
  BOARD_AR,
  BOARD_AREA,
  BOARD_CLA,
  BOARD_STALL,
  G,
  HULL_DRAG_LIN,
  HULL_DRAG_QUAD,
  HULL_HUMP,
  PLANING_DROP,
  RHO_WATER,
  RUDDER_AREA,
  RUDDER_LEVER,
  WATERLINE,
} from './constants';
import { clamp, wrapPi } from './math';

export interface HydroForce {
  fwd: number;
  stbd: number;
}

/**
 * Hull and centreboard. Lift stalls when the leeway angle is large, so a
 * boat pointed inside the no-go slips sideways instead of building speed.
 * A wave-making hump sits near hull speed; once the boat is planing the
 * hump is left behind and displacement drag steps down.
 */
export function hullForces(
  vFwd: number,
  vStbd: number,
  heel: number,
  planing: boolean,
): HydroForce {
  const v = Math.hypot(vFwd, vStbd);
  if (v < 0.04) return { fwd: 0, stbd: 0 };
  const uF = vFwd / v;
  const uS = vStbd / v;
  const leeway = Math.atan2(vStbd, vFwd);

  const froude = Math.abs(vFwd) / Math.sqrt(G * WATERLINE);
  const hump = Math.exp(-((froude - 0.5) ** 2) / (2 * 0.055 * 0.055));
  let drag = HULL_DRAG_LIN * v + HULL_DRAG_QUAD * v * v + HULL_HUMP * v * v * hump;
  const heelAbs = Math.abs(heel);
  if (heelAbs > 0.19) {
    drag *= 1 + ((heelAbs - 0.19) / 0.32) ** 2;
  }
  if (planing) {
    // Step off the displacement hump once the hull is planing.
    drag *= PLANING_DROP;
  }

  let cl = BOARD_CLA * leeway;
  let cdI = (cl * cl) / (Math.PI * BOARD_AR);
  if (Math.abs(leeway) > BOARD_STALL) {
    const ex = Math.abs(leeway) - BOARD_STALL;
    cl = Math.sign(leeway) * BOARD_CLA * BOARD_STALL * Math.exp(-ex / 0.38);
    const ramp = clamp(ex / 0.55, 0, 1);
    const flat = 0.28 + 0.85 * Math.sin(Math.min(Math.abs(leeway), 1.45)) ** 2;
    cdI = cdI * (1 - ramp) + flat * ramp;
  }
  const q = 0.5 * RHO_WATER * v * v * BOARD_AREA;
  const lift = q * cl;
  const d = drag + q * cdI;
  return {
    fwd: -d * uF + lift * uS,
    stbd: -d * uS - lift * uF,
  };
}

export interface RudderForce extends HydroForce {
  yaw: number;
  aoa: number;
  stalled: boolean;
}

/**
 * Rudder in the flow. `delta` > 0 yaws the bow to starboard when the boat
 * is moving forward. Past the stall angle, lift collapses and drag rises,
 * so a large deflection is a brake. When `vFwd` is negative the same
 * deflection yaws the other way.
 */
export function rudderForces(vFwd: number, vStbd: number, delta: number, stallAngle: number): RudderForce {
  const sp = Math.hypot(vFwd, vStbd);
  if (sp < 0.06) return { fwd: 0, stbd: 0, yaw: 0, aoa: 0, stalled: false };

  // Leeway relative to the direction of travel. Sign flips when going astern
  // so the same blade angle produces the opposite yaw.
  const travel = Math.sign(vFwd) || 1;
  // The rudder only sees part of the hull's leeway; the rest would round the boat up too hard.
  const leeway = Math.atan2(vStbd, Math.max(0.2, Math.abs(vFwd))) * travel * 0.3;
  const aoa = wrapPi(delta - leeway);
  const stalled = Math.abs(aoa) > stallAngle;
  let cl = aoa * 2.05;
  let cd = 0.04 + 0.95 * cl * cl;
  if (stalled) {
    const ex = Math.abs(aoa) - stallAngle;
    cl = Math.sign(aoa) * stallAngle * 0.9 * Math.exp(-ex / 0.48);
    cd = 0.34 + 1.35 * Math.sin(Math.min(Math.abs(aoa), 1.4)) ** 2;
  }
  const q = 0.5 * RHO_WATER * sp * sp * RUDDER_AREA;
  const uF = vFwd / sp;
  const uS = vStbd / sp;
  const drag = cd * q;
  // Positive AoA pushes the stern to starboard while there is forward flow,
  // which yaws the bow to starboard. Astern, travel < 0 and the stern force flips.
  const liftStbd = travel * cl * q;
  const fwd = -drag * uF;
  const stbd = -drag * uS + liftStbd;
  return { fwd, stbd, yaw: -stbd * RUDDER_LEVER, aoa, stalled };
}
