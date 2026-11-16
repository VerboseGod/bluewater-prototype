/** A short upwind beat: two marks, three tacks, and back to the start. */

export const LEFT_MARK = { x: 4, y: 24 };
export const RIGHT_MARK = { x: 18, y: 38 };
export const MARK_RADIUS = 14;
export const FINISH = { x: 0, y: 0 };
export const FINISH_RADIUS = 14;
export const AWAY_DISTANCE = 18;

export interface DrillProgress {
  phase: 'join' | 'sail' | 'done';
  roundedLeft: boolean;
  roundedRight: boolean;
  leftHome: boolean;
  tacks: number;
  startTime: number;
  endTime: number | null;
}

export function freshDrill(): DrillProgress {
  return {
    phase: 'join',
    roundedLeft: false,
    roundedRight: false,
    leftHome: false,
    tacks: 0,
    startTime: 0,
    endTime: null,
  };
}

export function stepDrill(progress: DrillProgress, x: number, y: number, time: number, tacks: number): DrillProgress {
  if (progress.phase === 'join' || progress.phase === 'done') return progress;
  const next = { ...progress, tacks };
  const home = Math.hypot(x - FINISH.x, y - FINISH.y);
  if (home > AWAY_DISTANCE) next.leftHome = true;
  if (Math.hypot(x - LEFT_MARK.x, y - LEFT_MARK.y) <= MARK_RADIUS) next.roundedLeft = true;
  if (Math.hypot(x - RIGHT_MARK.x, y - RIGHT_MARK.y) <= MARK_RADIUS) next.roundedRight = true;
  if (next.leftHome && next.roundedLeft && next.roundedRight && next.tacks >= 3 && home <= FINISH_RADIUS) {
    next.phase = 'done';
    next.endTime = time;
  }
  return next;
}

export function drillTime(progress: DrillProgress, now: number): number {
  if (progress.phase === 'join') return 0;
  const end = progress.endTime ?? now;
  return Math.max(0, end - progress.startTime);
}
