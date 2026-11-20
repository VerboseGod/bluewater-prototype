import { suggestedSheet } from '../core/sim/sail';
import { Simulation, type Controls } from '../core/sim/sim';
import { DEG } from '../core/sim/math';

export const DT = 1 / 60;

export function makeSim(partial: ConstructorParameters<typeof Simulation>[0] = {}): Simulation {
  return new Simulation({
    steady: true,
    waves: false,
    assisted: false,
    windSpeed: 5.66,
    windFrom: Math.PI / 2,
    heading: 0,
    ...partial,
  });
}

/** Optimal sheet and a hike that chases a slight leeward heel. Heading is locked by the caller. */
export function trimControls(sim: Simulation): Controls {
  const awa = Math.abs(sim.snapshot.awa);
  const target = suggestedSheet(awa);
  const windwardHeel = Math.sign(sim.snapshot.awa || sim.snapshot.twa || 1);
  const desired = windwardHeel * 0.12;
  const excess = windwardHeel * (sim.snapshot.heel - desired);
  const hike = clamp(0.35 + excess * 2.4, 0, 1);
  return {
    rudder: 0,
    sheetIn: target > sim.sheet ? 1 : 0,
    sheetOut: target < sim.sheet ? 1 : 0,
    hike,
  };
}

export function settle(
  sim: Simulation,
  seconds: number,
  heading: number | null,
  controls: (sim: Simulation) => Controls = trimControls,
): void {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    if (heading !== null) {
      sim.heading = heading;
      sim.yawRate = 0;
    }
    // Instant trim so the polar measures the boat, not the sheet winch.
    if (heading !== null) {
      const awa = Math.abs(sim.snapshot.awa || sim.snapshot.twa);
      sim.sheet = suggestedSheet(Math.max(awa, 0.01));
    }
    sim.step(DT, controls(sim));
    if (heading !== null) {
      sim.heading = heading;
      sim.yawRate = 0;
    }
  }
}

export function courseHeading(windFrom: number, twaDeg: number, sign = 1): number {
  return windFrom - sign * twaDeg * DEG;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
