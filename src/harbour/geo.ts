/** Local metres. Physics x is east, y is north, and true north is +y. */

export const ORIGIN = { lat: 32.163, lon: 34.794 };

const LAT_M = 111_320;

export function metresPerDegLon(lat: number): number {
  return LAT_M * Math.cos((lat * Math.PI) / 180);
}

export function toLocal(lat: number, lon: number, origin = ORIGIN): { x: number; y: number } {
  return {
    x: (lon - origin.lon) * metresPerDegLon(origin.lat),
    y: (lat - origin.lat) * LAT_M,
  };
}

export function toLatLon(x: number, y: number, origin = ORIGIN): { lat: number; lon: number } {
  return {
    lat: origin.lat + y / LAT_M,
    lon: origin.lon + x / metresPerDegLon(origin.lat),
  };
}

export interface Ring {
  x: number;
  y: number;
}

/** Even-odd fill. A repeated closing vertex does not change the result. */
export function pointInRing(x: number, y: number, ring: readonly Ring[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x;
    const yi = ring[i].y;
    const xj = ring[j].x;
    const yj = ring[j].y;
    const cross = (yi > y) !== (yj > y);
    if (cross && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function ringCentroid(ring: readonly Ring[]): Ring {
  let x = 0;
  let y = 0;
  const n = Math.max(1, ring.length);
  for (const p of ring) {
    x += p.x;
    y += p.y;
  }
  return { x: x / n, y: y / n };
}

export function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { dist: number; nx: number; ny: number; along: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy || 1;
  let along = ((px - x1) * dx + (py - y1) * dy) / l2;
  along = Math.max(0, Math.min(1, along));
  const qx = x1 + dx * along;
  const qy = y1 + dy * along;
  const ox = px - qx;
  const oy = py - qy;
  const dist = Math.hypot(ox, oy);
  if (dist < 1e-6) return { dist: 0, nx: 0, ny: 1, along };
  return { dist, nx: ox / dist, ny: oy / dist, along };
}
