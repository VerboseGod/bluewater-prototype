import { AnchorRig } from '../dock/anchor';
import { classifyImpact, type ImpactClass } from '../dock/contact';
import { holdMooring, mooringReadiness } from '../dock/mooring';
import { Scoreboard, type DockReport } from '../dock/score';
import type { ScenarioInput as InputState } from '../input';
import scenarios from '../data/scenarios.json';
import { headingFwd, KT, wrapPi } from '../sim/math';
import { boomForSheet } from '../sim/sail';
import { Simulation } from '../sim/sim';
import { collideSolids } from './collide';
import { advanceCourse, initialCourse, type CourseState, type HarbourPhase } from './course';
import { applyGrounding } from './ground';
import { HarbourPilot, type PilotCmd } from './pilot';
import { waveScaleAt } from './waves';
import { applyWindShadow } from './windshadow';
import { herzliya, type HarbourWorld } from './world';

export interface HarbourWind {
  id: string;
  label: string;
  /** Direction the wind comes from, radians. 0 is from the east, π/2 from the north. */
  from: number;
}

/** Afternoon sea breeze, plus a south-westerly. Speed stays 11 kn, the open-water breeze. */
export const HARBOUR_WINDS: readonly HarbourWind[] = scenarios.harbour.winds;

export const HARBOUR_WIND_MS = scenarios.harbour.windSpeed;

export interface HarbourReport {
  phase: HarbourPhase;
  timeSec: number;
  groundings: number;
  shadowMoments: number;
  shadowSeconds: number;
  wind: string;
  dock: DockReport;
}

/**
 * Herzliya marina on the same dinghy. Wind shadow, shoal water, and the
 * visitor pontoon sit on top of the open-water step.
 */
export class HarbourSession {
  readonly world: HarbourWorld = herzliya;
  readonly sim: Simulation;
  readonly demo: boolean;
  course: CourseState = initialCourse();
  groundings = 0;
  shadowMoments = 0;
  shadowSeconds = 0;
  shadowFactor = 1;
  moored = false;
  mooredOnce = false;
  windIndex = 0;
  rig = new AnchorRig();
  private score = new Scoreboard();
  private pilot: HarbourPilot | null;
  private touching = false;
  private visitorWas = false;
  private grounded = false;
  private shadowed = false;
  private reject: { text: string; until: number } | null = null;
  impactClass: ImpactClass = 'none';

  constructor(opts?: { demo?: boolean; wind?: number }) {
    this.demo = opts?.demo ?? false;
    this.windIndex = opts?.wind ?? 0;
    const course = this.world.course;
    this.sim = new Simulation({
      steady: this.demo,
      waves: true,
      assisted: true,
      windSpeed: HARBOUR_WIND_MS,
      windFrom: this.windFrom,
      x: course.start.x,
      y: course.start.y,
      heading: course.start.heading,
      sheet: 0.48,
      vx: 0,
      vy: 0,
    });
    const twa0 = wrapPi(this.windFrom - course.start.heading);
    this.sim.boom = Math.sign(twa0 || -1) * boomForSheet(0.48);
    this.sim.wind.modify = (x, y, sample) => {
      const next = applyWindShadow(sample, x, y, this.world.walls);
      this.shadowFactor = sample.speed > 0.2 ? next.speed / sample.speed : 1;
      return next;
    };
    this.sim.waveScale = (x, y) => waveScaleAt(this.world.depth.insideMarina(x, y), this.world.depth.depthAt(x, y));
    this.pilot = this.demo ? new HarbourPilot() : null;
    this.score.reset(0);
  }

  get windFrom(): number {
    return HARBOUR_WINDS[this.windIndex].from;
  }

  get windLabel(): string {
    return HARBOUR_WINDS[this.windIndex].label;
  }

  get phase(): HarbourPhase {
    return this.course.phase;
  }

  cycleWind(): void {
    this.windIndex = (this.windIndex + 1) % HARBOUR_WINDS.length;
    this.sim.wind.baseFrom = this.windFrom;
  }

