import { describe, expect, it } from 'vitest';
import { classifyImpact, resolveContact } from '../core/dock/contact';
import { DEPTH, MAX_SET_SPEED, MOOR_MS, MOOR_REACH, bowOf } from '../core/dock/layout';
import { canMakeFast } from '../core/dock/mooring';
import { steerTo } from '../core/dock/practice';
import { tipFor } from '../core/dock/score';
import { DockSession } from '../core/dock/session';
import { wrapPi } from '../core/sim/math';
import { downwind, rudderAuthority, waterSpeed } from '../core/sim/lowspeed';
import { Simulation } from '../core/sim/sim';
import type { InputState } from '../src/input';
import { DT, makeSim } from './support';

/** Metres travelled until the boat is nearly stopped, sail let fly, head to wind. */
function coastToStop(v0: number): { dist: number; done: boolean; speed: number } {
  const sim = new Simulation({
    steady: true,
    waves: false,
    assisted: false,
    windSpeed: 5.66,
    windFrom: 0,
    heading: 0,
    sheet: 1,
    vx: v0,
    vy: 0,
  });
  sim.boom = 1.4;
  let dist = 0;
  let px = sim.x;
  let py = sim.y;
  for (let i = 0; i < 60 * 40; i++) {
    sim.step(DT, { rudder: 0, sheetIn: 0, sheetOut: 1, hike: 0 });
    dist += Math.hypot(sim.x - px, sim.y - py);
    px = sim.x;
    py = sim.y;
    const speed = Math.hypot(sim.vx, sim.vy);
    if (speed < 0.15) return { dist, done: true, speed };
  }
  return { dist, done: false, speed: Math.hypot(sim.vx, sim.vy) };
}

function bleed(v0: number, drop = 0.5): { dist: number; done: boolean; speed: number } {
  const sim = new Simulation({
    steady: true,
    waves: false,
    assisted: false,
    windSpeed: 5.66,
    windFrom: 0,
    heading: 0,
    sheet: 1,
    vx: v0,
    vy: 0,
  });
  sim.boom = 1.4;
  let dist = 0;
  let px = sim.x;
  let py = sim.y;
  const target = Math.max(0.12, v0 - drop);
  for (let i = 0; i < 60 * 20; i++) {
    sim.step(DT, { rudder: 0, sheetIn: 0, sheetOut: 1, hike: 0 });
    dist += Math.hypot(sim.x - px, sim.y - py);
    px = sim.x;
    py = sim.y;
    const speed = Math.hypot(sim.vx, sim.vy);
    if (speed <= target) return { dist, done: true, speed };
  }
  return { dist, done: false, speed: Math.hypot(sim.vx, sim.vy) };
}

function idle(partial: Partial<InputState> = {}): InputState {
  return {
    rudder: 0,
    sheetIn: 0,
    sheetOut: 1,
    hike: 0,
    moveIn: 0,
    orbitX: 0,
    orbitY: 0,
    assistPressed: false,
    resetPressed: false,
    pausePressed: false,
    qualityPressed: false,
    camera: null,
    cycleCamera: false,
    usingGamepad: false,
    dockPressed: false,
    anchorPressed: false,
    moorPressed: false,
    scopeOut: false,
    scopeIn: false,
    windPressed: false,
    tidePressed: false,
    ...partial,
  };
}

function drift(currentX: number): Simulation {
  const sim = makeSim({ windFrom: Math.PI / 2, heading: Math.PI / 2, sheet: 1 });
  sim.boom = 1.35;
  sim.currentX = currentX;
  for (let i = 0; i < 60 * 14; i++) {
    sim.step(DT, { rudder: 0, sheetIn: 0, sheetOut: 1, hike: 0 });
  }
  return sim;
}

