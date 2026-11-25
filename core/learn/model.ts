import coaching from '../data/coaching.json';
import lessonsFile from '../data/lessons.json';
import scenarios from '../data/scenarios.json';
import { DEG, RAD, wrapPi } from '../sim/math';
import type { SailMode } from '../sim/sail';
import type { SimSnapshot } from '../sim/sim';

export type LessonId =
  | 'wind'
  | 'stop'
  | 'reach'
  | 'points'
  | 'tack'
  | 'irons'
  | 'return'
  | 'gybe'
  | 'capsize'
  | 'safety'
  | 'mob'
  | 'rules';

export type GateId =
  | 'nudged'
  | 'head-to-wind'
  | 'luffing-nogo'
  | 'on-beam'
  | 'beam-trimmed'
  | 'beam-flat'
  | 'close-hauled-sailing'
  | 'reach-sailing'
  | 'run-sailing'
  | 'tack-done'
  | 'sides-changed'
  | 'speed-back'
  | 'run-prepared'
  | 'gybe-done'
  | 'gybe-settled'
  | 'sheet-flying'
  | 'head-to-stop'
  | 'made-fast'
  | 'lying-to'
  | 'fell-off'
  | 'filled-away'
  | 'shown';

export type PointOfSail = 'no-go' | 'close-hauled' | 'close-reach' | 'beam-reach' | 'broad-reach' | 'run';

export const POINT_LABEL: Record<PointOfSail, string> = lessonsFile.pointLabels;

/**
 * Bands a sailor is taught. The no-go zone is about 45° either side of the
 * true wind. Close hauled starts at that edge. A beam reach is the wind on
 * the side. A run is the wind aft of about 150°.
 */
export function pointOfSail(twaRad: number): PointOfSail {
  const deg = Math.abs(twaRad) * RAD;
  if (deg < 45) return 'no-go';
  if (deg < 62) return 'close-hauled';
  if (deg < 78) return 'close-reach';
  if (deg < 112) return 'beam-reach';
  if (deg < 150) return 'broad-reach';
  return 'run';
}

/**
 * The same test the boom uses: past about 170° true, with the wind already
 * on the boom's side, the boom comes across on its own.
 */
export function byTheLee(twa: number, boom: number): boolean {
  if (Math.abs(boom) < 0.04) return false;
  return Math.abs(twa) > 2.97 && Math.sign(twa) !== Math.sign(boom);
}

export interface SailSample {
  twa: number;
  awa: number;
  sail: SailMode;
  sheet: number;
  heel: number;
  heelRate: number;
  vFwd: number;
  speed: number;
  inIrons: boolean;
  capsized: boolean;
  crew: number;
  boom: number;
  rudder: number;
  aoa: number;
  shake: number;
  time: number;
  tackQuality: number;
  x: number;
  y: number;
}

export function sampleOf(s: SimSnapshot, tackQuality = 0): SailSample {
  return {
    twa: s.twa,
    awa: s.awa,
    sail: s.sail,
    sheet: s.sheet,
    heel: s.heel,
    heelRate: s.heelRate,
    vFwd: s.vFwd,
    speed: s.speed,
    inIrons: s.inIrons,
    capsized: s.capsized,
    crew: s.crew,
    boom: s.boom,
    rudder: s.rudder,
    aoa: s.aoa,
    shake: s.shake,
    time: s.time,
    tackQuality,
    x: s.x,
    y: s.y,
  };
}

export function onWindward(sample: SailSample): boolean {
  const windward = -(Math.sign(sample.awa) || Math.sign(sample.twa) || 1);
  return sample.crew * windward > 0.15;
}

export interface TackRecord {
  at: number;
  x: number;
  y: number;
  entry: number;
  min: number;
  exit: number;
  /** Minimum speed through the tack, divided by the speed you came in with. */
  kept: number;
  /** Peak of the sim's existing tack-quality term during the turn. */
  quality: number;
  crossed: boolean;
  stars: 1 | 2 | 3;
}

