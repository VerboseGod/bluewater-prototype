import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { neutralInput, controlsFromBoat, type BoatInput } from '../core/input';
import { FIXED_DT, createDock, step, stepDock } from '../core/step';
import { DockSession, type DockState } from '../core/dock/session';
import { DEG, KT } from '../core/sim/math';
import { Simulation, type BoatState, type SimOptions } from '../core/sim/sim';

const FIXTURES = join(import.meta.dirname, '..', 'core', 'fixtures');
const WRITE = process.env.GOLDEN_WRITE === '1';

interface Beat {
  steps: number;
  steer?: number;
  sheetIn?: number;
  sheetOut?: number;
  hike?: number;
  moveIn?: number;
  anchor?: boolean;
  moor?: boolean;
  scopeOut?: boolean;
}

interface Sample {
  i: number;
  t: number;
  x: number;
  y: number;
  heading: number;
  speed: number;
  heel: number;
  sheet: number;
  boom: number;
  twa: number;
  awa: number;
  vFwd: number;
  leeway: number;
  crew: number;
  sail: string;
  capsized: boolean;
  capsizeCount: number;
  tacks: number;
  gybes: number;
  moored?: boolean;
  anchorDown?: boolean;
  dist?: number;
}

interface Fixture {
  name: string;
  dt: number;
  kind: 'boat' | 'dock';
  note: string;
  every: number;
  setup: SimOptions;
  script: Beat[];
  initial: BoatState | DockState;
  samples: Sample[];
}

function beatInput(beat: Beat): BoatInput {
  const sheetIn = beat.sheetIn ?? 0;
  const sheetOut = beat.sheetOut ?? 0;
  return {
    ...neutralInput(),
    steer: beat.steer ?? 0,
    sheetIn,
    sheetOut,
    sheet: sheetIn - sheetOut,
    hike: beat.hike ?? 0,
    moveIn: beat.moveIn ?? 0,
    anchor: beat.anchor ?? false,
    moor: beat.moor ?? false,
    scopeOut: beat.scopeOut ?? false,
  };
}

function sampleBoat(state: BoatState, i: number, extra: Partial<Sample> = {}): Sample {
  const view = state.view;
  return {
    i,
    t: round(state.time),
    x: round(state.x),
    y: round(state.y),
    heading: round(state.heading),
    speed: round(view.speed),
    heel: round(state.heel),
    sheet: round(state.sheet),
    boom: round(state.boom),
    twa: round(view.twa),
    awa: round(view.awa),
    vFwd: round(view.vFwd),
    leeway: round(view.leeway),
    crew: round(state.crew),
    sail: view.sail,
    capsized: state.capsized,
    capsizeCount: state.capsizeCount,
    tacks: state.marks.filter((mark) => mark.type === 'tack').length,
    gybes: state.marks.filter((mark) => mark.type === 'gybe').length,
    ...extra,
  };
}

function round(n: number): number {
  return Math.round(n * 1e9) / 1e9;
}

function playBoat(initial: BoatState, script: Beat[], every: number): Sample[] {
  const total = script.reduce((sum, beat) => sum + beat.steps, 0);
  let state = initial;
  let i = 0;
  const samples: Sample[] = [];
  for (const beat of script) {
    const input = beatInput(beat);
    for (let n = 0; n < beat.steps; n++) {
      state = step(state, input, FIXED_DT);
      if (i % every === 0 || i === total - 1) samples.push(sampleBoat(state, i));
      i += 1;
    }
  }
  return samples;
}

function playDock(initial: DockState, script: Beat[], every: number): Sample[] {
  const total = script.reduce((sum, beat) => sum + beat.steps, 0);
  let state = initial;
  let i = 0;
  const samples: Sample[] = [];
  for (const beat of script) {
    const input = beatInput(beat);
    for (let n = 0; n < beat.steps; n++) {
      state = stepDock(state, input, FIXED_DT);
      if (i % every === 0 || i === total - 1) {
        const cleat = Math.hypot(state.boat.x - 5, state.boat.y - 7);
        samples.push(sampleBoat(state.boat, i, { moored: state.moored, anchorDown: state.rig.down, dist: round(cleat) }));
      }
      i += 1;
    }
  }
  return samples;
}