describe('low speed', () => {
  it('total distance to stop with the sail let fly grows with entry speed', () => {
    const slow = coastToStop(0.5);
    const mid = coastToStop(1);
    const fast = coastToStop(1.5);
    expect(slow.done, `0.5 m/s ended at ${slow.speed.toFixed(2)}`).toBe(true);
    expect(mid.done, `1.0 m/s ended at ${mid.speed.toFixed(2)}`).toBe(true);
    expect(fast.done, `1.5 m/s ended at ${fast.speed.toFixed(2)}`).toBe(true);
    expect(mid.dist, `1.0 m/s coast ${mid.dist.toFixed(2)} m vs 0.5 m/s ${slow.dist.toFixed(2)} m`).toBeGreaterThan(slow.dist);
    expect(fast.dist, `1.5 m/s coast ${fast.dist.toFixed(2)} m vs 1.0 m/s ${mid.dist.toFixed(2)} m`).toBeGreaterThan(mid.dist);
  });

  it('carry distance when the sail is let fly decreases with speed', () => {
    const slow = bleed(1.15);
    const fast = bleed(2.35);
    expect(slow.done, `slow coast did not shed speed, ended at ${slow.speed}`).toBe(true);
    expect(fast.done, `fast coast did not shed speed, ended at ${fast.speed}`).toBe(true);
    // Quadratic hull drag: the metres it takes to lose half a metre per second
    // are shorter when you are already going faster.
    expect(fast.dist).toBeLessThan(slow.dist);
    expect(fast.dist).toBeGreaterThan(0.3);
    console.log(`DOCK_NUMBERS bleed115=${slow.dist.toFixed(2)} bleed235=${fast.dist.toFixed(2)}`);
  });

  it('rudder authority is near zero at 0 kn and falls with speed', () => {
    expect(rudderAuthority(0)).toBe(0);
    expect(rudderAuthority(0.05)).toBe(0);
    const crawl = rudderAuthority(0.25);
    const sailing = rudderAuthority(2.5);
    expect(crawl).toBeGreaterThan(0);
    expect(crawl).toBeLessThan(sailing * 0.03);
    const still = makeSim({ vx: 0, vy: 0, sheet: 1 });
    const helmed = makeSim({ vx: 0, vy: 0, sheet: 1 });
    for (let i = 0; i < 90; i++) {
      still.step(DT, { rudder: 0, sheetIn: 0, sheetOut: 1, hike: 0 });
      helmed.step(DT, { rudder: 1, sheetIn: 0, sheetOut: 1, hike: 0 });
    }
    expect(Math.abs(wrapPi(helmed.heading - still.heading))).toBeLessThan(0.08);
    console.log(`DOCK_NUMBERS yaw0=${rudderAuthority(0)} yaw025=${crawl.toFixed(2)} yaw25=${sailing.toFixed(1)}`);
  });

  it('port helm increases heading while there is way on', () => {
    expect(steerTo(0, 0.4, 0)).toBeLessThan(0);
    const sim = makeSim({ heading: 0, vx: 2, vy: 0, sheet: 1 });
    for (let i = 0; i < 70; i++) sim.step(DT, { rudder: -0.8, sheetIn: 0, sheetOut: 1, hike: 0 });
    expect(wrapPi(sim.heading)).toBeGreaterThan(0.08);
  });

  it('drift direction matches the wind and the current', () => {
    const calm = drift(0);
    const tide = drift(0.3);
    const wind = downwind(Math.PI / 2);
    const calmDown = calm.vx * wind.x + calm.vy * wind.y;
    const tideDown = tide.vx * wind.x + tide.vy * wind.y;
    expect(calmDown).toBeGreaterThan(0.05);
    expect(tideDown).toBeGreaterThan(0.04);
    expect(tide.vx - calm.vx).toBeGreaterThan(0.08);
    console.log(
      `DOCK_NUMBERS driftCalm=${calm.vx.toFixed(3)},${calm.vy.toFixed(3)} driftTide=${tide.vx.toFixed(3)},${tide.vy.toFixed(3)}`,
    );
  });
});

