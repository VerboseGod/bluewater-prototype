import type { Controls } from './sim/sim';

/**
 * What a port sends into `step`. Axes and intents, not gamepad buttons.
 * `sheetIn` and `sheetOut` are the analogue axes the browser already had
 * (0..1 each). `sheet` is their difference, -1 ease to +1 sheet in, for a
 * port that has one sheet axis. The reference step uses the two axes.
 */
export interface BoatInput {
  /** -1..1. Positive steers the bow to starboard while moving forward. */
  steer: number;
  /** -1 ease .. +1 sheet in. Net of the two sheet axes. */
  sheet: number;
  /** 0..1 analogue, sheets the sail in while held. */
  sheetIn: number;
  /** 0..1 analogue, eases the sail while held. */
  sheetOut: number;
  /** 0..1 move the sailor out, toward a windward hike. */
  hike: number;
  /** 0..1 move the sailor in, through the boat, and slightly to leeward. */
  moveIn: number;
  /** 0..1 kicker held. Co-op only; it slows how fast the sheet can run out. */
  vang: number;
  /** Helm asks for a tack or a gybe. */
  tackRequest: boolean;
  /** Crew answers the call. */
  tackReady: boolean;
  /** Drop or weigh the anchor. Edge, one step. */
  anchor: boolean;
  /** Throw or let go the mooring line. Edge, one step. */
  moor: boolean;
  /** Pay out anchor scope while held. */
  scopeOut: boolean;
  /** Take scope in while held. */
  scopeIn: boolean;
  /** Short paddle, used to leave a berth. */
  paddle: boolean;
  /** Cycle the scenario wind. Edge, one step. */
  cycleWind: boolean;
  /** Toggle the light dock tide. Edge, one step. */
  toggleTide: boolean;
}

export function neutralInput(): BoatInput {
  return {
    steer: 0,
    sheet: 0,
    sheetIn: 0,
    sheetOut: 0,
    hike: 0,
    moveIn: 0,
    vang: 0,
    tackRequest: false,
    tackReady: false,
    anchor: false,
    moor: false,
    scopeOut: false,
    scopeIn: false,
    paddle: false,
    cycleWind: false,
    toggleTide: false,
  };
}

/** Commands the dock and harbour steps already read. A BoatInput converts into this. */
export interface ScenarioInput {
  rudder: number;
  sheetIn: number;
  sheetOut: number;
  hike: number;
  moveIn?: number;
  anchorPressed: boolean;
  moorPressed: boolean;
  scopeOut: boolean;
  scopeIn: boolean;
  windPressed: boolean;
  tidePressed: boolean;
  paddle?: boolean;
}

export function controlsFromBoat(input: BoatInput): Controls {
  return {
    rudder: input.steer,
    sheetIn: input.sheetIn,
    sheetOut: input.sheetOut,
    hike: input.hike,
    moveIn: input.moveIn,
  };
}

export function scenarioFromBoat(input: BoatInput): ScenarioInput {
  return {
    rudder: input.steer,
    sheetIn: input.sheetIn,
    sheetOut: input.sheetOut,
    hike: input.hike,
    moveIn: input.moveIn,
    anchorPressed: input.anchor,
    moorPressed: input.moor,
    scopeOut: input.scopeOut,
    scopeIn: input.scopeIn,
    windPressed: input.cycleWind,
    tidePressed: input.toggleTide,
    paddle: input.paddle,
  };
}

/** Fill `sheet` from the two axes when a caller only set one of them. */
export function withSheetNet(input: BoatInput): BoatInput {
  return { ...input, sheet: input.sheetIn - input.sheetOut };
}
