import { DEG } from '../sim/math';
import type { Controls } from '../sim/sim';
import type { LessonId, SailSample } from './model';

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Positive rudder increases true-wind angle. Negative rudder points the bow up. */
export function steerToTwa(twa: number, target: number): number {
  return clamp((target - twa) * 1.05, -0.42, 0.42);
}

/**
 * Hike only while the boat is heeled to leeward, and come in when the hike
 * has rolled it to windward. A held hike otherwise walks the sailor all the
 * way out and stalls the boat.
 */
function balance(sample: SailSample): { hike: number; moveIn: number } {
  const windward = -(Math.sign(sample.awa) || Math.sign(sample.twa) || 1);
  const along = sample.crew * windward;
  const leeHeel = -sample.heel * windward;
  if (leeHeel > 0.16 && along < 0.55) return { hike: 0.65, moveIn: 0 };
  if (leeHeel < -0.1) return { hike: 0, moveIn: 0.65 };
  return { hike: 0, moveIn: 0 };
}

function trim(sample: SailSample, want: 'full' | 'ease' | 'fly'): { sheetIn: number; sheetOut: number } {
  if (want === 'fly') return { sheetIn: 0, sheetOut: 1 };
  if (want === 'ease') {
    if (sample.sheet > 0.46) return { sheetIn: 0, sheetOut: 0.55 };
    if (sample.sheet < 0.26) return { sheetIn: 0.35, sheetOut: 0 };
    return { sheetIn: 0, sheetOut: 0 };
  }
  if (sample.sail === 'stalled' || sample.sail === 'aback' || sample.aoa > 0.5) return { sheetIn: 0, sheetOut: 0.6 };
  if (sample.sail === 'luffing' || sample.aoa < 0.15) return { sheetIn: 0.8, sheetOut: 0 };
  return { sheetIn: 0, sheetOut: 0 };
}

/**
 * A gentle autopilot for the scripted lessons. Helm stays inside the
 * tack-quality window (under about 0.48) so a tack can score.
 */
export function pilotStick(lesson: LessonId, stepId: string, sample: SailSample, helmSide: number): Controls {
  const sign = Math.sign(sample.twa) || helmSide || 1;
  let rudder = 0;
  let sheetIn = 0;
  let sheetOut = 0;
  let hike = 0;
  let moveIn = 0;

  if (lesson === 'wind') {
    rudder = steerToTwa(sample.twa, 0);
    sheetOut = 1;
  } else if (lesson === 'reach') {
    rudder = steerToTwa(sample.twa, sign * 92 * DEG);
    ({ sheetIn, sheetOut } = trim(sample, 'full'));
    ({ hike, moveIn } = balance(sample));
  } else if (lesson === 'points') {
    const target = stepId === 'run' ? sign * 156 * DEG : stepId === 'reach' ? sign * 92 * DEG : sign * 48 * DEG;
    rudder = steerToTwa(sample.twa, target);
    ({ sheetIn, sheetOut } = trim(sample, stepId === 'run' ? 'ease' : 'full'));
    ({ hike, moveIn } = balance(sample));
  } else if (lesson === 'tack') {
    const side = helmSide || sign;
    if (stepId === 'through') {
      const through = Math.sign(sample.twa) === -side && Math.abs(sample.twa) > 0.5;
      if (!through) {
        rudder = -side * 0.36;
        const light = Math.abs(sample.twa) < 0.72 || sample.sail === 'luffing';
        sheetOut = 0.85;
        if (light) {
          moveIn = 1;
          hike = 0;
        } else ({ hike, moveIn } = balance(sample));
      } else {
        rudder = steerToTwa(sample.twa, -side * 50 * DEG);
        ({ sheetIn, sheetOut } = trim(sample, 'full'));
        hike = 1;
      }
    } else if (stepId === 'cross' || stepId === 'regain') {
      rudder = steerToTwa(sample.twa, sign * 50 * DEG);
      ({ sheetIn, sheetOut } = trim(sample, 'full'));
      if (sample.sail === 'luffing') sheetIn = Math.max(sheetIn, 0.7);
      const seated = balance(sample);
      hike = seated.hike > 0 || stepId === 'cross' ? 1 : 0;
      moveIn = stepId === 'cross' ? 0 : seated.moveIn;
    } else {
      rudder = steerToTwa(sample.twa, sign * 48 * DEG);
      ({ sheetIn, sheetOut } = trim(sample, 'full'));
      ({ hike, moveIn } = balance(sample));
    }
  } else if (lesson === 'gybe') {
    const side = helmSide || sign;
    if (stepId === 'through') {
      const through = Math.sign(sample.twa) === -side && Math.abs(sample.twa) > 2.15;
      if (!through) {
        rudder = side * 0.3;
        if (sample.sheet > 0.5) sheetOut = 0.4;
        else if (sample.sheet < 0.24) sheetIn = 0.3;
        if (Math.abs(sample.twa) > 2.75) {
          moveIn = 1;
          hike = 0;
        } else ({ hike, moveIn } = balance(sample));
      } else {
        rudder = steerToTwa(sample.twa, -side * 148 * DEG);
        if (sample.sheet < 0.3) sheetIn = 0.4;
        ({ hike, moveIn } = balance(sample));
        if (hike === 0 && moveIn === 0) hike = 0.4;
      }
    } else if (stepId === 'prepare') {
      rudder = steerToTwa(sample.twa, sign * 155 * DEG);
      if (sample.sheet > 0.48) sheetOut = 0.4;
      else if (sample.sheet < 0.26) sheetIn = 0.3;
      ({ hike, moveIn } = balance(sample));
    } else {
      rudder = steerToTwa(sample.twa, sign * 145 * DEG);
      if (sample.sheet < 0.32) sheetIn = 0.35;
      ({ hike, moveIn } = balance(sample));
    }
  } else {
    rudder = steerToTwa(sample.twa, 0);
    sheetOut = 1;
  }

  return { rudder, sheetIn, sheetOut, hike, moveIn };
}
