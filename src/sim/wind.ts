import type { Vec2 } from './math';
import { len, wrapPi } from './math';

export interface Gust {
  x: number;
  y: number;
  r: number;
  amp: number;
  life: number;
  maxLife: number;
}

export interface WindSample {
  /** Velocity of the air, m/s (direction it is blowing toward). */
  vel: Vec2;
  speed: number;
  /** Direction the wind is coming from, radians. */
  from: number;
  /** Local multiplier from puffs. 1 = baseline. */
  factor: number;
}

/**
 * True wind with a slow oscillation and puffs that drift downwind.
 * `steady` freezes direction and speed for physics tests.
 */
export class WindField {
  baseSpeed: number;
  baseFrom: number;
  steady: boolean;
  gusts: Gust[] = [];
  /** Extra multiplier applied even when the field is steady. 1 = none. */
  gustFactor = 1;
  /**
   * Optional local edit applied after the open-water sample. Null leaves the
   * sample untouched, which is what open water and the physics tests use.
   */
  modify: ((x: number, y: number, sample: WindSample) => WindSample) | null = null;
  private nextSpawn = 2.5;
  private rng: () => number;

  constructor(speed: number, from: number, steady: boolean, seed = 1) {
    this.baseSpeed = speed;
    this.baseFrom = from;
    this.steady = steady;
    let s = seed >>> 0 || 1;
    this.rng = () => {
      s = (Math.imul(1664525, s) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /** Direction the wind is blowing toward. */
  private flow(from: number, speed: number): Vec2 {
    return { x: -Math.cos(from) * speed, y: -Math.sin(from) * speed };
  }

  update(dt: number, boatX: number, boatY: number): void {
    if (this.steady) return;
    const sample = this.sample(boatX, boatY, 0);
    for (const g of this.gusts) {
      g.x += sample.vel.x * 0.82 * dt;
      g.y += sample.vel.y * 0.82 * dt;
      g.life += dt;
    }
    this.gusts = this.gusts.filter((g) => g.life < g.maxLife);
    this.nextSpawn -= dt;
    if (this.nextSpawn <= 0 && this.gusts.length < 6) {
      this.spawn(boatX, boatY, sample);
      this.nextSpawn = 5 + this.rng() * 6;
    }
  }

  private spawn(boatX: number, boatY: number, sample: WindSample): void {
    const upX = Math.cos(sample.from);
    const upY = Math.sin(sample.from);
    const acrossX = -upY;
    const acrossY = upX;
    const dist = 35 + this.rng() * 55;
    const side = (this.rng() - 0.5) * 70;
    this.gusts.push({
      x: boatX + upX * dist + acrossX * side,
      y: boatY + upY * dist + acrossY * side,
      r: 16 + this.rng() * 22,
      amp: 0.18 + this.rng() * 0.42,
      life: 0,
      maxLife: 28 + this.rng() * 18,
    });
  }

  sample(x: number, y: number, time: number): WindSample {
    let from = this.baseFrom;
    let speed = this.baseSpeed;
    if (!this.steady) {
      from += Math.sin(time / 36) * 0.11 + Math.sin(time / 91 + 1.2) * 0.05;
      speed *= 1 + Math.sin(time / 47) * 0.04;
    }
    let factor = 1;
    if (!this.steady) {
      for (const g of this.gusts) {
        const d = Math.hypot(x - g.x, y - g.y);
        if (d < g.r) {
          const w = 0.5 * (1 + Math.cos((Math.PI * d) / g.r));
          const fade = Math.sin(Math.PI * clamp01(g.life / g.maxLife));
          factor *= 1 + g.amp * w * (0.35 + 0.65 * fade);
        }
      }
    }
    factor *= this.gustFactor;
    speed *= factor;
    const vel = this.flow(from, speed);
    const sample = { vel, speed, from: wrapPi(from), factor };
    return this.modify ? this.modify(x, y, sample) : sample;
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function apparentWind(trueWind: Vec2, boatVel: Vec2): Vec2 {
  return { x: trueWind.x - boatVel.x, y: trueWind.y - boatVel.y };
}

export function windSpeed(v: Vec2): number {
  return len(v);
}
