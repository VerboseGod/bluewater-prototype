import { describe, expect, it } from 'vitest';
import { rudderForces } from '../src/sim/hydro';
import { RUDDER_STALL } from '../src/sim/constants';
import { suggestedSheet } from '../src/sim/sail';
import { DEG, KT, wrapPi } from '../src/sim/math';
import { makeSim, settle, courseHeading } from './support';

describe('dinghy behaviour', () => {
  it('cannot sustain speed inside about 35 degrees of the true wind', () => {
    for (const twa of [0, 15, 25, 35]) {
      const sim = makeSim();
      const heading = courseHeading(sim.wind.baseFrom, twa);
      sim.heading = heading;
      sim.vx = Math.cos(heading) * 1.5;
      sim.vy = Math.sin(heading) * 1.5;
      settle(sim, 22, heading);
      expect(sim.snapshot.vFwd, `TWA ${twa}`).toBeLessThan(0.45);
    }
  });

  it('heels more in more wind at the same trim', () => {
    const heelFor = (windSpeed: number) => {
      const sim = makeSim({ windSpeed, sheet: 0.55 });
      sim.sheet = 0.55;
      settle(sim, 14, 0, () => ({ rudder: 0, sheetIn: 0, sheetOut: 0, hike: 0.15 }));
      return Math.abs(sim.heel);
    };
    const light = heelFor(4);
    const fresh = heelFor(8);
    expect(fresh).toBeGreaterThan(light + 4 * DEG);
    // A faster beam reach brings the apparent wind forward, so the boat sits a little flatter.
    expect(light).toBeGreaterThan(1.5 * DEG);
  });

  it('keeps leeway in the 2–8 degree band when close-hauled', () => {
    let bestVmg = -Infinity;
    let bestTwa = 50;
    let bestLeeway = 0;
    let bestSpeed = 0;
    for (const twa of [46, 50, 54, 58, 62]) {
      const sim = makeSim();
      const heading = courseHeading(sim.wind.baseFrom, twa);
      sim.heading = heading;
      sim.vx = Math.cos(heading) * 2;
      sim.vy = Math.sin(heading) * 2;
      settle(sim, 24, heading);
      const vmg = sim.snapshot.vFwd * Math.cos(twa * DEG);
      if (vmg > bestVmg && sim.snapshot.vFwd > 1) {
        bestVmg = vmg;
        bestTwa = twa;
        bestLeeway = Math.abs(sim.snapshot.leeway);
        bestSpeed = sim.snapshot.vFwd;
      }
    }
    expect(bestSpeed, `close-hauled speed at ${bestTwa}°`).toBeGreaterThan(1.6);
    expect(bestLeeway, `leeway at ${bestTwa}°`).toBeGreaterThan(2 * DEG);
    expect(bestLeeway, `leeway at ${bestTwa}°`).toBeLessThan(8 * DEG);
  });

  it('uses the rudder as a brake past about 18 degrees', () => {
    const mild = rudderForces(3, 0, 10 * DEG, RUDDER_STALL);
    const hard = rudderForces(3, 0, 32 * DEG, RUDDER_STALL);
    expect(hard.stalled).toBe(true);
    expect(mild.stalled).toBe(false);
    const mildDrag = -mild.fwd;
    const hardDrag = -hard.fwd;
    expect(hardDrag).toBeGreaterThan(mildDrag * 2);
  });

  it('reverses the rudder when the boat is going backwards', () => {
    const ahead = rudderForces(2.2, 0, 0.25, RUDDER_STALL);
    const astern = rudderForces(-2.2, 0, 0.25, RUDDER_STALL);
    expect(ahead.yaw).toBeLessThan(0);
    expect(astern.yaw).toBeGreaterThan(0);
  });

  it('drifts backwards in irons', () => {
    const sim = makeSim();
    const heading = sim.wind.baseFrom;
    sim.heading = heading;
    sim.sheet = 0.9;
    settle(sim, 12, heading, () => ({ rudder: 0, sheetIn: 0, sheetOut: 0, hike: 0 }));
    expect(sim.snapshot.vFwd).toBeLessThan(-0.15);
  });

  it('needs speed to complete a tack, and a good one takes a few seconds', () => {
    const finish = (buildSpeed: boolean) => {
      const sim = makeSim({ assisted: false });
      const start = courseHeading(sim.wind.baseFrom, 52, 1);
      const target = courseHeading(sim.wind.baseFrom, 52, -1);
      sim.heading = start;
      if (buildSpeed) {
        sim.vx = Math.cos(start) * 2.2;
        sim.vy = Math.sin(start) * 2.2;
        settle(sim, 8, start);
      } else {
        sim.vx = Math.cos(start) * 0.15;
        sim.vy = Math.sin(start) * 0.15;
        sim.sheet = 0.8;
      }
      const t0 = sim.time;
      let madeAt = -1;
      let through = false;
      for (let i = 0; i < 60 * 14; i++) {
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
        const twa = sim.snapshot.twa;
        if (
          madeAt < 0 &&
          twa < -42 * DEG &&
          twa > -70 * DEG &&
          sim.snapshot.vFwd > 1.15 &&
          Math.abs(wrapPi(sim.heading - target)) < 16 * DEG
        ) {
          madeAt = sim.time - t0;
        }
      }
      return { time: madeAt, made: madeAt > 0, v: sim.snapshot.vFwd, hdg: sim.heading };
    };
    const good = finish(true);
    const poor = finish(false);
    expect(good.made, `tack vFwd ${good.v.toFixed(2)}`).toBe(true);
    expect(good.time).toBeGreaterThan(1.7);
    expect(good.time).toBeLessThan(5.5);
    expect(poor.made).toBe(false);
  });
});

describe('speed curve', () => {
  it('peaks on a reach and stays near zero inside the no-go zone', () => {
    const rows: { twa: number; kn: number; vFwd: number; heel: number; lee: number; mode: string; plane: boolean }[] = [];
    for (let twa = 0; twa <= 180; twa += 10) {
      const sim = makeSim();
      const heading = courseHeading(sim.wind.baseFrom, twa);
      sim.heading = heading;
      const seed = twa > 40 ? 2 : 0.2;
      sim.vx = Math.cos(heading) * seed;
      sim.vy = Math.sin(heading) * seed;
      settle(sim, 20, heading);
      rows.push({
        twa,
        kn: Math.max(0, sim.snapshot.vFwd) * KT,
        vFwd: sim.snapshot.vFwd,
        heel: Math.abs(sim.heel) / DEG,
        lee: Math.abs(sim.snapshot.leeway) / DEG,
        mode: sim.snapshot.sail,
        plane: sim.planing,
      });
    }
    for (const row of rows) {
      if (row.twa <= 35) expect(row.vFwd, `no-go ${row.twa}`).toBeLessThan(0.4);
    }
    let peak = rows[0];
    for (const row of rows) if (row.vFwd > peak.vFwd) peak = row;
    expect(peak.twa, `peak at ${peak.twa}°`).toBeGreaterThanOrEqual(70);
    expect(peak.twa, `peak at ${peak.twa}°`).toBeLessThanOrEqual(140);
    const run = rows.find((r) => r.twa === 180)!;
    expect(run.vFwd).toBeLessThan(peak.vFwd * 0.92);
    expect(peak.kn).toBeGreaterThan(4.2);
    expect(peak.kn).toBeLessThan(7.2);
  });
});
