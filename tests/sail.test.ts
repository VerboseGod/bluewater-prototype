import { describe, expect, it } from 'vitest';
import { sailForces } from '../core/sim/sail';
import { STALL_AOA } from '../core/sim/constants';
import { DEG } from '../core/sim/math';

describe('sail force', () => {
  it('is near zero head to wind', () => {
    const head = sailForces(0, 0, 6, 0, STALL_AOA);
    const reach = sailForces(80 * DEG, 50 * DEG, 6, 0, STALL_AOA);
    const headMag = Math.hypot(head.drive, head.side);
    const reachMag = Math.hypot(reach.drive, reach.side);
    expect(headMag).toBeLessThan(reachMag * 0.05);
    expect(head.mode).toBe('luffing');
    expect(reach.drive).toBeGreaterThan(40);
  });

  it('stalls when over-sheeted and luffs when eased past the wind', () => {
    const stalled = sailForces(70 * DEG, 2 * DEG, 6, 0, STALL_AOA);
    const luffing = sailForces(40 * DEG, 40 * DEG, 6, 0, STALL_AOA);
    expect(stalled.mode).toBe('stalled');
    expect(stalled.cd).toBeGreaterThan(stalled.cl);
    expect(luffing.mode).toBe('luffing');
    expect(Math.abs(luffing.drive)).toBeLessThan(15);
  });
});
