import { describe, expect, it } from 'vitest';
import { autoCrew } from '../core/coop/autocrew';
import { CallMachine, syncScore, type SyncParts } from '../core/coop/call';
import { LEFT_MARK, RIGHT_MARK } from '../core/coop/drill';
import { EMPTY_KEYS, emptyPad, routeRoles, type PadAxes } from '../core/coop/route';
import { freshMemory, scriptedPads, type ScriptView } from '../core/coop/script';
import { CoopSession, type BoatSample } from '../core/coop/session';
import { sheetWithVang, weightDrive } from '../core/coop/weight';
import { wrapPi } from '../core/sim/math';
import { Simulation } from '../core/sim/sim';

function pad(partial: Partial<PadAxes> & { buttons?: number[]; axes?: number[] }): PadAxes {
  const buttons = Array(16).fill(0);
  partial.buttons?.forEach((value, index) => {
    buttons[index] = value;
  });
  return {
    connected: partial.connected ?? true,
    axes: partial.axes ?? [0, 0, 0, 0],
    buttons,
  };
}

function callInput(over: Partial<Parameters<CallMachine['step']>[0]> = {}) {
  return {
    dt: 1 / 60,
    callDown: false,
    readyDown: false,
    rudder: 0,
    twa: 0.8,
    crewStbd: -0.6,
    sheet: 0.8,
    suggested: 0.75,
    vang: 0.8,
    tackQuality: 0,
    ...over,
  };
}

describe('role input routing', () => {
  it('gives the tiller to the helm and the sheet to the crew', () => {
    const helm = pad({ axes: [0.62, 0, 0, 0], buttons: [1, 0, 0, 0, 0, 0, 1, 1] });
    const crew = pad({ axes: [-0.9, 0, 0, 0], buttons: [0, 0, 0, 0, 0, 0, 0, 0.8] });
    const routed = routeRoles(helm, crew, EMPTY_KEYS);
    expect(routed.helm.rudder).toBeCloseTo(0.62);
    expect(routed.helm.hikeOut).toBe(1);
    expect(routed.crew.sheetIn).toBeCloseTo(0.8);
    expect(routed.crew.sheetOut).toBe(0);
    expect(routed.helm.rudder).toBeGreaterThan(0);
  });

  it('reads the keyboard fallback as two jobs on one board', () => {
    const routed = routeRoles(emptyPad(), emptyPad(), {
      ...EMPTY_KEYS,
      helmLeft: true,
      helmCall: true,
      crewSheetOut: true,
      crewOut: true,
      crewReady: true,
    });
    expect(routed.helm.rudder).toBeCloseTo(-0.55);
    expect(routed.helm.call).toBe(true);
    expect(routed.crew.sheetOut).toBe(1);
    expect(routed.crew.hikeOut).toBe(1);
    expect(routed.crew.ready).toBe(true);
    expect(routed.helm.hikeOut).toBe(0);
  });

  it('ignores a stick inside the dead zone', () => {
    const routed = routeRoles(pad({ axes: [0.1, 0, 0, 0] }), emptyPad(), EMPTY_KEYS);
    expect(routed.helm.rudder).toBe(0);
  });
});