export interface GybeRecord {
  at: number;
  x: number;
  y: number;
  entry: number;
  exit: number;
  kept: number;
  sheet: number;
  shake: number;
  byTheLee: boolean;
  capsized: boolean;
  controlled: boolean;
  stars: 0 | 1 | 2 | 3;
}

export interface DockView {
  moored: boolean;
  approachKn: number | null;
  impactClass: 'none' | 'gentle' | 'hard';
  distAtStop: number | null;
  stopped: boolean;
  /** Boat speed, m/s, while the hull is touching. Zero when it is clear. */
  contactMs?: number;
}

/** A pontoon approach faster than this, at contact, has to go round. */
export const APPROACH_TOO_FAST_MS = 1;

export const APPROACH_TOO_FAST = 'too fast, go round and try again';

export function approachTooFast(dock: DockView | null): boolean {
  return (dock?.contactMs ?? 0) > APPROACH_TOO_FAST_MS;
}

export interface LessonMemory {
  stepTime: number;
  helmSide: number;
  tacks: TackRecord[];
  gybes: GybeRecord[];
  dock: DockView | null;
  clean: { close: boolean; reach: boolean; run: boolean };
}

export function freshMemory(helmSide = 1): LessonMemory {
  return {
    stepTime: 0,
    helmSide,
    tacks: [],
    gybes: [],
    dock: null,
    clean: { close: false, reach: false, run: false },
  };
}

export interface Struggle {
  irons: number;
  stalled: number;
  luffingOnReach: number;
  heeled: number;
  byTheLee: number;
  rolling: number;
  pinned: number;
  offCourse: number;
}

export function freshStruggle(): Struggle {
  return {
    irons: 0,
    stalled: 0,
    luffingOnReach: 0,
    heeled: 0,
    byTheLee: 0,
    rolling: 0,
    pinned: 0,
    offCourse: 0,
  };
}

function accum(on: boolean, value: number, dt: number): number {
  return on ? value + dt : Math.max(0, value - dt * 2);
}

export function updateStruggle(s: Struggle, sample: SailSample, dt: number): void {
  const point = pointOfSail(sample.twa);
  s.irons = accum(sample.inIrons, s.irons, dt);
  s.stalled = accum(sample.sail === 'stalled' && sample.speed > 0.4, s.stalled, dt);
  s.luffingOnReach = accum(
    (point === 'beam-reach' || point === 'close-reach') && sample.sail === 'luffing' && !sample.inIrons,
    s.luffingOnReach,
    dt,
  );
  s.heeled = accum(Math.abs(sample.heel) > 0.3 && !sample.capsized, s.heeled, dt);
  s.byTheLee = accum(byTheLee(sample.twa, sample.boom), s.byTheLee, dt);
  const running = Math.abs(sample.twa) > 2.35;
  const rolling = running && sample.sheet < 0.32 && (Math.abs(sample.heel) > 0.22 || Math.abs(sample.heelRate) > 0.4);
  s.rolling = accum(rolling, s.rolling, dt);
  s.pinned = accum(Math.abs(sample.twa) < 0.6 && sample.sheet > 0.45 && sample.sail !== 'luffing', s.pinned, dt);
  s.offCourse = accum(Math.abs(sample.twa) > 0.7, s.offCourse, dt);
}

export interface Hint {
  id: string;
  text: string;
  urgent: boolean;
  level: 1 | 2;
}

