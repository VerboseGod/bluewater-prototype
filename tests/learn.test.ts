import { describe, expect, it } from 'vitest';
import { LearnDirector } from '../src/learn/director';
import {
  LESSONS,
  byTheLee,
  coachHint,
  comingBackGrade,
  freshMemory,
  freshStruggle,
  gateOpen,
  gybeStars,
  launchFor,
  lessonStars,
  pointOfSail,
  sampleOf,
  tackStars,
  updateStruggle,
  type DockView,
  type SailSample,
} from '../src/learn/model';
import { pilotStick } from '../src/learn/pilot';
import { loadProgress, recordPass, saveProgress, type Kv } from '../src/learn/progress';
import { Simulation } from '../src/sim/sim';

function sample(partial: Partial<SailSample> = {}): SailSample {
  return {
    twa: 0,
    awa: 0,
    sail: 'luffing',
    sheet: 0.2,
    heel: 0,
    heelRate: 0,
    vFwd: 0,
    speed: 0,
    inIrons: false,
    capsized: false,
    crew: 0,
    boom: 0.4,
    rudder: 0,
    aoa: 0,
    shake: 0,
    time: 0,
    tackQuality: 0,
    x: 0,
    y: 0,
    ...partial,
  };
}

function memoryWith(partial: Partial<ReturnType<typeof freshMemory>> = {}) {
  return { ...freshMemory(), ...partial };
}

