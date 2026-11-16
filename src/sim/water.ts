import { clamp } from './math';

export interface Wave {
  dirX: number;
  dirZ: number;
  amplitude: number;
  wavelength: number;
  steepness: number;
  speed: number;
  phase: number;
}

/** Shared by the hull sampler and the water shader. Keep both in lockstep. */
export const WAVES: readonly Wave[] = [
  { dirX: 0.93, dirZ: 0.37, amplitude: 0.09, wavelength: 26, steepness: 0.28, speed: 1.55, phase: 0.4 },
  { dirX: 0.48, dirZ: 0.88, amplitude: 0.055, wavelength: 14, steepness: 0.36, speed: 1.85, phase: 1.3 },
  { dirX: -0.22, dirZ: 0.98, amplitude: 0.032, wavelength: 8, steepness: 0.42, speed: 2.05, phase: 2.2 },
  { dirX: 0.78, dirZ: -0.63, amplitude: 0.02, wavelength: 4.8, steepness: 0.48, speed: 2.2, phase: 0.6 },
];

export interface WaterSample {
  height: number;
  normalX: number;
  normalY: number;
  normalZ: number;
  /** Horizontal orbital velocity in physics x / physics y (three.js x / z). */
  orbX: number;
  orbZ: number;
}

export function sampleWater(x: number, z: number, time: number, enabled = true, count = WAVES.length): WaterSample {
  if (!enabled) {
    return { height: 0, normalX: 0, normalY: 1, normalZ: 0, orbX: 0, orbZ: 0 };
  }
  let height = 0;
  let slopeX = 0;
  let slopeZ = 0;
  let orbX = 0;
  let orbZ = 0;
  const n = Math.min(count, WAVES.length);
  for (let i = 0; i < n; i++) {
    const w = WAVES[i];
    const k = (Math.PI * 2) / w.wavelength;
    const omega = Math.sqrt(9.81 * k) * 0.55 + w.speed * 0.15;
    const phase = k * (w.dirX * x + w.dirZ * z) + w.phase - omega * time;
    const s = Math.sin(phase);
    const c = Math.cos(phase);
    const q = clamp(w.steepness, 0, 1);
    height += w.amplitude * s;
    slopeX += w.amplitude * c * k * w.dirX;
    slopeZ += w.amplitude * c * k * w.dirZ;
    orbX += q * w.amplitude * w.dirX * s * omega;
    orbZ += q * w.amplitude * w.dirZ * s * omega;
  }
  const nx = -slopeX;
  const ny = 1;
  const nz = -slopeZ;
  const nl = Math.hypot(nx, ny, nz) || 1;
  return { height, normalX: nx / nl, normalY: ny / nl, normalZ: nz / nl, orbX, orbZ };
}
