import { KT, wrapPi } from '../sim/math';

/** Harbour geometry in metres. Physics x is east, y is north. */

export interface Aabb {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** South face is the berth. Boats come alongside from the south. */
export const PONTOON: Aabb = { minX: -4, maxX: 16, minY: 7, maxY: 9.2 };
export const FINGER: Aabb = { minX: 15.2, maxX: 16.5, minY: 3.2, maxY: 7 };
export const BREAKWATER_N: Aabb = { minX: -8, maxX: 20, minY: 11.2, maxY: 13.4 };
export const BREAKWATER_E: Aabb = { minX: 18.2, maxX: 20.2, minY: 1.5, maxY: 11.2 };

export const SOLIDS: readonly Aabb[] = [PONTOON, FINGER, BREAKWATER_N, BREAKWATER_E];

/** Cleat on the south face, where the mooring line is made fast. */
export const CLEAT = { x: 5, y: PONTOON.minY };

export const BUOY = { x: 11.6, y: 2.4, r: 0.55 };

export const DEPTH = 2;
export const BOW = 1.9;
export const STERN = 1.75;
export const HALF_BEAM = 0.64;
/** Soft standoff so the topsides meet rubber, not the concrete edge. */
export const FENDER = 0.16;

export const ALONGSIDE = {
  x: CLEAT.x,
  y: PONTOON.minY - (HALF_BEAM + FENDER) - 0.02,
};

/**
 * South of the face, heading a little north of east. With the offshore wind
 * this is a beam reach along the pontoon, the approach the demo sails.
 */
export const START = { x: -1.7, y: 5.55, heading: 0.18, vx: 1.55, sheet: 0, boom: 1.35 };

export const MOOR_REACH = 1;
export const MOOR_KN = 0.5;
export const MOOR_MS = MOOR_KN / KT;

/** Scope below this does not bite. 5:1 is a proper dinghy scope. */
export const MIN_SCOPE = 3;
export const GOOD_SCOPE = 5;
/** Through-water speed above this and the flukes skip. */
export const MAX_SET_SPEED = 0.45;

/** About 0.3 kn, east along the pontoon. */
export const TIDE_MS = 0.3 / KT;

export const DOCK_WIND = 5.66;

export const WINDS = [
  { id: 'offshore', label: 'Offshore', from: Math.PI / 2 },
  { id: 'onshore', label: 'Onshore', from: -Math.PI / 2 },
  { id: 'along', label: 'Along the pontoon', from: Math.PI },
] as const;

export type WindId = (typeof WINDS)[number]['id'];

export function bowOf(x: number, y: number, heading: number): { x: number; y: number } {
  return { x: x + Math.cos(heading) * BOW, y: y + Math.sin(heading) * BOW };
}

/** Degrees off the east-west line of the pontoon. Zero means alongside. */
export function alongsideAngleDeg(heading: number): number {
  const toEast = Math.abs(wrapPi(heading));
  const toWest = Math.abs(wrapPi(heading - Math.PI));
  return (Math.min(toEast, toWest) * 180) / Math.PI;
}
