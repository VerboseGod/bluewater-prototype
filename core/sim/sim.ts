import {
  BEAM_DRIVE,
  BEAM_HUMP,
  BROAD_DRIVE,
  BROAD_DRIVE_AFT,
  BROAD_HUMP,
  BOOM_YAW,
  CAPSIZE_ASSIST,
  CAPSIZE_MANUAL,
  CE_HEIGHT,
  CREW_LEEWARD,
  CREW_MASS,
  CREW_OFFSET_MAX,
  CREW_OFFSET_MIN,
  CREW_RATE,
  G,
  HEEL_STEER,
  HULL_RIGHTING_ASSIST,
  HULL_RIGHTING_MANUAL,
  I_ROLL,
  I_YAW,
  LIGHT_AIR,
  MASS,
  MAX_RUDDER,
  PLANING_OFF,
  PLANING_ONSET,
  RECOVERY_TIME,
  RHO_AIR,
  ROLL_DAMP,
  RUDDER_STALL,
  RUDDER_STALL_ASSIST,
  SHEET_RATE,
  STALL_AOA,
  STALL_AOA_ASSIST,
  WEATHER_HELM,
  WEATHERCOCK,
  WINDAGE,
} from './constants';
import { hullForces, rudderForces } from './hydro';
import { DEG, KT, headingFwd, headingStbd, passedAngle, smoothstep, wrapPi } from './math';
import { boomForSheet, sailForces, suggestedSheet, type SailMode } from './sail';
import { apparentWind, WindField, type Gust, type WindSample } from './wind';
import { sampleWater } from './water';

export interface Controls {
  /** -1..1. Positive steers the bow to starboard while moving forward. */
  rudder: number;
  /** 0..1 analogue, sheets the sail in while held. */
  sheetIn: number;
  /** 0..1 analogue, eases the sail while held. */
  sheetOut: number;
  /**
   * 0..1 move the sailor out, toward a windward hike.
   * With `moveIn` omitted, this is the legacy windward-hike fraction.
   */
  hike: number;
  /**
   * 0..1 move the sailor in, through the boat, and slightly to leeward.
   * Omit it to keep the old "hike is always on the windward side" behaviour.
   */
  moveIn?: number;
}

export const NEUTRAL: Controls = { rudder: 0, sheetIn: 0, sheetOut: 0, hike: 0 };

export interface TrackPoint {
  x: number;
  y: number;
  t: number;
}

export interface ManeuverMark {
  type: 'tack' | 'gybe';
  x: number;
  y: number;
  t: number;
}

export interface SimOptions {
  windSpeed?: number;
  windFrom?: number;
  /** Freeze wind and disable waves. Physics tests use this. */
  steady?: boolean;
  waves?: boolean;
  assisted?: boolean;
  heading?: number;
  sheet?: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

export interface SimSnapshot {
  time: number;
  x: number;
  y: number;
  heading: number;
  vx: number;
  vy: number;
  speed: number;
  vFwd: number;
  vStbd: number;
  leeway: number;
  yawRate: number;
  heel: number;
  heelRate: number;
  sheet: number;
  boom: number;
  aoa: number;
  awa: number;
  twa: number;
  aws: number;
  tws: number;
  windFrom: number;
  sail: SailMode;
  inIrons: boolean;
  planing: boolean;
  capsized: boolean;
  capsizeCount: number;
  capsizeSide: number;
  assisted: boolean;
  drive: number;
  side: number;
  suggestedSheet: number;
  rudder: number;
  rudderStalled: boolean;
  gust: number;
  hike: number;
  /** Sailor offset, meters, starboard-positive. */
  crew: number;
  boomImpact: number;
  shake: number;
}

/** Plain wind field. `modify` is a scenario hook and is not stored. */
export interface WindState {
  baseSpeed: number;
  baseFrom: number;
  steady: boolean;
  gustFactor: number;
  gusts: Gust[];
  nextSpawn: number;
  rngState: number;
}

/**
 * Plain boat. A port keeps this struct and passes it to `step`.
 * `waveScale` is a scenario hook (1 in open water) and is not stored.
 */
export interface BoatState {
  x: number;
  y: number;
  heading: number;
  vx: number;
  vy: number;
  currentX: number;
  currentY: number;
  yawRate: number;
  heel: number;
  heelRate: number;
  sheet: number;
  boom: number;
  boomRate: number;
  planing: boolean;
  capsized: boolean;
  capsizeTimer: number;
  capsizeCount: number;
  capsizeSide: number;
  time: number;
  timeLuffing: number;
  timeStalled: number;
  bestVmgUp: number;
  bestVmgDown: number;
  maxSpeed: number;
  track: TrackPoint[];
  marks: ManeuverMark[];
  trackAccum: number;
  prevHeading: number;
  armedTack: boolean;
  armedGybe: boolean;
  prevBoomSign: number;
  crossedBoomAt: number;
  rumble: { strong: number; weak: number; ms: number } | null;
  lastTackQuality: number;
  prevGust: number;
  hikeCmd: number;
  crew: number;
  crewManual: boolean;
  shake: number;
  assisted: boolean;
  waves: boolean;
  wind: WindState;
  view: SimSnapshot;
}

export type SailorStation = 'hiked' | 'rail' | 'in' | 'leeward';

/** Which way is windward, in starboard-positive boat axes. */
export function windwardSign(awa: number, twa: number): number {
  return -(Math.sign(awa) || Math.sign(twa) || 1);
}

/** Where the sailor is sitting relative to the wind. */
export function sailorStation(crew: number, windward: number): SailorStation {
  const along = crew * windward;
  if (along > 0.72) return 'hiked';
  if (along > 0.22) return 'rail';
  if (along >= -0.12) return 'in';
  return 'leeward';
}

/**
 * Fixed-step dinghy. One call is one physics tick; the render loop accumulates
 * real time and calls this at 60 Hz. Wind, water, and the boat stay separate.
 */
export class Simulation {
  readonly wind: WindField;
  readonly waves: boolean;
  assisted: boolean;

