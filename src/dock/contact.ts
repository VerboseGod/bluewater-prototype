import { headingFwd, headingStbd } from '../sim/math';
import type { Simulation } from '../sim/sim';
import { BOW, FENDER, HALF_BEAM, SOLIDS, STERN, type Aabb } from './layout';

export type ImpactClass = 'none' | 'gentle' | 'hard';

/** Closing speed below this is resting contact, not a bump. */
const REST = 0.08;
/** With fenders, under half a metre per second is a bump. Bare topsides are less forgiving. */
export const GENTLE_WITH_FENDERS = 0.5;
export const GENTLE_BARE = 0.32;

export function classifyImpact(closingMs: number, fenders: boolean): ImpactClass {
  if (closingMs < REST) return 'none';
  const limit = fenders ? GENTLE_WITH_FENDERS : GENTLE_BARE;
  return closingMs < limit ? 'gentle' : 'hard';
}

interface Vec {
  x: number;
  y: number;
}

function hullCorners(sim: Simulation, halfBeam: number): Vec[] {
  const f = headingFwd(sim.heading);
  const s = headingStbd(sim.heading);
  const out: Vec[] = [];
  for (const along of [BOW, -STERN]) {
    for (const beam of [halfBeam, -halfBeam]) {
      out.push({
        x: sim.x + f.x * along + s.x * beam,
        y: sim.y + f.y * along + s.y * beam,
      });
    }
  }
  return out;
}

function boxCorners(box: Aabb): Vec[] {
  return [
    { x: box.minX, y: box.minY },
    { x: box.maxX, y: box.minY },
    { x: box.maxX, y: box.maxY },
    { x: box.minX, y: box.maxY },
  ];
}

function project(pts: Vec[], ax: number, ay: number): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const p of pts) {
    const d = p.x * ax + p.y * ay;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return { min, max };
}

/**
 * Push the hull out of one box. Returns the closing speed, or null when the
 * hull is clear. Fenders add a little beam so the wood never meets the concrete.
 */
function separate(sim: Simulation, box: Aabb, fenders: boolean): number | null {
  const half = HALF_BEAM + (fenders ? FENDER : 0);
  const hull = hullCorners(sim, half);
  const solid = boxCorners(box);
  const hx = (hull[0].x + hull[1].x + hull[2].x + hull[3].x) / 4;
  const hy = (hull[0].y + hull[1].y + hull[2].y + hull[3].y) / 4;
  const bx = (box.minX + box.maxX) / 2;
  const by = (box.minY + box.maxY) / 2;
  const raw = [
    { x: hull[1].x - hull[0].x, y: hull[1].y - hull[0].y },
    { x: hull[2].x - hull[0].x, y: hull[2].y - hull[0].y },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
  ];
  let best = Infinity;
  let nx = 0;
  let ny = 0;
  for (const e of raw) {
    const len = Math.hypot(e.x, e.y) || 1;
    const ax = e.x / len;
    const ay = e.y / len;
    const a = project(hull, ax, ay);
    const b = project(solid, ax, ay);
    const overlap = Math.min(a.max, b.max) - Math.max(a.min, b.min);
    if (overlap <= 0) return null;
    if (overlap < best - 1e-6) {
      best = overlap;
      const sign = Math.sign((hx - bx) * ax + (hy - by) * ay) || 1;
      nx = ax * sign;
      ny = ay * sign;
    }
  }
  if (!Number.isFinite(best)) return null;
  const outward = sim.vx * nx + sim.vy * ny;
  const closing = Math.max(0, -outward);
  sim.x += nx * (best + 0.004);
  sim.y += ny * (best + 0.004);
  if (outward < 0) {
    const hard = classifyImpact(closing, fenders) === 'hard';
    const e = hard ? 0.14 : 0.03;
    sim.vx -= (1 + e) * outward * nx;
    sim.vy -= (1 + e) * outward * ny;
    if (hard) sim.yawRate += (sim.vy * nx - sim.vx * ny) * 0.015;
  }
  return closing;
}

export function resolveContact(
  sim: Simulation,
  wasTouching: boolean,
  fenders = true,
): { touching: boolean; closing: number; hit: ImpactClass } {
  let touching = false;
  let closing = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (const box of SOLIDS) {
      const c = separate(sim, box, fenders);
      if (c == null) continue;
      touching = true;
      if (c > closing) closing = c;
    }
  }
  const hit = wasTouching ? 'none' : classifyImpact(closing, fenders);
  return { touching, closing, hit };
}
