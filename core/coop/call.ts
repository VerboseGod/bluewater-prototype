/** Call and answer, then a timing window for the crew to cross. */

export type CallPhase = 'idle' | 'called' | 'ready' | 'turning' | 'window';

export interface SyncParts {
  answered: boolean;
  /** Seconds from the call to ready. Null when the crew never answered. */
  answerDelay: number | null;
  /** Seconds from the window opening to the crew changing sides. Negative means they crossed early. */
  crossDelay: number | null;
  sheetEased: boolean;
  sheetRetrimmed: boolean;
  vangEased: boolean;
  jumped: boolean;
}

export interface SyncScore extends SyncParts {
  kind: 'tack' | 'gybe';
  sync: number;
  /** Peak of the sim's existing tack-quality term during the maneuver. */
  tackQuality: number;
  missed: boolean;
}

export interface CallInput {
  dt: number;
  callDown: boolean;
  readyDown: boolean;
  rudder: number;
  twa: number;
  crewStbd: number;
  sheet: number;
  suggested: number;
  vang: number;
  tackQuality: number;
}

export interface CallOutput {
  phase: CallPhase;
  kind: 'tack' | 'gybe' | null;
  rudder: number;
  helm: string;
  crew: string;
  banner: string;
  callAge: number;
  windowAge: number;
  answered: boolean;
  result: SyncScore | null;
}

const CALL_LIMIT = 6;
const READY_LIMIT = 6;
const TURN_LIMIT = 9;
const WINDOW = 2.4;

export function syncScore(parts: SyncParts): number {
  const answer = answerPart(parts);
  const cross = crossPart(parts.crossDelay);
  const sheet = parts.sheetEased && parts.sheetRetrimmed ? 1 : parts.sheetEased ? 0.55 : 0.1;
  const vang = parts.vangEased ? 1 : 0.35;
  let score = 0.34 * answer + 0.36 * cross + 0.2 * sheet + 0.1 * vang;
  if (!parts.answered) score = Math.min(score, 0.22);
  if (parts.jumped) score *= 0.35;
  return clamp(score, 0, 1);
}

export function helmNote(quality: number, parts: SyncParts[]): string {
  if (parts.length === 0) return 'No tack has been called yet. RB, or Q, is ready about.';
  const jumped = parts.some((p) => p.jumped);
  const missed = parts.some((p) => !p.answered);
  if (jumped) return 'The tiller went down before the crew answered. Call it, wait, then turn.';
  if (missed) return 'The crew never got a call they could answer, or the call timed out.';
  if (quality >= 0.55) return 'Clean helm. The sheet was eased and the tiller stayed smooth through the wind.';
  if (quality >= 0.35) return 'Usable tack. Once the bow is through, ease the tiller so the boat keeps its speed.';
  return 'The boat gave away more speed than it had to. Half a stick is enough once it is turning.';
}

export function crewNote(parts: SyncParts[], ai: boolean): string {
  if (ai) return 'An AI crew answered and trimmed. The second controller is the crew this mode is for.';
  if (parts.length === 0) return 'Wait for ready about, answer on Y or U, then ease the sheet and cross.';
  const mean = parts.reduce((sum, p) => sum + syncScore(p), 0) / parts.length;
  const late = parts.some((p) => p.crossDelay === null || p.crossDelay > 1.5);
  const sheet = parts.every((p) => p.sheetEased);
  if (mean >= 0.75 && sheet) return 'Answered, eased, and crossed while the sail was light. That is the move.';
  if (mean >= 0.45) return late
    ? 'With the helm, a beat late on the cross. The new side wants you as the sail fills.'
    : 'The answer was there. The sheet or the vang was a beat off the boom coming across.';
  return 'The helm needs a ready before the turn, then the sheet and the vang ease as you cross.';
}

export class CallMachine {
  phase: CallPhase = 'idle';
  kind: 'tack' | 'gybe' | null = null;
  callAge = 0;
  windowAge = 0;
  answered = false;
  private time = 0;
  private calledAt = 0;
  private answeredAt: number | null = null;
  private turnAt = 0;
  private windowAt = 0;
  private prevCall = false;
  private prevReady = false;
  private jumped = false;
  private entryAbs = 0;
  private entrySign = 1;
  private crossedAt: number | null = null;
  private sheetEased = false;
  private sheetRetrimmed = false;
  private vangEased = false;
  private maxQuality = 0;

