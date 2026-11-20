import { wrapPi } from '../sim/math';
import type { CourseGeom } from './course';
import { makeDepth, type DepthFns } from './depth';
import { distToSegment, ringCentroid, type Ring } from './geo';
import { loadHarbourExtract, type BuildingFootprint, type HarbourExtract, type Polyline, type Seamark } from './load';
import type { ShadowWall } from './windshadow';

export const PIER_WIDTH = 2.4;
export const BREAKWATER_MARGIN = 0.6;

export interface SolidSeg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Distance from the centre-line or edge that the hull may not cross. */
  radius: number;
  kind: 'breakwater' | 'pier' | 'visitor';
}

export interface CourseLayout extends CourseGeom {
  start: { x: number; y: number; heading: number };
  cleat: { x: number; y: number };
  berthAxis: number;
  alongside: { x: number; y: number; heading: number };
  /** Where the demo aims, a few metres off each practice mark. */
  aim: [{ x: number; y: number }, { x: number; y: number }];
  /** Inside the basin, west of the entrance mole, so the exit does not cross rock. */
  dogleg: { x: number; y: number };
  channel: { x: number; y: number };
  outside: { x: number; y: number };
  reenter: { x: number; y: number };
}

export interface HarbourWorld {
  extract: HarbourExtract;
  depth: DepthFns;
  walls: ShadowWall[];
  solids: SolidSeg[];
  basin: Ring[];
  lights: Seamark[];
  course: CourseLayout;
  buildings: BuildingFootprint[];
}

const DEFAULT_FROM = Math.PI;

function edges(pts: readonly Ring[], closed: boolean): { x1: number; y1: number; x2: number; y2: number }[] {
  const out = [];
  const n = pts.length;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    if (Math.hypot(b.x - a.x, b.y - a.y) < 0.4) continue;
    out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }
  return out;
}

function openPts(line: Polyline): Ring[] {
  const pts = line.pts;
  if (line.closed) return pts.slice(0, -1);
  return pts;
}

function mid(line: Polyline): Ring {
  const pts = line.pts;
  return pts[Math.floor(pts.length / 2)];
}

function longestMid(line: Polyline): Ring {
  let best = line.pts[0];
  let bestLen = -1;
  for (let i = 1; i < line.pts.length; i++) {
    const len = Math.hypot(line.pts[i].x - line.pts[i - 1].x, line.pts[i].y - line.pts[i - 1].y);
    if (len > bestLen) {
      bestLen = len;
      best = {
        x: (line.pts[i - 1].x + line.pts[i].x) / 2,
        y: (line.pts[i - 1].y + line.pts[i].y) / 2,
      };
    }
  }
  return best;
}

function axisOf(line: Polyline): { x: number; y: number; angle: number } {
  const a = line.pts[0];
  const b = line.pts[line.pts.length - 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len, angle: Math.atan2(dy, dx) };
}

function layHeading(from: Ring, to: Ring, windFrom: number): number {
  let heading = Math.atan2(to.y - from.y, to.x - from.x);
  const twa = wrapPi(windFrom - heading);
  if (Math.abs(twa) < 0.72) heading = wrapPi(windFrom - Math.sign(twa || 1) * 0.95);
  return heading;
}