describe('call and response', () => {
  it('holds the tiller until the crew answers', () => {
    const machine = new CallMachine();
    const first = machine.step(callInput({ callDown: true, rudder: 0.9 }));
    const held = machine.step(callInput({ callDown: true, rudder: 0.9 }));
    expect(first.phase).toBe('called');
    expect(first.kind).toBe('tack');
    expect(held.rudder).toBeCloseTo(0.2);
    expect(held.banner).toBe('Ready about');
    const answered = machine.step(callInput({ callDown: true, readyDown: true, rudder: 0 }));
    expect(answered.phase).toBe('ready');
    const turning = machine.step(callInput({ callDown: true, readyDown: true, rudder: 0.4 }));
    expect(turning.phase).toBe('turning');
    expect(turning.rudder).toBeCloseTo(0.4);
    expect(turning.banner).toBe('Lee-oh');
    expect(turning.crew).toBe('Duck the boom, cross the boat');
    expect(turning.helm).not.toContain('Lee-oh');
  });

  it('tells the crew to duck on a tack and to trim on the new side', () => {
    const tack = new CallMachine();
    expect(tack.step(callInput({ callDown: true })).crew).toBe('Ready');
    const gybe = new CallMachine();
    gybe.step(callInput({ callDown: true, twa: 2.8 }));
    const gybing = gybe.step(callInput({ callDown: true, readyDown: true, rudder: 0.4, twa: 2.8, dt: 0.3 }));
    expect(gybing.crew).toBe('Gybe-oh, duck, cross');
    expect(gybing.helm).not.toContain('Gybe-oh');
    const across = gybe.step(callInput({ callDown: true, rudder: 0.2, twa: 3.1, dt: 0.3 }));
    expect(across.phase).toBe('window');
    expect(across.crew).toBe('Trim for the new course');
    expect(across.banner).toBe('Gybe-oh');
  });

  it('names a downwind call a gybe', () => {
    const machine = new CallMachine();
    const out = machine.step(callInput({ callDown: true, twa: 2.9 }));
    expect(out.kind).toBe('gybe');
    expect(out.banner).toBe('Stand by to gybe');
  });

  it('scores the maneuver after the crew crosses in the window', () => {
    const machine = new CallMachine();
    let result: ReturnType<CallMachine['step']>['result'] = null;
    let twa = 0.85;
    let crew = -0.65;
    let sheet = 0.88;
    for (let i = 0; i < 60 * 10; i++) {
      const t = i / 60;
      if (t > 1.3) twa = Math.max(-0.85, twa - 0.55 / 60);
      if (t > 1.4 && t < 3.2) sheet = Math.max(0.32, sheet - 0.45 / 60);
      if (t > 3.4) sheet = Math.min(0.8, sheet + 0.5 / 60);
      if (t > 2.4) crew = Math.min(0.7, crew + 1.4 / 60);
      const out = machine.step(callInput({
        callDown: t < 0.25 || t > 0.25,
        readyDown: t > 0.55 && t < 0.9,
        rudder: t > 1.15 && twa > -0.7 ? -0.34 : 0,
        twa,
        crewStbd: crew,
        sheet,
        vang: t > 2.1 ? 0.15 : 0.82,
        tackQuality: t > 2.2 && t < 4 ? 0.61 : 0,
      }));
      if (out.result) result = out.result;
    }
    expect(result).not.toBeNull();
    expect(result?.kind).toBe('tack');
    expect(result?.answered).toBe(true);
    expect(result?.tackQuality).toBeCloseTo(0.61);
    expect(result?.sync).toBeGreaterThan(0.55);
  });
});

describe('sync scoring', () => {
  const clean: SyncParts = {
    answered: true,
    answerDelay: 0.4,
    crossDelay: 0.8,
    sheetEased: true,
    sheetRetrimmed: true,
    vangEased: true,
    jumped: false,
  };

  it('rates a prompt answer and an on-time cross highly', () => {
    expect(syncScore(clean)).toBeGreaterThan(0.9);
  });

  it('drops a late cross and a missing answer', () => {
    expect(syncScore({ ...clean, crossDelay: 2.2 })).toBeLessThan(syncScore(clean));
    expect(syncScore({ ...clean, answered: false, answerDelay: null })).toBeLessThan(0.25);
  });

  it('penalises the helm who turns before ready', () => {
    expect(syncScore({ ...clean, jumped: true })).toBeLessThan(syncScore(clean) * 0.5);
  });

  it('still counts a tack when the vang stays tight', () => {
    const eased = syncScore(clean);
    const tight = syncScore({ ...clean, vangEased: false });
    expect(tight).toBeLessThan(eased);
    expect(tight).toBeGreaterThan(0.7);
  });
});

