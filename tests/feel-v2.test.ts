import { describe, expect, it } from 'vitest';
import { DEG, KT, wrapPi } from '../src/sim/math';
import { suggestedSheet } from '../src/sim/sail';
import { windwardSign, type Controls } from '../src/sim/sim';
import { DT, courseHeading, makeSim, settle } from './support';

function hold(sim: ReturnType<typeof makeSim>, heading: number, crew: number | null, controls: Controls): void {
  sim.heading = heading;
  sim.yawRate = 0;
  if (crew !== null) sim.crew = crew;
  const awa = Math.abs(sim.snapshot.awa || sim.snapshot.twa);
  sim.sheet = suggestedSheet(Math.max(awa, 0.05));
  sim.step(DT, controls);
  sim.heading = heading;
  sim.yawRate = 0;
  if (crew !== null) sim.crew = crew;
}

describe('feel pass 2', () => {
  it('is faster sitting in or slightly to leeward than hiked out in light air', () => {
    const speed = (place: 'hike' | 'in' | 'lee') => {
      const sim = makeSim({ windSpeed: 5 / KT });
      const heading = courseHeading(sim.wind.baseFrom, 85);
      sim.heading = heading;
      sim.vx = Math.cos(heading) * 1.3;
      sim.vy = Math.sin(heading) * 1.3;
      settle(sim, 4, heading);
      const windward = windwardSign(sim.snapshot.awa, sim.snapshot.twa);
      const crew = place === 'hike' ? windward * 1 : place === 'lee' ? -windward * 0.3 : 0;
      for (let i = 0; i < 60 * 16; i++) hold(sim, heading, crew, { rudder: 0, sheetIn: 0, sheetOut: 0, hike: 0, moveIn: 0 });
      return Math.max(0, sim.snapshot.vFwd) * KT;
    };
    const hiked = speed('hike');
    const sitting = speed('in');
    const lee = speed('lee');
    expect(sitting, `in ${sitting.toFixed(2)} vs hiked ${hiked.toFixed(2)}`).toBeGreaterThan(hiked + 0.2);
    expect(lee, `lee ${lee.toFixed(2)} vs hiked ${hiked.toFixed(2)}`).toBeGreaterThan(hiked + 0.2);
  });

  it('keeps about 60% of entry speed in a good tack and loses about 70% in a poor one', () => {
    const run = (style: 'good' | 'poor') => {
      const sim = makeSim({ assisted: false });
      const start = courseHeading(sim.wind.baseFrom, 50, 1);
      const target = courseHeading(sim.wind.baseFrom, 50, -1);
      sim.heading = start;
      sim.vx = Math.cos(start) * 2.5;
      sim.vy = Math.sin(start) * 2.5;
      settle(sim, 8, start);
      const entry = Math.max(0.3, sim.snapshot.vFwd);
      const entrySign = Math.sign(sim.snapshot.twa || 1);
      let minV = entry;
      let madeAt = -1;
      const t0 = sim.time;
      for (let i = 0; i < 60 * 12; i++) {
        const twa = sim.snapshot.twa;
        const abs = Math.abs(twa);
        const through = Math.sign(twa || entrySign) !== entrySign && abs > 15 * DEG;
        let rudder = 0;
        let sheetIn = 0;
        let sheetOut = 0;
        let hike = 0;
        let moveIn = 0;
        if (style === 'good') {
          rudder = -0.1;
          if (through) {
            const err = wrapPi(target - sim.heading);
            rudder = Math.max(-0.16, Math.min(0.16, -err * 0.42));
          }
          // Ease through the wind, then trim once the new tack has opened.
          if (!through && abs < 32 * DEG) sheetOut = 0.35;
          else if (through && abs > 18 * DEG && sim.sheet < 0.72) sheetIn = 0.55;
          const along = sim.crew * windwardSign(sim.snapshot.awa, sim.snapshot.twa);
          // Come in off the rail before the sail unloads, cross near head to wind, hike once it fills.
          if (!through && along > 0.08) moveIn = 1;
          else if (!through && abs < 18 * DEG && along > -0.05) moveIn = 1;
          if (through && abs > 20 * DEG && sim.snapshot.sail !== 'luffing') hike = 0.7;
        } else {
          // Faster helm, sheet never eased, and the sailor only slides as far as the old rail.
          rudder = -0.44;
          if (through) {
            const err = wrapPi(target - sim.heading);
            rudder = Math.max(-0.28, Math.min(0.28, -err * 0.7));
          }
          const along = sim.crew * windwardSign(sim.snapshot.awa, sim.snapshot.twa);
          if (!through && along > 0.38) moveIn = 1;
        }
        sim.step(DT, { rudder, sheetIn, sheetOut, hike, moveIn });
        minV = Math.min(minV, sim.snapshot.vFwd);
        if (
          madeAt < 0 &&
          twa < -38 * DEG &&
          twa > -72 * DEG &&
          Math.abs(wrapPi(sim.heading - target)) < 20 * DEG
        ) {
          madeAt = sim.time - t0;
        }
        if (madeAt > 0) break;
      }
      return { retain: minV / entry, entryKn: entry * KT, minKn: minV * KT, madeAt };
    };
    const good = run('good');
    const poor = run('poor');
    expect(good.retain, `good ${good.entryKn.toFixed(2)} → ${good.minKn.toFixed(2)} in ${good.madeAt.toFixed(2)}s`).toBeGreaterThanOrEqual(0.55);
    expect(poor.retain, `poor ${poor.minKn.toFixed(2)} kn keep ${(poor.retain * 100).toFixed(1)}%`).toBeLessThanOrEqual(0.35);
    expect(good.madeAt, 'good tack duration').toBeGreaterThan(3);
    expect(good.madeAt, 'good tack duration').toBeLessThan(6);
  });

  it('rounds up in a gust unless the sailor hikes or eases', () => {
    const response = (kind: 'none' | 'hike' | 'ease') => {
      const sim = makeSim({ windSpeed: 5.66 });
      const heading = courseHeading(sim.wind.baseFrom, 48, 1);
      sim.heading = heading;
      sim.vx = Math.cos(heading) * 2.3;
      sim.vy = Math.sin(heading) * 2.3;
      settle(sim, 8, heading);
      const windward = windwardSign(sim.snapshot.awa, sim.snapshot.twa);
      const crew = kind === 'hike' ? windward * 1 : windward * 0.1;
      sim.crew = crew;
      const sign0 = Math.sign(sim.snapshot.twa || 1);
      const twa0 = Math.abs(sim.snapshot.twa);
      sim.wind.baseSpeed = 8.1;
      let luffed = 0;
      for (let i = 0; i < 60 * 6; i++) {
        const before = Math.abs(sim.snapshot.twa);
        sim.crew = kind === 'hike' ? windward * 1 : windward * 0.1;
        sim.step(DT, {
          rudder: 0,
          sheetIn: 0,
          sheetOut: kind === 'ease' ? 1 : 0,
          hike: 0,
          moveIn: 0,
        });
        if (Math.sign(sim.snapshot.twa || sign0) !== sign0) {
          luffed += before;
          break;
        }
        luffed = Math.max(luffed, twa0 - Math.abs(sim.snapshot.twa));
      }
      return { luffed: luffed / DEG, caps: sim.capsizeCount };
    };
    const sitting = response('none');
    const hiking = response('hike');
    const easing = response('ease');
    expect(sitting.caps, 'gust without a hike should round up, not immediately invert').toBe(0);
    expect(sitting.luffed, `sitting luffed ${sitting.luffed.toFixed(1)}°`).toBeGreaterThan(8);
    expect(hiking.luffed, `hiking luffed ${hiking.luffed.toFixed(1)}°`).toBeLessThan(sitting.luffed - 5);
    expect(easing.luffed, `easing luffed ${easing.luffed.toFixed(1)}°`).toBeLessThan(sitting.luffed - 5);
  });

  it('bears away when heeled to windward and luffs when heeled to leeward', () => {
    const turned = (lee: boolean) => {
      const sim = makeSim();
      const heading = courseHeading(sim.wind.baseFrom, 58, 1);
      sim.heading = heading;
      sim.vx = Math.cos(heading) * 2.2;
      sim.vy = Math.sin(heading) * 2.2;
      settle(sim, 6, heading);
      const windward = windwardSign(sim.snapshot.awa, sim.snapshot.twa);
      const sign0 = Math.sign(sim.snapshot.twa || 1);
      const crew = lee ? -windward * 0.4 : windward * 1;
      let luff = 0;
      for (let i = 0; i < 60 * 5; i++) {
        const before = Math.abs(sim.snapshot.twa);
        sim.crew = crew;
        sim.step(DT, { rudder: 0, sheetIn: 0, sheetOut: 0, hike: 0, moveIn: 0 });
        if (Math.sign(sim.snapshot.twa || sign0) !== sign0) break;
        luff += before - Math.abs(sim.snapshot.twa);
      }
      return luff / DEG;
    };
    const lee = turned(true);
    const wind = turned(false);
    expect(lee, `leeward heel luff ${lee.toFixed(1)}°`).toBeGreaterThan(3);
    expect(wind, `windward heel bear-away ${(-wind).toFixed(1)}°`).toBeLessThan(-3);
  });

  it('peaks near 6 kn on a beam reach in 11 kn', () => {
    let best = { twa: 0, kn: 0 };
    for (let twa = 75; twa <= 105; twa += 5) {
      const sim = makeSim();
      const heading = courseHeading(sim.wind.baseFrom, twa);
      sim.heading = heading;
      sim.vx = Math.cos(heading) * 2.6;
      sim.vy = Math.sin(heading) * 2.6;
      settle(sim, 22, heading);
      const kn = Math.max(0, sim.snapshot.vFwd) * KT;
      if (kn > best.kn) best = { twa, kn };
    }
    expect(best.kn, `beam peak ${best.kn.toFixed(2)} kn at ${best.twa}°`).toBeGreaterThanOrEqual(5.8);
    expect(best.kn, `beam peak ${best.kn.toFixed(2)} kn at ${best.twa}°`).toBeLessThanOrEqual(6.3);
  });

  it('is harder to get onto a plane than to stay on one', () => {
    const planeFromRest = (windKn: number) => {
      const sim = makeSim({ windSpeed: windKn / KT });
      const heading = courseHeading(sim.wind.baseFrom, 128);
      sim.heading = heading;
      sim.vx = Math.cos(heading) * 2.5;
      sim.vy = Math.sin(heading) * 2.5;
      sim.sheet = 0.12;
      settle(sim, 16, heading);
      return sim.planing;
    };
    let onset = 20;
    for (const windKn of [11, 12, 13, 14, 15, 16]) {
      if (planeFromRest(windKn)) {
        onset = windKn;
        break;
      }
    }
    const sim = makeSim({ windSpeed: 16 / KT });
    const heading = courseHeading(sim.wind.baseFrom, 128);
    sim.heading = heading;
    sim.vx = Math.cos(heading) * 3;
    sim.vy = Math.sin(heading) * 3;
    settle(sim, 14, heading);
    expect(sim.planing, '16 kn broad reach should be planing').toBe(true);
    let drop = 6;
    for (const windKn of [15, 14, 13, 12, 11, 10, 9, 8]) {
      sim.wind.baseSpeed = windKn / KT;
      settle(sim, 7, heading);
      if (!sim.planing) {
        drop = windKn;
        break;
      }
    }
    expect(onset, `onset ${onset} kn, drop ${drop} kn`).toBeGreaterThan(drop);
    expect(onset).toBeGreaterThanOrEqual(12);
    expect(onset).toBeLessThanOrEqual(14);
  });

  it('gybes the boom on its own when the boat is held by the lee', () => {
    const sim = makeSim();
    const deep = courseHeading(sim.wind.baseFrom, 174, 1);
    sim.heading = deep;
    sim.vx = Math.cos(deep) * 1.7;
    sim.vy = Math.sin(deep) * 1.7;
    sim.sheet = 0.18;
    settle(sim, 3, deep);
    const before = Math.sign(sim.boom);
    expect(Math.abs(sim.boom)).toBeGreaterThan(0.2);
    const byLee = courseHeading(sim.wind.baseFrom, 170, -1);
    for (let i = 0; i < 60 * 3; i++) {
      sim.heading = byLee;
      sim.yawRate = 0;
      sim.step(DT, { rudder: 0, sheetIn: 0, sheetOut: 0, hike: 0 });
      sim.heading = byLee;
      sim.yawRate = 0;
    }
    expect(Math.sign(sim.boom), 'boom comes across with the tiller held').toBe(-before);
  });

  it('still finds best VMG between 40° and 47° in 11 kn', () => {
    let best = { twa: 0, vmg: -Infinity, kn: 0 };
    for (let twa = 32; twa <= 70; twa += 1) {
      const sim = makeSim();
      const heading = courseHeading(sim.wind.baseFrom, twa);
      sim.heading = heading;
      const seed = twa > 36 ? 2 : 0.2;
      sim.vx = Math.cos(heading) * seed;
      sim.vy = Math.sin(heading) * seed;
      settle(sim, 20, heading);
      const v = sim.snapshot.vFwd;
      const vmg = v * Math.cos(twa * DEG);
      if (vmg > best.vmg) best = { twa, vmg, kn: v * KT };
    }
    expect(best.twa, `VMG ${best.kn.toFixed(2)} kn at ${best.twa}°`).toBeGreaterThanOrEqual(40);
    expect(best.twa).toBeLessThanOrEqual(47);
  });
});