describe('anchor', () => {
  function place(session: DockSession, speed: number, offWind: number): void {
    const from = session.windFrom;
    session.sim.x = 48;
    session.sim.y = -28;
    session.sim.heading = wrapPi(from + offWind);
    session.sim.vx = Math.cos(session.sim.heading) * speed;
    session.sim.vy = Math.sin(session.sim.heading) * speed;
    session.sim.yawRate = 0;
    session.sim.sheet = 1;
    session.sim.boom = 1.3;
  }

  function run(session: DockSession, seconds: number): void {
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n; i++) session.step(DT, idle());
  }

  it('holds at 5:1 and the bow swings toward the wind', () => {
    const session = new DockSession({ assisted: false });
    place(session, 0.08, 0.75);
    const sim = session.sim;
    session.rig.drop(sim);
    session.rig.setSpeed = 0.1;
    session.rig.rode = DEPTH * 5;
    const bow = bowOf(sim.x, sim.y, sim.heading);
    const reach = Math.sqrt(session.rig.rode ** 2 - DEPTH ** 2);
    const upX = Math.cos(session.windFrom);
    const upY = Math.sin(session.windFrom);
    session.rig.x = bow.x + upX * (reach + 0.45);
    session.rig.y = bow.y + upY * (reach + 0.45);
    const ax = session.rig.x;
    const ay = session.rig.y;
    run(session, 7);
    expect(session.rig.scope).toBeCloseTo(5, 5);
    expect(session.rig.held).toBe(true);
    expect(session.rig.dragged).toBeLessThan(0.2);
    expect(Math.hypot(session.rig.x - ax, session.rig.y - ay)).toBeLessThan(0.2);
    expect(Math.abs(wrapPi(sim.heading - session.windFrom))).toBeLessThan(0.45);
  });

  it('drags at 2:1 and when the approach is too fast', () => {
    const short = new DockSession({ assisted: false });
    place(short, 0.05, 0);
    short.rig.drop(short.sim);
    short.rig.setSpeed = 0.1;
    short.rig.rode = DEPTH * 2;
    const wind = downwind(short.windFrom);
    const x0 = short.rig.x;
    const y0 = short.rig.y;
    run(short, 6);
    const along = (short.rig.x - x0) * wind.x + (short.rig.y - y0) * wind.y;
    expect(short.rig.scope).toBeCloseTo(2, 5);
    expect(short.rig.held).toBe(false);
    expect(short.rig.dragging).toBe(true);
    expect(along).toBeGreaterThan(0.8);
    console.log(`DOCK_NUMBERS drag2to1=${along.toFixed(2)} m in 6s`);

    const fast = new DockSession({ assisted: false });
    place(fast, 1.35, 0);
    fast.rig.drop(fast.sim);
    fast.rig.rode = DEPTH * 5;
    expect(fast.rig.setSpeed).toBeGreaterThan(MAX_SET_SPEED);
    const fx = fast.rig.x;
    const fy = fast.rig.y;
    run(fast, 5);
    const fastAlong = (fast.rig.x - fx) * wind.x + (fast.rig.y - fy) * wind.y;
    expect(fast.rig.held).toBe(false);
    expect(fastAlong).toBeGreaterThan(0.8);
    console.log(`DOCK_NUMBERS dragFast=${fastAlong.toFixed(2)} set=${fast.rig.setSpeed.toFixed(2)}`);
  });
});

describe('mooring line', () => {
  it('only succeeds within a metre and under half a knot', () => {
    expect(MOOR_REACH).toBe(1);
    expect(canMakeFast(1, MOOR_MS)).toBe(true);
    expect(canMakeFast(0.4, 0)).toBe(true);
    expect(canMakeFast(1.001, MOOR_MS)).toBe(false);
    expect(canMakeFast(0.4, MOOR_MS + 0.01)).toBe(false);

    const ok = new DockSession({ assisted: false });
    ok.sim.x = 5;
    ok.sim.y = 5.76;
    ok.sim.heading = Math.PI;
    ok.sim.vx = -0.05;
    ok.sim.vy = 0;
    ok.sim.sheet = 1;
    const ready = waterSpeed(ok.sim.vx, ok.sim.vy);
    expect(ready).toBeLessThan(MOOR_MS);
    expect(ok.fairlead().dist).toBeLessThan(1);
    ok.step(DT, idle({ moorPressed: true, sheetOut: 1 }));
    expect(ok.moored).toBe(true);

    const far = new DockSession({ assisted: false });
    far.sim.x = 5;
    far.sim.y = 3.2;
    far.sim.heading = Math.PI;
    far.sim.vx = 0;
    far.sim.vy = 0;
    far.step(DT, idle({ moorPressed: true }));
    expect(far.moored).toBe(false);
    expect(far.hint().urgent).toBe(true);

    const hot = new DockSession({ assisted: false });
    hot.sim.x = 5;
    hot.sim.y = 5.76;
    hot.sim.heading = Math.PI;
    hot.sim.vx = -0.8;
    hot.sim.vy = 0;
    hot.step(DT, idle({ moorPressed: true }));
    expect(hot.moored).toBe(false);
    expect(hot.hint().text.toLowerCase()).toContain('knot');
  });
});