  x: number;
  y: number;
  heading: number;
  vx: number;
  vy: number;
  /**
   * Uniform current, world m/s. Zero in open water, so the sailing forces
   * are unchanged. The dock scenario sets a light tide here.
   */
  currentX = 0;
  currentY = 0;
  /**
   * Multiplier on the open-water wave amplitudes at a point. Open water
   * leaves this at 1, so the swell numbers do not change.
   */
  waveScale: (x: number, y: number) => number = () => 1;
  yawRate = 0;
  heel = 0;
  heelRate = 0;
  sheet: number;
  boom = 0;
  boomRate = 0;
  planing = false;
  capsized = false;
  capsizeTimer = 0;
  capsizeCount = 0;
  capsizeSide = 0;

  time = 0;
  timeLuffing = 0;
  timeStalled = 0;
  bestVmgUp = 0;
  bestVmgDown = 0;
  maxSpeed = 0;
  track: TrackPoint[] = [];
  marks: ManeuverMark[] = [];

  private trackAccum = 0;
  private prevHeading: number;
  private armedTack = true;
  private armedGybe = true;
  private prevBoomSign = 0;
  private crossedBoomAt = -10;
  private rumble: { strong: number; weak: number; ms: number } | null = null;
  /**
   * Latest value of the tack-quality term the force model already applies.
   * Recording it does not change those forces.
   */
  lastTackQuality = 0;
  private prevGust = 1;
  private hikeCmd = 0;
  /** Persistent sailor offset once `moveIn` is used. Starboard-positive meters. */
  crew = 0;
  private crewManual = false;
  shake = 0;

  snapshot: SimSnapshot;

  constructor(opts: SimOptions = {}) {
    const windSpeed = opts.windSpeed ?? 5.66;
    const windFrom = opts.windFrom ?? Math.PI / 2;
    const steady = opts.steady ?? false;
    this.wind = new WindField(windSpeed, windFrom, steady);
    this.waves = opts.waves ?? !steady;
    this.assisted = opts.assisted ?? false;
    this.x = opts.x ?? 0;
    this.y = opts.y ?? 0;
    this.heading = opts.heading ?? 0;
    this.prevHeading = this.heading;
    this.vx = opts.vx ?? 0;
    this.vy = opts.vy ?? 0;
    this.sheet = opts.sheet ?? 0.08;
    const twa0 = wrapPi(windFrom - this.heading);
    this.crew = windwardSign(twa0, twa0) * CREW_OFFSET_MIN;
    this.snapshot = this.capture(NEUTRAL, 0, 0, 0, 0, 0, 'luffing', 0, 0, false);
  }