describe('AI auto-crew', () => {
  it('answers a beat after the call and does not steer', () => {
    const early = autoCrew({
      dt: 1 / 60,
      twa: 0.8,
      sheet: 0.4,
      suggested: 0.8,
      heel: 0.2,
      phase: 'called',
      windowAge: 0,
      callAge: 0.2,
      answered: false,
      vang: 0.8,
    });
    const ready = autoCrew({
      dt: 1 / 60,
      twa: 0.8,
      sheet: 0.4,
      suggested: 0.8,
      heel: 0.2,
      phase: 'called',
      windowAge: 0,
      callAge: 0.45,
      answered: false,
      vang: 0.8,
    });
    expect(early.ready).toBe(false);
    expect(ready.ready).toBe(true);
    expect(ready.sheetIn).toBe(1);
    expect('rudder' in ready).toBe(false);
  });

  it('eases and crosses while the boat is turning, then hikes the new side', () => {
    const turning = autoCrew({
      dt: 1 / 60,
      twa: 0.4,
      sheet: 0.8,
      suggested: 0.7,
      heel: 0.05,
      phase: 'turning',
      windowAge: 0,
      callAge: 2,
      answered: true,
      vang: 0.8,
    });
    const across = autoCrew({
      dt: 1 / 60,
      twa: -0.7,
      sheet: 0.35,
      suggested: 0.75,
      heel: 0.05,
      phase: 'window',
      windowAge: 1.4,
      callAge: 4,
      answered: true,
      vang: 0.15,
    });
    expect(turning.sheetOut).toBe(1);
    expect(turning.hikeIn).toBe(1);
    expect(across.hikeOut).toBe(1);
    expect(across.sheetIn).toBe(1);
  });

  it('takes the sheet when nobody has joined the crew', () => {
    const session = new CoopSession();
    session.joinAi();
    const boat = stillBoat();
    let phase = '';
    for (let i = 0; i < 90; i++) {
      const call = i < 8;
      session.noteTime(i / 60);
      session.tick(1 / 60, pad({ buttons: [0, 0, 0, 0, 0, call ? 1 : 0] }), emptyPad(), EMPTY_KEYS, { ...boat, time: i / 60 });
      phase = session.call.phase;
      if (phase === 'ready' || phase === 'turning') break;
    }
    expect(session.role).toBe('ai');
    expect(phase === 'ready' || phase === 'turning').toBe(true);
  });
});

describe('vang and shared weight', () => {
  it('lets a tight vang slow the ease without touching the sheet-in', () => {
    const free = sheetWithVang(0, 1, 0);
    const tight = sheetWithVang(1, 1, 1);
    expect(free.sheetOut).toBe(1);
    expect(tight.sheetIn).toBe(1);
    expect(tight.sheetOut).toBeLessThan(0.5);
  });

  it('drives the single weight toward the two-person center', () => {
    const out = weightDrive(-0.9, -0.2, -1);
    const inn = weightDrive(0.2, -0.8, -1);
    expect(out.hike).toBeGreaterThan(0);
    expect(out.moveIn).toBe(0);
    expect(inn.moveIn).toBeGreaterThan(0);
    expect(inn.hike).toBe(0);
  });
});

describe('co-op drill', () => {
  it('sails three tacks around both marks and back with two scripted pads', () => {
    const run = sailDrill(100);
    expect(run.session.drill.phase, run.log).toBe('done');
    expect(run.session.drill.tacks).toBeGreaterThanOrEqual(3);
    expect(run.session.drill.roundedLeft).toBe(true);
    expect(run.session.drill.roundedRight).toBe(true);
    expect(run.session.report().sync).toBeGreaterThan(0.3);
    expect(run.session.report().time).toBeGreaterThan(20);
    expect(run.session.report().time).toBeLessThan(95);
    expect(run.session.report().helm.length).toBeGreaterThan(10);
    expect(run.session.report().crew.length).toBeGreaterThan(10);
  });
});

