import { WAVES, type Wave } from '../sim/water';

/** Visual-only swell. The hull sampler in `sim/water` is not touched. */
export interface GerstnerWave {
  dirX: number;
  dirZ: number;
  amplitude: number;
  wavelength: number;
  steepness: number;
  /** Angular frequency, rad/s. Matches the shader. */
  omega: number;
  phase: number;
}

interface Spec {
  along: number;
  across: number;
  amp: number;
  length: number;
  steep: number;
  phase: number;
}

const SPECS: readonly Spec[] = [
  { along: 1, across: 0.04, amp: 0.28, length: 38, steep: 0.26, phase: 0.4 },
  { along: 0.94, across: 0.18, amp: 0.13, length: 22, steep: 0.3, phase: 1.3 },
  { along: 0.9, across: -0.16, amp: 0.06, length: 13, steep: 0.32, phase: 2.2 },
  { along: 0.96, across: 0.12, amp: 0.03, length: 7.5, steep: 0.3, phase: 0.8 },
  { along: 0.45, across: 0.88, amp: 0.018, length: 4.2, steep: 0.3, phase: 1.9 },
  { along: 0.9, across: -0.32, amp: 0.01, length: 2.6, steep: 0.26, phase: 2.7 },
  { along: 0.15, across: -0.95, amp: 0.006, length: 1.7, steep: 0.22, phase: 0.5 },
];

export function waveCountFor(quality: 'low' | 'high'): number {
  return quality === 'high' ? 7 : 4;
}

/**
 * Wind-following Gerstner set. `windFrom` is the meteorological direction
 * (where the wind comes from). Amplitudes scale with true-wind speed.
 */
export function buildGerstner(windFrom: number, windSpeed: number, count: number): GerstnerWave[] {
  const toX = -Math.cos(windFrom);
  const toZ = -Math.sin(windFrom);
  const px = -toZ;
  const pz = toX;
  const scale = Math.max(0.5, Math.min(1.65, windSpeed / 5.66));
  const n = Math.min(count, SPECS.length);
  const out: GerstnerWave[] = [];
  for (let i = 0; i < n; i++) {
    const s = SPECS[i];
    const dx = toX * s.along + px * s.across;
    const dz = toZ * s.along + pz * s.across;
    const len = Math.hypot(dx, dz) || 1;
    const k = (Math.PI * 2) / s.length;
    out.push({
      dirX: dx / len,
      dirZ: dz / len,
      amplitude: s.amp * scale,
      wavelength: s.length,
      steepness: s.steep,
      omega: Math.sqrt(9.81 * k),
      phase: s.phase,
    });
  }
  return out;
}

export interface SurfacePoint {
  height: number;
  slopeX: number;
  slopeZ: number;
}

/** Height and slope of the visual swell at a world xz. Shader uses the same sum. */
export function gerstnerAt(x: number, z: number, time: number, waves: readonly GerstnerWave[]): SurfacePoint {
  let height = 0;
  let slopeX = 0;
  let slopeZ = 0;
  for (const w of waves) {
    const k = (Math.PI * 2) / w.wavelength;
    const phase = k * (w.dirX * x + w.dirZ * z) + w.phase - w.omega * time;
    const s = Math.sin(phase);
    const c = Math.cos(phase);
    height += w.amplitude * s;
    slopeX += w.amplitude * k * w.dirX * c;
    slopeZ += w.amplitude * k * w.dirZ * c;
  }
  return { height, slopeX, slopeZ };
}

export function physicsWaves(count: number): readonly Wave[] {
  return WAVES.slice(0, Math.min(count, WAVES.length));
}

/**
 * The short chop the water shader adds on top of the Gerstner swell.
 * The phase matches the vertex shader's `uPhys` loop.
 */
export function physicsChop(x: number, z: number, time: number, count: number): SurfacePoint {
  let height = 0;
  let slopeX = 0;
  let slopeZ = 0;
  const n = Math.min(Math.max(0, count), WAVES.length);
  for (let i = 0; i < n; i++) {
    const w = WAVES[i];
    const k = (Math.PI * 2) / w.wavelength;
    const omega = Math.sqrt(9.81 * k) * 0.55 + w.speed * 0.15;
    const phase = k * (w.dirX * x + w.dirZ * z) + w.phase - omega * time;
    const s = Math.sin(phase);
    const c = Math.cos(phase);
    height += w.amplitude * s;
    slopeX += w.amplitude * k * w.dirX * c;
    slopeZ += w.amplitude * k * w.dirZ * c;
  }
  return { height, slopeX, slopeZ };
}
