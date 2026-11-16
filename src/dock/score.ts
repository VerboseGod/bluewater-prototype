import { KT } from '../sim/math';
import { waterSpeed } from '../sim/lowspeed';
import type { Simulation } from '../sim/sim';
import type { AnchorRig } from './anchor';
import type { ImpactClass } from './contact';
import { alongsideAngleDeg } from './layout';

export interface DockReport {
  approachKn: number | null;
  impactMs: number;
  impactClass: ImpactClass;
  distAtStop: number | null;
  angleAtStopDeg: number | null;
  timeSec: number | null;
  elapsed: number;
  scope: number | null;
  anchorHeld: boolean;
  anchorDown: boolean;
  setSpeedKn: number | null;
  moored: boolean;
  fast: boolean;
  tip: string;
}

/**
 * One sentence. The hot approach uses the same shape as the coaching line
 * "you came in at 1.8 kn; luff earlier."
 */
export function tipFor(r: {
  approachKn: number | null;
  impactMs: number;
  impactClass: ImpactClass;
  distAtStop: number | null;
  moored: boolean;
  anchorDown: boolean;
  scope: number | null;
  anchorHeld: boolean;
  setSpeedKn: number | null;
}): string {
  if (r.moored && r.anchorHeld && r.scope != null) {
    return `Made fast, and the anchor held at ${r.scope.toFixed(1)}:1 with the boat head-to-wind.`;
  }
  if (r.anchorDown && !r.anchorHeld && r.scope != null && r.scope < 3) {
    return `Scope was ${r.scope.toFixed(1)}:1 and the anchor dragged. Pay out to about 5:1.`;
  }
  if (r.anchorDown && !r.anchorHeld && r.setSpeedKn != null && r.setSpeedKn > 0.9) {
    return `You dropped the hook at ${r.setSpeedKn.toFixed(1)} kn. Stop head-to-wind first.`;
  }
  if (r.anchorHeld && r.scope != null) {
    return `Anchor held at ${r.scope.toFixed(1)}:1 and the boat swung to the wind.`;
  }
  if (r.approachKn != null && r.approachKn >= 1.5) {
    return `You came in at ${r.approachKn.toFixed(1)} kn; luff earlier.`;
  }
  if (r.impactClass === 'hard') {
    return `Hard hit at ${r.impactMs.toFixed(1)} m/s. With fenders, a bump under about 0.5 m/s is the one you want.`;
  }
  if (!r.moored && r.distAtStop != null && r.distAtStop > 1) {
    return `You stopped ${r.distAtStop.toFixed(1)} m off the cleat. The line only reaches about a metre, under half a knot.`;
  }
  if (r.moored) {
    return 'Made fast. The sail was luffing and the fenders took what little bump there was.';
  }
  return 'Let the sail fly, point the bow into the wind, and make fast once you are within a metre and under half a knot.';
}

export class Scoreboard {
  approachKn: number | null = null;
  impactMs = 0;
  impactClass: ImpactClass = 'none';
  distAtStop: number | null = null;
  angleAtStopDeg: number | null = null;
  t0 = 0;
  tMoored: number | null = null;
  tHeld: number | null = null;
  private gated = false;
  private stopped = false;
  private axis = 0;

  reset(time: number): void {
    this.approachKn = null;
    this.impactMs = 0;
    this.impactClass = 'none';
    this.distAtStop = null;
    this.angleAtStopDeg = null;
    this.t0 = time;
    this.tMoored = null;
    this.tHeld = null;
    this.gated = false;
    this.stopped = false;
  }

  observe(
    sim: Simulation,
    fairleadM: number,
    closing: number,
    hit: ImpactClass,
    anchor: AnchorRig,
    mooredOnce: boolean,
    berthAxis = 0,
  ): void {
    this.axis = berthAxis;
    const kn = waterSpeed(sim.vx, sim.vy, sim.currentX, sim.currentY) * KT;
    if (!this.gated && fairleadM < 2.2) {
      this.gated = true;
      this.approachKn = kn;
    }
    if (closing > this.impactMs) this.impactMs = closing;
    if (hit === 'hard') this.impactClass = 'hard';
    else if (hit === 'gentle' && this.impactClass === 'none') this.impactClass = 'gentle';
    if (this.gated && !this.stopped && kn < 0.35) {
      this.markStop(sim, fairleadM, this.axis);
    }
    if (mooredOnce && this.tMoored == null) {
      this.tMoored = sim.time;
      if (!this.stopped) this.markStop(sim, fairleadM, this.axis);
    }
    if (anchor.held && this.tHeld == null) this.tHeld = sim.time;
  }

  private markStop(sim: Simulation, fairleadM: number, axis: number): void {
    this.stopped = true;
    this.distAtStop = fairleadM;
    this.angleAtStopDeg = alongsideAngleDeg(sim.heading, axis);
  }

  report(sim: Simulation, anchor: AnchorRig, mooredOnce: boolean, fast: boolean): DockReport {
    const end = this.tMoored ?? this.tHeld;
    const partial = {
      approachKn: this.approachKn,
      impactMs: this.impactMs,
      impactClass: this.impactClass,
      distAtStop: this.distAtStop,
      moored: mooredOnce,
      anchorDown: anchor.down,
      scope: anchor.down ? anchor.scope : null,
      anchorHeld: anchor.held,
      setSpeedKn: anchor.down ? anchor.setSpeed * KT : null,
    };
    return {
      ...partial,
      angleAtStopDeg: this.angleAtStopDeg,
      timeSec: end == null ? null : Math.max(0, end - this.t0),
      elapsed: Math.max(0, sim.time - this.t0),
      fast,
      tip: tipFor(partial),
    };
  }
}
