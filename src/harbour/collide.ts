import { classifyImpact, type ImpactClass } from '../dock/contact';
import { headingFwd } from '../sim/math';
import type { Simulation } from '../sim/sim';
import { distToSegment } from './geo';
import type { SolidSeg } from './world';

export interface CollideHit {
  touching: boolean;
  closing: number;
  hit: ImpactClass;
  visitor: boolean;
  visitorClosing: number;
}

const BOW = 1.7;
const STERN = 1.55;

/**
 * Push the hull off breakwaters and pontoons. Piers use the step-2 fender
 * class; rock does not.
 */
export function collideSolids(sim: Simulation, solids: readonly SolidSeg[], wasTouching: boolean): CollideHit {
  let touching = false;
  let closing = 0;
  let visitorClosing = 0;
  let visitor = false;
  let fenders = true;
  for (let pass = 0; pass < 2; pass++) {
    const pts = hullPoints(sim);
    for (const seg of solids) {
      for (const p of pts) {
        const hit = distToSegment(p.x, p.y, seg.x1, seg.y1, seg.x2, seg.y2);
        const overlap = seg.radius - hit.dist;
        if (overlap <= 0) continue;
        touching = true;
        if (seg.kind === 'visitor') visitor = true;
        if (seg.kind === 'breakwater') fenders = false;
        const nx = hit.nx || 0;
        const ny = hit.ny || 1;
        sim.x += nx * (overlap + 0.01);
        sim.y += ny * (overlap + 0.01);
        const inward = -(sim.vx * nx + sim.vy * ny);
        if (inward > 0) {
          sim.vx += nx * inward;
          sim.vy += ny * inward;
          if (inward > closing) closing = inward;
          if (seg.kind === 'visitor' && inward > visitorClosing) visitorClosing = inward;
        }
      }
    }
  }
  return {
    touching,
    closing,
    hit: wasTouching ? 'none' : classifyImpact(closing, fenders),
    visitor,
    visitorClosing,
  };
}

function hullPoints(sim: Simulation): { x: number; y: number }[] {
  const f = headingFwd(sim.heading);
  return [
    { x: sim.x, y: sim.y },
    { x: sim.x + f.x * BOW, y: sim.y + f.y * BOW },
    { x: sim.x - f.x * STERN, y: sim.y - f.y * STERN },
  ];
}
