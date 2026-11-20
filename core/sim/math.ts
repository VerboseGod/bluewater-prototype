export interface Vec2 {
  x: number;
  y: number;
}

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;
/** Knots per (m/s). */
export const KT = 1.9438444924406;

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function wrapPi(a: number): number {
  const t = Math.PI * 2;
  let x = (a + Math.PI) % t;
  if (x < 0) x += t;
  return x - Math.PI;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function len(a: Vec2): number {
  return Math.hypot(a.x, a.y);
}

/** Heading 0 faces +x, increasing counter-clockwise. */
export function headingFwd(heading: number): Vec2 {
  return { x: Math.cos(heading), y: Math.sin(heading) };
}

/** Starboard, clockwise from the bow. */
export function headingStbd(heading: number): Vec2 {
  return { x: Math.sin(heading), y: -Math.cos(heading) };
}

/** True if the short step from `prev` to `next` swept across `target`. */
export function passedAngle(prev: number, next: number, target: number): boolean {
  const d = wrapPi(next - prev);
  if (Math.abs(d) < 1e-9) return false;
  const a = wrapPi(target - prev);
  if (d > 0) return a >= -1e-6 && a <= d + 1e-6;
  return a <= 1e-6 && a >= d - 1e-6;
}
