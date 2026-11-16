import type { InputState } from '../input';
import { KT } from '../sim/math';
import { Simulation } from '../sim/sim';
import { AnchorRig } from './anchor';
import { resolveContact, type ImpactClass } from './contact';
import { DOCK_WIND, START, TIDE_MS, WINDS, type WindId } from './layout';
import { holdMooring, mooringReadiness, nearerFairlead } from './mooring';
import { DockPilot } from './practice';
import { Scoreboard, type DockReport } from './score';

export interface HarbourState {
  x: number;
  y: number;
  heading: number;
  anchorDown: boolean;
  anchorX: number;
  anchorY: number;
  anchorHeld: boolean;
  moored: boolean;
  fairX: number;
  fairY: number;
  time: number;
}

export interface Strip {
  text: string;
  kind: 'info' | 'good' | 'bad';
}

/**
 * One sheltered practice: a finger berth and a buoy. The sailing step is the
 * existing dinghy; this only adds tide, contact, the line, and the anchor.
 */
export class DockSession {
  readonly sim: Simulation;
  readonly demo: boolean;
  rig = new AnchorRig();
  private score = new Scoreboard();
  private pilot: DockPilot | null;
  private windIndex = 0;
  tide = false;
  moored = false;
  mooredOnce = false;
  touching = false;
  impactClass: ImpactClass = 'none';
  impactMs = 0;
  private reject: { text: string; until: number } | null = null;

  constructor(opts?: { demo?: boolean; wind?: WindId; assisted?: boolean }) {
    this.demo = opts?.demo ?? false;
    const wind = WINDS.findIndex((w) => w.id === (opts?.wind ?? 'offshore'));
    this.windIndex = wind < 0 ? 0 : wind;
    this.sim = new Simulation({
      steady: true,
      waves: false,
      assisted: opts?.assisted ?? true,
      windSpeed: DOCK_WIND,
      windFrom: this.windFrom,
      heading: START.heading,
      x: START.x,
      y: START.y,
      vx: START.vx,
      sheet: START.sheet,
    });
    this.sim.boom = START.boom;
    this.pilot = this.demo ? new DockPilot() : null;
    this.score.reset(0);
  }

  get windFrom(): number {
    return WINDS[this.windIndex].from;
  }

  get windLabel(): string {
    return WINDS[this.windIndex].label;
  }

  get pilotPhase(): string {
    return this.pilot?.phase ?? 'player';
  }

  trace(): string[] {
    return this.pilot?.log() ?? [];
  }

  fairlead(): { x: number; y: number; dist: number } {
    return nearerFairlead(this.sim.x, this.sim.y, this.sim.heading);
  }

  cycleWind(): void {
    this.windIndex = (this.windIndex + 1) % WINDS.length;
    this.sim.wind.baseFrom = this.windFrom;
  }

  toggleTide(): void {
    this.tide = !this.tide;
    this.applyTide();
  }

  private applyTide(): void {
    this.sim.currentX = this.tide ? TIDE_MS : 0;
    this.sim.currentY = 0;
  }

  reset(): void {
    const sim = this.sim;
    sim.x = START.x;
    sim.y = START.y;
    sim.heading = START.heading;
    sim.vx = START.vx;
    sim.vy = 0;
    sim.yawRate = 0;
    sim.heel = 0;
    sim.heelRate = 0;
    sim.sheet = START.sheet;
    sim.boom = START.boom;
    sim.boomRate = 0;
    sim.planing = false;
    sim.capsized = false;
    sim.wind.baseFrom = this.windFrom;
    this.applyTide();
    this.rig = new AnchorRig();
    this.moored = false;
    this.mooredOnce = false;
    this.touching = false;
    this.impactClass = 'none';
    this.impactMs = 0;
    this.reject = null;
    this.score.reset(sim.time);
    this.pilot?.reset(sim.time);
    sim.syncPose();
  }

  step(dt: number, input: InputState): void {
    const auto = this.pilot?.sample(this) ?? null;
    if (!this.demo) {
      if (input.windPressed) this.cycleWind();
      if (input.tidePressed) this.toggleTide();
    }
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
    if (this.reject && this.sim.time > this.reject.until) this.reject = null;

    this.applyTide();
    this.sim.step(dt, {
      rudder: auto ? auto.rudder : input.rudder,
      sheetIn: auto ? auto.sheetIn : input.sheetIn,
      sheetOut: auto ? auto.sheetOut : input.sheetOut,
      hike: auto ? auto.hike : input.hike,
      moveIn: auto ? 0 : input.moveIn,
    });
    const contact = resolveContact(this.sim, this.touching, true);
    this.touching = contact.touching;
    if (contact.hit === 'hard') {
      this.impactClass = 'hard';
      this.sim.buzz(0.75, 0.45, 200);
    } else if (contact.hit === 'gentle') {
      if (this.impactClass === 'none') this.impactClass = 'gentle';
      this.sim.buzz(0.12, 0.22, 90);
    }
    if (contact.closing > this.impactMs) this.impactMs = contact.closing;
    if (this.moored) holdMooring(this.sim, dt);
    this.rig.update(this.sim, dt);
    this.sim.syncPose();
    this.score.observe(
      this.sim,
      this.fairlead().dist,
      contact.closing,
      contact.hit,
      this.rig,
      this.mooredOnce,
    );
  }

