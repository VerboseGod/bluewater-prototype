import { describe, expect, it } from 'vitest';
import { advanceCourse, initialCourse } from '../core/harbour/course';
import { DREDGED_DEPTH } from '../core/harbour/depth';
import { applyGrounding, DRAFT } from '../core/harbour/ground';
import { HarbourSession } from '../core/harbour/session';
import { waveScaleAt } from '../core/harbour/waves';
import { applyWindShadow, shadowAt, type ShadowWall } from '../core/harbour/windshadow';
import { herzliya } from '../core/harbour/world';
import { sampleWater } from '../core/sim/water';
import { makeSim } from './support';
import type { InputState } from '../src/input';
import { DT } from './support';

const WALL: ShadowWall = { x1: 0, y1: -15, x2: 0, y2: 15, height: 8 };
const FROM_WEST = Math.PI;

describe('berth wind', () => {
  it('is a breeze at the berth, not dead air', () => {
    const session = new HarbourSession();
    session.step(1 / 60, emptyInput());
    expect(session.sim.snapshot.tws).toBeGreaterThan(3);
    expect(session.sim.snapshot.aws).toBeGreaterThan(2);
    expect(session.shadowFactor).toBeGreaterThan(0.7);
  });
});

describe('herzliya extract', () => {
  it('parses breakwater segments and seamarks', () => {
    expect(herzliya.extract.breakwaters.length).toBe(5);
    expect(herzliya.extract.breakwaterSegments).toBe(104);
    expect(herzliya.extract.seamarks.filter((s) => s.type === 'light_minor')).toHaveLength(2);
    expect(herzliya.extract.seamarks.length).toBeGreaterThanOrEqual(6);
    expect(herzliya.extract.piers.length).toBeGreaterThan(10);
    expect(herzliya.buildings.length).toBeGreaterThan(50);
    expect(herzliya.depth.insideMarina(herzliya.course.start.x, herzliya.course.start.y)).toBe(true);
    expect(herzliya.depth.depthAt(herzliya.course.start.x, herzliya.course.start.y)).toBe(DREDGED_DEPTH);
    for (const mark of herzliya.course.marks) {
      expect(herzliya.depth.insideMarina(mark.x, mark.y)).toBe(false);
      expect(herzliya.depth.insideBreakwater(mark.x, mark.y)).toBe(false);
      expect(herzliya.depth.depthAt(mark.x, mark.y)).toBeGreaterThan(DRAFT);
    }
  });
});

describe('wind shadow', () => {
  it('reduces and shifts the wind in the lee, and leaves the upwind side alone', () => {
    const open = { vel: { x: 6, y: 0 }, speed: 6, from: FROM_WEST, factor: 1 };
    const lee = applyWindShadow(open, 8, 0, [WALL]);
    const up = applyWindShadow(open, -8, 0, [WALL]);
    const aside = applyWindShadow(open, 8, 40, [WALL]);
    expect(lee.speed).toBeLessThan(open.speed * 0.75);
    expect(Math.abs(lee.from - open.from)).toBeGreaterThan(0.04);
    expect(up.speed).toBe(open.speed);
    expect(up.from).toBe(open.from);
    expect(aside.speed).toBe(open.speed);

    const tall = shadowAt(10, 0, FROM_WEST, [{ ...WALL, height: 12 }]);
    const low = shadowAt(10, 0, FROM_WEST, [{ ...WALL, height: 3 }]);
    expect(tall.factor).toBeLessThan(low.factor);
    const near = shadowAt(6, 0, FROM_WEST, [WALL]);
    const far = shadowAt(50, 0, FROM_WEST, [WALL]);
    expect(near.factor).toBeLessThan(far.factor);
  });

  it('uses a real breakwater segment the same way', () => {
    const wall = herzliya.walls
      .filter((w) => w.height >= 4)
      .sort((a, b) => Math.abs(b.y2 - b.y1) - Math.abs(a.y2 - a.y1))[0];
    const mx = (wall.x1 + wall.x2) / 2;
    const my = (wall.y1 + wall.y2) / 2;
    const len = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1) || 1;
    const nx = -(wall.y2 - wall.y1) / len;
    const ny = (wall.x2 - wall.x1) / len;
    const from = Math.atan2(ny, nx);
    const lee = shadowAt(mx - nx * 8, my - ny * 8, from, [wall]);
    const up = shadowAt(mx + nx * 12, my + ny * 12, from, [wall]);
    expect(lee.factor).toBeLessThan(0.8);
    expect(up.factor).toBeGreaterThan(0.95);
  });
});

describe('harbour waves', () => {
  it('is calmer inside the breakwater than outside, and calmer in the shallows', () => {
    const deepIn = waveScaleAt(true, 8);
    const deepOut = waveScaleAt(false, 8);
    const shoal = waveScaleAt(false, 1.2);
    expect(deepIn).toBeLessThan(deepOut);
    expect(shoal).toBeLessThan(deepOut);
    const inside = peak(deepIn);
    const outside = peak(deepOut);
    expect(inside).toBeLessThan(outside);
  });
});