function stillBoat(): BoatSample {
  return {
    twa: 0.8,
    awa: 0.7,
    sheet: 0.7,
    suggested: 0.75,
    heel: 0.15,
    crew: -0.4,
    tackQuality: 0,
    x: 0,
    y: 0,
    heading: 0.8,
    time: 0,
    windFrom: Math.PI / 2,
    tackCount: 0,
  };
}

function sailDrill(limit: number): { session: CoopSession; log: string } {
  const sim = new Simulation({
    windSpeed: 5.66,
    windFrom: Math.PI / 2,
    steady: true,
    waves: false,
    assisted: true,
  });
  sim.placeCourse(46, 4.6, 1);
  const session = new CoopSession();
  let memory = freshMemory();
  const lines: string[] = [];
  for (let i = 0; i < limit * 60; i++) {
    const now = i / 60;
    session.noteTime(sim.time);
    const view = session.view();
    const sample = boatOf(sim);
    const scripted = scriptedPads(scriptView(sim, view.joined, view.call, view.vang), memory, now);
    memory = scripted.memory;
    const controls = session.tick(1 / 60, pad({ axes: scripted.helmAxes, buttons: scripted.helmButtons }), pad({ axes: scripted.crewAxes, buttons: scripted.crewButtons }), EMPTY_KEYS, sample);
    sim.step(1 / 60, controls);
    if (i % 90 === 0) {
      lines.push(
        `${now.toFixed(1)} ${memory.mode} L${memory.leg} ${sim.x.toFixed(1)},${sim.y.toFixed(1)} twa ${(wrapPi(sim.wind.baseFrom - sim.heading) * 57.3).toFixed(0)} sheet ${sim.sheet.toFixed(2)} boom ${sim.boom.toFixed(2)} ${sim.snapshot.sail} heel ${(sim.heel * 57.3).toFixed(0)} crew ${sim.crew.toFixed(2)} tacks ${session.drill.tacks} v ${(sim.snapshot.vFwd * 1.944).toFixed(1)}`,
      );
    }
    if (session.drill.phase === 'done') break;
  }
  lines.push(`end ${sim.x.toFixed(1)},${sim.y.toFixed(1)} left ${LEFT_MARK.x},${LEFT_MARK.y} right ${RIGHT_MARK.x},${RIGHT_MARK.y} sync ${session.report(sim.time).sync.toFixed(2)} q ${session.report(sim.time).tackQuality.toFixed(2)} scores ${session.report().maneuvers.length}`);
  return { session, log: lines.join('\n') };
}

function scriptView(sim: Simulation, joined: boolean, callPhase: string, vang: number): ScriptView {
  return {
    joined,
    x: sim.x,
    y: sim.y,
    heading: sim.heading,
    twa: wrapPi(sim.wind.baseFrom - sim.heading),
    windFrom: sim.wind.baseFrom,
    sheet: sim.sheet,
    vFwd: sim.vx * Math.cos(sim.heading) + sim.vy * Math.sin(sim.heading),
    crew: sim.crew,
    callPhase,
    vang,
  };
}

function boatOf(sim: Simulation): BoatSample {
  return {
    twa: wrapPi(sim.wind.baseFrom - sim.heading),
    awa: sim.snapshot.awa,
    sheet: sim.sheet,
    suggested: sim.snapshot.suggestedSheet || 0.7,
    heel: sim.heel,
    crew: sim.crew,
    tackQuality: sim.lastTackQuality,
    x: sim.x,
    y: sim.y,
    heading: sim.heading,
    time: sim.time,
    windFrom: sim.wind.baseFrom,
    tackCount: sim.marks.filter((mark) => mark.type === 'tack').length,
  };
}
