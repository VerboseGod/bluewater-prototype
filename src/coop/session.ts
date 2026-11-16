import { autoCrew } from './autocrew';
import { CallMachine, crewNote, helmNote, type SyncScore } from './call';
import { drillTime, freshDrill, stepDrill, type DrillProgress } from './drill';
import { EMPTY_KEYS, routeRoles, type CoopKeys, type CrewRole, type PadAxes } from './route';
import { composeControls, moveBody, sheetWithVang, weightDrive } from './weight';
import { windwardSign, type Controls } from '../sim/sim';

export interface BoatSample {
  twa: number;
  awa: number;
  sheet: number;
  suggested: number;
  heel: number;
  crew: number;
  tackQuality: number;
  x: number;
  y: number;
  heading: number;
  time: number;
  windFrom: number;
  tackCount: number;
}

export type CoopRole = 'none' | 'human' | 'ai';

export interface CoopView {
  phase: 'join' | 'sail' | 'done';
  role: CoopRole;
  call: string;
  kind: 'tack' | 'gybe' | null;
  helmLine: string;
  crewLine: string;
  banner: string;
  rudder: number;
  helmAlong: number;
  crewAlong: number;
  helmStbd: number;
  crewStbd: number;
  sheet: number;
  suggested: number;
  vang: number;
  sync: number;
  tackQuality: number;
  tacks: number;
  roundedLeft: boolean;
  roundedRight: boolean;
  time: number;
  joined: boolean;
}

export interface CoopReport {
  phase: 'join' | 'sail' | 'done';
  role: CoopRole;
  time: number;
  sync: number;
  tackQuality: number;
  tacks: number;
  helm: string;
  crew: string;
  maneuvers: { kind: string; sync: number; quality: number }[];
}

export class CoopSession {
  readonly call = new CallMachine();
  drill: DrillProgress = freshDrill();
  role: CoopRole = 'none';
  vang = 0.82;
  helmStbd = -0.55;
  crewStbd = -0.7;
  private scores: SyncScore[] = [];
  private prevVang = false;
  private aiVangPulse = false;
  private seenTacks = 0;
  private scoredAt = -10;
  private lastRudder = 0;
  private lastHelmAlong = 0.5;
  private lastCrewAlong = 0.6;

  joinHuman(): void {
    if (this.role === 'human') return;
    this.role = 'human';
    this.begin();
  }

  joinAi(): void {
    if (this.role !== 'none') return;
    this.role = 'ai';
    this.begin();
  }

  tick(dt: number, helmPad: PadAxes, crewPad: PadAxes, keys: CoopKeys, boat: BoatSample): Controls {
    const routed = routeRoles(helmPad, crewPad, this.role === 'ai' ? { ...keys, crewSheetIn: false, crewSheetOut: false, crewOut: false, crewIn: false, crewReady: false, crewVang: false, crewJoin: false } : keys);
    if (this.role === 'none' && (routed.crew.joinDown || keys.crewJoin)) this.joinHuman();
    if (this.role === 'none' && keys.aiStart) this.joinAi();
    if (this.role === 'ai' && routed.crew.connected && routed.crew.joinDown) this.joinHuman();

    let crew: CrewRole = routed.crew;
    if (this.role === 'ai') {
      const ai = autoCrew({
        dt,
        twa: boat.twa,
        sheet: boat.sheet,
        suggested: boat.suggested,
        heel: boat.heel,
        phase: this.call.phase,
        windowAge: this.call.windowAge,
        callAge: this.call.callAge,
        answered: this.call.answered,
        vang: this.vang,
      });
      crew = {
        ...crew,
        sheetIn: ai.sheetIn,
        sheetOut: ai.sheetOut,
        hikeOut: ai.hikeOut,
        hikeIn: ai.hikeIn,
        ready: ai.ready,
        vangDown: ai.vangToggle,
        joinDown: false,
      };
    }

    const windward = windwardSign(boat.awa, boat.twa);
    if (this.role !== 'none') {
      this.helmStbd = moveBody(this.helmStbd, routed.helm.hikeOut, routed.helm.hikeIn, windward, dt);
      this.crewStbd = moveBody(this.crewStbd, crew.hikeOut, crew.hikeIn, windward, dt);
    }
    this.lastHelmAlong = this.helmStbd * windward;
    this.lastCrewAlong = this.crewStbd * windward;

    const vangEdge = crew.vangDown && !this.prevVang;
    this.prevVang = crew.vangDown;
    if (this.role === 'ai') {
      if (crew.vangDown && !this.aiVangPulse) {
        this.vang = this.vang > 0.5 ? 0.12 : 0.85;
        this.aiVangPulse = true;
      }
      if (!crew.vangDown) this.aiVangPulse = false;
    } else if (vangEdge) {
      this.vang = this.vang > 0.5 ? 0.12 : 0.85;
    }

    const stepped = this.call.step({
      dt,
      callDown: routed.helm.call,
      readyDown: crew.ready,
      rudder: routed.helm.rudder,
      twa: boat.twa,
      crewStbd: this.crewStbd,
      sheet: boat.sheet,
      suggested: boat.suggested,
      vang: this.vang,
      tackQuality: boat.tackQuality,
    });
    if (stepped.result) {
      this.scores.push(stepped.result);
      this.scoredAt = boat.time;
    }

    if (boat.tackCount > this.seenTacks) {
      const fresh = boat.tackCount - this.seenTacks;
      this.seenTacks = boat.tackCount;
      const covered = this.call.phase !== 'idle' || boat.time - this.scoredAt < 3;
      if (this.drill.phase === 'sail' && !covered) {
        for (let i = 0; i < fresh; i++) {
          this.scores.push({
            kind: 'tack',
            sync: 0,
            tackQuality: boat.tackQuality,
            answered: false,
            answerDelay: null,
            crossDelay: null,
            sheetEased: false,
            sheetRetrimmed: false,
            vangEased: false,
            jumped: false,
            missed: true,
          });
        }
      }
    }

    if (this.drill.phase === 'sail') {
      const tacks = boat.tackCount - this.tackBase;
      this.drill = stepDrill(this.drill, boat.x, boat.y, boat.time, tacks);
    }

    const sheet = sheetWithVang(crew.sheetIn, crew.sheetOut, this.vang);
    const com = this.helmStbd * 0.46 + this.crewStbd * 0.54;
    const weight = this.role === 'none'
      ? { hike: 0.2, moveIn: 0 }
      : weightDrive(com, boat.crew, windward);
    this.lastRudder = stepped.rudder;
    return composeControls(stepped.rudder, sheet.sheetIn, sheet.sheetOut, weight.hike, weight.moveIn);
  }

