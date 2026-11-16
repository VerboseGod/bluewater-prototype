import type { CallPhase } from './call';

export interface AutoCrewIn {
  dt: number;
  twa: number;
  sheet: number;
  suggested: number;
  heel: number;
  phase: CallPhase;
  windowAge: number;
  callAge: number;
  answered: boolean;
  vang: number;
}

export interface AutoCrewOut {
  sheetIn: number;
  sheetOut: number;
  hikeOut: number;
  hikeIn: number;
  ready: boolean;
  vangToggle: boolean;
}

/**
 * Fills the crew job when only one person is on the boat.
 * It answers a beat after the call, eases through the wind, and trims back.
 */
export function autoCrew(input: AutoCrewIn): AutoCrewOut {
  const easing = input.phase === 'turning' || (input.phase === 'window' && input.windowAge < 1.05);
  const crossing = input.phase === 'turning';
  let sheetIn = 0;
  let sheetOut = 0;
  if (easing) sheetOut = 1;
  else if (input.sheet < input.suggested - 0.06) sheetIn = 1;
  else if (input.sheet > input.suggested + 0.1) sheetOut = 1;

  let hikeOut = 0;
  let hikeIn = 0;
  if (crossing) hikeIn = 1;
  else if (input.phase === 'window') hikeOut = 1;
  else if (Math.abs(input.twa) < 1.25 && Math.abs(input.heel) > 0.1) hikeOut = 0.85;
  else if (Math.abs(input.twa) > 1.7) hikeOut = 0.2;
  else hikeOut = 0.4;

  const ready = input.phase === 'called' && !input.answered && input.callAge >= 0.45 && input.callAge - input.dt < 0.45;
  const easeVang = input.phase === 'window' && input.windowAge <= input.dt && input.vang > 0.5;
  const resetVang = input.phase === 'window' && input.windowAge >= 1.15 && input.windowAge - input.dt < 1.15 && input.vang < 0.5;
  return { sheetIn, sheetOut, hikeOut, hikeIn, ready, vangToggle: easeVang || resetVang };
}