describe('pontoon contact', () => {
  it('reports boat speed while the hull is touching the pontoon', () => {
    const session = new DockSession({ demo: false, assisted: false });
    session.sim.x = 4;
    session.sim.y = 6.55;
    session.sim.heading = 0;
    session.sim.vx = 1.4;
    session.sim.vy = 0;
    session.step(DT, idle());
    expect(session.touching, 'hull should meet the pontoon').toBe(true);
    expect(session.contactMs).toBeGreaterThan(1);
    session.sim.vx = 0.4;
    session.sim.vy = 0;
    session.step(DT, idle());
    expect(session.contactMs).toBeLessThanOrEqual(1);
  });
});

describe('impact', () => {
  it('classifies a gentle bump against a hard hit', () => {
    expect(classifyImpact(0.05, true)).toBe('none');
    expect(classifyImpact(0.3, true)).toBe('gentle');
    expect(classifyImpact(0.4, true)).toBe('gentle');
    expect(classifyImpact(0.4, false)).toBe('hard');
    expect(classifyImpact(1.1, true)).toBe('hard');

    const hard = new DockSession({ assisted: false });
    hard.sim.x = 5;
    hard.sim.y = 6.55;
    hard.sim.heading = 0;
    hard.sim.vy = 1.3;
    hard.sim.vx = 0;
    hard.step(DT, idle());
    expect(hard.impactClass).toBe('hard');
    expect(hard.impactMs).toBeGreaterThan(0.5);
    expect(hard.sim.y).toBeLessThan(6.55);

    const bump = new DockSession({ assisted: false });
    bump.sim.x = 5;
    bump.sim.y = 6.55;
    bump.sim.heading = 0;
    bump.sim.vy = 0.22;
    bump.sim.vx = 0;
    bump.step(DT, idle());
    expect(bump.impactClass).toBe('gentle');
    expect(bump.impactMs).toBeLessThan(0.5);
    console.log(`DOCK_NUMBERS hard=${hard.impactMs.toFixed(2)} gentle=${bump.impactMs.toFixed(2)}`);
  });

  it('resolveContact reports the closing speed in m/s', () => {
    const sim = new Simulation({ steady: true, waves: false, x: 5, y: 6.5, heading: 0, vy: 0.9 });
    const hit = resolveContact(sim, false, true);
    expect(hit.hit).toBe('hard');
    expect(hit.closing).toBeGreaterThan(0.5);
  });
});

describe('debrief', () => {
  it('says when the approach was too fast', () => {
    expect(
      tipFor({
        approachKn: 1.8,
        impactMs: 0.2,
        impactClass: 'gentle',
        distAtStop: 0.6,
        moored: false,
        anchorDown: false,
        scope: null,
        anchorHeld: false,
        setSpeedKn: null,
      }),
    ).toBe('You came in at 1.8 kn; luff earlier.');
  });
});

describe('practice run', () => {
  it('docks gently and then anchors so the hook holds', () => {
    const session = new DockSession({ demo: true, assisted: true });
    let mooredAt = -1;
    let heldAt = -1;
    for (let i = 0; i < 60 * 55; i++) {
      session.step(DT, idle({ sheetOut: 0 }));
      if (mooredAt < 0 && session.mooredOnce) mooredAt = session.sim.time;
      if (heldAt < 0 && session.rig.held && session.rig.scope >= 5) heldAt = session.sim.time;
      if (session.pilotPhase === 'done' && session.sim.time > heldAt + 1) break;
    }
    const report = session.report();
    const trace = session.trace().join('\n');
    console.log(
      `DOCK_NUMBERS mooredAt=${mooredAt.toFixed(1)} heldAt=${heldAt.toFixed(1)} x=${session.sim.x.toFixed(1)} y=${session.sim.y.toFixed(1)} approach=${report.approachKn} impact=${report.impactClass} ${report.impactMs.toFixed(2)} scope=${report.scope} tip=${report.tip}`,
    );
    expect(session.mooredOnce, trace).toBe(true);
    expect(report.impactClass, trace).not.toBe('hard');
    expect(session.rig.held, trace).toBe(true);
    expect(session.rig.scope).toBeGreaterThanOrEqual(5);
    expect(mooredAt).toBeGreaterThan(4);
    expect(heldAt).toBeGreaterThan(mooredAt);
    expect(heldAt).toBeLessThan(48);
  });
});