/** One coaching line. A longer struggle replaces it with the next line. */
export function coachHint(lesson: LessonId, sample: SailSample, struggle: Struggle): Hint | null {
  if (sample.capsized) {
    return { id: 'capsize', level: 1, urgent: true, text: coaching.capsize };
  }
  if ((lesson === 'gybe' || lesson === 'points') && struggle.byTheLee >= 0.8) {
    const level = struggle.byTheLee >= 2.2 ? 2 : 1;
    return { id: 'by-the-lee', level, urgent: true, text: coaching.byTheLee[level - 1] };
  }
  if ((lesson === 'gybe' || lesson === 'points') && struggle.rolling >= 0.5) {
    const level = struggle.rolling >= 1.6 ? 2 : 1;
    return { id: 'death-roll', level, urgent: true, text: coaching.deathRoll[level - 1] };
  }
  if (struggle.irons >= 5) {
    const level = struggle.irons >= 9 ? 2 : 1;
    return { id: 'irons', level, urgent: true, text: coaching.irons[level - 1] };
  }
  if ((lesson === 'reach' || lesson === 'points' || lesson === 'tack') && struggle.stalled >= 1.2) {
    const level = struggle.stalled >= 3 ? 2 : 1;
    return { id: 'stall', level, urgent: true, text: coaching.stall[level - 1] };
  }
  if ((lesson === 'reach' || lesson === 'points' || lesson === 'tack') && struggle.heeled >= 1) {
    const level = struggle.heeled >= 2.5 ? 2 : 1;
    return { id: 'heel', level, urgent: false, text: coaching.heel[level - 1] };
  }
  if (lesson === 'wind' && struggle.pinned >= 2) {
    return { id: 'pinned', level: 1, urgent: false, text: coaching.pinned };
  }
  if (lesson === 'reach' && struggle.luffingOnReach >= 2.5) {
    const level = struggle.luffingOnReach >= 5 ? 2 : 1;
    return { id: 'luff-reach', level, urgent: false, text: coaching.luffReach[level - 1] };
  }
  if (lesson === 'wind' && struggle.offCourse >= 8) {
    const level = struggle.offCourse >= 14 ? 2 : 1;
    return { id: 'find-wind', level, urgent: false, text: coaching.findWind[level - 1] };
  }
  return null;
}

/** A clean tack in this boat keeps about 60% of entry speed and scores over 0.55. */
export function tackStars(kept: number, quality: number): 1 | 2 | 3 {
  if (kept >= 0.55 && quality >= 0.55) return 3;
  if (kept >= 0.38 || quality >= 0.35) return 2;
  return 1;
}

export function gybeStars(g: { controlled: boolean; byTheLee: boolean; capsized: boolean; kept: number }): 0 | 1 | 2 | 3 {
  if (g.capsized) return 0;
  if (g.controlled && !g.byTheLee && g.kept >= 0.6) return 3;
  if (g.controlled && !g.byTheLee) return 2;
  return 1;
}

/**
 * Head-to-wind stop, graded from the docking score.
 * A hot approach is the score's own 1.5 kn line. A hard hit is its hard class.
 * Made fast under half a knot, inside a metre, is what the mooring line already requires.
 */
export function comingBackGrade(dock: DockView | null, sample: SailSample): { pass: boolean; stars: 0 | 1 | 2 | 3 } {
  if (!dock) return { pass: false, stars: 0 };
  const head = Math.abs(sample.twa) < 0.7 && (sample.sail === 'luffing' || sample.inIrons || sample.sheet < 0.22);
  const slow = sample.speed < 0.55;
  const near = dock.distAtStop != null && dock.distAtStop <= 2.5;
  const noted = dock.distAtStop != null;
  const gentle = dock.impactClass !== 'hard';
  const calm = dock.approachKn == null || dock.approachKn < 1.5;
  if (dock.moored && gentle && calm && head) return { pass: true, stars: 3 };
  if (dock.moored && gentle) return { pass: true, stars: 2 };
  if (dock.moored) return { pass: true, stars: 1 };
  if (head && slow && near && gentle) return { pass: true, stars: 2 };
  if (head && slow && noted && gentle && (dock.stopped || near)) return { pass: true, stars: 1 };
  return { pass: false, stars: 0 };
}

