/**
 * Dinghy pose from water heights sampled on the hull. Pitch is bow-up.
 * Roll is port-up. The origin sits just above the fitted surface, and lifts
 * further when a crest would otherwise come through the cockpit.
 */
export interface HullHeights {
  bow: number;
  stern: number;
  cock: number;
  port: number;
  stbd: number;
}

export interface FloatPose {
  y: number;
  pitch: number;
  roll: number;
}

const LENGTH = 3.3;
const BEAM = 1.05;
/** Cockpit sample, metres aft of the mesh origin. */
const COCK_X = -0.45;
const FREEBOARD = 0.05;

export function hullFloat(h: HullHeights): FloatPose {
  const pitch = Math.atan2(h.bow - h.stern, LENGTH);
  const roll = Math.atan2(h.port - h.stbd, BEAM);
  const mid = (h.bow + h.stern) * 0.5;
  const planeCock = mid + Math.sin(pitch) * COCK_X;
  const half = Math.sin(roll) * BEAM * 0.42;
  const poke = Math.max(0, h.cock - planeCock, h.port - (planeCock + half), h.stbd - (planeCock - half));
  return { y: mid + poke + FREEBOARD, pitch, roll };
}
