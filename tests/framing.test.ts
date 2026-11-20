import { describe, expect, it } from 'vitest';
import { chaseAim } from '../src/render/chase';
import { MAST_X, sailPoint } from '../src/render/sail-mesh';
import { hintOpacity, stripOpacity } from '../src/hud';
import { windwardSign } from '../core/sim/sim';

describe('chase framing', () => {
  it('sits behind the boat on the windward quarter and looks above the hull', () => {
    const heading = 0.4;
    const awa = 0.8;
    const twa = 1.1;
    const waterY = 0.2;
    const aim = chaseAim(10, -4, heading, awa, twa, waterY, 0);
    const fx = Math.cos(heading);
    const fz = Math.sin(heading);
    const sx = Math.sin(heading);
    const sz = -Math.cos(heading);
    const rx = aim.x - 10;
    const rz = aim.z - -4;
    const along = rx * fx + rz * fz;
    const stbd = rx * sx + rz * sz;
    expect(along, 'camera is astern').toBeLessThan(-10);
    expect(Math.sign(stbd), 'camera is to windward').toBe(windwardSign(awa, twa));
    expect(Math.abs(stbd), 'the offset is a quarter, not dead astern').toBeGreaterThan(4);
    expect(aim.y).toBeGreaterThan(waterY + 3);
    expect(aim.lookY).toBeGreaterThan(waterY + 2.4);
    expect(aim.lookY).toBeLessThan(aim.y + 0.2);
  });
});

describe('sail mesh', () => {
  it('stands on the mast with the clew aft and a visible belly', () => {
    const boom = 0.7;
    const head = sailPoint(0, 1, boom, 0.5, 'trimmed', 0);
    const clew = sailPoint(1, 0, boom, 0.5, 'trimmed', 0);
    const belly = sailPoint(0.42, 0.48, boom, 0.5, 'trimmed', 0);
    const chord = sailPoint(0.42, 0, boom, 0.5, 'trimmed', 0);
    expect(head.y).toBeGreaterThan(4.8);
    expect(Math.abs(head.x - MAST_X)).toBeLessThan(0.15);
    expect(Math.abs(head.z)).toBeLessThan(0.2);
    expect(clew.y).toBeLessThan(1.3);
    expect(clew.x).toBeLessThan(MAST_X - 0.8);
    expect(Math.abs(clew.z)).toBeGreaterThan(1);
    expect(Math.abs(belly.z - chord.z * (1 - 0.48)), 'camber off the chord').toBeGreaterThan(0.25);
  });
});

describe('coaching prompt', () => {
  it('shows for a few seconds and then fades', () => {
    expect(hintOpacity(0, false, 'Trim in')).toBe(1);
    expect(hintOpacity(2000, false, 'Trim in')).toBe(1);
    expect(hintOpacity(5000, false, 'Trim in')).toBe(0);
    expect(hintOpacity(100, true, '')).toBe(0);
    const mid = hintOpacity(4300, false, 'Trim in');
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it('lets the phase banner fade after about four seconds', () => {
    expect(stripOpacity(0, 'Sea breeze, west · berth')).toBe(1);
    expect(stripOpacity(3900, 'Sea breeze, west · berth')).toBe(1);
    expect(stripOpacity(5000, 'Sea breeze, west · berth')).toBe(0);
    const mid = stripOpacity(4400, 'Sea breeze, west · berth');
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
});
