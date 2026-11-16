import { describe, expect, it } from 'vitest';
import { apparentWind } from '../src/sim/wind';
import { DEG, KT } from '../src/sim/math';
import { makeSim, settle } from './support';

describe('apparent wind', () => {
  it('subtracts boat velocity from true wind', () => {
    const aw = apparentWind({ x: 0, y: -5 }, { x: 2, y: 0 });
    expect(aw.x).toBeCloseTo(-2, 6);
    expect(aw.y).toBeCloseTo(-5, 6);
  });

  it('moves forward as boatspeed rises on a reach', () => {
    const slow = makeSim({ heading: 0, vx: 0.2, vy: 0 });
    slow.step(1 / 60, { rudder: 0, sheetIn: 0, sheetOut: 0, hike: 0 });
    const fast = makeSim({ heading: 0, vx: 3.2, vy: 0 });
    fast.step(1 / 60, { rudder: 0, sheetIn: 0, sheetOut: 0, hike: 0 });
    expect(Math.abs(fast.snapshot.awa)).toBeLessThan(Math.abs(slow.snapshot.awa) - 8 * DEG);
    expect(fast.snapshot.aws).toBeGreaterThan(slow.snapshot.aws);
  });

  it('reports a usable angle after the boat has settled', () => {
    const sim = makeSim();
    settle(sim, 8, 0);
    expect(Math.abs(sim.snapshot.awa)).toBeGreaterThan(20 * DEG);
    expect(Math.abs(sim.snapshot.awa)).toBeLessThan(100 * DEG);
    expect(sim.snapshot.aws * KT).toBeGreaterThan(sim.snapshot.tws * KT * 0.9);
  });
});