  /** One fixed tick. Pass 1/60 from the game loop. */
  step(dt: number, controls: Controls): void {
    if (this.capsized) {
      this.lastTackQuality = 0;
      this.stepCapsize(dt);
      return;
    }

    this.time += dt;
    this.shake *= Math.exp(-dt * 3.5);
    this.sheet = clamp01(this.sheet + (clamp01(controls.sheetIn) - clamp01(controls.sheetOut)) * SHEET_RATE * dt);

    this.wind.update(dt, this.x, this.y);
    const wind = this.wind.sample(this.x, this.y, this.time);
    if (wind.factor > this.prevGust + 0.12) {
      this.requestRumble(0.25, 0.55, 160);
    }
    this.prevGust = wind.factor;

    const aw = apparentWind(wind.vel, { x: this.vx, y: this.vy });
    const aws = Math.hypot(aw.x, aw.y);
    const awa = aws > 0.05 ? wrapPi(Math.atan2(-aw.y, -aw.x) - this.heading) : 0;
    const twa = wrapPi(wind.from - this.heading);
    this.updateCrew(dt, controls, awa, twa);

    const water = sampleWater(this.x, this.y, this.time, this.waves, undefined, this.waveScale(this.x, this.y));
    const fwd = headingFwd(this.heading);
    const stbd = headingStbd(this.heading);
    // Hull and rudder see the water, not the ground. With no current this is
    // the same ground velocity the open-water boat has always used.
    const relVx = this.vx - this.currentX;
    const relVy = this.vy - this.currentY;
    let vFwd = relVx * fwd.x + relVy * fwd.y;
    let vStbd = relVx * stbd.x + relVy * stbd.y;
    if (this.waves) {
      const orbFwd = water.orbX * fwd.x + water.orbZ * fwd.y;
      const orbStbd = water.orbX * stbd.x + water.orbZ * stbd.y;
      vFwd -= orbFwd * 0.35;
      vStbd -= orbStbd * 0.35;
    }

    // Sail inflow uses forward speed and only a little sideslip. Full slip
    // swings the apparent wind aft and the no-go zone becomes a cliff.
    const flow = apparentWind(wind.vel, {
      x: this.vx - stbd.x * vStbd * 0.82,
      y: this.vy - stbd.y * vStbd * 0.82,
    });
    const flowAws = Math.hypot(flow.x, flow.y);
    const flowAwa = flowAws > 0.05 ? wrapPi(Math.atan2(-flow.y, -flow.x) - this.heading) : awa;

    const twaAbsEarly = Math.abs(twa);
    // Between about 46° and 37° true, sheet the sail toward a luff so speed
    // bleeds off before the stall, instead of staying full until a cliff.
    const pinch = smoothstep(50 * (Math.PI / 180), 37 * (Math.PI / 180), twaAbsEarly);
    const sailAwa = flowAwa;
    this.updateBoom(dt, sailAwa, flowAws, twa);
    const stall = this.assisted ? STALL_AOA_ASSIST : STALL_AOA;
    const sail = sailForces(sailAwa, this.boom, flowAws, this.heel, stall);
    if (pinch > 0) {
      // Angle of attack, not the slip-swollen apparent wind, drives the luff.
      sail.aoa *= 1 - 0.62 * pinch;
      sail.drive *= 1 - 0.28 * pinch;
      sail.side *= 1 - 0.15 * pinch;
      if (twaAbsEarly < 36 * (Math.PI / 180)) {
        sail.drive *= 0.08;
        sail.side *= 0.35;
        sail.aoa = Math.min(sail.aoa, 0.07);
      }
      if (sail.aoa < 0.16) sail.mode = 'luffing';
      else if (sail.aoa < stall && sail.mode === 'luffing') sail.mode = 'trimmed';
    }

    const windage = WINDAGE * RHO_AIR * aws;
    let drive = sail.drive + windage * (aw.x * fwd.x + aw.y * fwd.y);
    let side = sail.side + windage * (aw.x * stbd.x + aw.y * stbd.y);

    const twaAbs = Math.abs(twa);
    const windward = windwardSign(awa, twa);
    const along = this.crew * windward;
    const toWindward = Math.max(0, along);
    const toLeeward = Math.max(0, -along);

    // A reaching rig works harder around the beam. Close-hauled is left alone.
    const beam = smoothstep(1.02, 1.38, twaAbs) * (1 - smoothstep(1.92, 2.28, twaAbs));
    // Broad reach, after the beam window has shut. Zero on the beam and upwind.
    // Deeper angles sit further under the hump, so the help grows toward 135°.
    const span = smoothstep(1.98, 2.08, twaAbs) * (1 - smoothstep(2.62, 2.95, twaAbs));
    const aft = smoothstep(2.08, 2.38, twaAbs);
    const broad = span * (0.76 + 0.24 * aft);
    drive *= 1 + BEAM_DRIVE * beam + (BROAD_DRIVE + BROAD_DRIVE_AFT * aft) * span;

    // Light air: weight out in the breeze just adds drag. Sitting in, or a
    // touch to leeward, keeps the boat moving.
    const light = smoothstep(LIGHT_AIR + 0.45, LIGHT_AIR - 0.55, wind.speed);
    if (light > 0) {
      const hikeOut = Math.max(0, toWindward - 0.18);
      drive -= light * hikeOut * (32 + 40 * hikeOut);
      const inboard = smoothstep(0.5, 0.02, toWindward);
      const lee = 1 + 0.65 * clamp(toLeeward / CREW_LEEWARD, 0, 1);
      drive += light * inboard * lee * 18;
    }

    // Easing in a puff spills the sail before the boom has finished traveling.
    if (clamp01(controls.sheetOut) > 0.35 && twaAbs < 1.35 && Math.abs(this.heel) > 0.22) {
      const spill = 0.62 * clamp01(controls.sheetOut) * smoothstep(0.18, 0.36, Math.abs(this.heel));
      drive *= 1 - spill * 0.35;
      side *= 1 - spill;
    }

    // Still on the new leeward side once the tack has opened up: the sail stalls and the boat stays heeled.
    if (this.crewManual && toLeeward > 0.24 && twaAbs > 0.82 && twaAbs < 1.35 && sail.mode !== 'luffing') {
      drive *= 0.7;
      side *= 1.08;
    }

    const bearingAway = twaAbs > 1.85 && twaAbs < 2.7;
    const eased = this.sheet < 0.5;
    const flat = Math.abs(this.heel) < 0.34;
    if (!this.planing) {
      // Onset asks for a bear-away, a flat boat, and an eased sheet.
      if (bearingAway && eased && flat && wind.speed >= PLANING_ONSET && vFwd > 2.45) this.planing = true;
    } else if (
      !bearingAway ||
      wind.speed < PLANING_OFF ||
      vFwd < 2.05 ||
      Math.abs(this.heel) > 0.72 ||
      sail.mode === 'luffing' ||
      sail.aoa < 0.06
    ) {
      // Apparent wind swings forward on the plane. Leave the sheet out and the sail luffs, and the plane dies.
      this.planing = false;
    }

    const tackQuality = this.tackQuality(controls, twaAbs, toWindward, toLeeward, sail.mode);
    this.lastTackQuality = tackQuality;
    // A clean tack keeps a little sail drawing through the no-go instead of stalling dead.
    if (this.crewManual && tackQuality > 0.55 && twaAbs < 0.9 && sail.mode !== 'stalled' && vFwd > 0.4) {
      drive += 22 * tackQuality;
    }
    const humpRelief = Math.min(0.93, BEAM_HUMP * beam + BROAD_HUMP * broad);
    const hydro = hullForces(vFwd, vStbd, this.heel, this.planing, 1 - humpRelief);
    if (this.crewManual && tackQuality > 0.35 && vFwd > 0) {
      // Coordinated tack: the board stays planted and the hull is not dug in.
      hydro.fwd *= 1 - 0.75 * tackQuality;
    }
    const rudderDelta = clamp(controls.rudder, -1, 1) * MAX_RUDDER;
    const rudderStall = this.assisted ? RUDDER_STALL_ASSIST : RUDDER_STALL;
    const rudder = rudderForces(vFwd, vStbd, rudderDelta, rudderStall);

    // A clean tack (eased sheet, smooth helm, sailor changing sides while the
    // sail is quiet) coasts. A harsh helm, a pinned sheet, or weight still on
    // the wrong side scrubs the speed off.
    const bleed = this.crewManual ? 22 * (1 - 0.82 * tackQuality) + 30 * (1 - tackQuality) * (Math.abs(controls.rudder) > 0.6 ? 1 : 0) : 22;
    const turnDrag = bleed * Math.abs(this.yawRate) * Math.max(0.2, vFwd);
    const pinchStick = smoothstep(52 * (Math.PI / 180), 36 * (Math.PI / 180), Math.abs(twa));
    let skidResist = (40 + 110 * Math.abs(clamp(controls.rudder, -1, 1)) + 1400 * pinchStick) * vStbd * Math.abs(vStbd);
    if (this.crewManual && tackQuality > 0) skidResist *= 1 - 0.8 * tackQuality;
    const fx = drive + hydro.fwd + rudder.fwd - turnDrag;
    const fs = side + hydro.stbd + rudder.stbd - skidResist;
    this.vx += ((fx * fwd.x + fs * stbd.x) / MASS) * dt;
    this.vy += ((fx * fwd.y + fs * stbd.y) / MASS) * dt;

    const heelMoment = side * CE_HEIGHT * Math.cos(this.heel);
    const hullK = this.assisted ? HULL_RIGHTING_ASSIST : HULL_RIGHTING_MANUAL;
    const hullMoment = -hullK * Math.sin(this.heel);
    const crewMoment = CREW_MASS * G * this.crew * Math.cos(this.heel);
    // Crossing before the bow is through rolls the boat onto the new leeward side.
    let earlyRoll = 0;
    if (this.crewManual && toLeeward > 0.26 && twaAbs > 0.42 && twaAbs < 1.2 && Math.abs(this.yawRate) > 0.18) {
      earlyRoll = windward * (180 + 260 * toLeeward);
    }
    const deadRun = smoothstep(2.92, 3.12, twaAbs);
    const overEased = smoothstep(0.09, 0.015, this.sheet);
    const rollAmp = deadRun * overEased;
    let death = 0;
    let damp = ROLL_DAMP;
    if (rollAmp > 0) {
      // Over-eased dead run: roll damping goes negative, then a soft spring
      // keeps the death roll from going all the way over in moderate air.
      damp = ROLL_DAMP - 260 * rollAmp;
      death = -Math.sin(this.heel) * 1500 * rollAmp * smoothstep(0.3, 0.58, Math.abs(this.heel));
      death += Math.sin(this.time * 1.3) * 40 * rollAmp;
    }
    const rollAcc = (heelMoment + hullMoment + crewMoment + earlyRoll + death - damp * this.heelRate) / I_ROLL;
    this.heelRate += rollAcc * dt;
    this.heel += this.heelRate * dt;

    const helmFrac = Math.abs(clamp(controls.rudder, -1, 1));
    // A centered tiller does not let leeway steer the bow around.
    const steer = smoothstep(0.02, 0.14, helmFrac);
    let yawMoment = rudder.yaw * steer;
    // Heel steers. Leeward heel (and the sign convention below) rounds the
    // boat up; windward heel bears it away. The effect fades on a reach so a
    // flat beam reach with a centered tiller does not walk up. A gust heels
    // the boat, so the same term is the round-up unless you hike, ease, or luff.
    const poweredHelm = sail.mode === 'trimmed' || sail.mode === 'stalled' ? 1 : sail.aoa < 0.1 ? 0.15 : 0.4;
    const heelHelm = Math.max(0, Math.abs(this.heel) - 0.08);
    const upwindSteer = smoothstep(1.72, 0.82, twaAbs);
    const steerGain = 0.22 + HEEL_STEER * upwindSteer;
    yawMoment += Math.sign(this.heel || 1) * heelHelm * WEATHER_HELM * steerGain * poweredHelm * Math.max(0, vFwd);
    const deep = Math.min(1, Math.max(0, (Math.abs(awa) - 2.15) / 0.65));
    // A dead run is loose enough to wander into one gybe, then the extra
    // damping lets the new broad reach settle instead of spinning back.
    const runNudge = smoothstep(3.0, 3.12, twaAbs);
    yawMoment += -Math.sin(this.boom) * BOOM_YAW * 0.45 * Math.max(0, sail.drive) * (0.2 + 0.8 * deep) * runNudge;
    if (twaAbs > 2.4) yawMoment -= 160 * this.yawRate;
    const waterSpeed = Math.hypot(vFwd, vStbd);
    if (waterSpeed < 0.65 && Math.abs(awa) < 0.55) {
      yawMoment += WEATHERCOCK * awa * aws * aws * (0.65 - waterSpeed) * 1.6;
    }
    if (this.waves) {
      const slopeStbd = water.normalX * stbd.x + water.normalZ * stbd.y;
      const run = twaAbs > 2.4 ? (twaAbs - 2.4) / 0.7 : 0;
      yawMoment += slopeStbd * (18 + 70 * run);
    }
    const helm = Math.abs(clamp(controls.rudder, -1, 1));
    const yawDamp = 18 + 26 * Math.abs(vFwd) + Math.min(55, Math.abs(side) * 0.08) + helm * 28 * Math.max(0, vFwd);
    yawMoment -= yawDamp * this.yawRate;
    this.yawRate += (yawMoment / I_YAW) * dt;
    this.heading = wrapPi(this.heading + this.yawRate * dt);

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (!Number.isFinite(this.vx) || !Number.isFinite(this.heel)) {
      this.vx = 0;
      this.vy = 0;
      this.heel = 0;
      this.heelRate = 0;
      this.yawRate = 0;
    }

    const capsizeAt = this.assisted ? CAPSIZE_ASSIST : CAPSIZE_MANUAL;
    if (Math.abs(this.heel) > capsizeAt) {
      this.capsized = true;
      this.capsizeTimer = 0;
      this.capsizeCount += 1;
      this.capsizeSide = Math.sign(this.heel);
      this.planing = false;
      this.requestRumble(1, 0.8, 700);
    }

    this.noteManeuver(wind.from);
    this.noteStats(dt, twa, wind, sail.mode);
    const speed = Math.hypot(this.vx, this.vy);
    const leeway = Math.atan2(vStbd, vFwd);
    const inIrons = speed < 0.7 && Math.abs(twa) < 0.7 && vFwd < 0.25;
    this.snapshot = this.capture(
      controls,
      awa,
      twa,
      aws,
      wind.speed,
      wind.from,
      sail.mode,
      sail.drive,
      sail.side,
      rudder.stalled,
      sail.aoa,
      leeway,
      vFwd,
      vStbd,
      inIrons,
      wind.factor,
    );
    this.prevHeading = this.heading;
  }

