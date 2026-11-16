export type DemoPhase = 'reach' | 'tack' | 'settle' | 'bear' | 'gybe' | 'finish' | 'debrief';

export interface DemoCommand {
  rudder: number;
  sheetIn: number;
  sheetOut: number;
  hike: number;
  pause: boolean;
  phase: DemoPhase;
}

/**
 * A fixed sail for the demo reel: beam reach, sheet in, tack, bear away, gybe, debrief.
 * Helm stays gentle. A hard rudder stalls and brakes the boat out of a tack.
 * It only produces control inputs. The boat still moves under the existing forces.
 */
export class DemoDirector {
  phase: DemoPhase = 'reach';
  private phaseT = 0;
  private pauseSent = false;

  step(dt: number, heading: number, sheet: number, vFwd: number): DemoCommand {
    this.phaseT += dt;

    if (this.phase === 'reach' && this.phaseT > 12 && vFwd > 1.8) this.advance();
    else if (this.phase === 'tack' && (heading > 2.55 || this.phaseT > 9)) this.advance();
    else if (this.phase === 'settle' && this.phaseT > 4 && vFwd > 1.15) this.advance();
    else if (this.phase === 'bear' && (near(heading, -2.05, 0.3) || this.phaseT > 9)) this.advance();
    else if (this.phase === 'gybe' && (near(heading, -0.95, 0.32) || this.phaseT > 9)) this.advance();
    else if (this.phase === 'finish' && this.phaseT > 6) this.advance();

    if (this.phase === 'debrief') {
      const pause = !this.pauseSent;
      this.pauseSent = true;
      return { rudder: 0, sheetIn: 0, sheetOut: 0, hike: 0, pause, phase: 'debrief' };
    }

    const plan = {
      reach: { sheet: 0.48, hike: 0.35, rudder: hold(heading, 0) },
      tack: {
        sheet: heading < 1.3 ? 0.72 : 0.5,
        hike: heading < 1.15 ? 0.05 : 0.4,
        rudder: heading < 1.55 ? -0.16 : hold(heading, 2.55),
      },
      settle: { sheet: 0.48, hike: 0.35, rudder: hold(heading, Math.PI) },
      bear: { sheet: 0.14, hike: 0.1, rudder: hold(heading, -2.05) },
      gybe: { sheet: 0.1, hike: 0, rudder: hold(heading, -0.95) },
      finish: { sheet: 0.1, hike: 0.15, rudder: hold(heading, -0.95) },
    }[this.phase];

    return {
      rudder: plan.rudder,
      sheetIn: sheet < plan.sheet - 0.03 ? 1 : 0,
      sheetOut: sheet > plan.sheet + 0.03 ? 1 : 0,
      hike: plan.hike,
      pause: false,
      phase: this.phase,
    };
  }

  private advance(): void {
    const order: DemoPhase[] = ['reach', 'tack', 'settle', 'bear', 'gybe', 'finish', 'debrief'];
    const i = order.indexOf(this.phase);
    this.phase = order[Math.min(order.length - 1, i + 1)];
    this.phaseT = 0;
  }
}

function hold(heading: number, target: number): number {
  let err = target - heading;
  while (err > Math.PI) err -= Math.PI * 2;
  while (err < -Math.PI) err += Math.PI * 2;
  return Math.max(-0.45, Math.min(0.45, -err * 0.9));
}

function near(heading: number, target: number, tol: number): boolean {
  let d = heading - target;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d) < tol;
}
