import { layHeading, steerTo } from '../dock/practice';
import { mooringReadiness } from '../dock/mooring';
import { suggestedSheet } from '../sim/sail';
import { wrapPi } from '../sim/math';
import type { HarbourSession } from './session';

export interface PilotCmd {
  rudder: number;
  sheetIn: number;
  sheetOut: number;
  hike: number;
  moveIn: number;
  paddle: boolean;
  /** Demo only: creep the last few metres onto the visitor pontoon. */
  creep: boolean;
  moor: boolean;
  anchor: boolean;
  scopeOut: boolean;
  scopeIn: boolean;
}

interface Waypoint {
  x: number;
  y: number;
  reach: number;
}

/**
 * Sails the short harbour course on the real dinghy: out through the
 * entrance, around both practice marks, and back alongside the visitor pontoon.
 * Steering uses the same layline and tiller sense as the docking practice.
 */
export class HarbourPilot {
  private index = 0;
  private threw = false;
  private tackSign = -1;
  private tackUntil = 0;

  reset(): void {
    this.index = 0;
    this.threw = false;
    this.tackSign = -1;
    this.tackUntil = 0;
  }

  sample(session: HarbourSession, _dt: number): PilotCmd {
    const sim = session.sim;
    const points = this.points(session);
    const wp = points[Math.min(this.index, points.length - 1)];
    const last = this.index >= points.length - 1;
    const dist = Math.hypot(wp.x - sim.x, wp.y - sim.y);
    if (!last && dist < wp.reach) this.index += 1;

    const windFrom = sim.wind.baseFrom;
    const markHeading = this.headingFor(sim, windFrom, wp.x, wp.y, last, dist, session.world.course.alongside.heading);
    const luff = last && dist < 3.4;
    const speed = Math.hypot(sim.vx, sim.vy);

    const cmd: PilotCmd = {
      rudder: sim.capsized ? 0 : steerTo(sim.heading, markHeading, sim.yawRate),
      sheetIn: 0,
      sheetOut: 0,
      hike: 0,
      moveIn: 0.3,
      paddle: !sim.capsized && speed < (last ? 0.7 : 1.15) && !(luff && dist < 2),
      creep: last && dist < 9,
      moor: false,
      anchor: false,
      scopeOut: false,
      scopeIn: false,
    };

    const windward = -(Math.sign(sim.snapshot.awa) || Math.sign(sim.snapshot.twa) || 1);
    const leewardHeel = sim.heel * windward < -0.18;
    if (luff || Math.abs(sim.snapshot.twa) < 0.95) {
      cmd.sheetOut = 1;
    } else {
      const awa = Math.abs(sim.snapshot.awa || sim.snapshot.twa || 0.8);
      const target = Math.min(0.75, Math.max(0.32, suggestedSheet(awa)));
      if (sim.sheet < target - 0.04) cmd.sheetIn = 1;
      else if (sim.sheet > target + 0.07 || Math.abs(sim.heel) > 0.42) cmd.sheetOut = 1;
      if (leewardHeel) {
        cmd.hike = 0.5;
        cmd.moveIn = 0;
      }
    }

    const ready = mooringReadiness(sim, session.world.course.cleat);
    if (!this.threw && last && ready.ok) {
      this.threw = true;
      cmd.moor = true;
    }
    return cmd;
  }

  private headingFor(
    sim: HarbourSession['sim'],
    windFrom: number,
    tx: number,
    ty: number,
    last: boolean,
    dist: number,
    alongside: number,
  ): number {
    if (last && dist < 3.2) {
      const alt = wrapPi(alongside + Math.PI);
      return Math.abs(wrapPi(alongside - sim.heading)) <= Math.abs(wrapPi(alt - sim.heading)) ? alongside : alt;
    }
    const direct = Math.atan2(ty - sim.y, tx - sim.x);
    const into = Math.abs(wrapPi(windFrom - direct));
    if (into > 2.4) {
      const broad = 2.05;
      const a = wrapPi(windFrom - broad);
      const b = wrapPi(windFrom + broad);
      const miss = (h: number) => Math.abs(wrapPi(h - direct));
      return miss(a) < miss(b) ? a : b;
    }
    if (into < 1.15) {
      if (sim.time >= this.tackUntil) {
        const port = wrapPi(windFrom - 1.22);
        const stbd = wrapPi(windFrom + 1.22);
        const gain = (h: number) => Math.cos(h) * (tx - sim.x) + Math.sin(h) * (ty - sim.y);
        this.tackSign = gain(port) >= gain(stbd) ? -1 : 1;
        this.tackUntil = sim.time + 18;
      }
      return wrapPi(windFrom + this.tackSign * 1.22);
    }
    return layHeading(sim.x, sim.y, windFrom, tx, ty);
  }

  private points(session: HarbourSession): Waypoint[] {
    const c = session.world.course;
    return [
      { ...c.dogleg, reach: 18 },
      { ...c.channel, reach: 18 },
      { ...c.outside, reach: 18 },
      { ...c.aim[0], reach: 28 },
      { ...c.aim[1], reach: 28 },
      { ...c.aim[0], reach: 28 },
      { ...c.outside, reach: 20 },
      { ...c.channel, reach: 18 },
      { ...c.dogleg, reach: 18 },
      { ...c.alongside, reach: 5 },
    ];
  }
}