  step(input: CallInput): CallOutput {
    const dt = Math.max(0, input.dt);
    this.time += dt;
    const callEdge = input.callDown && !this.prevCall;
    const readyEdge = input.readyDown && !this.prevReady;
    this.prevCall = input.callDown;
    this.prevReady = input.readyDown;
    let result: SyncScore | null = null;

    if (this.phase === 'idle' && callEdge) this.begin(input);
    if (this.phase === 'called' && readyEdge) {
      this.phase = 'ready';
      this.answeredAt = this.time;
    }
    if (this.phase === 'called' && Math.abs(input.rudder) > 0.45) this.jumped = true;
    if (this.phase === 'ready' && Math.abs(input.rudder) > 0.28) {
      this.phase = 'turning';
      this.turnAt = this.time;
    }
    this.observe(input);
    if (this.phase === 'turning' && this.through(input.twa) && this.time - this.turnAt > 0.25) {
      this.phase = 'window';
      this.windowAt = this.time;
    }

    if (this.phase === 'called' && this.time - this.calledAt > CALL_LIMIT) result = this.finish(true);
    else if (this.phase === 'ready' && this.answeredAt !== null && this.time - this.answeredAt > READY_LIMIT) result = this.finish(true);
    else if (this.phase === 'turning' && this.time - this.turnAt > TURN_LIMIT) result = this.finish(true);
    else if (this.phase === 'window' && this.time - this.windowAt > WINDOW) result = this.finish(false);

    const rudder = this.phase === 'called' ? clamp(input.rudder, -0.2, 0.2) : input.rudder;
    const lines = this.lines();
    this.callAge = this.phase === 'idle' ? 0 : this.time - this.calledAt;
    this.windowAge = this.phase === 'window' ? this.time - this.windowAt : 0;
    this.answered = this.answeredAt !== null && this.phase !== 'idle';
    return {
      phase: this.phase,
      kind: this.kind,
      rudder,
      helm: lines.helm,
      crew: lines.crew,
      banner: lines.banner,
      callAge: this.phase === 'idle' ? 0 : this.time - this.calledAt,
      windowAge: this.phase === 'window' ? this.time - this.windowAt : 0,
      answered: this.answeredAt !== null && this.phase !== 'idle',
      result,
    };
  }

  private begin(input: CallInput): void {
    this.phase = 'called';
    this.kind = Math.abs(input.twa) > 1.75 ? 'gybe' : 'tack';
    this.calledAt = this.time;
    this.answeredAt = null;
    this.jumped = false;
    this.entryAbs = Math.abs(input.twa);
    this.entrySign = Math.sign(input.crewStbd) || 1;
    this.crossedAt = null;
    this.sheetEased = false;
    this.sheetRetrimmed = false;
    this.vangEased = false;
    this.maxQuality = 0;
  }

  private observe(input: CallInput): void {
    if (this.phase === 'idle') return;
    if (this.crossedAt === null && input.crewStbd * this.entrySign < -0.12) this.crossedAt = this.time;
    if (input.sheet < 0.55) this.sheetEased = true;
    if (this.sheetEased && (input.sheet > 0.58 || Math.abs(input.sheet - input.suggested) < 0.2)) this.sheetRetrimmed = true;
    if (input.vang < 0.45) this.vangEased = true;
    if (input.tackQuality > this.maxQuality) this.maxQuality = input.tackQuality;
  }

  private through(twa: number): boolean {
    const abs = Math.abs(twa);
    if (this.kind === 'gybe') return abs > 2.5 && abs > this.entryAbs + 0.15;
    return abs < 0.55 && abs < this.entryAbs - 0.2;
  }

  private finish(missed: boolean): SyncScore {
    const kind = this.kind ?? 'tack';
    const answered = this.answeredAt !== null;
    const parts: SyncParts = {
      answered,
      answerDelay: answered && this.answeredAt !== null ? this.answeredAt - this.calledAt : null,
      crossDelay: this.crossedAt === null ? null : this.crossedAt - (this.phase === 'window' ? this.windowAt : this.time),
      sheetEased: this.sheetEased,
      sheetRetrimmed: this.sheetRetrimmed,
      vangEased: this.vangEased,
      jumped: this.jumped,
    };
    if (this.phase !== 'window' && this.crossedAt !== null) {
      parts.crossDelay = this.crossedAt - this.time;
    }
    const score: SyncScore = {
      ...parts,
      kind,
      sync: syncScore(parts),
      tackQuality: this.maxQuality,
      missed,
    };
    this.phase = 'idle';
    this.kind = null;
    this.answeredAt = null;
    return score;
  }

  private lines(): { helm: string; crew: string; banner: string } {
    const gybe = this.kind === 'gybe';
    if (this.phase === 'called') {
      return gybe
        ? { helm: 'Wait for the answer.', crew: 'Ready', banner: 'Stand by to gybe' }
        : { helm: 'Wait for the answer.', crew: 'Ready', banner: 'Ready about' };
    }
    if (this.phase === 'ready' || this.phase === 'turning') {
      return {
        helm: 'Helm down.',
        crew: gybe ? 'Gybe-oh, duck, cross' : 'Duck the boom, cross the boat',
        banner: gybe ? 'Gybe-oh' : 'Lee-oh',
      };
    }
    if (this.phase === 'window') {
      return {
        helm: 'Straighten up.',
        crew: gybe ? 'Trim for the new course' : 'Trim on, hike',
        banner: gybe ? 'Gybe-oh' : 'Lee-oh',
      };
    }
    return {
      helm: 'Steer and hike. RB calls ready about.',
      crew: 'Sheet, vang, and trapeze. Y answers.',
      banner: 'Upwind beat. Three tacks, two marks, and back.',
    };
  }
}

function answerPart(parts: SyncParts): number {
  if (!parts.answered || parts.answerDelay === null) return 0;
  const d = parts.answerDelay;
  if (d <= 0.8) return 1;
  if (d >= 4) return 0.15;
  return 1 - ((d - 0.8) / 3.2) * 0.85;
}

function crossPart(delay: number | null): number {
  if (delay === null) return 0;
  if (delay < 0) return 0.72;
  if (delay <= 1.5) return 1;
  if (delay >= 2.4) return 0.15;
  return 1 - ((delay - 1.5) / 0.9) * 0.85;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
