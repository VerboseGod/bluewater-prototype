import { describe, expect, it } from 'vitest';
import { DEG, KT, wrapPi } from '../core/sim/math';
import { suggestedSheet } from '../core/sim/sail';
import { tillerYaw } from '../src/render/tiller';
import { courseHeading, makeSim, settle } from './support';

function speedAt(twa: number, wind = 5.66) {
  const sim = makeSim({ windSpeed: wind });
  const heading = courseHeading(sim.wind.baseFrom, twa);
  sim.heading = heading;
  const seed = twa > 36 ? 2 : 0.2;
  sim.vx = Math.cos(heading) * seed;
  sim.vy = Math.sin(heading) * seed;
  settle(sim, 24, heading);
  return sim;
}

function bestVmg(windKn: number) {
  const wind = windKn / KT;
  let best = { twa: 0, kn: 0, vmg: -Infinity };
  for (let twa = 32; twa <= 70; twa += 1) {
    const sim = speedAt(twa, wind);
    const v = sim.snapshot.vFwd;
    const vmg = v * Math.cos(twa * DEG);
    if (vmg > best.vmg) best = { twa, kn: v * KT, vmg };
  }
  return best;
}

describe('sailor feel', () => {
  it('takes 3–6 s through a tack, bleeds speed, and does not skid on a held helm', () => {
    const sim = makeSim({ assisted: false });
    const start = courseHeading(sim.wind.baseFrom, 52, 1);
    const target = courseHeading(sim.wind.baseFrom, 52, -1);
    sim.heading = start;
    sim.vx = Math.cos(start) * 2.2;
    sim.vy = Math.sin(start) * 2.2;
    settle(sim, 8, start);
    const t0 = sim.time;
    const entry = sim.snapshot.vFwd;
    let minV = entry;
    let madeAt = -1;
    let through = false;
    for (let i = 0; i < 60 * 14 && madeAt < 0; i++) {
      const twaNow = sim.snapshot.twa;
      if (twaNow < -30 * DEG) through = true;
      let rudder = -0.145;
      if (through) {
        const err = wrapPi(target - sim.heading);
        rudder = Math.max(-0.2, Math.min(0.2, -err * 0.7 + sim.yawRate * 0.25));
      }
      sim.sheet = suggestedSheet(Math.max(0.15, Math.abs(sim.snapshot.awa || twaNow)));
      const sign = Math.sign(sim.snapshot.awa || twaNow || 1);
      const powered = sim.snapshot.sail === 'trimmed' || sim.snapshot.sail === 'stalled';
      const excess = sign * (sim.heel - sign * 0.12);
      const hike = powered ? Math.max(0, Math.min(1, 0.3 + excess * 2)) : 0;
      sim.step(1 / 60, { rudder, sheetIn: 0, sheetOut: 0, hike });
      minV = Math.min(minV, sim.snapshot.vFwd);
      const twa = sim.snapshot.twa;
      if (
        twa < -42 * DEG &&
        twa > -70 * DEG &&
        sim.snapshot.vFwd > 1.15 &&
        Math.abs(wrapPi(sim.heading - target)) < 16 * DEG
      ) {
        madeAt = sim.time - t0;
      }
    }
    let maxStbd = 0;
    for (let i = 0; i < 60 * 3; i++) {
      sim.step(1 / 60, { rudder: -0.7, sheetIn: 0, sheetOut: 0, hike: 0.2 });
      maxStbd = Math.max(maxStbd, Math.abs(sim.snapshot.vStbd));
    }
    expect(madeAt, 'tack completes').toBeGreaterThan(3);
    expect(madeAt, 'tack completes').toBeLessThan(6);
    expect(minV, 'speed loss through the turn').toBeLessThan(entry * 0.7);
    expect(maxStbd, 'no sideways skid with helm held').toBeLessThan(0.8);
  });

  it('stops when held at 40° and still sails close-hauled', () => {
    const at = (twa: number) => speedAt(twa);
    const s40 = at(40);
    const s45 = at(45);
    const s50 = at(50);
    const s55 = at(55);
    expect(s40.snapshot.vFwd).toBeLessThan(0.45);
    expect(s45.snapshot.vFwd).toBeGreaterThan(1.5);
    expect(s50.snapshot.vFwd).toBeGreaterThan(s45.snapshot.vFwd * 0.9);
    expect(s55.snapshot.vFwd).toBeGreaterThan(1.5);
    expect(s55.snapshot.sail).toBe('trimmed');
    const vmg = bestVmg(11);
    expect(vmg.twa).toBeGreaterThanOrEqual(40);
    expect(vmg.twa).toBeLessThanOrEqual(62);
    expect(vmg.kn).toBeGreaterThan(4);
    expect(vmg.kn).toBeLessThan(5.6);
  });

  it('does not walk up on a trimmed flat reach, and settles after a gybe', () => {
    const reach = makeSim();
    reach.heading = 0;
    reach.vx = 2.4;
    settle(reach, 8, 0);
    const h0 = reach.heading;
    for (let i = 0; i < 60 * 15; i++) {
      const awa = Math.abs(reach.snapshot.awa || reach.snapshot.twa);
      reach.sheet = suggestedSheet(Math.max(awa, 0.2));
      const windward = Math.sign(reach.snapshot.awa || reach.snapshot.twa || 1);
      const hike = Math.max(0, Math.min(1, 0.35 + windward * (reach.heel - windward * 0.08) * 3));
      reach.step(1 / 60, { rudder: 0, sheetIn: 0, sheetOut: 0, hike });
    }
    expect(Math.abs(wrapPi(reach.heading - h0))).toBeLessThan(25 * DEG);
    expect(reach.snapshot.sail).toBe('trimmed');

    const run = makeSim();
    const heading = courseHeading(run.wind.baseFrom, 178);
    run.heading = heading;
    run.vx = Math.cos(heading) * 2;
    run.vy = Math.sin(heading) * 2;
    run.sheet = 0.12;
    let minH = Infinity;
    let maxH = -Infinity;
    for (let i = 0; i < 60 * 24; i++) {
      run.step(1 / 60, { rudder: 0, sheetIn: 0, sheetOut: 0, hike: 0 });
      if (run.time > 8) {
        minH = Math.min(minH, run.heading);
        maxH = Math.max(maxH, run.heading);
      }
    }
    const gybes = run.marks.filter((m) => m.type === 'gybe').length;
    expect(gybes).toBeGreaterThan(0);
    expect(gybes).toBeLessThan(4);
    expect(maxH - minH).toBeLessThan(20 * DEG);
  });

  it('can capsize on a bad gybe in 16 kn with the sheet out and no hike', () => {
    const sim = makeSim({ windSpeed: 16 / KT, assisted: false });
    const heading = courseHeading(sim.wind.baseFrom, 140, 1);
    sim.heading = heading;
    sim.vx = Math.cos(heading) * 3.2;
    sim.vy = Math.sin(heading) * 3.2;
    sim.sheet = 0.02;
    settle(sim, 3, heading, () => ({ rudder: 0, sheetIn: 0, sheetOut: 1, hike: 0 }));
    sim.sheet = 0.02;
    for (let i = 0; i < 60 * 10 && sim.capsizeCount === 0; i++) {
      sim.step(1 / 60, { rudder: 0.9, sheetIn: 0, sheetOut: 1, hike: 0 });
    }
    expect(sim.wind.baseSpeed * KT).toBeGreaterThanOrEqual(16);
    expect(sim.capsizeCount).toBeGreaterThan(0);
    expect(sim.marks.some((m) => m.type === 'gybe')).toBe(true);
  });

  it('swings the tiller opposite the bow', () => {
    expect(tillerYaw(0)).toBe(0);
    expect(tillerYaw(1)).toBeLessThan(0);
    expect(tillerYaw(-1)).toBeGreaterThan(0);
  });
});