  private tackBase = 0;

  view(boat?: Pick<BoatSample, 'sheet' | 'suggested' | 'time'>): CoopView {
    const quality = mean(this.scores.map((s) => s.tackQuality));
    const sync = mean(this.scores.map((s) => s.sync));
    return {
      phase: this.drill.phase,
      role: this.role,
      call: this.call.phase,
      kind: this.call.kind,
      helmLine: this.call.phase === 'idle' ? 'Steer and hike. RB calls ready about.' : this.lines().helm,
      crewLine: this.call.phase === 'idle' ? 'Sheet, vang, and trapeze. Y answers.' : this.lines().crew,
      banner: this.banner(),
      rudder: this.lastRudder,
      helmAlong: this.lastHelmAlong,
      crewAlong: this.lastCrewAlong,
      helmStbd: this.helmStbd,
      crewStbd: this.crewStbd,
      sheet: boat?.sheet ?? 0,
      suggested: boat?.suggested ?? 0,
      vang: this.vang,
      sync,
      tackQuality: quality,
      tacks: this.drill.tacks,
      roundedLeft: this.drill.roundedLeft,
      roundedRight: this.drill.roundedRight,
      time: drillTime(this.drill, boat?.time ?? 0),
      joined: this.role !== 'none',
    };
  }

  report(now = 0): CoopReport {
    const parts = this.scores;
    return {
      phase: this.drill.phase,
      role: this.role,
      time: drillTime(this.drill, now),
      sync: mean(parts.map((s) => s.sync)),
      tackQuality: mean(parts.map((s) => s.tackQuality)),
      tacks: this.drill.tacks,
      helm: helmNote(mean(parts.map((s) => s.tackQuality)), parts),
      crew: crewNote(parts, this.role === 'ai'),
      maneuvers: parts.map((s) => ({ kind: s.kind, sync: s.sync, quality: s.tackQuality })),
    };
  }

  private begin(): void {
    if (this.drill.phase !== 'join') return;
    this.drill = { ...this.drill, phase: 'sail', startTime: this.pendingTime };
  }

  private pendingTime = 0;

  noteTime(time: number): void {
    this.pendingTime = time;
    if (this.drill.phase === 'join') this.tackBase = this.seenTacks;
  }

  private lines(): { helm: string; crew: string } {
    const gybe = this.call.kind === 'gybe';
    if (this.call.phase === 'called') {
      return gybe
        ? { helm: 'Stand by to gybe. Wait for ready.', crew: 'Helm called the gybe. Press Y.' }
        : { helm: 'Ready about. Wait for the crew.', crew: 'Helm called ready about. Press Y.' };
    }
    if (this.call.phase === 'ready') return { helm: 'Crew is ready. Put the helm down.', crew: 'You answered. Ease the sheet, then cross.' };
    if (this.call.phase === 'turning') return { helm: gybe ? 'Gybe-oh.' : 'Lee-oh.', crew: 'Ease the sheet and the vang. Cross the boat.' };
    if (this.call.phase === 'window') return { helm: 'Through the wind. Straighten up.', crew: 'New side. Trim on.' };
    return { helm: 'Steer and hike. RB calls ready about.', crew: 'Sheet, vang, and trapeze. Y answers.' };
  }

  private banner(): string {
    if (this.drill.phase === 'join') return 'Press A on a second controller';
    if (this.drill.phase === 'done') return 'Back on the line';
    if (this.call.phase === 'called') return this.call.kind === 'gybe' ? 'Stand by to gybe' : 'Ready about';
    if (this.call.phase === 'ready' || this.call.phase === 'turning') return this.call.kind === 'gybe' ? 'Gybe-oh' : 'Lee-oh';
    if (this.call.phase === 'window') return 'Cross and trim';
    const n = Math.min(3, this.drill.tacks);
    return `Upwind beat. Tack ${n} of 3.`;
  }
}

export function idleKeys(): CoopKeys {
  return { ...EMPTY_KEYS };
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