  /** Dock impacts call this. Open-water sailing never does. */
  buzz(strong: number, weak: number, ms: number): void {
    this.requestRumble(strong, weak, ms);
  }

  /**
   * Contact and the anchor correct the pose after the sailing step.
   * Copy that correction into the snapshot the renderer reads.
   */
  syncPose(): void {
    const fwd = headingFwd(this.heading);
    const stbd = headingStbd(this.heading);
    const rx = this.vx - this.currentX;
    const ry = this.vy - this.currentY;
    const vFwd = rx * fwd.x + ry * fwd.y;
    const vStbd = rx * stbd.x + ry * stbd.y;
    this.snapshot = {
      ...this.snapshot,
      time: this.time,
      x: this.x,
      y: this.y,
      heading: this.heading,
      vx: this.vx,
      vy: this.vy,
      speed: Math.hypot(this.vx, this.vy),
      vFwd,
      vStbd,
      leeway: Math.atan2(vStbd, vFwd),
      yawRate: this.yawRate,
    };
  }

  consumeRumble(): { strong: number; weak: number; ms: number } | null {
    const r = this.rumble;
    this.rumble = null;
    return r;
  }

  gusts(): Gust[] {
    return this.wind.gusts;
  }

  /** Put the boat on a close-hauled or reaching heading with way on. Used by the feel demo. */
  placeCourse(twaDeg: number, speedKn: number, sign = 1): void {
    this.heading = wrapPi(this.wind.baseFrom - sign * twaDeg * DEG);
    this.prevHeading = this.heading;
    const v = speedKn / KT;
    this.vx = Math.cos(this.heading) * v;
    this.vy = Math.sin(this.heading) * v;
    this.yawRate = 0;
    this.heel = 0;
    this.heelRate = 0;
    this.capsized = false;
    this.planing = false;
    const windward = windwardSign(sign, sign);
    this.crew = windward * 0.7;
    this.sheet = twaDeg < 70 ? 0.9 : 0.35;
    this.boom = Math.sign(sign || 1) * Math.min(1.1, Math.max(0.2, twaDeg * DEG - 0.45));
    this.boomRate = 0;
  }

