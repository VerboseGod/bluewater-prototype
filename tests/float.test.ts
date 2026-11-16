import { describe, expect, it } from 'vitest';
import { hullFloat } from '../src/render/float';
import { physicsChop } from '../src/render/waves';

describe('hull float', () => {
  it('pitches bow-up when the bow sample is higher and stays flat on a level sea', () => {
    const flat = hullFloat({ bow: 0.2, stern: 0.2, cock: 0.2, port: 0.2, stbd: 0.2 });
    expect(flat.pitch).toBeCloseTo(0, 5);
    expect(flat.roll).toBeCloseTo(0, 5);
    expect(flat.y).toBeGreaterThan(0.2);

    const pitched = hullFloat({ bow: 0.4, stern: 0.0, cock: 0.2, port: 0.2, stbd: 0.2 });
    expect(pitched.pitch).toBeGreaterThan(0.05);
    const rolled = hullFloat({ bow: 0.2, stern: 0.2, cock: 0.2, port: 0.45, stbd: 0.0 });
    expect(rolled.roll).toBeGreaterThan(0.05);
  });

  it('lifts the hull when a crest stands above the bow-stern plane', () => {
    const smooth = hullFloat({ bow: 0.3, stern: 0.1, cock: 0.2, port: 0.2, stbd: 0.2 });
    const crest = hullFloat({ bow: 0.3, stern: 0.1, cock: 0.55, port: 0.2, stbd: 0.2 });
    expect(crest.y).toBeGreaterThan(smooth.y + 0.2);
    expect(crest.pitch).toBeCloseTo(smooth.pitch, 5);
  });
});

describe('physics chop', () => {
  it('is zero when the sheltered basin turns the chop off', () => {
    const off = physicsChop(3, -2, 1.25, 0);
    expect(off.height).toBe(0);
    expect(off.slopeX).toBe(0);
    const on = physicsChop(3, -2, 1.25, 4);
    expect(Math.abs(on.height) + Math.abs(on.slopeX) + Math.abs(on.slopeZ)).toBeGreaterThan(0);
  });
});
