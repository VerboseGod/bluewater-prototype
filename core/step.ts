import scenarios from './data/scenarios.json';
import { controlsFromBoat, scenarioFromBoat, type BoatInput } from './input';
import { DockSession, type DockState } from './dock/session';
import type { WindId } from './dock/layout';
import { Simulation, type BoatState, type SimOptions } from './sim/sim';

/** The browser loop and the goldens both use this. */
export const FIXED_DT = 1 / 60;

export function openWaterOptions(demo: boolean): SimOptions {
  const open = scenarios.openWater;
  return {
    windSpeed: open.windSpeed,
    windFrom: open.windFrom,
    steady: open.steady,
    waves: open.waves,
    assisted: open.assisted,
    heading: open.heading,
    sheet: demo ? open.demoSheet : open.sheet,
    vx: demo ? open.demoVx : 0,
    vy: 0,
  };
}

export function coopOptions(): SimOptions {
  const coop = scenarios.coop;
  return {
    windSpeed: coop.windSpeed,
    windFrom: coop.windFrom,
    steady: coop.steady,
    waves: coop.waves,
    assisted: coop.assisted,
  };
}

export function createBoat(opts: SimOptions = {}): BoatState {
  return new Simulation(opts).toState();
}

/** One fixed tick. Does not mutate `state`. */
export function step(state: BoatState, input: BoatInput, dt: number): BoatState {
  const sim = Simulation.fromState(state);
  sim.step(dt, controlsFromBoat(input));
  return sim.toState();
}

export function createDock(opts?: { assisted?: boolean; wind?: WindId }): DockState {
  return new DockSession({ demo: false, assisted: opts?.assisted, wind: opts?.wind }).toState();
}

/** One fixed tick of the dock scenario. Does not mutate `state`. */
export function stepDock(state: DockState, input: BoatInput, dt: number): DockState {
  const session = DockSession.fromState(state);
  session.step(dt, scenarioFromBoat(input));
  return session.toState();
}