function freshBoat(opts: SimOptions, speed: number): BoatState {
  const heading = opts.heading ?? 0;
  const sim = new Simulation({
    steady: true,
    waves: false,
    assisted: false,
    windSpeed: 5.66,
    windFrom: Math.PI / 2,
    ...opts,
  });
  sim.vx = Math.cos(heading) * speed;
  sim.vy = Math.sin(heading) * speed;
  sim.syncPose();
  return sim.toState();
}

function loadOrRecord(name: string, built: Omit<Fixture, 'samples'> & { samples: Sample[] }, expectEvent: (samples: Sample[]) => void): void {
  expectEvent(built.samples);
  const path = join(FIXTURES, `${name}.json`);
  if (WRITE) {
    mkdirSync(FIXTURES, { recursive: true });
    writeFileSync(path, JSON.stringify(built, null, 2) + '\n');
  }
  const saved = JSON.parse(readFileSync(path, 'utf8')) as Fixture;
  expect(saved.samples).toEqual(built.samples);
  const replay = saved.kind === 'dock'
    ? playDock(saved.initial as DockState, saved.script, saved.every)
    : playBoat(saved.initial as BoatState, saved.script, saved.every);
  expect(replay).toEqual(saved.samples);
}

describe('plain step matches the class', () => {
  it('replays an open-water boat without dropping state', () => {
    const sim = new Simulation({
      steady: true,
      waves: false,
      assisted: false,
      windSpeed: 5.66,
      windFrom: Math.PI / 2,
      heading: 0.4,
      vx: 2,
      vy: 0.2,
    });
    let state = sim.toState();
    for (let i = 0; i < 240; i++) {
      const input = {
        ...neutralInput(),
        steer: Math.sin(i / 20) * 0.4,
        sheetIn: i % 80 < 40 ? 1 : 0,
        sheetOut: i % 80 >= 40 ? 0.5 : 0,
        hike: 0.2,
        moveIn: i > 100 ? 0.4 : 0,
      };
      input.sheet = input.sheetIn - input.sheetOut;
      sim.step(FIXED_DT, controlsFromBoat(input));
      state = step(state, input, FIXED_DT);
      expect(state.x).toBe(sim.x);
      expect(state.y).toBe(sim.y);
      expect(state.heading).toBe(sim.heading);
      expect(state.heel).toBe(sim.heel);
      expect(state.sheet).toBe(sim.sheet);
      expect(state.boom).toBe(sim.boom);
      expect(state.crew).toBe(sim.crew);
      expect(state.capsizeCount).toBe(sim.capsizeCount);
      expect(state.view.sail).toBe(sim.snapshot.sail);
      expect(state.marks.length).toBe(sim.marks.length);
    }
  });

  it('replays a dock approach without dropping state', () => {
    const session = new DockSession({ demo: false, assisted: true });
    let state = session.toState();
    for (let i = 0; i < 180; i++) {
      const input = { ...neutralInput(), steer: -0.25, sheetOut: 1, sheet: -1, anchor: i === 90 };
      session.step(FIXED_DT, {
        rudder: input.steer,
        sheetIn: input.sheetIn,
        sheetOut: input.sheetOut,
        hike: input.hike,
        moveIn: input.moveIn,
        anchorPressed: input.anchor,
        moorPressed: false,
        scopeOut: false,
        scopeIn: false,
        windPressed: false,
        tidePressed: false,
      });
      state = stepDock(state, input, FIXED_DT);
      expect(state.boat.x).toBe(session.sim.x);
      expect(state.boat.y).toBe(session.sim.y);
      expect(state.boat.heading).toBe(session.sim.heading);
      expect(state.rig.down).toBe(session.rig.down);
      expect(state.moored).toBe(session.moored);
    }
  });
});

