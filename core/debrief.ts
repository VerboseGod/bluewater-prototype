import type { DockReport } from './dock/score';
import type { BoatState } from './sim/sim';

/** Open-water debrief numbers. The HUD formats these; a port can show the same fields. */
export interface OpenDebrief {
  elapsedSec: number;
  maxSpeedMs: number;
  bestVmgUpMs: number;
  bestVmgDownMs: number;
  timeLuffingSec: number;
  timeStalledSec: number;
  capsizes: number;
  tacks: number;
  gybes: number;
}

export function openDebrief(state: BoatState): OpenDebrief {
  return {
    elapsedSec: state.time,
    maxSpeedMs: state.maxSpeed,
    bestVmgUpMs: state.bestVmgUp,
    bestVmgDownMs: state.bestVmgDown,
    timeLuffingSec: state.timeLuffing,
    timeStalledSec: state.timeStalled,
    capsizes: state.capsizeCount,
    tacks: state.marks.filter((mark) => mark.type === 'tack').length,
    gybes: state.marks.filter((mark) => mark.type === 'gybe').length,
  };
}

export type { DockReport };