  private throwLine(): void {
    if (this.moored) {
      this.moored = false;
      return;
    }
    const ready = mooringReadiness(this.sim);
    if (ready.ok) {
      this.moored = true;
      this.mooredOnce = true;
      this.reject = null;
      return;
    }
    const why =
      ready.dist > 1
        ? `The line misses. You are ${ready.dist.toFixed(1)} m off the cleat, and it only reaches about a metre.`
        : `Too much way on (${(ready.speed * KT).toFixed(1)} kn). Get under half a knot, then throw the line.`;
    this.reject = { text: why, until: this.sim.time + 3 };
  }

  hint(): { text: string; urgent: boolean } {
    if (this.reject) return { text: this.reject.text, urgent: true };
    if (this.rig.held) {
      return {
        text: `Anchor is holding at ${this.rig.scope.toFixed(1)}:1. F or right-stick click weighs the anchor, RB is the mooring line, D-pad up pays out scope, LB changes the wind.`,
        urgent: false,
      };
    }
    if (this.rig.dragging && this.rig.scope < 3) {
      return {
        text: `Scope is ${this.rig.scope.toFixed(1)}:1 and the anchor is dragging. D-pad up pays out toward 5:1. RB is the mooring line, LB the wind, left-stick click the tide.`,
        urgent: true,
      };
    }
    if (this.rig.dragging && this.rig.setSpeed > 0.45) {
      return {
        text: 'The hook skipped because you still had way on. Stop head-to-wind, weigh with F or right-stick click, and drop it again.',
        urgent: true,
      };
    }
    if (this.moored) {
      return {
        text: 'Made fast. F or right-stick click drops the anchor, RB lets the line go, D-pad up pays out scope, LB cycles the wind, left-stick click sets the tide.',
        urgent: false,
      };
    }
    if (this.impactClass === 'hard') {
      return {
        text: `Hard hit at ${this.impactMs.toFixed(1)} m/s. Let the sail fly earlier. F or right-stick click is the anchor · RB the mooring line · D-pad up/down scope · LB wind · left-stick click tide.`,
        urgent: true,
      };
    }
    return {
      text: 'Come alongside into the wind with the sail luffing. F or right-stick click drops the anchor · RB throws the mooring line · D-pad up pays out scope, down takes it in · LB cycles the wind · left-stick click sets a light tide. Y still toggles assisted mode.',
      urgent: false,
    };
  }

  strip(): Strip {
    const ready = mooringReadiness(this.sim);
    const kn = ready.speed * KT;
    const wind = `${this.windLabel}${this.tide ? ' · tide 0.3 kn' : ' · tide off'}`;
    if (this.rig.held) {
      return { text: `${wind} · anchor held ${this.rig.scope.toFixed(1)}:1 · cleat ${ready.dist.toFixed(1)} m`, kind: 'good' };
    }
    if (this.moored) {
      return { text: `${wind} · made fast · ${kn.toFixed(1)} kn`, kind: 'good' };
    }
    if (this.rig.dragging) {
      return {
        text: `${wind} · anchor dragging · scope ${this.rig.scope.toFixed(1)}:1 · ${kn.toFixed(1)} kn`,
        kind: 'bad',
      };
    }
    if (this.impactClass === 'hard') {
      return { text: `${wind} · hard hit ${this.impactMs.toFixed(1)} m/s · cleat ${ready.dist.toFixed(1)} m`, kind: 'bad' };
    }
    const bump = this.impactClass === 'gentle' ? ` · bump ${this.impactMs.toFixed(1)} m/s` : '';
    return { text: `${wind} · cleat ${ready.dist.toFixed(1)} m · ${kn.toFixed(1)} kn${bump}`, kind: 'info' };
  }

  report(): DockReport {
    return this.score.report(this.sim, this.rig, this.mooredOnce, this.moored);
  }

  view(): HarbourState {
    const lead = this.fairlead();
    return {
      x: this.sim.x,
      y: this.sim.y,
      heading: this.sim.heading,
      anchorDown: this.rig.down,
      anchorX: this.rig.x,
      anchorY: this.rig.y,
      anchorHeld: this.rig.held,
      moored: this.moored,
      fairX: lead.x,
      fairY: lead.y,
      time: this.sim.time,
    };
  }
}
