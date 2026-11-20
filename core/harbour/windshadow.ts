import type { WindSample } from '../sim/wind';
import { wrapPi } from '../sim/math';

export interface ShadowWall {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  height: number;
}

export interface Shadow {
  /** 1 in clear air, lower in the lee. */
  factor: number;
  /** Added to the "wind from" angle, radians. */
  shift: number;
}

/**
 * Breakwaters and buildings shelter the lee. The shadow length and the
 * deficit both grow with height and fall off with distance downwind.
 * Upwind of a wall the factor stays 1.
 */
export function shadowAt(x: number, y: number, from: number, walls: readonly ShadowWall[]): Shadow {
  const ux = Math.cos(from);
  const uy = Math.sin(from);
  let best = 0;
  let shift = 0;
  for (const w of walls) {
    if (w.height < 0.5) continue;
    const hit = raySegment(x, y, ux, uy, w.x1, w.y1, w.x2, w.y2);
    if (hit == null) continue;
    const reach = w.height * 16;
    if (hit.t <= 0.4 || hit.t > reach) continue;
    const near = w.height / (w.height + hit.t * 0.55);
    const fade = 1 - hit.t / reach;
    const strength = Math.max(0, Math.min(1, near * fade));
    if (strength > best) {
      best = strength;
      const across = hit.u - 0.5;
      shift = strength * (0.22 * Math.sin(hit.u * Math.PI) + across * 0.36);
    }
  }
  return { factor: 1 - 0.82 * best, shift };
}

export function applyWindShadow(sample: WindSample, x: number, y: number, walls: readonly ShadowWall[]): WindSample {
  const shadow = shadowAt(x, y, sample.from, walls);
  if (shadow.factor > 0.995 && Math.abs(shadow.shift) < 0.005) return sample;
  const from = wrapPi(sample.from + shadow.shift);
  const speed = sample.speed * shadow.factor;
  return {
    vel: { x: -Math.cos(from) * speed, y: -Math.sin(from) * speed },
    speed,
    from,
    factor: sample.factor * shadow.factor,
  };
}

function raySegment(
  px: number,
  py: number,
  dx: number,
  dy: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { t: number; u: number } | null {
  const rx = x2 - x1;
  const ry = y2 - y1;
  const den = dx * ry - dy * rx;
  if (Math.abs(den) < 1e-8) return null;
  const t = ((x1 - px) * ry - (y1 - py) * rx) / den;
  const u = ((x1 - px) * dy - (y1 - py) * dx) / den;
  if (t < 0 || u < 0 || u > 1) return null;
  return { t, u };
}
