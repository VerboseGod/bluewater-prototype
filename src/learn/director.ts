import { wrapPi } from '../sim/math';
import {
  LESSONS,
  coachHint,
  debriefLine,
  freshMemory,
  freshStruggle,
  gateOpen,
  launchFor,
  lessonStars,
  pointOfSail,
  updateStruggle,
  type DockView,
  type Hint,
  type LessonDef,
  type LessonId,
  type LessonLaunch,
  type LessonMemory,
  type PointOfSail,
  type SailSample,
  type Struggle,
  type TackRecord,
} from './model';
import { loadProgress, recordPass, saveProgress, type Kv, type Progress } from './progress';
import { ManeuverWatch } from './watch';

export type LearnPhase = 'menu' | 'sail' | 'debrief';

export interface LearnView {
  phase: LearnPhase;
  cursor: number;
  titles: { id: LessonId; title: string; blurb: string; stars: number }[];
  lesson: number | null;
  lessonCount: number;
  title: string;
  goal: string;
  say: string;
  urgent: boolean;
  stepId: string;
  point: PointOfSail | null;
  twa: number;
  showWheel: boolean;
  stars: number;
  debrief: string;
  tacks: TackRecord[];
  ribbon: { x: number; y: number }[];
  passed: boolean;
}

export class LearnDirector {
  phase: LearnPhase = 'menu';
  cursor = 0;
  lessonIndex = 0;
  stepIndex = 0;
  hold = 0;
  stars = 0;
  struggle: Struggle = freshStruggle();
  memory: LessonMemory = freshMemory();
  ribbon: { x: number; y: number }[] = [];
  hint: Hint | null = null;
  private watch = new ManeuverWatch();
  private ribbonAcc = 0;
  private progress: Progress;
  private readonly store: Kv | null | undefined;

  constructor(store?: Kv | null) {
    this.store = store;
    this.progress = loadProgress(store);
  }

  get lesson(): LessonDef | null {
    return this.phase === 'menu' ? null : LESSONS[this.lessonIndex];
  }

  get lessonNumber(): number {
    return this.lessonIndex + 1;
  }

  get stepId(): string {
    return this.lesson?.steps[this.stepIndex]?.id ?? '';
  }

  completed(): number[] {
    return this.progress.done.map((id) => LESSONS.findIndex((lesson) => lesson.id === id) + 1).filter((n) => n > 0);
  }

  move(dir: -1 | 1): void {
    if (this.phase !== 'menu') return;
    const n = LESSONS.length;
    this.cursor = (this.cursor + dir + n) % n;
  }

  /** Start the focused lesson, or the next one from the debrief. */
  confirm(): LessonLaunch | null {
    if (this.phase === 'menu') return this.begin(this.cursor);
    if (this.phase === 'debrief') {
      const next = this.lessonIndex + 1;
      if (next < LESSONS.length) return this.begin(next);
      this.phase = 'menu';
    }
    return null;
  }

  back(): 'menu' | 'close' {
    if (this.phase === 'menu') return 'close';
    this.phase = 'menu';
    this.hint = null;
    return 'menu';
  }

  begin(index: number): LessonLaunch {
    const launch = launchFor(index);
    this.lessonIndex = launch.index;
    this.phase = 'sail';
    this.stepIndex = 0;
    this.hold = 0;
    this.stars = 0;
    this.hint = null;
    this.struggle = freshStruggle();
    this.watch.reset();
    this.ribbon = [];
    this.ribbonAcc = 0;
    const side = Math.sign(wrapHeading(launch)) || 1;
    this.memory = freshMemory(side);
    return launch;
  }

  restart(): LessonLaunch {
    return this.begin(this.lessonIndex);
  }

  tick(dt: number, sample: SailSample, dock: DockView | null, added: 'tack' | 'gybe' | null): LearnPhase {
    if (this.phase !== 'sail') return this.phase;
    const lesson = LESSONS[this.lessonIndex];
    this.memory.stepTime += dt;
    this.memory.dock = dock;
    updateStruggle(this.struggle, sample, dt);
    this.watch.push(sample, dt, added);
    this.memory.tacks = this.watch.tacks;
    this.memory.gybes = this.watch.gybes;
    this.pushRibbon(sample, dt);
    this.hint = coachHint(lesson.id, sample, this.struggle);
    const step = lesson.steps[this.stepIndex];
    if (!step) return this.phase;
    if (gateOpen(step.gate, sample, this.memory)) this.hold += dt;
    else this.hold = 0;
    if (this.hold < step.hold) return this.phase;
    this.noteClean(step.gate, sample);
    this.stepIndex += 1;
    this.hold = 0;
    this.memory.stepTime = 0;
    if (Math.abs(sample.twa) > 0.35) this.memory.helmSide = Math.sign(sample.twa) || this.memory.helmSide;
    if (this.stepIndex < lesson.steps.length) return this.phase;
    this.stars = lessonStars(lesson.id, sample, this.memory);
    this.phase = 'debrief';
    this.progress = recordPass(this.progress, lesson.id, this.stars);
    saveProgress(this.progress, this.store);
    return this.phase;
  }

  view(sample?: SailSample | null): LearnView {
    const lesson = this.phase === 'menu' ? null : LESSONS[this.lessonIndex];
    const step = lesson?.steps[this.stepIndex];
    const say = this.hint?.text ?? step?.say ?? '';
    return {
      phase: this.phase,
      cursor: this.cursor,
      titles: LESSONS.map((item) => ({
        id: item.id,
        title: item.title,
        blurb: item.blurb,
        stars: this.progress.stars[item.id] ?? 0,
      })),
      lesson: lesson ? this.lessonIndex + 1 : null,
      lessonCount: LESSONS.length,
      title: lesson?.title ?? 'Learn to sail',
      goal: lesson?.goal ?? '',
      say,
      urgent: !!this.hint?.urgent,
      stepId: step?.id ?? '',
      point: sample ? pointOfSail(sample.twa) : null,
      twa: sample?.twa ?? 0,
      showWheel: lesson?.id === 'points' && this.phase === 'sail',
      stars: this.stars,
      debrief: lesson && this.phase === 'debrief' ? debriefLine(lesson.id, this.stars, this.memory) : '',
      tacks: this.memory.tacks,
      ribbon: this.ribbon,
      passed: this.phase === 'debrief',
    };
  }

  private noteClean(gate: string, sample: SailSample): void {
    if (gate === 'close-hauled-sailing' && sample.sail === 'trimmed') this.memory.clean.close = true;
    if (gate === 'reach-sailing' && sample.sail === 'trimmed') this.memory.clean.reach = true;
    if (gate === 'run-sailing') this.memory.clean.run = true;
  }

  private pushRibbon(sample: SailSample, dt: number): void {
    this.ribbonAcc += dt;
    if (this.ribbon.length > 0 && this.ribbonAcc < 0.35) return;
    this.ribbonAcc = 0;
    const last = this.ribbon[this.ribbon.length - 1];
    if (last && Math.hypot(sample.x - last.x, sample.y - last.y) < 0.7) return;
    this.ribbon.push({ x: sample.x, y: sample.y });
    if (this.ribbon.length > 700) this.ribbon.splice(0, this.ribbon.length - 700);
  }
}

function wrapHeading(launch: LessonLaunch): number {
  return wrapPi(launch.windFrom - launch.heading);
}