export function gateOpen(id: GateId, sample: SailSample, mem: LessonMemory): boolean {
  const point = pointOfSail(sample.twa);
  const moving = sample.vFwd > 1.15 && !sample.inIrons && !sample.capsized;
  switch (id) {
    case 'nudged':
      return Math.abs(sample.rudder) > 0.12 || mem.stepTime > 3.5;
    case 'head-to-wind':
      return Math.abs(sample.twa) < 28 * DEG;
    case 'luffing-nogo':
      return Math.abs(sample.twa) < 32 * DEG && (sample.sail === 'luffing' || sample.inIrons);
    case 'on-beam':
      return point === 'beam-reach';
    case 'beam-trimmed':
      return point === 'beam-reach' && sample.sail === 'trimmed' && sample.vFwd > 1.2;
    case 'beam-flat':
      return point === 'beam-reach' && sample.sail === 'trimmed' && sample.vFwd > 1.4 && Math.abs(sample.heel) < 0.28;
    case 'close-hauled-sailing':
      return point === 'close-hauled' && sample.sail === 'trimmed' && moving;
    case 'reach-sailing':
      return (point === 'beam-reach' || point === 'close-reach') && sample.sail === 'trimmed' && moving;
    case 'run-sailing':
      return Math.abs(sample.twa) > 140 * DEG && sample.sheet < 0.62 && sample.vFwd > 1.1 && !sample.capsized;
    case 'tack-done':
      return mem.tacks.length > 0;
    case 'sides-changed':
      return mem.tacks.length > 0 && onWindward(sample);
    case 'speed-back':
      return (
        mem.tacks.length > 0 &&
        sample.vFwd > 1.35 &&
        !sample.inIrons &&
        !sample.capsized &&
        point !== 'no-go' &&
        sample.sail !== 'luffing'
      );
    case 'run-prepared':
      return Math.abs(sample.twa) > 145 * DEG && sample.sheet > 0.12 && sample.sheet < 0.62 && sample.vFwd > 1.15 && !sample.capsized;
    case 'gybe-done': {
      const g = mem.gybes[mem.gybes.length - 1];
      return !!g && !g.capsized;
    }
    case 'gybe-settled': {
      const g = mem.gybes[mem.gybes.length - 1];
      return !!g && !g.capsized && !sample.capsized && sample.vFwd > 1.15 && !byTheLee(sample.twa, sample.boom) && Math.abs(sample.heel) < 0.45;
    }
    case 'sheet-flying':
      return sample.sheet < 0.28 || sample.sail === 'luffing';
    case 'head-to-stop':
      return Math.abs(sample.twa) < 40 * DEG && (sample.sail === 'luffing' || sample.inIrons || sample.speed < 0.9);
    case 'made-fast':
      return comingBackGrade(mem.dock, sample).pass;
    case 'lying-to':
      return Math.abs(sample.twa) < 42 * DEG && sample.sheet < 0.35 && (sample.sail === 'luffing' || sample.inIrons || sample.speed < 1.2);
    case 'fell-off':
      return Math.abs(sample.twa) > 50 * DEG && !sample.inIrons;
    case 'filled-away':
      return sample.vFwd > 1 && sample.sail === 'trimmed' && point !== 'no-go' && !sample.inIrons;
    case 'shown':
      return mem.stepTime > 0.3;
    default:
      return false;
  }
}

export function lessonStars(id: LessonId, sample: SailSample, mem: LessonMemory): 1 | 2 | 3 {
  if (id === 'tack') return mem.tacks[mem.tacks.length - 1]?.stars ?? 1;
  if (id === 'gybe') {
    const stars = mem.gybes[mem.gybes.length - 1]?.stars ?? 1;
    return stars === 0 ? 1 : stars;
  }
  if (id === 'return') return comingBackGrade(mem.dock, sample).stars || 1;
  if (id === 'wind') {
    if (Math.abs(sample.twa) < 18 * DEG && sample.sail === 'luffing' && !sample.inIrons) return 3;
    if (!sample.inIrons) return 2;
    return 1;
  }
  if (id === 'reach') {
    if (pointOfSail(sample.twa) === 'beam-reach' && sample.sail === 'trimmed' && Math.abs(sample.heel) < 0.16 && sample.vFwd > 2) {
      return 3;
    }
    if (sample.sail === 'trimmed' && Math.abs(sample.heel) < 0.24) return 2;
    return 1;
  }
  if (id === 'points') {
    const c = mem.clean;
    if (c.close && c.reach && c.run) return 3;
    if ((c.close ? 1 : 0) + (c.reach ? 1 : 0) + (c.run ? 1 : 0) >= 2) return 2;
    return 1;
  }
  return 1;
}

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => String(values[key] ?? ''));
}