class MemoryStore implements Kv {
  map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

describe('points of sail', () => {
  it('matches the dinghy bands', () => {
    const deg = (d: number) => (d * Math.PI) / 180;
    expect(pointOfSail(deg(10))).toBe('no-go');
    expect(pointOfSail(deg(34))).toBe('no-go');
    expect(pointOfSail(deg(45))).toBe('close-hauled');
    expect(pointOfSail(deg(70))).toBe('close-reach');
    expect(pointOfSail(deg(90))).toBe('beam-reach');
    expect(pointOfSail(deg(130))).toBe('broad-reach');
    expect(pointOfSail(deg(165))).toBe('run');
    expect(pointOfSail(deg(-90))).toBe('beam-reach');
  });

  it('calls by the lee the way the boom does', () => {
    expect(byTheLee(3.0, -0.8)).toBe(true);
    expect(byTheLee(3.0, 0.8)).toBe(false);
    expect(byTheLee(2.5, 0.8)).toBe(false);
    expect(byTheLee(3.0, 0.01)).toBe(false);
  });
});

describe('lesson 1 pass and hints', () => {
  it('passes only when the bow is in the no-go and the sail is luffing', () => {
    const mem = freshMemory();
    expect(gateOpen('luffing-nogo', sample({ twa: 0.2, sail: 'luffing' }), mem)).toBe(true);
    expect(gateOpen('luffing-nogo', sample({ twa: 0.2, sail: 'trimmed' }), mem)).toBe(false);
    expect(gateOpen('luffing-nogo', sample({ twa: 1.4, sail: 'luffing' }), mem)).toBe(false);
    expect(gateOpen('luffing-nogo', sample({ twa: 0.3, inIrons: true, sail: 'trimmed' }), mem)).toBe(true);
  });

  it('waits five seconds in irons, then speaks, then speaks again', () => {
    const boat = sample({ inIrons: true, twa: 0.2, sail: 'luffing' });
    const early = freshStruggle();
    early.irons = 4.9;
    expect(coachHint('wind', boat, early)).toBeNull();
    const due = freshStruggle();
    due.irons = 5;
    const first = coachHint('wind', boat, due);
    expect(first?.id).toBe('irons');
    expect(first?.level).toBe(1);
    expect(first?.text).toBe('In irons. Push the stick away from the sail and wait.');
    const later = freshStruggle();
    later.irons = 9;
    const second = coachHint('wind', boat, later);
    expect(second?.level).toBe(2);
    expect(second?.text).toContain('sheet in');
  });

  it('counts irons time and lets it decay', () => {
    const s = freshStruggle();
    updateStruggle(s, sample({ inIrons: true }), 3);
    expect(s.irons).toBeCloseTo(3);
    updateStruggle(s, sample({ inIrons: false, twa: 1.2 }), 1);
    expect(s.irons).toBeCloseTo(1);
  });
});

describe('lesson 2 pass and hints', () => {
  const beam = 90 * (Math.PI / 180);

  it('passes a flat trimmed beam reach and refuses a stall', () => {
    const mem = freshMemory();
    expect(
      gateOpen('beam-flat', sample({ twa: beam, sail: 'trimmed', vFwd: 2.2, heel: 0.1 }), mem),
    ).toBe(true);
    expect(
      gateOpen('beam-flat', sample({ twa: beam, sail: 'stalled', vFwd: 2.2, heel: 0.05 }), mem),
    ).toBe(false);
    expect(
      gateOpen('beam-flat', sample({ twa: beam, sail: 'trimmed', vFwd: 2.2, heel: 0.4 }), mem),
    ).toBe(false);
    expect(gateOpen('on-beam', sample({ twa: 0.4 }), mem)).toBe(false);
  });

  it('hints when the sail is stalled and when the boat stays heeled', () => {
    const stalled = freshStruggle();
    stalled.stalled = 1.2;
    expect(coachHint('reach', sample({ sail: 'stalled' }), stalled)?.id).toBe('stall');
    const longer = freshStruggle();
    longer.stalled = 3;
    expect(coachHint('reach', sample(), longer)?.level).toBe(2);
    const heeled = freshStruggle();
    heeled.heeled = 1;
    expect(coachHint('reach', sample({ heel: 0.4 }), heeled)?.text).toContain('{a}');
    const still = freshStruggle();
    still.heeled = 2.5;
    expect(coachHint('reach', sample(), still)?.level).toBe(2);
  });

  it('asks for sheet when a reach keeps luffing', () => {
    const s = freshStruggle();
    s.luffingOnReach = 2.5;
    expect(coachHint('reach', sample({ sail: 'luffing' }), s)?.id).toBe('luff-reach');
    s.luffingOnReach = 2;
    expect(coachHint('reach', sample({ sail: 'luffing' }), s)).toBeNull();
  });
});

describe('lesson 3 points', () => {
  it('requires close-hauled, a reach, and a run', () => {
    const mem = freshMemory();
    expect(gateOpen('close-hauled-sailing', sample({ twa: 48 * Math.PI / 180, sail: 'trimmed', vFwd: 2 }), mem)).toBe(true);
    expect(gateOpen('close-hauled-sailing', sample({ twa: 90 * Math.PI / 180, sail: 'trimmed', vFwd: 2 }), mem)).toBe(false);
    expect(gateOpen('reach-sailing', sample({ twa: 90 * Math.PI / 180, sail: 'trimmed', vFwd: 2 }), mem)).toBe(true);
    expect(gateOpen('run-sailing', sample({ twa: 160 * Math.PI / 180, sail: 'trimmed', sheet: 0.4, vFwd: 1.6 }), mem)).toBe(true);
    expect(gateOpen('run-sailing', sample({ twa: 100 * Math.PI / 180, sheet: 0.4, vFwd: 1.6 }), mem)).toBe(false);
  });

  it('gives three stars only when each point was sailed cleanly', () => {
    const mem = freshMemory();
    mem.clean = { close: true, reach: true, run: true };
    expect(lessonStars('points', sample(), mem)).toBe(3);
    mem.clean = { close: true, reach: true, run: false };
    expect(lessonStars('points', sample(), mem)).toBe(2);
    mem.clean = { close: false, reach: false, run: false };
    expect(lessonStars('points', sample(), mem)).toBe(1);
  });
});

describe('lesson 4 tacking', () => {
  it('grades speed kept with the tack-quality thresholds', () => {
    expect(tackStars(0.62, 0.6)).toBe(3);
    expect(tackStars(0.55, 0.55)).toBe(3);
    expect(tackStars(0.5, 0.6)).toBe(2);
    expect(tackStars(0.2, 0.35)).toBe(2);
    expect(tackStars(0.2, 0.1)).toBe(1);
  });

  it('passes once a tack is done, the sailor has crossed, and the boat is moving again', () => {
    const mem = memoryWith({
      tacks: [
        { at: 1, x: 0, y: 0, entry: 2.4, min: 1.5, exit: 2, kept: 0.62, quality: 0.6, crossed: true, stars: 3 },
      ],
    });
    expect(gateOpen('tack-done', sample(), mem)).toBe(true);
    expect(gateOpen('tack-done', sample(), freshMemory())).toBe(false);
    expect(gateOpen('sides-changed', sample({ awa: 0.6, twa: 0.7, crew: -0.4 }), mem)).toBe(true);
    expect(gateOpen('sides-changed', sample({ awa: 0.6, twa: 0.7, crew: 0.4 }), mem)).toBe(false);
    expect(
      gateOpen('speed-back', sample({ twa: 0.85, sail: 'trimmed', vFwd: 1.6 }), mem),
    ).toBe(true);
    expect(gateOpen('speed-back', sample({ twa: 0.2, sail: 'luffing', vFwd: 0.4, inIrons: true }), mem)).toBe(false);
    expect(lessonStars('tack', sample(), mem)).toBe(3);
  });
});

describe('lesson 5 gybing', () => {
  it('warns about by the lee and a death roll, and not before they develop', () => {
    const lee = freshStruggle();
    lee.byTheLee = 0.7;
    expect(coachHint('gybe', sample(), lee)).toBeNull();
    lee.byTheLee = 0.8;
    expect(coachHint('gybe', sample(), lee)?.id).toBe('by-the-lee');
    expect(coachHint('gybe', sample(), lee)?.text).toContain('By the lee');
    lee.byTheLee = 2.2;
    expect(coachHint('gybe', sample(), lee)?.level).toBe(2);
    const roll = freshStruggle();
    roll.rolling = 0.5;
    expect(coachHint('gybe', sample(), roll)?.id).toBe('death-roll');
    expect(coachHint('gybe', sample(), roll)?.text).toContain('death-roll');
    roll.rolling = 1.6;
    expect(coachHint('gybe', sample(), roll)?.level).toBe(2);
    expect(coachHint('gybe', sample(), roll)?.text).toContain('death roll');
  });

  it('counts a controlled gybe and refuses a capsize', () => {
    expect(gybeStars({ controlled: true, byTheLee: false, capsized: false, kept: 0.7 })).toBe(3);
    expect(gybeStars({ controlled: true, byTheLee: false, capsized: false, kept: 0.4 })).toBe(2);
    expect(gybeStars({ controlled: false, byTheLee: true, capsized: false, kept: 0.8 })).toBe(1);
    expect(gybeStars({ controlled: true, byTheLee: false, capsized: true, kept: 0.8 })).toBe(0);
    const good = memoryWith({
      gybes: [
        {
          at: 2,
          x: 0,
          y: 0,
          entry: 2,
          exit: 1.8,
          kept: 0.9,
          sheet: 0.35,
          shake: 0.1,
          byTheLee: false,
          capsized: false,
          controlled: true,
          stars: 3,
        },
      ],
    });
    expect(gateOpen('gybe-done', sample(), good)).toBe(true);
    expect(gateOpen('gybe-settled', sample({ twa: 2.6, boom: 0.8, vFwd: 1.6, heel: 0.1 }), good)).toBe(true);
    expect(gateOpen('gybe-settled', sample({ twa: 3.05, boom: -0.8, vFwd: 1.6 }), good)).toBe(false);
    const crash = memoryWith({
      gybes: [{ ...good.gybes[0], capsized: true, stars: 0 }],
    });
    expect(gateOpen('gybe-done', sample(), crash)).toBe(false);
  });

  it('accumulates by-the-lee and roll time from the boat', () => {
    const s = freshStruggle();
    updateStruggle(s, sample({ twa: 3.02, boom: -0.9, sheet: 0.2, heel: 0.3 }), 1);
    expect(s.byTheLee).toBeCloseTo(1);
    expect(s.rolling).toBeCloseTo(1);
  });
});

describe('lesson 6 coming back', () => {
  const dock = (partial: Partial<DockView>): DockView => ({
    moored: false,
    approachKn: 0.8,
    impactClass: 'none',
    distAtStop: null,
    stopped: false,
    ...partial,
  });
  const head = sample({ twa: 0.2, sail: 'luffing', speed: 0.3, sheet: 0.05 });

  it('reuses the docking score for a head-to-wind stop', () => {
    expect(comingBackGrade(dock({ moored: true, approachKn: 0.9, impactClass: 'gentle' }), head)).toEqual({
      pass: true,
      stars: 3,
    });
    expect(comingBackGrade(dock({ moored: true, approachKn: 1.8, impactClass: 'gentle' }), head).stars).toBe(2);
    expect(comingBackGrade(dock({ moored: true, impactClass: 'hard', approachKn: 2 }), head).stars).toBe(1);
    expect(
      comingBackGrade(dock({ distAtStop: 1.2, stopped: true, impactClass: 'gentle' }), head),
    ).toEqual({ pass: true, stars: 2 });
    expect(comingBackGrade(dock({ distAtStop: 4, stopped: true, impactClass: 'none' }), head).stars).toBe(1);
    expect(comingBackGrade(dock({ distAtStop: 1, impactClass: 'hard' }), head).pass).toBe(false);
    expect(comingBackGrade(null, head).pass).toBe(false);
    expect(gateOpen('made-fast', head, memoryWith({ dock: dock({ moored: true }) }))).toBe(true);
  });
});

describe('progress', () => {
  it('keeps the better star count', () => {
    const store = new MemoryStore();
    const saved = recordPass(recordPass({ stars: {}, done: [] }, 'wind', 2), 'wind', 1);
    saveProgress(saved, store);
    const loaded = loadProgress(store);
    expect(loaded.stars.wind).toBe(2);
    expect(loaded.done).toEqual(['wind']);
    expect(loadProgress(new MemoryStore()).done).toEqual([]);
  });
});

describe('menu', () => {
  it('moves with the d-pad and starts the focused lesson', () => {
    const director = new LearnDirector(null);
    director.move(1);
    director.move(1);
    expect(director.cursor).toBe(2);
    const launch = director.confirm();
    expect(launch?.id).toBe('points');
    expect(director.phase).toBe('sail');
    expect(director.back()).toBe('menu');
    expect(director.back()).toBe('close');
  });
});

function sailLesson(index: number, seconds: number): LearnDirector {
  const director = new LearnDirector(null);
  const launch = director.begin(index);
  const sim = new Simulation({
    windSpeed: launch.windSpeed,
    windFrom: launch.windFrom,
    steady: true,
    waves: false,
    assisted: true,
    heading: launch.heading,
    x: launch.x,
    y: launch.y,
    vx: launch.vx,
    vy: launch.vy,
    sheet: launch.sheet,
  });
  sim.boom = launch.boom;
  const dt = 1 / 60;
  for (let i = 0; i < seconds * 60 && director.phase === 'sail'; i++) {
    const before = sim.marks.length;
    const preview = sampleOf(sim.snapshot, sim.lastTackQuality);
    const stick = pilotStick(launch.id, director.stepId, preview, director.memory.helmSide);
    sim.step(dt, stick);
    const added = sim.marks.length > before ? sim.marks[sim.marks.length - 1].type : null;
    director.tick(dt, sampleOf(sim.snapshot, sim.lastTackQuality), null, added);
  }
  return director;
}

describe('autopilot against the sim', () => {
  it('finishes lesson 1, finding the wind', () => {
    const director = sailLesson(0, 25);
    expect(director.phase).toBe('debrief');
    expect(director.stars).toBeGreaterThanOrEqual(1);
  });

  it('finishes lesson 2, a beam reach', () => {
    const director = sailLesson(1, 30);
    expect(director.phase).toBe('debrief');
    expect(director.stars).toBeGreaterThanOrEqual(1);
  });

  it('finishes lesson 4 and records the tack score', () => {
    const director = sailLesson(3, 40);
    expect(director.phase, director.stepId).toBe('debrief');
    expect(director.memory.tacks.length).toBeGreaterThan(0);
    const tack = director.memory.tacks[0];
    expect(tack.entry).toBeGreaterThan(1);
    expect(tack.kept).toBeGreaterThan(0);
    expect(tack.kept).toBeLessThanOrEqual(1);
    expect(director.view().debrief).toContain('Tack score');
  });

  it('exposes the same tack-quality number the forces use', () => {
    const launch = launchFor(3);
    const sim = new Simulation({
      windSpeed: launch.windSpeed,
      windFrom: launch.windFrom,
      steady: true,
      waves: false,
      assisted: true,
      heading: launch.heading,
      vx: launch.vx,
      vy: launch.vy,
      sheet: launch.sheet,
    });
    let peak = 0;
    for (let i = 0; i < 60 * 8; i++) {
      sim.step(1 / 60, { rudder: -0.36, sheetIn: 0, sheetOut: 0.8, hike: 0, moveIn: i > 40 ? 1 : 0 });
      peak = Math.max(peak, sim.lastTackQuality);
    }
    expect(peak).toBeGreaterThan(0);
    expect(LESSONS).toHaveLength(6);
  });
});