describe('golden trajectories', () => {
  const windFrom = Math.PI / 2;
  const every = 30;

  it('records a tack', () => {
    const heading = windFrom - 48 * DEG;
    const setup: SimOptions = { windFrom, windSpeed: 5.66, heading, sheet: 0.84, assisted: true, steady: true, waves: false };
    const initial = freshBoat(setup, 2.45);
    const script: Beat[] = [
      { steps: 45, steer: 0, sheetIn: 0.2, hike: 0.3 },
      { steps: 220, steer: -0.42, sheetOut: 0.85, moveIn: 1 },
      { steps: 180, steer: -0.15, sheetIn: 0.7, hike: 0.6 },
    ];
    const samples = playBoat(initial, script, every);
    loadOrRecord('tack', {
      name: 'tack',
      dt: FIXED_DT,
      kind: 'boat',
      note: 'Close-hauled, ease and steer through the wind, then sheet in on the new tack.',
      every,
      setup,
      script,
      initial,
      samples,
    }, (rows) => {
      expect(rows[rows.length - 1].tacks).toBeGreaterThan(0);
    });
  });

  it('records a gybe', () => {
    const heading = windFrom - 150 * DEG;
    const setup: SimOptions = { windFrom, windSpeed: 5.66, heading, sheet: 0.28, assisted: true, steady: true, waves: false };
    const initial = freshBoat(setup, 2.4);
    const script: Beat[] = [
      { steps: 40, steer: 0, sheetOut: 0.4, hike: 0.2 },
      { steps: 280, steer: 0.55, sheetOut: 0.35, hike: 0.35, moveIn: 0.2 },
    ];
    const samples = playBoat(initial, script, every);
    loadOrRecord('gybe', {
      name: 'gybe',
      dt: FIXED_DT,
      kind: 'boat',
      note: 'Bear away from a deep broad reach and steer the stern through the wind.',
      every,
      setup,
      script,
      initial,
      samples,
    }, (rows) => {
      expect(rows[rows.length - 1].gybes).toBeGreaterThan(0);
    });
  });

  it('records a docking approach', () => {
    const setup: SimOptions = { steady: true, waves: false, assisted: true };
    const initial = createDock({ assisted: true });
    const script: Beat[] = [
      { steps: 360, steer: -0.28, sheetOut: 1, hike: 0 },
    ];
    const samples = playDock(initial, script, every);
    loadOrRecord('dock', {
      name: 'dock',
      dt: FIXED_DT,
      kind: 'dock',
      note: 'Practice dock, sail eased, bow steered toward the pontoon from the start pose.',
      every,
      setup,
      script,
      initial,
      samples,
    }, (rows) => {
      const first = rows[0].dist ?? 0;
      const last = rows[rows.length - 1].dist ?? first;
      expect(last).toBeLessThan(first);
      expect(rows[rows.length - 1].speed).toBeGreaterThan(0);
    });
  });

  it('records a capsize', () => {
    const heading = windFrom - 140 * DEG;
    const setup: SimOptions = { windFrom, windSpeed: 16 / KT, heading, sheet: 0.02, assisted: false, steady: true, waves: false };
    const initial = freshBoat(setup, 3.2);
    const script: Beat[] = [{ steps: 60 * 8, steer: 0.9, sheetOut: 1, hike: 0 }];
    const samples = playBoat(initial, script, every);
    loadOrRecord('capsize', {
      name: 'capsize',
      dt: FIXED_DT,
      kind: 'boat',
      note: '16 kn, sheet eased, no hike, helm held over from a broad reach until the boat capsizes.',
      every,
      setup,
      script,
      initial,
      samples,
    }, (rows) => {
      expect(rows.some((row) => row.capsizeCount > 0)).toBe(true);
    });
  });
});