  resetBoat(): void {
    const from = this.wind.baseFrom;
    this.x = 0;
    this.y = 0;
    this.heading = wrapPi(from - Math.PI / 2);
    this.prevHeading = this.heading;
    this.vx = 0;
    this.vy = 0;
    this.yawRate = 0;
    this.heel = 0;
    this.heelRate = 0;
    this.sheet = 0.08;
    this.crew = windwardSign(wrapPi(from - this.heading), 0) * CREW_OFFSET_MIN;
    this.crewManual = false;
    this.boom = 0;
    this.boomRate = 0;
    this.planing = false;
    this.capsized = false;
    this.capsizeTimer = 0;
    this.track.push({ x: Number.NaN, y: Number.NaN, t: this.time });
  }

  private stepCapsize(dt: number): void {
    this.time += dt;
    this.capsizeTimer += dt;
    this.vx *= Math.exp(-dt * 1.4);
    this.vy *= Math.exp(-dt * 1.4);
    this.yawRate *= Math.exp(-dt * 2);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.capsizeTimer >= RECOVERY_TIME) {
      this.heel = 0;
      this.heelRate = 0;
      this.boomRate = 0;
      this.boom *= 0.2;
      this.vx *= 0.15;
      this.vy *= 0.15;
      this.yawRate = 0;
      this.capsized = false;
      this.sheet = Math.min(this.sheet, 0.35);
    }
    this.noteStats(dt, 0, this.wind.sample(this.x, this.y, this.time), 'luffing');
    this.snapshot = {
      ...this.snapshot,
      time: this.time,
      x: this.x,
      y: this.y,
      heel: this.heel,
      capsized: this.capsized,
      capsizeCount: this.capsizeCount,
      speed: Math.hypot(this.vx, this.vy),
      vx: this.vx,
      vy: this.vy,
    };
  }

