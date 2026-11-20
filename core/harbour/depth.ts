import { distToSegment, pointInRing, toLatLon, type Ring } from './geo';
import type { DepthGrid, Polyline } from './load';

/** Assumed dredged depth inside the basin. Not a charted sounding. */
export const DREDGED_DEPTH = 3.5;
/** The coarse grid does not resolve the beach, so the last stretch is ramped. */
export const SHORE_RAMP_M = 40;

export interface DepthFns {
  depthAt: (x: number, y: number) => number;
  insideMarina: (x: number, y: number) => boolean;
  insideBreakwater: (x: number, y: number) => boolean;
}

export function makeDepth(marina: Polyline | null, breakwaters: readonly Polyline[], coast: readonly Polyline[], grid: DepthGrid): DepthFns {
  const marinaRing = marina ? openRing(marina) : [];
  const rocks = breakwaters.filter((b) => b.closed).map((b) => openRing(b));
  const coastSegs = coast.flatMap((line) => segments(line.pts));
  const waterSign = coastSign(coastSegs);

  const insideMarina = (x: number, y: number) => marinaRing.length >= 3 && pointInRing(x, y, marinaRing);
  const insideBreakwater = (x: number, y: number) => rocks.some((ring) => pointInRing(x, y, ring));

  const depthAt = (x: number, y: number): number => {
    if (insideBreakwater(x, y)) return 0;
    if (insideMarina(x, y)) return DREDGED_DEPTH;
    let depth = bathyDepth(grid, x, y);
    const shore = nearestShore(x, y, coastSegs);
    if (shore) {
      const waterSide = shore.side * waterSign > 0;
      if (!waterSide) return 0;
      if (shore.dist < SHORE_RAMP_M) {
        const ramp = (shore.dist / SHORE_RAMP_M) * depth;
        depth = Math.min(depth, ramp);
      }
    }
    return depth;
  };

  return { depthAt, insideMarina, insideBreakwater };
}

function openRing(line: Polyline): Ring[] {
  const pts = line.pts;
  if (pts.length > 1 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1) {
    return pts.slice(0, -1);
  }
  return pts;
}

function segments(pts: readonly Ring[]): { x1: number; y1: number; x2: number; y2: number }[] {
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    out.push({ x1: pts[i - 1].x, y1: pts[i - 1].y, x2: pts[i].x, y2: pts[i].y });
  }
  return out;
}

/** +1 when "left of the coastline" is water, learned from a point offshore to the west. */
function coastSign(segs: { x1: number; y1: number; x2: number; y2: number }[]): number {
  const probe = nearestShore(-500, 0, segs);
  if (!probe) return -1;
  return probe.side >= 0 ? 1 : -1;
}

function nearestShore(
  x: number,
  y: number,
  segs: { x1: number; y1: number; x2: number; y2: number }[],
): { dist: number; side: number } | null {
  let best: { dist: number; side: number } | null = null;
  for (const s of segs) {
    const hit = distToSegment(x, y, s.x1, s.y1, s.x2, s.y2);
    const dx = s.x2 - s.x1;
    const dy = s.y2 - s.y1;
    const left = -dy * (x - (s.x1 + dx * hit.along)) + dx * (y - (s.y1 + dy * hit.along));
    const side = left >= 0 ? 1 : -1;
    if (!best || hit.dist < best.dist) best = { dist: hit.dist, side };
  }
  return best;
}

function bathyDepth(grid: DepthGrid, x: number, y: number): number {
  const { lat, lon } = toLatLon(x, y);
  const col = (lon - grid.originLon) / grid.lonStep;
  const row = (lat - grid.originLat) / grid.latStep;
  if (col < 0 || row < 0 || col > grid.width - 1 || row > grid.height - 1) {
    return x < 0 ? 12 : 0;
  }
  const c0 = Math.floor(col);
  const r0 = Math.floor(row);
  const c1 = Math.min(grid.width - 1, c0 + 1);
  const r1 = Math.min(grid.height - 1, r0 + 1);
  const tx = col - c0;
  const ty = row - r0;
  const e00 = grid.elevation[r0 * grid.width + c0];
  const e10 = grid.elevation[r0 * grid.width + c1];
  const e01 = grid.elevation[r1 * grid.width + c0];
  const e11 = grid.elevation[r1 * grid.width + c1];
  const elevation = e00 * (1 - tx) * (1 - ty) + e10 * tx * (1 - ty) + e01 * (1 - tx) * ty + e11 * tx * ty;
  return elevation < 0 ? -elevation : 0;
}
