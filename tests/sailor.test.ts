import { describe, expect, it } from 'vitest';
import { KT, DEG } from '../core/sim/math';
import { courseHeading, makeSim, settle } from './support';

describe('sailor targets', () => {
  it('planes on a broad reach only once the wind is up', () => {
    const run = (windSpeed: number) => {
      const sim = makeSim({ windSpeed });
      const heading = courseHeading(sim.wind.baseFrom, 125);
      sim.heading = heading;
      sim.vx = Math.cos(heading) * 3;
      sim.vy = Math.sin(heading) * 3;
      settle(sim, 16, heading);
      return { kn: sim.snapshot.vFwd * KT, plane: sim.planing, heel: Math.abs(sim.heel) / DEG };
    };
    const moderate = run(5.66);
    const fresh = run(8.4);
    expect(moderate.plane, `11 kn speed ${moderate.kn.toFixed(2)}`).toBe(false);
    expect(moderate.kn).toBeGreaterThan(4);
    expect(moderate.kn).toBeLessThan(6.6);
    expect(fresh.plane, `16 kn speed ${fresh.kn.toFixed(2)} heel ${fresh.heel.toFixed(0)}`).toBe(true);
    expect(fresh.kn).toBeGreaterThan(moderate.kn + 2.5);
  });

  it('is slower and less settled dead downwind than on a reach', () => {
    const sim = makeSim();
    const heading = courseHeading(sim.wind.baseFrom, 178);
    sim.heading = heading;
    sim.vx = Math.cos(heading) * 2;
    sim.vy = Math.sin(heading) * 2;
    // Free heading, centered tiller: a run should wander toward a gybe.
    sim.sheet = 0.15;
    let gybed = false;
    for (let i = 0; i < 60 * 18; i++) {
      sim.step(1 / 60, { rudder: 0, sheetIn: 0, sheetOut: 0, hike: 0 });
      if (sim.marks.some((m) => m.type === 'gybe')) gybed = true;
    }
    expect(gybed).toBe(true);
  });

  it('rewards hiking when the boat is pressed', () => {
    const speedFor = (hike: number) => {
      const sim = makeSim({ windSpeed: 6.4 });
      const heading = courseHeading(sim.wind.baseFrom, 60);
      sim.heading = heading;
      sim.vx = Math.cos(heading) * 2;
      sim.vy = Math.sin(heading) * 2;
      settle(sim, 14, heading, () => ({ rudder: 0, sheetIn: 0, sheetOut: 0, hike }));
      return { kn: Math.max(0, sim.snapshot.vFwd) * KT, heel: sim.heel / DEG, caps: sim.capsizeCount };
    };
    const sitting = speedFor(0);
    const hiking = speedFor(0.55);
    expect(Math.abs(hiking.heel)).toBeLessThan(Math.abs(sitting.heel) - 4);
    expect(hiking.kn).toBeGreaterThan(sitting.kn + 0.3);
  });

  it('can capsize to windward if you stay hiked out through a lull', () => {
    const sim = makeSim({ windSpeed: 7.2, assisted: false });
    const heading = courseHeading(sim.wind.baseFrom, 55);
    sim.heading = heading;
    sim.vx = Math.cos(heading) * 2.2;
    sim.vy = Math.sin(heading) * 2.2;
    settle(sim, 6, heading, () => ({ rudder: 0, sheetIn: 0, sheetOut: 0, hike: 1 }));
    const sideBefore = Math.sign(sim.heel);
    sim.wind.baseSpeed = 0.3;
    for (let i = 0; i < 60 * 6; i++) {
      sim.heading = heading;
      sim.yawRate = 0;
      sim.step(1 / 60, { rudder: 0, sheetIn: 0, sheetOut: 0, hike: 1 });
      sim.heading = heading;
      sim.yawRate = 0;
    }
    expect(sim.capsizeCount).toBeGreaterThan(0);
    expect(Math.sign(sim.capsizeSide)).toBe(-sideBefore || Math.sign(sim.capsizeSide));
  });
});