  private updateBoom(dt: number, awa: number, aws: number, twa: number): void {
    const limit = boomForSheet(this.sheet);
    const sign = Math.abs(awa) > 0.08 ? Math.sign(awa) : Math.sign(this.boom) || 1;
    const target = sign * Math.min(Math.abs(awa), limit);
    const err = target - this.boom;
    const boomSign = Math.sign(this.boom);
    // By the lee the true wind is already on the boom's old side. The boom comes across on its own.
    if (boomSign !== 0 && Math.abs(twa) > 2.97 && Math.sign(twa) !== boomSign) {
      this.boomRate -= boomSign * (6 + aws * 0.9);
    }
    const q = aws * aws;
    const acc = err * (7 + q * 0.22) - this.boomRate * (3.2 + q * 0.04);
    this.boomRate = clamp(this.boomRate + acc * dt, -14, 14);
    this.boom += this.boomRate * dt;

    if (Math.sign(this.boom) !== this.prevBoomSign && Math.abs(this.boom) > 0.04 && this.prevBoomSign !== 0) {
      this.crossedBoomAt = this.time;
      if (this.wind.baseSpeed >= 8.2 && this.sheet < 0.4 && this.hikeCmd < 0.2) {
        this.heel += Math.sign(this.boom) * 1.35;
        this.heelRate += Math.sign(this.boom) * 0.7;
      }
      // Late across the boat: weight is still on the new leeward side and the roll can carry through to windward.
      const windward = windwardSign(awa, twa);
      const late = this.crew * windward < -0.12;
      if (late && this.wind.baseSpeed >= 7.7 && this.sheet < 0.45) {
        this.heel += windward * 1.05;
        this.heelRate += windward * 1.5;
      }
    }
    if (Math.abs(this.boom) > 0.02) this.prevBoomSign = Math.sign(this.boom);

    if (Math.abs(this.boom) > limit) {
      const s = Math.sign(this.boom);
      const impact = Math.sign(this.boomRate) === s ? Math.abs(this.boomRate) : 0;
      this.boom = s * limit;
      const badGybe = this.wind.baseSpeed >= 8.2 && this.sheet < 0.4 && this.hikeCmd < 0.2;
      if (impact > (badGybe ? 0.65 : 1.6) && this.time - this.crossedBoomAt < 0.9 && Math.abs(awa) > (badGybe ? 1.35 : 1.9)) {
        // Sheet eased, no hike, and a fresh breeze: the boom can knock the boat over.
        const kick = impact * (0.08 + q * 0.0045) * (badGybe ? 2.2 : 1);
        this.heelRate += s * kick;
        if (badGybe) this.heel += s * Math.min(1.35, 0.85 + impact * 0.08);
        this.yawRate += -s * kick * 0.05;
        this.shake = Math.max(this.shake, Math.min(1, impact / 5));
        this.requestRumble(Math.min(1, impact / 8), 0.4, 220);
      }
      this.boomRate *= impact > 1 ? -0.04 : 0.1;
    }
  }

