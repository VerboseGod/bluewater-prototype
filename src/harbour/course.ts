export type HarbourPhase = 'berth' | 'exit' | 'marks' | 'return' | 'dock';

export interface CourseGeom {
  berth: { x: number; y: number };
  gate: { x: number; y: number; ox: number; oy: number };
  marks: readonly { x: number; y: number }[];
  leaveDistance: number;
  markRadius: number;
}

export interface CourseState {
  phase: HarbourPhase;
  leftBerth: boolean;
  exited: boolean;
  rounded: [boolean, boolean];
}

export function initialCourse(): CourseState {
  return { phase: 'berth', leftBerth: false, exited: false, rounded: [false, false] };
}

/** Berth, then the entrance, then both marks, then back inside to dock. */
export function advanceCourse(prev: CourseState, x: number, y: number, inside: boolean, g: CourseGeom): CourseState {
  const rounded: [boolean, boolean] = [prev.rounded[0], prev.rounded[1]];
  const leftBerth = prev.leftBerth || Math.hypot(x - g.berth.x, y - g.berth.y) > g.leaveDistance;
  const pastGate = (x - g.gate.x) * g.gate.ox + (y - g.gate.y) * g.gate.oy > 12;
  const exited = prev.exited || (leftBerth && !inside && pastGate);
  if (exited) {
    for (let i = 0; i < 2; i++) {
      const m = g.marks[i];
      if (m && Math.hypot(x - m.x, y - m.y) < g.markRadius) rounded[i] = true;
    }
  }
  const both = rounded[0] && rounded[1];
  let phase: HarbourPhase;
  if (!leftBerth) phase = 'berth';
  else if (!exited) phase = 'exit';
  else if (!both) phase = 'marks';
  else if (inside) phase = 'dock';
  else phase = 'return';
  return { phase, leftBerth, exited, rounded };
}
