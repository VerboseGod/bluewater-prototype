import scenarios from '../data/scenarios.json';
import { KT, wrapPi } from '../sim/math';

/** Harbour geometry in metres. Physics x is east, y is north. Numbers come from core/data/scenarios.json. */

export interface Aabb {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const dock = scenarios.dock;

/** South face is the berth. Boats come alongside from the south. */
export const PONTOON: Aabb = dock.pontoon;
export const FINGER: Aabb = dock.finger;
export const BREAKWATER_N: Aabb = dock.breakwaterN;
export const BREAKWATER_E: Aabb = dock.breakwaterE;

export const SOLIDS: readonly Aabb[] = [PONTOON, FINGER, BREAKWATER_N, BREAKWATER_E];

/** Cleat on the south face, where the mooring line is made fast. */
export const CLEAT = { x: dock.cleatX, y: PONTOON.minY };

export const BUOY = dock.buoy;

export const DEPTH = dock.depth;
export const BOW = dock.bow;
export const STERN = dock.stern;
export const HALF_BEAM = dock.halfBeam;
/** Soft standoff so the topsides meet rubber, not the concrete edge. */
export const FENDER = dock.fender;

export const ALONGSIDE = {
  x: CLEAT.x,
  y: PONTOON.minY - (HALF_BEAM + FENDER) - dock.alongsideGap,
};

/**
 * South of the face, heading a little north of east. With the offshore wind
 * this is a beam reach along the pontoon, the approach the demo sails.
 */
export const START = dock.start;

export const MOOR_REACH = dock.moorReach;
export const MOOR_KN = dock.moorKn;
export const MOOR_MS = MOOR_KN / KT;

/** Scope below this does not bite. 5:1 is a proper dinghy scope. */
export const MIN_SCOPE = dock.minScope;
export const GOOD_SCOPE = dock.goodScope;
/** Through-water speed above this and the flukes skip. */
export const MAX_SET_SPEED = dock.maxSetSpeed;

/** About 0.3 kn, east along the pontoon. */
export const TIDE_MS = dock.tideKn / KT;

export const DOCK_WIND = dock.windSpeed;

export const WINDS = dock.winds;

export type WindId = 'offshore' | 'onshore' | 'along';

export function bowOf(x: number, y: number, heading: number): { x: number; y: number } {
  return { x: x + Math.cos(heading) * BOW, y: y + Math.sin(heading) * BOW };
}

/** Degrees off the pontoon's long axis. Zero means alongside. Axis 0 is east-west. */
export function alongsideAngleDeg(heading: number, axis = 0): number {
  const toA = Math.abs(wrapPi(heading - axis));
  const toB = Math.abs(wrapPi(heading - axis - Math.PI));
  return (Math.min(toA, toB) * 180) / Math.PI;
}