  reset(): void {
    const course = this.world.course;
    const sim = this.sim;
    sim.x = course.start.x;
    sim.y = course.start.y;
    sim.heading = course.start.heading;
    sim.vx = 0;
    sim.vy = 0;
    sim.yawRate = 0;
    sim.heel = 0;
    sim.heelRate = 0;
    sim.sheet = 0.48;
    const twa0 = wrapPi(this.windFrom - course.start.heading);
    sim.boom = Math.sign(twa0 || -1) * boomForSheet(0.48);
    sim.boom = 0;
    sim.boomRate = 0;
    sim.planing = false;
    sim.capsized = false;
    sim.wind.baseFrom = this.windFrom;
    sim.wind.baseSpeed = HARBOUR_WIND_MS;
    this.course = initialCourse();
    this.groundings = 0;
    this.shadowMoments = 0;
    this.shadowSeconds = 0;
    this.shadowFactor = 1;
    this.shadowed = false;
    this.moored = false;
    this.mooredOnce = false;
    this.touching = false;
    this.visitorWas = false;
    this.grounded = false;
    this.impactClass = 'none';
    this.reject = null;
    this.rig = new AnchorRig();
    this.score.reset(sim.time);
    this.pilot?.reset();
    sim.syncPose();
  }

  step(dt: number, input: InputState): void {
    const auto = this.pilot?.sample(this, dt) ?? null;
    if (!this.demo && input.windPressed) this.cycleWind();
    this.readDeck(dt, input, auto);
    if (this.reject && this.sim.time > this.reject.until) this.reject = null;

    this.sim.step(dt, {
      rudder: auto ? auto.rudder : input.rudder,
      sheetIn: auto ? auto.sheetIn : input.sheetIn,
      sheetOut: auto ? auto.sheetOut : input.sheetOut,
      hike: auto ? auto.hike : input.hike,
      moveIn: auto ? auto.moveIn : input.moveIn,
    });

    const paddle = auto ? auto.paddle : !!input.paddle;
    if (paddle && !auto?.creep && Math.hypot(this.sim.vx, this.sim.vy) < 1.8 && !this.sim.capsized) {
      const fwd = headingFwd(this.sim.heading);
      this.sim.vx += fwd.x * 2.4 * dt;
      this.sim.vy += fwd.y * 2.4 * dt;
    }
    if (auto?.creep && !this.moored) {
      const cleat = this.world.course.alongside;
      const dx = cleat.x - this.sim.x;
      const dy = cleat.y - this.sim.y;
      const d = Math.hypot(dx, dy) || 1;
      const spd = Math.min(0.34, Math.max(0.1, (d - 0.8) * 0.18));
      this.sim.vx = (dx / d) * spd;
      this.sim.vy = (dy / d) * spd;
    }

    const contact = collideSolids(this.sim, this.world.solids, this.touching);
    this.touching = contact.touching;
    if (contact.hit === 'hard') this.sim.buzz(0.7, 0.4, 180);
    else if (contact.hit === 'gentle') this.sim.buzz(0.1, 0.18, 80);

    let dockClosing = 0;
    let dockHit: ImpactClass = 'none';
    if (contact.visitor && contact.visitorClosing > 0) {
      dockHit = this.visitorWas ? 'none' : classifyImpact(contact.visitorClosing, true);
      dockClosing = contact.visitorClosing;
      this.visitorWas = true;
      if (dockHit === 'hard') this.impactClass = 'hard';
      else if (dockHit === 'gentle' && this.impactClass === 'none') this.impactClass = 'gentle';
    } else if (!contact.visitor) this.visitorWas = false;

    const depth = this.world.depth.depthAt(this.sim.x, this.sim.y);
    const ground = applyGrounding(this.sim, depth, this.grounded);
    this.grounded = ground.grounded;
    if (ground.fresh) {
      this.groundings += 1;
      this.sim.buzz(0.85, 0.5, 240);
    }

    if (this.moored) holdMooring(this.sim, dt, this.world.course.cleat);
    this.rig.update(this.sim, dt);

    const inside = this.world.depth.insideMarina(this.sim.x, this.sim.y);
    this.course = advanceCourse(this.course, this.sim.x, this.sim.y, inside, this.world.course);

    if (this.shadowFactor < 0.75) {
      if (!this.shadowed) this.shadowMoments += 1;
      this.shadowed = true;
      this.shadowSeconds += dt;
    } else if (this.shadowFactor > 0.9) this.shadowed = false;

    const ready = mooringReadiness(this.sim, this.world.course.cleat);
    this.score.observe(this.sim, ready.dist, dockClosing, dockHit, this.rig, this.mooredOnce, this.world.course.berthAxis);
    this.sim.syncPose();
  }

