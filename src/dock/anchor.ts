import { clamp, wrapPi } from '../sim/math';
import { downwind, waterSpeed } from '../sim/lowspeed';
import type { Simulation } from '../sim/sim';
import { bowOf, DEPTH, MAX_SET_SPEED, MIN_SCOPE } from './layout';

const PAY_RATE = 2.2;

/**
 * Dinghy anchor. Scope is rode length over the depth of the basin.
 * Under about 3:1, or if it was dropped with way on, the flukes never set
 * and the anchor creeps downwind. At 5:1, dropped near a stop, the rode
 * goes taut and the bow swings toward the anchor, which is upwind.
 * The rode is a straight length, not a catenary.
 */
export class AnchorRig {
  down = false;
  x = 0;
  y = 0;
  rode = 0;
  setSpeed = 0;
  dragged = 0;
  held = false;
  dragging = false;

  get scope(): number {
    return this.rode / DEPTH;
  }

  drop(sim: Simulation): void {
    const bow = bowOf(sim.x, sim.y, sim.heading);
    this.down = true;
    this.x = bow.x;
    this.y = bow.y;
    this.rode = DEPTH * 1.25;
    this.setSpeed = waterSpeed(sim.vx, sim.vy, sim.currentX, sim.currentY);
    this.dragged = 0;
    this.held = false;
    this.dragging = true;
  }

  weigh(): void {
    this.down = false;
    this.held = false;
    this.dragging = false;
  }

  pay(dt: number): void {
    if (!this.down) return;
    this.rode = Math.min(28, this.rode + PAY_RATE * dt);
  }

  shorten(dt: number): void {
    if (!this.down) return;
    this.rode = Math.max(DEPTH + 0.3, this.rode - PAY_RATE * dt);
  }

  update(sim: Simulation, dt: number): void {
    this.held = this.down && this.scope >= MIN_SCOPE - 1e-9 && this.setSpeed <= MAX_SET_SPEED + 1e-9;
    this.dragging = this.down && !this.held;
    if (!this.down) return;
    if (this.held) this.swing(sim, dt);
    else this.creep(sim, dt);
  }

  private reach(): number {
    return Math.sqrt(Math.max(0.25, this.rode * this.rode - DEPTH * DEPTH));
  }

  private creep(sim: Simulation, dt: number): void {
    const wind = downwind(sim.snapshot.windFrom || sim.wind.baseFrom);
    const short = this.scope < MIN_SCOPE ? (MIN_SCOPE - Math.max(0, this.scope)) / MIN_SCOPE : 0;
    const fast =
      this.setSpeed > MAX_SET_SPEED ? Math.min(1, (this.setSpeed - MAX_SET_SPEED) / 0.6) : 0;
    const bad = Math.max(short, fast);
    const rate = bad <= 0 ? 0 : 0.12 + 0.35 * bad;
    const step = rate * dt;
    this.x += wind.x * step;
    this.y += wind.y * step;
    this.dragged += step;
    const bow = bowOf(sim.x, sim.y, sim.heading);
    const dx = bow.x - this.x;
    const dy = bow.y - this.y;
    const dist = Math.hypot(dx, dy);
    const reach = this.reach();
    if (dist > reach) {
      const slip = dist - reach;
      this.x += (dx / dist) * slip;
      this.y += (dy / dist) * slip;
      this.dragged += slip;
    }
  }

  private swing(sim: Simulation, dt: number): void {
    const reach = this.reach();
    let bow = bowOf(sim.x, sim.y, sim.heading);
    let dx = bow.x - this.x;
    let dy = bow.y - this.y;
    let dist = Math.hypot(dx, dy) || 1e-6;
    if (dist > reach) {
      const nx = dx / dist;
      const ny = dy / dist;
      const over = dist - reach;
      sim.x -= nx * over;
      sim.y -= ny * over;
      const vn = sim.vx * nx + sim.vy * ny;
      if (vn > 0) {
        sim.vx -= vn * nx;
        sim.vy -= vn * ny;
      }
      bow = bowOf(sim.x, sim.y, sim.heading);
      dx = bow.x - this.x;
      dy = bow.y - this.y;
      dist = Math.hypot(dx, dy) || 1e-6;
    }
    if (dist > reach * 0.9) {
      const aim = Math.atan2(this.y - bow.y, this.x - bow.x);
      const err = wrapPi(aim - sim.heading);
      sim.heading = wrapPi(sim.heading + clamp(err, -1.2, 1.2) * dt * 1.35);
      sim.yawRate = sim.yawRate * 0.8 + err * 0.35;
    }
  }
}
