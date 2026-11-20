import type { DockSession } from './session';
import { CLEAT } from './layout';
import { canMakeFast } from './mooring';
import { DEG, clamp, wrapPi } from '../sim/math';
import { waterSpeed } from '../sim/lowspeed';
import { suggestedSheet } from '../sim/sail';
import type { Simulation } from '../sim/sim';

export interface PilotCmd {
  rudder: number;
  sheetIn: number;
  sheetOut: number;
  hike: number;
  anchor: boolean;
  moor: boolean;
  scopeOut: boolean;
  scopeIn: boolean;
}

type Phase = 'lay' | 'luff' | 'moor' | 'dwell' | 'depart' | 'round' | 'drop' | 'pay' | 'done';

const MIN_TWA = 50 * DEG;

export function layHeading(
  x: number,
  y: number,
  windFrom: number,
  targetX: number,
  targetY: number,
): number {
  const desired = Math.atan2(targetY - y, targetX - x);
  const twa = wrapPi(windFrom - desired);
  if (Math.abs(twa) >= MIN_TWA) return desired;
  const port = wrapPi(windFrom - MIN_TWA);
  const stbd = wrapPi(windFrom + MIN_TWA);
  const dp = Math.abs(wrapPi(port - desired));
  const ds = Math.abs(wrapPi(stbd - desired));
  return dp < ds ? port : stbd;
}

/** Positive rudder yaws the bow to starboard, which decreases heading. */
export function steerTo(heading: number, target: number, yawRate: number): number {
  const err = wrapPi(target - heading);
  return clamp(-err * 1.7 - yawRate * 0.45, -1, 1);
}

function idle(): PilotCmd {
  return {
    rudder: 0,
    sheetIn: 0,
    sheetOut: 0,
    hike: 0,
    anchor: false,
    moor: false,
    scopeOut: false,
    scopeIn: false,
  };
}

function drive(sim: Simulation, cmd: PilotCmd, heading: number, fill: boolean, cap = 99): void {
  cmd.rudder = steerTo(sim.heading, heading, sim.yawRate);
  if (!fill || waterSpeed(sim.vx, sim.vy, sim.currentX, sim.currentY) > cap) {
    cmd.sheetOut = 1;
    cmd.sheetIn = 0;
    return;
  }
  const awa = Math.abs(sim.snapshot.awa || sim.snapshot.twa || 0.8);
  const target = Math.min(0.72, Math.max(0.12, suggestedSheet(awa)));
  if (sim.sheet < target - 0.03) cmd.sheetIn = 1;
  else if (sim.sheet > target + 0.06) cmd.sheetOut = 1;
  if (Math.abs(sim.heel) > 0.28) cmd.hike = 0.45;
}

/**
 * Scripted practice run for the demo capture. It sails the real boat:
 * a close reach into the berth, a luff, a mooring line, then an anchor
 * that is paid out to 5:1 once the boat has stopped.
 */
export class DockPilot {
  phase: Phase = 'lay';
  private mark = 0;
  private trace: string[] = [];
  private tracedAt = -1;

  reset(time = 0): void {
    this.phase = 'lay';
    this.mark = time;
    this.trace = [];
    this.tracedAt = -1;
  }

  log(): string[] {
    return this.trace;
  }

  private goto(sim: Simulation, phase: Phase): void {
    this.phase = phase;
    this.mark = sim.time;
  }

  private age(sim: Simulation): number {
    return sim.time - this.mark;
  }

  private note(session: DockSession): void {
    const sim = session.sim;
    if (sim.time - this.tracedAt < 0.5) return;
    this.tracedAt = sim.time;
    const line = `${sim.time.toFixed(1)} ${this.phase} x=${sim.x.toFixed(1)} y=${sim.y.toFixed(1)} h=${((sim.heading * 180) / Math.PI).toFixed(0)} v=${waterSpeed(sim.vx, sim.vy, sim.currentX, sim.currentY).toFixed(2)}`;
    this.trace.push(line);
    if (this.trace.length > 160) this.trace.shift();
  }

  sample(session: DockSession): PilotCmd {
    const sim = session.sim;
    const cmd = idle();
    const fair = session.fairlead();
    const speed = waterSpeed(sim.vx, sim.vy, sim.currentX, sim.currentY);
    this.note(session);
    const glide = 0.07;

    if (this.phase === 'lay' || this.phase === 'luff' || this.phase === 'moor') {
      if (canMakeFast(fair.dist, speed)) {
        cmd.sheetOut = 1;
        cmd.rudder = steerTo(sim.heading, glide, sim.yawRate);
        cmd.moor = true;
        this.goto(sim, 'dwell');
      } else if (sim.x > CLEAT.x + 1.4 && speed < 0.4) {
        drive(sim, cmd, Math.PI - glide, speed < 0.22, 0.4);
      } else {
        cmd.sheetOut = 1;
        cmd.rudder = clamp(steerTo(sim.heading, 0.18, sim.yawRate), -0.35, 0.35);
      }
    } else if (this.phase === 'dwell') {
      cmd.sheetOut = 1;
      cmd.rudder = steerTo(sim.heading, 0.02, sim.yawRate) * 0.35;
      if (this.age(sim) > 3) {
        cmd.moor = true;
        this.goto(sim, 'depart');
      }
    } else if (this.phase === 'depart') {
      drive(sim, cmd, -0.95, true, 0.9);
      if ((this.age(sim) > 2.2 && sim.y < 2.0) || this.age(sim) > 5) this.goto(sim, 'round');
    } else if (this.phase === 'round') {
      cmd.sheetOut = 1;
      cmd.rudder = clamp(steerTo(sim.heading, 0.2, sim.yawRate), -0.45, 0.45);
      if (speed < 0.28 || this.age(sim) > 9) this.goto(sim, 'drop');
    } else if (this.phase === 'drop') {
      cmd.sheetOut = 1;
      cmd.rudder = clamp(steerTo(sim.heading, 0.2, sim.yawRate), -0.35, 0.35);
      if (speed < 0.32) {
        cmd.anchor = true;
        this.goto(sim, 'pay');
      }
    } else if (this.phase === 'pay') {
      cmd.sheetOut = 1;
      cmd.rudder = clamp(steerTo(sim.heading, 0.15, sim.yawRate), -0.3, 0.3);
      if (!session.rig.held || session.rig.scope < 5.05) cmd.scopeOut = true;
      if (session.rig.held && session.rig.scope >= 5 && this.age(sim) > 3.2) this.goto(sim, 'done');
    } else {
      cmd.sheetOut = 1;
      cmd.rudder = clamp(steerTo(sim.heading, 0.15, sim.yawRate), -0.3, 0.3);
    }
    return cmd;
  }
}
