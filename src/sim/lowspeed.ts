import { RUDDER_STALL } from './constants';
import { rudderForces } from './hydro';

/**
 * Low-speed behaviour used for docking. It does not add a second hull model.
 * Rudder force already falls with speed squared and is zero below a crawl,
 * because dynamic pressure is ½ρv². Carry is the coast after the sail is let
 * fly: quadratic hull drag sheds a given slice of speed over a shorter
 * distance when you are already moving fast. Drift is windage (and any tide
 * set on Simulation.currentX/Y) once the sail is no longer driving.
 */

/** Absolute yaw moment from a full-ish helm at this forward speed through the water. */
export function rudderAuthority(vFwd: number, delta = 0.5): number {
  return Math.abs(rudderForces(vFwd, 0, delta, RUDDER_STALL).yaw);
}

export function waterSpeed(vx: number, vy: number, currentX = 0, currentY = 0): number {
  return Math.hypot(vx - currentX, vy - currentY);
}

/** Direction the wind is blowing toward. */
export function downwind(windFrom: number): { x: number; y: number } {
  return { x: -Math.cos(windFrom), y: -Math.sin(windFrom) };
}
