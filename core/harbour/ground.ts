import type { Simulation } from '../sim/sim';

/** Dinghy with the board down. Shallower than this and the boat stops. */
export const DRAFT = 0.9;

export interface GroundHit {
  grounded: boolean;
  fresh: boolean;
}

/** Stop the boat when the water is shallower than the draft. */
export function applyGrounding(sim: Simulation, depth: number, wasGrounded: boolean, draft = DRAFT): GroundHit {
  if (depth >= draft) return { grounded: false, fresh: false };
  sim.vx = 0;
  sim.vy = 0;
  sim.yawRate *= 0.2;
  return { grounded: true, fresh: !wasGrounded };
}