describe('grounding', () => {
  it('stops the boat on a shoal and counts one contact until it floats again', () => {
    const sim = makeSim({ x: 0, y: 0, vx: 2, vy: 0.4 });
    const hit = applyGrounding(sim, 0.3, false);
    expect(hit.grounded).toBe(true);
    expect(hit.fresh).toBe(true);
    expect(sim.vx).toBe(0);
    expect(sim.vy).toBe(0);
    const again = applyGrounding(sim, 0.3, true);
    expect(again.fresh).toBe(false);
    const afloat = applyGrounding(sim, 4, true);
    expect(afloat.grounded).toBe(false);
    expect(applyGrounding(sim, DRAFT, false).grounded).toBe(false);
  });
});

describe('harbour course', () => {
  it('walks berth, exit, marks, return, and dock', () => {
    const g = herzliya.course;
    let state = initialCourse();
    state = advanceCourse(state, g.berth.x, g.berth.y, true, g);
    expect(state.phase).toBe('berth');

    const exitPoint = {
      x: g.berth.x + (g.dogleg.x - g.berth.x) * 0.55,
      y: g.berth.y + (g.dogleg.y - g.berth.y) * 0.55,
    };
    state = advanceCourse(state, exitPoint.x, exitPoint.y, true, g);
    expect(state.phase).toBe('exit');

    const outside = { x: g.gate.x + g.gate.ox * 40, y: g.gate.y + g.gate.oy * 40 };
    state = advanceCourse(state, outside.x, outside.y, false, g);
    expect(state.phase).toBe('marks');

    state = advanceCourse(state, g.marks[0].x, g.marks[0].y, false, g);
    expect(state.phase).toBe('marks');
    expect(state.rounded).toEqual([true, false]);

    state = advanceCourse(state, g.marks[1].x, g.marks[1].y, false, g);
    expect(state.phase).toBe('return');
    expect(state.rounded).toEqual([true, true]);

    state = advanceCourse(state, g.reenter.x, g.reenter.y, true, g);
    expect(state.phase).toBe('dock');
  });
});

describe('harbour demo', () => {
  it('sails out, rounds both marks, and docks', () => {
    const session = new HarbourSession({ demo: true, wind: 3 });
    const idle = emptyInput();
    const c = session.world.course;
    const trace: string[] = [
      `start ${c.start.x.toFixed(0)},${c.start.y.toFixed(0)} hdg ${(c.start.heading * 180 / Math.PI).toFixed(0)}`,
      `gate ${c.gate.x.toFixed(0)},${c.gate.y.toFixed(0)} out ${(c.gate.ox).toFixed(2)},${c.gate.oy.toFixed(2)}`,
      `dog ${c.dogleg.x.toFixed(0)},${c.dogleg.y.toFixed(0)} ch ${c.channel.x.toFixed(0)},${c.channel.y.toFixed(0)} out ${c.outside.x.toFixed(0)},${c.outside.y.toFixed(0)}`,
      `marks ${c.marks.map((m) => `${m.x.toFixed(0)},${m.y.toFixed(0)}`).join(' | ')}`,
      `aim ${c.aim.map((m) => `${m.x.toFixed(0)},${m.y.toFixed(0)}`).join(' | ')}`,
      `cleat ${c.cleat.x.toFixed(0)},${c.cleat.y.toFixed(0)} along ${c.alongside.x.toFixed(0)},${c.alongside.y.toFixed(0)}`,
    ];
    for (let i = 0; i < 720 * 60; i++) {
      session.step(DT, idle);
      if (i % 600 === 0) {
        const s = session.sim;
        const snap = s.snapshot;
        trace.push(
          `${s.time.toFixed(0)}s ${session.phase} (${s.x.toFixed(0)},${s.y.toFixed(0)}) spd ${snap.speed.toFixed(2)} hdg ${(snap.heading * 180 / Math.PI).toFixed(0)} twa ${(snap.twa * 180 / Math.PI).toFixed(0)} ${snap.sail} sheet ${snap.sheet.toFixed(2)} heel ${(snap.heel * 180 / Math.PI).toFixed(0)} depth ${session.world.depth.depthAt(s.x, s.y).toFixed(1)} g ${session.groundings}`,
        );
      }
      if (session.moored && session.phase === 'dock' && session.course.rounded[0] && session.course.rounded[1]) break;
    }
    expect(trace.join('\n') + `\nphase ${session.phase} moored ${session.moored}`).toContain('dock');
    expect(session.course.rounded).toEqual([true, true]);
    expect(session.moored).toBe(true);
    expect(session.phase).toBe('dock');
  }, 30_000);
});

function peak(scale: number): number {
  let max = 0;
  for (let t = 0; t < 40; t += 0.25) {
    max = Math.max(max, Math.abs(sampleWater(0, 0, t, true, undefined, scale).height));
  }
  return max;
}

function emptyInput(): InputState {
  return {
    rudder: 0,
    sheetIn: 0,
    sheetOut: 0,
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
    paddle: false,
  };
}
