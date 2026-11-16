import bathyFile from '../../data/herzliya/bathy.json';
import osmFile from '../../data/herzliya/osm.json';
import { ORIGIN, toLocal, type Ring } from './geo';

interface OsmGeom {
  lat: number;
  lon: number;
}

interface OsmElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  geometry?: OsmGeom[];
  tags?: Record<string, string>;
}

interface OsmFile {
  attribution: string;
  licence: string;
  retrieved: string;
  overpass: { elements: OsmElement[] };
}

interface BathyFile {
  source: string;
  licence: string;
  citation: string;
  width: number;
  height: number;
  originLon: number;
  originLat: number;
  lonStep: number;
  latStep: number;
  values: number[];
}

const osm = osmFile as unknown as OsmFile;
const bathy = bathyFile as unknown as BathyFile;

export interface Polyline {
  id: number;
  name: string;
  pts: Ring[];
  closed: boolean;
  length: number;
}

export interface Seamark {
  id: number;
  x: number;
  y: number;
  type: string;
  name: string;
  colour: string;
  character: string;
  period: number;
  lightHeight: number;
}

export interface BuildingFootprint {
  id: number;
  pts: Ring[];
  height: number;
}

export interface DepthGrid {
  width: number;
  height: number;
  originLon: number;
  originLat: number;
  lonStep: number;
  latStep: number;
  /** Elevation, metres, positive up. Voids repaired for sampling; raw stays in the file. */
  elevation: Float64Array;
}

export interface HarbourExtract {
  coastline: Polyline[];
  breakwaters: Polyline[];
  piers: Polyline[];
  marina: Polyline | null;
  buildings: BuildingFootprint[];
  seamarks: Seamark[];
  breakwaterSegments: number;
  depth: DepthGrid;
}

function tagsOf(el: OsmElement): Record<string, string> {
  return el.tags ?? {};
}

function ringOf(el: OsmElement): Ring[] {
  const geom = el.geometry ?? [];
  return geom.map((g) => toLocal(g.lat, g.lon, ORIGIN));
}

function asLine(el: OsmElement): Polyline | null {
  const pts = ringOf(el);
  if (pts.length < 2) return null;
  const closed = Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1;
  let length = 0;
  for (let i = 1; i < pts.length; i++) {
    length += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  const tags = tagsOf(el);
  return { id: el.id, name: tags.name ?? '', pts, closed, length };
}

function segmentsOf(lines: readonly Polyline[]): number {
  let n = 0;
  for (const line of lines) n += Math.max(0, line.pts.length - 1);
  return n;
}

function buildingHeight(tags: Record<string, string>): number {
  const levels = Number(tags['building:levels']);
  if (Number.isFinite(levels) && levels > 0) return levels * 3.2;
  return 9;
}

function repairElevation(values: readonly number[], width: number, height: number): Float64Array {
  const out = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) out[i] = values[i];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const v = out[row * width + col];
      if (v >= -80) continue;
      let sum = 0;
      let n = 0;
      for (let radius = 1; radius <= 4 && n === 0; radius++) {
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const rr = row + dy;
            const cc = col + dx;
            if (rr < 0 || cc < 0 || rr >= height || cc >= width) continue;
            const sample = values[rr * width + cc];
            if (sample < -80) continue;
            sum += sample;
            n += 1;
          }
        }
      }
      out[row * width + col] = n > 0 ? sum / n : -12;
    }
  }
  return out;
}

/** Parse the checked-in Overpass extract and the EMODnet grid. */
export function loadHarbourExtract(): HarbourExtract {
  const coastline: Polyline[] = [];
  const breakwaters: Polyline[] = [];
  const piers: Polyline[] = [];
  const buildings: BuildingFootprint[] = [];
  const seamarks: Seamark[] = [];
  let marina: Polyline | null = null;

  for (const el of osm.overpass.elements) {
    const tags = tagsOf(el);
    if (el.type === 'node' && tags['seamark:type']) {
      const local = toLocal(el.lat ?? 0, el.lon ?? 0, ORIGIN);
      seamarks.push({
        id: el.id,
        x: local.x,
        y: local.y,
        type: tags['seamark:type'],
        name: tags['seamark:name'] ?? tags.name ?? '',
        colour: tags['seamark:light:colour'] ?? '',
        character: tags['seamark:light:character'] ?? '',
        period: Number(tags['seamark:light:period']) || 0,
        lightHeight: Number(tags['seamark:light:height']) || 0,
      });
      continue;
    }
    if (el.type !== 'way') continue;
    const line = asLine(el);
    if (!line) continue;
    if (tags.natural === 'coastline') coastline.push(line);
    else if (tags.man_made === 'breakwater') breakwaters.push(line);
    else if (tags.man_made === 'pier') piers.push(line);
    else if (tags.leisure === 'marina') marina = line;
    else if (tags.building) {
      const pts = line.closed ? line.pts.slice(0, -1) : line.pts;
      if (pts.length >= 3) buildings.push({ id: el.id, pts, height: buildingHeight(tags) });
    }
    if (tags['seamark:type'] && el.type === 'way') {
      const mid = line.pts[Math.floor(line.pts.length / 2)];
      seamarks.push({
        id: el.id,
        x: mid.x,
        y: mid.y,
        type: tags['seamark:type'],
        name: tags.name ?? tags['seamark:name'] ?? '',
        colour: '',
        character: '',
        period: 0,
        lightHeight: 0,
      });
    }
  }

  return {
    coastline,
    breakwaters,
    piers,
    marina,
    buildings,
    seamarks,
    breakwaterSegments: segmentsOf(breakwaters),
    depth: {
      width: bathy.width,
      height: bathy.height,
      originLon: bathy.originLon,
      originLat: bathy.originLat,
      lonStep: bathy.lonStep,
      latStep: bathy.latStep,
      elevation: repairElevation(bathy.values, bathy.width, bathy.height),
    },
  };
}

export const EXTRACT_META = {
  osmAttribution: osm.attribution,
  osmLicence: osm.licence,
  osmRetrieved: osm.retrieved,
  bathySource: bathy.source,
  bathyLicence: bathy.licence,
  bathyCitation: bathy.citation,
};