  private noteManeuver(windFrom: number): void {
    const up = windFrom;
    const down = wrapPi(windFrom + Math.PI);
    // A settled boat can sit a degree or two across the wind. Count the
    // maneuver once, then wait until the bow has actually sailed away.
    if (Math.abs(wrapPi(this.heading - up)) > 0.22) this.armedTack = true;
    if (Math.abs(wrapPi(this.heading - down)) > 0.22) this.armedGybe = true;
    if (this.armedTack && passedAngle(this.prevHeading, this.heading, up)) {
      this.marks.push({ type: 'tack', x: this.x, y: this.y, t: this.time });
      this.armedTack = false;
    } else if (this.armedGybe && passedAngle(this.prevHeading, this.heading, down)) {
      this.marks.push({ type: 'gybe', x: this.x, y: this.y, t: this.time });
      this.armedGybe = false;
    }
    if (this.marks.length > 400) this.marks.splice(0, this.marks.length - 400);
  }

  private noteStats(dt: number, twa: number, wind: WindSample, mode: SailMode): void {
    if (mode === 'luffing') this.timeLuffing += dt;
    if (mode === 'stalled') this.timeStalled += dt;
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > this.maxSpeed) this.maxSpeed = speed;
    const upX = Math.cos(wind.from);
    const upY = Math.sin(wind.from);
    const vmgUp = this.vx * upX + this.vy * upY;
    const vmgDown = -vmgUp;
    if (Math.abs(twa) < 1.35 && vmgUp > this.bestVmgUp) this.bestVmgUp = vmgUp;
    if (Math.abs(twa) > 1.7 && vmgDown > this.bestVmgDown) this.bestVmgDown = vmgDown;

