import { wrapPi } from '../sim/math';
import type { Simulation } from '../sim/sim';
import { waterSpeed } from '../sim/lowspeed';
import { CLEAT, HALF_BEAM, MOOR_MS, MOOR_REACH } from './layout';

export function nearerFairlead(
  x: number,
  y: number,
  heading: number,
): { x: number; y: number; dist: number } {
  const sx = Math.sin(heading) * HALF_BEAM;
  const sy = -Math.cos(heading) * HALF_BEAM;
  const a = { x: x + sx, y: y + sy };
  const b = { x: x - sx, y: y - sy };
  const da = Math.hypot(a.x - CLEAT.x, a.y - CLEAT.y);
  const db = Math.hypot(b.x - CLEAT.x, b.y - CLEAT.y);
  return da <= db ? { x: a.x, y: a.y, dist: da } : { x: b.x, y: b.y, dist: db };
}

/** The line reaches about a metre and only when the boat is under half a knot. */
export function canMakeFast(distM: number, speedMs: number): boolean {
  return distM <= MOOR_REACH + 1e-6 && speedMs <= MOOR_MS + 1e-9;
}

export function mooringReadiness(sim: Simulation): { dist: number; speed: number; ok: boolean } {
  const lead = nearerFairlead(sim.x, sim.y, sim.heading);
  const speed = waterSpeed(sim.vx, sim.vy, sim.currentX, sim.currentY);
  return { dist: lead.dist, speed, ok: canMakeFast(lead.dist, speed) };
}

/** A short line to the cleat, once the throw has succeeded. */
export function holdMooring(sim: Simulation, dt: number): void {
  const lead = nearerFairlead(sim.x, sim.y, sim.heading);
  const dx = CLEAT.x - lead.x;
  const dy = CLEAT.y - lead.y;
  const dist = Math.hypot(dx, dy);
  const slack = 0.32;
  if (dist > slack) {
    const step = Math.min(dist - slack, dt * 1.4);
    sim.x += (dx / dist) * step;
    sim.y += (dy / dist) * step;
  }
  sim.vx *= Math.exp(-dt * 1.4);
  sim.vy *= Math.exp(-dt * 1.4);
  const east = Math.abs(wrapPi(sim.heading));
  const west = Math.abs(wrapPi(sim.heading - Math.PI));
  const along = east < west ? 0 : Math.PI;
  const err = wrapPi(along - sim.heading);
  sim.heading = wrapPi(sim.heading + err * Math.min(1, dt * 0.7));
  sim.yawRate *= 0.8;
}