  report(): HarbourReport {
    return {
      phase: this.course.phase,
      timeSec: this.sim.time,
      groundings: this.groundings,
      shadowMoments: this.shadowMoments,
      shadowSeconds: this.shadowSeconds,
      wind: this.windLabel,
      dock: this.score.report(this.sim, this.rig, this.mooredOnce, this.moored),
    };
  }

  isAground(): boolean {
    return this.grounded;
  }

  hint(): { text: string; urgent: boolean } {
    if (this.reject) return { text: this.reject.text, urgent: true };
    if (this.grounded) {
      return { text: 'Aground. The board is in the mud. Hold D-pad left, or Q, and paddle back toward deeper water.', urgent: true };
    }
    if (this.moored && this.course.phase === 'dock' && this.course.rounded[0] && this.course.rounded[1]) {
      return { text: 'Made fast on the visitor pontoon. Menu opens the chart.', urgent: false };
    }
    if (this.moored) return { text: 'Made fast. RB or M lets the line go.', urgent: false };
    if (this.course.phase === 'berth') {
      return {
        text: 'Slow speed inside the marina. Sheet in and leave under sail, or hold D-pad left to paddle. LB cycles the wind.',
        urgent: false,
      };
    }
    if (this.course.phase === 'exit') {
      return { text: 'Take the entrance between the red and green lights. Both flash every 5 seconds.', urgent: false };
    }
    if (this.course.phase === 'marks') {
      const left = this.course.rounded[0] ? 'One mark done.' : 'Round the two yellow practice marks.';
      return { text: `${left} They are not charted buoys.`, urgent: false };
    }
    if (this.course.phase === 'return') {
      return { text: 'Back through the entrance, then alongside the visitor pontoon. Ease the sheet and make fast under half a knot.', urgent: false };
    }
    return {
      text: 'Visitor pontoon. Let the sail fly. RB or M throws the line once you are within a metre and under half a knot.',
      urgent: false,
    };
  }

  strip(): { text: string; kind: 'info' | 'good' | 'bad'; sticky?: boolean } {
    const phase = this.course.phase;
    const inside = this.world.depth.insideMarina(this.sim.x, this.sim.y);
    const shadow = this.shadowFactor < 0.75 ? ' · wind shadow' : '';
    const ground = this.groundings ? ` · groundings ${this.groundings}` : '';
    const kind = this.grounded ? 'bad' : this.moored ? 'good' : 'info';
    if (inside && phase !== 'marks') {
      return { text: `Slow speed inside the marina · ${this.windLabel}${ground}`, kind, sticky: true };
    }
    return { text: `${this.windLabel} · ${phase}${shadow}${ground}`, kind };
  }

  private readDeck(dt: number, input: InputState, auto: PilotCmd | null): void {
    const anchorPressed = auto ? auto.anchor : input.anchorPressed;
    const moorPressed = auto ? auto.moor : input.moorPressed;
    const scopeOut = auto ? auto.scopeOut : input.scopeOut;
    const scopeIn = auto ? auto.scopeIn : input.scopeIn;
    if (anchorPressed) {
      if (this.rig.down) this.rig.weigh();
      else this.rig.drop(this.sim);
    }
    if (moorPressed) this.throwLine();
    if (scopeOut) this.rig.pay(dt);
    if (scopeIn) this.rig.shorten(dt);
  }

  private throwLine(): void {
    if (this.moored) {
      this.moored = false;
      return;
    }
    const ready = mooringReadiness(this.sim, this.world.course.cleat);
    if (ready.ok) {
      this.moored = true;
      this.mooredOnce = true;
      this.reject = null;
      return;
    }
    const why =
      ready.dist > 1
        ? `The line misses. You are ${ready.dist.toFixed(1)} m off the visitor cleat.`
        : `Too much way on (${(ready.speed * KT).toFixed(1)} kn). Get under half a knot, then throw the line.`;
    this.reject = { text: why, until: this.sim.time + 3 };
  }
}