    this.trackAccum += dt;
    if (this.trackAccum >= 0.5) {
      this.trackAccum = 0;
      this.track.push({ x: this.x, y: this.y, t: this.time });
      if (this.track.length > 3600) this.track.splice(0, this.track.length - 3600);
    }
  }

  private capture(
    controls: Controls,
    awa: number,
    twa: number,
    aws: number,
    tws: number,
    windFrom: number,
    sail: SailMode,
    drive: number,
    side: number,
    rudderStalled: boolean,
    aoa = 0,
    leeway = 0,
    vFwd = 0,
    vStbd = 0,
    inIrons = false,
    gust = 1,
  ): SimSnapshot {
    const speed = Math.hypot(this.vx, this.vy);
    return {
      time: this.time,
      x: this.x,
      y: this.y,
      heading: this.heading,
      vx: this.vx,
      vy: this.vy,
      speed,
      vFwd,
      vStbd,
      leeway,
      yawRate: this.yawRate,
      heel: this.heel,
      heelRate: this.heelRate,
      sheet: this.sheet,
      boom: this.boom,
      aoa,
      awa,
      twa,
      aws,
      tws,
      windFrom,
      sail,
      inIrons,
      planing: this.planing,
      capsized: this.capsized,
      capsizeCount: this.capsizeCount,
      capsizeSide: this.capsizeSide,
      assisted: this.assisted,
      drive,
      side,
      suggestedSheet: suggestedSheet(Math.abs(awa)),
      rudder: controls.rudder,
      rudderStalled,
      gust,
      hike: this.hikeCmd,
      crew: this.crew,
      boomImpact: this.shake,
      shake: this.shake,
    };
  }

  /**
   * A moves the sailor out to a windward hike. B moves them in and, held,
   * through onto the leeward side. Omit `moveIn` and hike stays a windward
   * fraction, which is what the older settled-boat tests drive.
   */
  private updateCrew(dt: number, controls: Controls, awa: number, twa: number): void {
    const windward = windwardSign(awa, twa);
    if (controls.moveIn === undefined) {
      this.crewManual = false;
      this.hikeCmd = clamp01(controls.hike);
      this.crew = windward * (CREW_OFFSET_MIN + this.hikeCmd * (CREW_OFFSET_MAX - CREW_OFFSET_MIN));
      return;
    }
    this.crewManual = true;
    const hike = clamp01(controls.hike);
    const inn = clamp01(controls.moveIn);
    this.hikeCmd = hike;
    const outTarget = windward * CREW_OFFSET_MAX;
    const inTarget = -windward * CREW_LEEWARD;
    let delta = 0;
    if (hike > 0) delta += Math.sign(outTarget - this.crew || windward) * hike;
    if (inn > 0) delta += Math.sign(inTarget - this.crew || -windward) * inn;
    this.crew = clamp(this.crew + delta * CREW_RATE * dt, -CREW_OFFSET_MAX, CREW_OFFSET_MAX);
  }

  /** 1 when a tack is being sailed cleanly, 0 when it is being forced. Legacy tests stay at 0. */
  private tackQuality(controls: Controls, twaAbs: number, toWindward: number, toLeeward: number, mode: SailMode): number {
    if (!this.crewManual || twaAbs > 1.15 || Math.abs(this.yawRate) < 0.1) return 0;
    const ease = clamp((0.95 - this.sheet) / 0.5, 0, 1);
    const smooth = clamp((0.48 - Math.abs(controls.rudder)) / 0.32, 0, 1);
    if (Math.abs(controls.rudder) > 0.62) return 0;
    // Coming off the rail counts as soon as the turn starts; sitting out to leeward early does not.
    const inboard = toLeeward > 0.32 && twaAbs > 0.65 ? 0 : clamp((0.55 - toWindward) / 0.4, 0, 1);
    const late = toLeeward > 0.3 && mode !== 'luffing' && twaAbs > 0.9 ? 1 : 0;
    return clamp(smooth * (1 - late) * Math.max(ease * 0.35, inboard), 0, 1);
  }

  private requestRumble(strong: number, weak: number, ms: number): void {
    this.rumble = { strong, weak, ms };
  }

  /** Copy every field the next tick reads. Hooks (`waveScale`, `wind.modify`) stay on the instance. */
  toState(): BoatState {
    return {
      x: this.x,
      y: this.y,
      heading: this.heading,
      vx: this.vx,
      vy: this.vy,
      currentX: this.currentX,
      currentY: this.currentY,
      yawRate: this.yawRate,
      heel: this.heel,
      heelRate: this.heelRate,
      sheet: this.sheet,
      boom: this.boom,
      boomRate: this.boomRate,
      planing: this.planing,
      capsized: this.capsized,
      capsizeTimer: this.capsizeTimer,
      capsizeCount: this.capsizeCount,
      capsizeSide: this.capsizeSide,
      time: this.time,
      timeLuffing: this.timeLuffing,
      timeStalled: this.timeStalled,
      bestVmgUp: this.bestVmgUp,
      bestVmgDown: this.bestVmgDown,
      maxSpeed: this.maxSpeed,
      track: this.track.map((p) => ({ ...p })),
      marks: this.marks.map((m) => ({ ...m })),
      trackAccum: this.trackAccum,
      prevHeading: this.prevHeading,
      armedTack: this.armedTack,
      armedGybe: this.armedGybe,
      prevBoomSign: this.prevBoomSign,
      crossedBoomAt: this.crossedBoomAt,
      rumble: this.rumble ? { ...this.rumble } : null,
      lastTackQuality: this.lastTackQuality,
      prevGust: this.prevGust,
      hikeCmd: this.hikeCmd,
      crew: this.crew,
      crewManual: this.crewManual,
      shake: this.shake,
      assisted: this.assisted,
      waves: this.waves,
      wind: {
        baseSpeed: this.wind.baseSpeed,
        baseFrom: this.wind.baseFrom,
        steady: this.wind.steady,
        gustFactor: this.wind.gustFactor,
        gusts: this.wind.gusts.map((g) => ({ ...g })),
        nextSpawn: this.wind.nextSpawn,
        rngState: this.wind.rngState,
      },
      view: { ...this.snapshot },
    };
  }

  applyState(state: BoatState): void {
    this.x = state.x;
    this.y = state.y;
    this.heading = state.heading;
    this.vx = state.vx;
    this.vy = state.vy;
    this.currentX = state.currentX;
    this.currentY = state.currentY;
    this.yawRate = state.yawRate;
    this.heel = state.heel;
    this.heelRate = state.heelRate;
    this.sheet = state.sheet;
    this.boom = state.boom;
    this.boomRate = state.boomRate;
    this.planing = state.planing;
    this.capsized = state.capsized;
    this.capsizeTimer = state.capsizeTimer;
    this.capsizeCount = state.capsizeCount;
    this.capsizeSide = state.capsizeSide;
    this.time = state.time;
    this.timeLuffing = state.timeLuffing;
    this.timeStalled = state.timeStalled;
    this.bestVmgUp = state.bestVmgUp;
    this.bestVmgDown = state.bestVmgDown;
    this.maxSpeed = state.maxSpeed;
    this.track = state.track.map((p) => ({ ...p }));
    this.marks = state.marks.map((m) => ({ ...m }));
    this.trackAccum = state.trackAccum;
    this.prevHeading = state.prevHeading;
    this.armedTack = state.armedTack;
    this.armedGybe = state.armedGybe;
    this.prevBoomSign = state.prevBoomSign;
    this.crossedBoomAt = state.crossedBoomAt;
    this.rumble = state.rumble ? { ...state.rumble } : null;
    this.lastTackQuality = state.lastTackQuality;
    this.prevGust = state.prevGust;
    this.hikeCmd = state.hikeCmd;
    this.crew = state.crew;
    this.crewManual = state.crewManual;
    this.shake = state.shake;
    this.assisted = state.assisted;
    this.wind.baseSpeed = state.wind.baseSpeed;
    this.wind.baseFrom = state.wind.baseFrom;
    this.wind.steady = state.wind.steady;
    this.wind.gustFactor = state.wind.gustFactor;
    this.wind.gusts = state.wind.gusts.map((g) => ({ ...g }));
    this.wind.nextSpawn = state.wind.nextSpawn;
    this.wind.rngState = state.wind.rngState;
    this.snapshot = { ...state.view };
  }

  static fromState(state: BoatState): Simulation {
    const sim = new Simulation({
      windSpeed: state.wind.baseSpeed,
      windFrom: state.wind.baseFrom,
      steady: state.wind.steady,
      waves: state.waves,
      assisted: state.assisted,
      heading: state.heading,
      x: state.x,
      y: state.y,
      vx: state.vx,
      vy: state.vy,
      sheet: state.sheet,
    });
    sim.applyState(state);
    return sim;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}