function buildCourse(extract: HarbourExtract, depth: DepthFns): CourseLayout {
  const lights = extract.seamarks.filter((s) => s.type === 'light_minor');
  const red = lights.find((s) => s.colour === 'red') ?? lights[0];
  const green = lights.find((s) => s.colour === 'green') ?? lights[1] ?? lights[0];
  const ox = green.x - red.x;
  const oy = green.y - red.y;
  const olen = Math.hypot(ox, oy) || 1;
  const outX = ox / olen;
  const outY = oy / olen;
  let latX = outY;
  let latY = -outX;
  if (latX < 0) {
    latX = -latX;
    latY = -latY;
  }
  const gate = { x: (red.x + green.x) / 2, y: (red.y + green.y) / 2, ox: outX, oy: outY };

  const place = (along: number, side: number) => {
    let a = along;
    let s = side;
    for (let i = 0; i < 14; i++) {
      const x = gate.x + outX * a + latX * s;
      const y = gate.y + outY * a + latY * s;
      if (!depth.insideMarina(x, y) && !depth.insideBreakwater(x, y) && depth.depthAt(x, y) > 3) {
        return { x, y };
      }
      a += 12;
      s += Math.sign(side || 1) * 6;
    }
    return { x: gate.x + outX * a + latX * s, y: gate.y + outY * a + latY * s };
  };

  const markA = place(58, 16);
  const markB = place(118, -14);
  const basin = extract.marina ? ringCentroid(openPts(extract.marina)) : { x: 0, y: 0 };
  const visitors = extract.piers.find((p) => p.name === 'Visitors') ?? extract.piers[0];
  const visitorMid = longestMid(visitors);
  const axis = axisOf(visitors);
  let nx = -axis.y;
  let ny = axis.x;
  if ((basin.x - visitorMid.x) * nx + (basin.y - visitorMid.y) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  const cleat = { x: visitorMid.x + nx * (PIER_WIDTH / 2), y: visitorMid.y + ny * (PIER_WIDTH / 2) };
  const alongside = {
    x: cleat.x + nx * 1.15,
    y: cleat.y + ny * 1.15,
    heading: axis.angle,
  };

  const ranked = extract.piers
    .filter((p) => p !== visitors)
    .map((p) => ({ p, m: mid(p) }))
    .sort((a, b) => Math.hypot(a.m.x - gate.x, a.m.y - gate.y) - Math.hypot(b.m.x - gate.x, b.m.y - gate.y));

  const clear = (x: number, y: number, stepX: number, stepY: number) => {
    for (let i = 0; i < 16; i++) {
      const px = x + stepX * i;
      const py = y + stepY * i;
      if (depth.insideMarina(px, py) && !depth.insideBreakwater(px, py) && depth.depthAt(px, py) > 2) {
        return { x: px, y: py };
      }
    }
    return { x, y };
  };
  // The entrance mole lies across a straight line from the berths to the gate.
  const dogleg = clear(red.x - 50, red.y - 46, -4, -3);
  const channel = clear(red.x - 28, red.y + 35, -4, 4);

  let start = { x: alongside.x + 30, y: alongside.y - 40, heading: 0 };
  for (const cand of ranked) {
    const vx = basin.x - cand.m.x;
    const vy = basin.y - cand.m.y;
    const vl = Math.hypot(vx, vy) || 1;
    const spot = { x: cand.m.x + (vx / vl) * 5.5, y: cand.m.y + (vy / vl) * 5.5 };
    if (!depth.insideMarina(spot.x, spot.y) || depth.insideBreakwater(spot.x, spot.y)) continue;
    if (Math.hypot(spot.x - cleat.x, spot.y - cleat.y) < 25) continue;
    start = { ...spot, heading: layHeading(spot, dogleg, DEFAULT_FROM) };
    break;
  }

  const aim: [{ x: number; y: number }, { x: number; y: number }] = [markA, markB];

  return {
    berth: { x: start.x, y: start.y },
    gate,
    marks: [markA, markB],
    leaveDistance: 14,
    markRadius: 24,
    start,
    cleat,
    berthAxis: axis.angle,
    alongside,
    aim,
    dogleg,
    channel,
    outside: { x: gate.x + outX * 28, y: gate.y + outY * 28 },
    reenter: dogleg,
  };
}

function buildWalls(extract: HarbourExtract): ShadowWall[] {
  const walls: ShadowWall[] = [];
  for (const line of extract.breakwaters) {
    const height = line.length > 200 ? 4.5 : 3;
    for (const e of edges(line.closed ? openPts(line) : line.pts, line.closed)) {
      walls.push({ ...e, height });
    }
  }
  for (const b of extract.buildings) {
    for (const e of edges(b.pts, true)) walls.push({ ...e, height: b.height });
  }
  return walls;
}

function buildSolids(extract: HarbourExtract, visitors: Polyline | undefined): SolidSeg[] {
  const solids: SolidSeg[] = [];
  for (const line of extract.breakwaters) {
    const pts = line.closed ? openPts(line) : line.pts;
    for (const e of edges(pts, line.closed)) {
      solids.push({ ...e, radius: 1.15, kind: 'breakwater' });
    }
  }
  for (const line of extract.piers) {
    const kind = line === visitors ? 'visitor' : 'pier';
    for (const e of edges(line.pts, false)) {
      solids.push({ ...e, radius: 1.45, kind });
    }
  }
  return solids;
}

function simplifyBasin(marina: Polyline | null): Ring[] {
  if (!marina) return [];
  const pts = openPts(marina);
  const step = Math.max(1, Math.ceil(pts.length / 42));
  const out: Ring[] = [];
  for (let i = 0; i < pts.length; i += step) out.push(pts[i]);
  return out;
}

export function buildWorld(): HarbourWorld {
  const extract = loadHarbourExtract();
  const depth = makeDepth(extract.marina, extract.breakwaters, extract.coastline, extract.depth);
  const entrance = extract.seamarks.filter((s) => s.type === 'light_minor');
  const red = entrance.find((s) => s.colour === 'red');
  const green = entrance.find((s) => s.colour === 'green');
  if (red && green) {
    const rawDepth = depth.depthAt;
    depth.depthAt = (x, y) => {
      if (depth.insideBreakwater(x, y)) return 0;
      const d = rawDepth(x, y);
      if (d >= 2) return d;
      // The 115 m grid reads 0 across the entrance. Treat a corridor between the lights as channel water.
      if (distToSegment(x, y, red.x, red.y, green.x, green.y).dist < 48) return 4.2;
      return d;
    };
  }
  const visitors = extract.piers.find((p) => p.name === 'Visitors');
  return {
    extract,
    depth,
    walls: buildWalls(extract),
    solids: buildSolids(extract, visitors),
    basin: simplifyBasin(extract.marina),
    lights: extract.seamarks.filter((s) => s.type === 'light_minor'),
    course: buildCourse(extract, depth),
    buildings: extract.buildings,
  };
}

export const herzliya = buildWorld();