export function debriefLine(id: LessonId, stars: number, mem: LessonMemory): string {
  const line = coaching.debrief;
  if (id === 'tack') {
    const t = mem.tacks[mem.tacks.length - 1];
    if (!t) return line.tackNone;
    return fill(line.tack, { kept: Math.round(t.kept * 100), quality: t.quality.toFixed(2) });
  }
  if (id === 'gybe') {
    const g = mem.gybes[mem.gybes.length - 1];
    if (!g) return line.gybeNone;
    if (g.byTheLee) return line.gybeLee;
    if (!g.controlled) return line.gybeSlam;
    return stars === 3 ? line.gybeClean : line.gybeOk;
  }
  if (id === 'return') return stars === 3 ? line.returnClean : line.returnOk;
  if (id === 'wind') return stars === 3 ? line.windClean : line.windOk;
  if (id === 'stop') return line.stop;
  if (id === 'irons') return line.irons;
  if (id === 'capsize') return line.capsize;
  if (id === 'safety' || id === 'mob' || id === 'rules') return line.card;
  if (id === 'reach') return stars === 3 ? line.reachClean : line.reachOk;
  return stars === 3 ? line.pointsClean : line.pointsOk;
}

export interface LessonStep {
  id: string;
  gate: GateId;
  /** Seconds the gate must stay true. */
  hold: number;
  say: string;
}

export interface LessonDef {
  id: LessonId;
  title: string;
  goal: string;
  blurb: string;
  steps: LessonStep[];
}

export const LESSONS: readonly LessonDef[] = lessonsFile.lessons as readonly LessonDef[];

export interface LessonLaunch {
  id: LessonId;
  index: number;
  world: 'open' | 'dock';
  windFrom: number;
  windSpeed: number;
  heading: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  sheet: number;
  boom: number;
}

const TEACH_WIND = scenarios.learn.windFrom;
const TEACH_SPEED = scenarios.learn.windSpeed;

interface LaunchSpec {
  id: string;
  world: 'open' | 'dock';
  twaDeg?: number;
  speed?: number;
  sheet: number;
  boom: number;
  heading?: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

function openLaunch(index: number, twaDeg: number, speed: number, sheet: number, boom: number): LessonLaunch {
  const heading = wrapPi(TEACH_WIND - twaDeg * DEG);
  return {
    id: LESSONS[index].id,
    index,
    world: 'open',
    windFrom: TEACH_WIND,
    windSpeed: TEACH_SPEED,
    heading,
    x: 0,
    y: 0,
    vx: Math.cos(heading) * speed,
    vy: Math.sin(heading) * speed,
    sheet,
    boom,
  };
}

function dockLaunch(index: number): LessonLaunch {
  const spec = (scenarios.learn.launches as readonly LaunchSpec[]).find((item) => item.id === 'return');
  return {
    id: 'return',
    index,
    world: 'dock',
    windFrom: TEACH_WIND,
    windSpeed: TEACH_SPEED,
    heading: spec?.heading ?? 0,
    x: spec?.x ?? 0,
    y: spec?.y ?? 0,
    vx: spec?.vx ?? 0,
    vy: spec?.vy ?? 0,
    sheet: spec?.sheet ?? 0,
    boom: spec?.boom ?? 0,
  };
}

export function launchFor(index: number): LessonLaunch {
  const specs = scenarios.learn.launches as readonly LaunchSpec[];
  const i = Math.max(0, Math.min(LESSONS.length - 1, index));
  const id = LESSONS[i].id;
  const spec = specs.find((item) => item.id === id) ?? specs.find((item) => item.id === 'card');
  if (!spec || spec.world === 'dock') return dockLaunch(i);
  return openLaunch(i, spec.twaDeg ?? 0, spec.speed ?? 0, spec.sheet, spec.boom);
}
