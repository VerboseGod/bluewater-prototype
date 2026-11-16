/** Mast station the luff is tied to. +x is the bow. */
export const MAST_X = 0.95;
const FOOT = 2.32;
const TACK_Y = 0.92;
const HEAD_Y = 5.22;

export interface SailSample {
  x: number;
  y: number;
  z: number;
}

/**
 * One point on the sail. `u` runs luff to leech, `v` runs foot to head.
 * The clew follows the boom, aft and to leeward. Camber bellies the cloth
 * off that chord so the sail is not a flat board.
 */
export function sailPoint(
  u: number,
  v: number,
  boom: number,
  sheet: number,
  mode: string,
  time: number,
): SailSample {
  const tackX = MAST_X;
  const tackY = TACK_Y;
  const headX = MAST_X - 0.04;
  const headY = HEAD_Y;
  const clewX = MAST_X - Math.cos(boom) * FOOT;
  const clewZ = -Math.sin(boom) * FOOT;
  const footX = tackX + (clewX - tackX) * u;
  const footZ = clewZ * u;
  let x = footX + (headX - footX) * v;
  const y = tackY + (headY - tackY) * v;
  let z = footZ * (1 - v);
  const fill = mode === 'trimmed' ? 1 : mode === 'stalled' ? 0.55 : mode === 'aback' ? 0.15 : 0.08;
  const camber = (0.28 + 0.7 * (1 - Math.min(1, Math.max(0, sheet)))) * fill;
  const draft = Math.sin(Math.PI * Math.pow(Math.max(0, u), 0.72)) * Math.sin(Math.PI * v);
  const side = -Math.sign(boom || 1);
  z += side * draft * camber * (0.55 + 0.45 * (1 - v * 0.55));
  const luff = mode === 'luffing' || mode === 'aback' ? 1 : mode === 'stalled' ? 0.35 : 0.04;
  const luffW = Math.exp(-u * 6) * (0.2 + 0.8 * v);
  z += Math.sin(time * 15 + v * 10 + u * 4) * 0.05 * luff * luffW;
  x += Math.sin(time * 22 + v * 16) * 0.02 * luff * luffW;
  return { x, y, z };
}
