import { DEG, RAD, wrapPi } from '../sim/math';
import type { SailMode } from '../sim/sail';
import type { SimSnapshot } from '../sim/sim';

export type LessonId = 'wind' | 'reach' | 'points' | 'tack' | 'gybe' | 'return';

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
  | 'made-fast';

export type PointOfSail = 'no-go' | 'close-hauled' | 'close-reach' | 'beam-reach' | 'broad-reach' | 'run';

export const POINT_LABEL: Record<PointOfSail, string> = {
  'no-go': 'No-go',
  'close-hauled': 'Close-hauled',
  'close-reach': 'Close reach',
  'beam-reach': 'Beam reach',
  'broad-reach': 'Broad reach',
  run: 'Run',
};

/**
 * Bands for this dinghy. Inside about 35° it stops and the sail luffs.
 * Close-hauled is near 45°. A beam reach is the wind on the side.
 * A run is the wind aft of about 150°. Dead downwind is near 180°.
 */
export function pointOfSail(twaRad: number): PointOfSail {
  const deg = Math.abs(twaRad) * RAD;
  if (deg < 35) return 'no-go';
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
    return {
      id: 'capsize',
      level: 1,
      urgent: true,
      text: 'Capsized. Ease with {lt} and wait for the boat to right.',
    };
  }
  if ((lesson === 'gybe' || lesson === 'points') && struggle.byTheLee >= 0.8) {
    const level = struggle.byTheLee >= 2.2 ? 2 : 1;
    return {
      id: 'by-the-lee',
      level,
      urgent: true,
      text:
        level === 1
          ? 'By the lee. The wind is on the same side as the boom, and it can gybe itself.'
          : 'Still by the lee. Steer so the wind comes back onto the windward quarter.',
    };
  }
  if ((lesson === 'gybe' || lesson === 'points') && struggle.rolling >= 0.5) {
    const level = struggle.rolling >= 1.6 ? 2 : 1;
    return {
      id: 'death-roll',
      level,
      urgent: true,
      text:
        level === 1
          ? 'The boat is rolling. Sheet in a little with {rt} and hike with {a}, or it can death-roll.'
          : 'That roll is building into a death roll. Sheet in with {rt} and hold {a}.',
    };
  }
  if (struggle.irons >= 5) {
    const level = struggle.irons >= 9 ? 2 : 1;
    return {
      id: 'irons',
      level,
      urgent: true,
      text:
        level === 1
          ? 'In irons. Push the stick away from the sail and wait.'
          : 'Keep the stick away from the sail. When the bow falls off, sheet in with {rt}.',
    };
  }
  if ((lesson === 'reach' || lesson === 'points' || lesson === 'tack') && struggle.stalled >= 1.2) {
    const level = struggle.stalled >= 3 ? 2 : 1;
    return {
      id: 'stall',
      level,
      urgent: true,
      text:
        level === 1
          ? 'Stalled — sheeted too tight. Ease with {lt} until the telltales stream aft.'
          : 'Still stalled. Ease more with {lt}. The leeward telltale should stream aft.',
    };
  }
  if ((lesson === 'reach' || lesson === 'points' || lesson === 'tack') && struggle.heeled >= 1) {
    const level = struggle.heeled >= 2.5 ? 2 : 1;
    return {
      id: 'heel',
      level,
      urgent: false,
      text:
        level === 1
          ? 'Heeling. Hold {a} and hike out to windward.'
          : 'Still heeled. Hold {a} until the boat comes flat.',
    };
  }
  if (lesson === 'wind' && struggle.pinned >= 2) {
    return { id: 'pinned', level: 1, urgent: false, text: 'Ease with {lt} so the sail can shake. Luffing is the point.' };
  }
  if (lesson === 'reach' && struggle.luffingOnReach >= 2.5) {
    const level = struggle.luffingOnReach >= 5 ? 2 : 1;
    return {
      id: 'luff-reach',
      level,
      urgent: false,
      text:
        level === 1
          ? 'The sail is still luffing. Sheet in with {rt} until it goes quiet.'
          : 'Keep {rt} held until the shaking just stops, then let go.',
    };
  }
  if (lesson === 'wind' && struggle.offCourse >= 8) {
    const level = struggle.offCourse >= 14 ? 2 : 1;
    return {
      id: 'find-wind',
      level,
      urgent: false,
      text:
        level === 1
          ? 'Turn toward the wind arrow. The bow should meet the streaks.'
          : 'The arrow on the water points to where the wind comes from. Steer the bow at it.',
    };
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

export function debriefLine(id: LessonId, stars: number, mem: LessonMemory): string {
  if (id === 'tack') {
    const t = mem.tacks[mem.tacks.length - 1];
    if (!t) return 'No tack was recorded.';
    const kept = Math.round(t.kept * 100);
    return `Speed kept ${kept}% through the tack. Tack score ${t.quality.toFixed(2)}. A clean one keeps about 60% and scores over 0.55: sheet eased, helm smooth, sailor across while the sail is light.`;
  }
  if (id === 'gybe') {
    const g = mem.gybes[mem.gybes.length - 1];
    if (!g) return 'No gybe was recorded.';
    if (g.byTheLee) return 'The wind got onto the same side as the boom — by the lee — and the boom can crash across on its own.';
    if (!g.controlled) return 'The boom came across hard. Leave a little sheet on, and move your weight as it crosses.';
    return stars === 3
      ? 'Controlled gybe. The sheet was on, the boom did not slam, and you stayed off by the lee.'
      : 'The gybe was under control. Sheet a touch more next time so the roll stays small.';
  }
  if (id === 'return') {
    return stars === 3
      ? 'Head-to-wind, sail luffing, and made fast without a hard hit. That is how a dinghy stops.'
      : 'You came back. Next time, luff earlier so the approach stays under about 1.5 kn.';
  }
  if (id === 'wind') {
    return stars === 3
      ? 'Bow into the wind, sail luffing, and you still had steerage. That arc is the no-go zone.'
      : 'You found the no-go zone. Next time, ease the sheet as you turn in so you are not stuck in irons.';
  }
  if (id === 'reach') {
    return stars === 3
      ? 'Beam reach, sail quiet, boat flat. The telltales stream aft when the sheet is right.'
      : 'You crossed the wind. Trim until the shaking just stops, and hike if the rail digs in.';
  }
  return stars === 3
    ? 'Close-hauled, a reach, and a run. The wheel should have followed you around.'
    : 'You visited the points of sail. Close-hauled is toward the wind, a reach is across it, a run is away.';
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

export const LESSONS: readonly LessonDef[] = [
  {
    id: 'wind',
    title: 'Where the wind comes from',
    goal: 'Point the bow into the wind until the sail luffs. That is the no-go zone.',
    blurb: 'Find the wind. The sail shakes when you point into it.',
    steps: [
      {
        id: 'look',
        gate: 'nudged',
        hold: 0.4,
        say: 'The streaks on the water are the wind. Steer with {ls}.',
      },
      {
        id: 'point',
        gate: 'head-to-wind',
        hold: 0.5,
        say: 'Turn the bow into the wind. The arrow shows where it comes from.',
      },
      {
        id: 'luff',
        gate: 'luffing-nogo',
        hold: 2,
        say: 'Hold it. The sail is luffing. You are in the no-go zone.',
      },
    ],
  },
  {
    id: 'reach',
    title: 'Beam reach',
    goal: 'Sail across the wind, trim until the sail goes quiet, and keep the boat flat.',
    blurb: 'Wind on the beam. Trim the sheet. Hike the heel off.',
    steps: [
      {
        id: 'bear',
        gate: 'on-beam',
        hold: 0.6,
        say: 'Bear away with {ls} until the wind is on the beam. That is a beam reach.',
      },
      {
        id: 'trim',
        gate: 'beam-trimmed',
        hold: 0.7,
        say: 'Sheet in with {rt} until the shaking stops. The telltales should stream aft.',
      },
      {
        id: 'flat',
        gate: 'beam-flat',
        hold: 2.2,
        say: 'If the boat heels, hold {a} and hike. A flat boat keeps its speed.',
      },
    ],
  },
  {
    id: 'points',
    title: 'Points of sail',
    goal: 'Sail close-hauled, a reach, and a run. The wheel shows which one you are on.',
    blurb: 'Close-hauled, a reach, then a run.',
    steps: [
      {
        id: 'close',
        gate: 'close-hauled-sailing',
        hold: 1.6,
        say: 'Sail close-hauled. Toward the wind, but not into the no-go. Sheet in with {rt}.',
      },
      {
        id: 'reach',
        gate: 'reach-sailing',
        hold: 1.6,
        say: 'Bear away to a reach. The wind should be on the side of the boat.',
      },
      {
        id: 'run',
        gate: 'run-sailing',
        hold: 1.6,
        say: 'Bear away further, onto a run. Ease with {lt} so the sail stays full.',
      },
    ],
  },
  {
    id: 'tack',
    title: 'Tacking',
    goal: 'Tack onto the other close-hauled. Call it, steer through, change sides, keep your speed.',
    blurb: 'Ready about, lee-oh, through the wind, then the speed back.',
    steps: [
      {
        id: 'settle',
        gate: 'close-hauled-sailing',
        hold: 4.5,
        say: 'Settle close-hauled, sail full, boat moving. You are on a tack.',
      },
      {
        id: 'through',
        gate: 'tack-done',
        hold: 0.25,
        say: 'Call ready about, then lee-oh. Ease with {lt} and steer through the wind.',
      },
      {
        id: 'cross',
        gate: 'sides-changed',
        hold: 0.45,
        say: 'Cross the boat. {b} brings you in, then {a} hikes you out on the new side.',
      },
      {
        id: 'regain',
        gate: 'speed-back',
        hold: 3.2,
        say: 'Sheet in with {rt} on the new tack and let the speed come back.',
      },
    ],
  },
  {
    id: 'gybe',
    title: 'Gybing safely',
    goal: 'Gybe on a run, under control. Stay off by the lee, and do not let the boat death-roll.',
    blurb: 'A controlled gybe. Sheet on, weight across, no slam.',
    steps: [
      {
        id: 'prepare',
        gate: 'run-prepared',
        hold: 1.3,
        say: 'Bear away onto a run. Ease with {lt}, but leave a little sheet on.',
      },
      {
        id: 'through',
        gate: 'gybe-done',
        hold: 0.25,
        say: 'Call stand by to gybe. Steer the stern through the wind and cross as the boom comes over.',
      },
      {
        id: 'settle',
        gate: 'gybe-settled',
        hold: 1.4,
        say: 'New gybe. Sheet enough to stop the roll, and keep the wind on the windward quarter.',
      },
    ],
  },
  {
    id: 'return',
    title: 'Coming back',
    goal: 'Approach the pontoon head-to-wind and stop. Make fast once the boat has stopped.',
    blurb: 'Let the sail fly, point into the wind, and stop at the dock.',
    steps: [
      {
        id: 'fly',
        gate: 'sheet-flying',
        hold: 0.6,
        say: 'Let the sail fly. Hold {lt} so you are not driving at the pontoon.',
      },
      {
        id: 'head',
        gate: 'head-to-stop',
        hold: 0.7,
        say: 'Steer the bow into the wind with {ls}. Head-to-wind is how a dinghy stops.',
      },
      {
        id: 'fast',
        gate: 'made-fast',
        hold: 0.4,
        say: 'Glide in under half a knot. Within a metre, {rb} throws the mooring line.',
      },
    ],
  },
];

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

const TEACH_WIND = Math.PI / 2;
const TEACH_SPEED = 5.66;

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

export function launchFor(index: number): LessonLaunch {
  const i = Math.max(0, Math.min(LESSONS.length - 1, index));
  if (i === 0) return openLaunch(0, 90, 2.3, 0.5, 0.55);
  if (i === 1) return openLaunch(1, 42, 2.15, 0.12, 0.22);
  if (i === 2) return openLaunch(2, 90, 2.6, 0.5, 0.62);
  if (i === 3) return openLaunch(3, 48, 2.45, 0.84, 0.34);
  if (i === 4) return openLaunch(4, 152, 2.5, 0.4, 1.05);
  return {
    id: 'return',
    index: 5,
    world: 'dock',
    windFrom: TEACH_WIND,
    windSpeed: TEACH_SPEED,
    heading: 0.18,
    x: -1.7,
    y: 5.55,
    vx: 1.55,
    vy: 0,
    sheet: 0,
    boom: 1.35,
  };
}
