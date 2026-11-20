import {
  ACESFilmicToneMapping,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { DinghyView } from './render/boat';
import { DemoDirector } from './render/demo';
import { BowSpray, Wake, WindCues } from './render/effects';
import { Ocean } from './render/ocean';
import { Marks, makeCoast } from './render/scenery';
import { applySkyQuality, applyTimeOfDay, createSky, followBoat, setShadowStage, type SkyRig, type TimeOfDay } from './render/sky';
import { wrapPi } from './sim/math';
import { DockSession } from './dock/session';
import type { DockReport } from './dock/score';
import { HarbourSession, type HarbourReport } from './harbour/session';
import { HerzliyaView } from './render/herzliya';
import { Hud } from './hud';
import { LearnDirector } from './learn/director';
import { LESSONS, launchFor, sampleOf, type DockView, type LessonLaunch } from './learn/model';
import { LearnOverlay } from './learn/overlay';
import { pilotStick } from './learn/pilot';
import { attachKeyboard, readCoopKeys, readInput, readPads, rumble, setInputOptions, setPadLayout, type InputState } from './input';
import { Shell } from './ui/shell';
import { loadSettings, saveSettings, type Settings } from './ui/settings';
import { promptsFor } from './ui/prompts';
import { boatReadout } from './ui/status';
import { freshWatch, watchGamepad, type WatchState } from './ui/watch';
import { CoopOverlay } from './coop/overlay';
import { LEFT_MARK, RIGHT_MARK } from './coop/drill';
import { CoopSession } from './coop/session';
import { HarbourView } from './render/harbour';
import { chaseAim } from './render/chase';
import { TrackRibbon } from './render/ribbon';
import { hullFloat } from './render/float';
import { KT } from './sim/math';
import { Simulation, windwardSign, type Controls, type SimSnapshot } from './sim/sim';

type CamMode = 'chase' | 'cockpit' | 'top' | 'cinema';
type Quality = 'low' | 'high';

const MODES: CamMode[] = ['chase', 'cockpit', 'top', 'cinema'];

const params = new URLSearchParams(location.search);

function openWater(): Simulation {
  return new Simulation({
    windSpeed: 5.66,
    windFrom: Math.PI / 2,
    steady: false,
    waves: true,
    assisted: true,
    heading: 0,
    sheet: params.has('demo') ? 0.48 : 0.06,
    vx: params.has('demo') ? 2.6 : 0,
    vy: 0,
  });
}

export class Game {
  private sim = openWater();
  private dock: DockSession | null = null;
  private harbour: HarbourView | null = null;
  private marina: HarbourSession | null = null;
  private herzliya: HerzliyaView | null = null;
  private coast: ReturnType<typeof makeCoast>;
  private pace = 1;
  private overview = false;
  private shot = '';
  private reel = false;
  private reelT = 0;
  private reelHeading = -0.4;
  private hud: Hud;
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(50, 1, 0.15, 8000);
  private ocean: Ocean;
  private boat = new DinghyView();
  private cues: WindCues;
  private wake: Wake;
  private spray: BowSpray;
  private marks = new Marks();
  private sky: SkyRig;
  private quality: Quality;
  private camMode: CamMode = 'chase';
  private paused = false;
  private orbit = 0;
  private pitch = 0.18;
  private camPos = new Vector3(-9.3, 4.2, -0.3);
  private smooth = new Vector3();
  private cinemaBias = 0.25;
  private last = 0;
  private acc = 0;
  private fps = 60;
  private readonly step = 1 / 60;
  private readonly demo: DemoDirector | null;
  private readonly capture: boolean;
  private readonly bench: boolean;
  private readonly lockShot: boolean;
  private serial = 0;
  private benchWarm = 0;
  private benchFrames = 0;
  private benchTime = 0;
  private benchDone = false;
  private stick: Controls | null = null;
  private learn: LearnDirector | null = null;
  private coop: CoopSession | null = null;
  /** Windward quarter held through a co-op tack, so the chase camera does not swing abeam. */
  private chaseSide = 1;
  private coopOverlay: CoopOverlay;
  private overlay: LearnOverlay;
  private ribbon: TrackRibbon;
  private pilotMode: 'off' | 'basics' | 'tack' = 'off';
  private lessonQuery = 0;
  private visual = 0;
  private shell: Shell;
  private settings: Settings;
  private watch: WatchState = freshWatch();
  private latched = true;
  private introStep = 0;
  private tackUntil = 0;
  private tackSide = 1;
  private lastTackAt = -10;
  private prevSheetIn = 0;
  private prevSheetOut = 0;
  private prevHike = 0;
  private prevMove = 0;

  constructor(root: HTMLElement) {
    const scenario = params.get('scenario');
    const dockQuery = scenario === 'dock';
    const harbourQuery = scenario === 'harbour';
    const learnQuery = scenario === 'learn';
    const coopQuery = scenario === 'coop';
    this.quality = params.get('quality') === 'high' || params.has('demo') ? 'high' : 'low';
    this.demo = params.has('demo') && !dockQuery && !harbourQuery && !learnQuery && !coopQuery ? new DemoDirector() : null;
    const pilot = params.get('pilot');
    this.pilotMode = pilot === 'tack' ? 'tack' : pilot === '1' || pilot === 'basics' ? 'basics' : 'off';
    this.lessonQuery = Number(params.get('lesson')) || 0;
    this.pace = harbourQuery ? Math.max(1, Math.min(16, Number(params.get('pace')) || 1)) : 1;
    const shot = params.get('shot');
    this.overview = harbourQuery && (shot === 'overview' || shot === 'entrance' || shot === 'berth');
    this.shot = shot === 'berth' || shot === 'entrance' || shot === 'overview' ? shot : '';
    this.reel = harbourQuery && params.has('reel');
    this.capture = params.has('capture');
    this.bench = params.has('bench');
    this.lockShot = params.has('shot') && !harbourQuery;
    if (this.demo) this.camMode = 'cinema';
    if (this.lockShot) this.paused = true;

    this.hud = new Hud(root);
    this.renderer = new WebGLRenderer({
      canvas: this.hud.canvas,
      antialias: false,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.84;
    this.renderer.shadowMap.enabled = this.quality === 'high';
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.setPixelRatio(this.quality === 'high' ? Math.min(window.devicePixelRatio || 1, 1.25) : 1);

    this.sky = createSky(this.renderer, this.scene, this.quality);
    this.ocean = new Ocean(this.quality, this.sky.envCube);
    this.ocean.setSun(this.sky.sunDir, this.sky.horizon);
    this.cues = new WindCues(this.quality);
    this.wake = new Wake(this.quality);
    this.spray = new BowSpray(this.quality);
    this.boat.setContactShadow(true);
    this.coast = makeCoast();
    this.overlay = new LearnOverlay(root);
    this.coopOverlay = new CoopOverlay(root);
    this.coopOverlay.onJoin = () => this.coop?.joinHuman();
    this.coopOverlay.onAi = () => this.coop?.joinAi();
    this.ribbon = new TrackRibbon();
    this.scene.add(this.ocean.mesh, this.coast, this.marks.group, this.cues.group, this.wake.mesh, this.spray.mesh, this.boat.group, this.ribbon.mesh);
    this.overlay.onConfirm = () => this.confirmLearn();
    this.overlay.onBack = () => this.backLearn();
    this.overlay.onPick = (index) => {
      if (!this.learn) return;
      this.learn.cursor = index;
      this.confirmLearn();
    };

    this.hud.onToggleMode = () => this.toggleAssist();
    this.hud.onToggleQuality = () => this.cycleQuality();
    this.hud.onTogglePause = () => {
      if (this.shell.screen === 'pause') this.shell.closeToPlay();
      else this.shell.openPause();
      this.paused = this.shell.modal;
      this.hud.setPaused(this.paused);
    };
    this.hud.onToggleDock = () => this.toggleScenario();
    this.hud.onToggleHarbour = () => this.toggleHarbour();
    this.hud.onPlace = (place) => this.goPlace(place);
    this.hud.onTime = (mode) => this.setTime(mode);
    this.settings = loadSettings();
    this.shell = new Shell(root, this.settings, {
      onPlace: (place) => this.pickPlace(place),
      onResume: () => {
        this.paused = false;
        this.hud.setPaused(false);
      },
      onRestart: () => this.restartHere(),
      onMain: () => {
        this.latched = false;
        this.introStep = 0;
        this.enterOpen();
      },
      onChange: (settings) => this.applySettings(settings),
    });
    this.applySettings(this.settings);
    attachKeyboard(window);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    const query = new URLSearchParams(window.location.search);
    if (query.get('scenario') === 'dock') this.enterDock(query.get('demo') === '1');
    if (harbourQuery) this.enterHarbour(params.has('demo') && !this.reel);
    if (learnQuery) this.enterLearn(true);
    if (coopQuery) this.enterCoop();
    const skipMenu = dockQuery || harbourQuery || learnQuery || coopQuery || !!this.demo || this.capture || this.bench || this.lockShot || this.overview || this.reel;
    if (!skipMenu) {
      this.shell.openMain();
      this.latched = false;
      setPadLayout('menu');
    }
  }

  start(): void {
    requestAnimationFrame((t) => this.frame(t));
  }

  state(): SimSnapshot {
    return this.sim.snapshot;
  }

  /** Demo and test hook. Pass null to go back to the controller. */
  setStick(controls: Controls | null): void {
    this.stick = controls;
  }

  place(twaDeg: number, speedKn: number, sign = 1): void {
    this.sim.placeCourse(twaDeg, speedKn, sign);
  }

  setWindKn(kn: number): void {
    this.sim.wind.baseSpeed = kn / KT;
  }

  setGust(factor: number): void {
    this.sim.wind.gustFactor = factor;
  }

  /** Freeze the random wind so a scripted gust is the only puff. */
  setSteady(steady: boolean): void {
    this.sim.wind.steady = steady;
  }

  scenario(): 'open' | 'dock' | 'harbour' | 'learn' | 'coop' {
    if (this.coop) return 'coop';
    if (this.learn) return 'learn';
    if (this.marina) return 'harbour';
    return this.dock ? 'dock' : 'open';
  }

  coopState(): {
    phase: 'join' | 'sail' | 'done';
    role: string;
    call: string;
    joined: boolean;
    tacks: number;
    sync: number;
    tackQuality: number;
    vang: number;
    roundedLeft: boolean;
    roundedRight: boolean;
    banner: string;
  } | null {
    if (!this.coop) return null;
    const view = this.coop.view({
      sheet: this.sim.snapshot.sheet,
      suggested: this.sim.snapshot.suggestedSheet,
      time: this.sim.time,
    });
    return {
      phase: view.phase,
      role: view.role,
      call: view.call,
      joined: view.joined,
      tacks: view.tacks,
      sync: view.sync,
      tackQuality: view.tackQuality,
      vang: view.vang,
      roundedLeft: view.roundedLeft,
      roundedRight: view.roundedRight,
      banner: view.banner,
    };
  }

  learnState(): {
    phase: string;
    lesson: number | null;
    step: string;
    coach: string;
    completed: number[];
    stars: number | null;
    passed: boolean;
  } | null {
    if (!this.learn) return null;
    const view = this.learn.view();
    return {
      phase: view.phase,
      lesson: view.lesson,
      step: view.stepId,
      coach: view.say,
      completed: this.learn.completed(),
      stars: view.passed ? view.stars : null,
      passed: view.passed,
    };
  }

  dockReport(): DockReport | null {
    return this.dock ? this.dock.report() : null;
  }

  harbourReport(): HarbourReport | null {
    return this.marina ? this.marina.report() : null;
  }

  private frame(t: number): void {
    const raw = this.last ? (t - this.last) / 1000 : this.step;
    const real = Math.min(this.coop ? 0.1 : this.reel ? 0.3 : this.pace > 1 ? 0.12 : 0.05, raw);
    if (this.reel && !this.paused) this.reelT += Math.min(0.3, raw);
    const dt = this.capture ? 1 / 30 : real;
    this.visual += dt;
    this.last = t;
    if (!this.capture) this.fps += (1 / Math.max(raw, 0.001) - this.fps) * 0.05;
    this.syncLayout();
    let input = readInput();
    this.noteGamepad(real);
    if (this.demo && !this.dock && !this.marina && !this.learn && !this.coop && !this.paused) {
      const s = this.sim.snapshot;
      const cmd = this.demo.step(dt, s.heading, s.sheet, s.vFwd);
      input = {
        ...input,
        rudder: cmd.rudder,
        sheetIn: cmd.sheetIn,
        sheetOut: cmd.sheetOut,
        hike: cmd.hike,
        pausePressed: cmd.pause || input.pausePressed,
      };
      const api = window.__BLUEWATER__;
      if (api) api.demoPhase = cmd.phase;
    }
    this.applyInput(input, dt);
    this.draw(dt);
    const hint = this.learn || this.coop || this.demo
      ? { text: '', urgent: false }
      : this.marina
        ? this.marina.hint()
        : this.dock
          ? this.dock.hint()
          : { text: '', urgent: false };
    if (this.marina) {
      const strip = this.marina.strip();
      this.hud.setStrip(strip.text, strip.kind, !!strip.sticky);
    } else if (this.dock) {
      const strip = this.dock.strip();
      this.hud.setStrip(strip.text, strip.kind);
    } else this.hud.setStrip(null);
    this.hud.render(this.sim, hint.text, hint.urgent, this.quality);
    if (this.learn) {
      this.overlay.show(this.learn.view(sampleOf(this.sim.snapshot, this.sim.lastTackQuality)));
      this.ribbon.update(this.learn.ribbon);
      this.hud.root.classList.toggle('picking-lesson', this.learn.phase === 'menu');
    } else {
      this.overlay.hide();
      this.ribbon.clear();
      this.hud.root.classList.remove('picking-lesson');
    }
    this.paintCoop();
    this.paintShell();
    this.hud.setFps(this.capture ? 0 : this.fps);
    this.noteBench(raw);
    if (this.capture) {
      this.serial += 1;
      const serial = this.serial;
      const api = window.__BLUEWATER__;
      if (api) api.frame = serial;
      const wait = () => {
        if ((window.__BLUEWATER__?.ack ?? 0) >= serial) this.frame(performance.now());
        else requestAnimationFrame(wait);
      };
      requestAnimationFrame(wait);
      return;
    }
    requestAnimationFrame((now) => this.frame(now));
  }

  private applyInput(input: InputState, dt: number): void {
    const wasPlay = this.shell.screen === 'play';
    const gate = this.shell.pump(input);
    if (gate === 'modal') {
      this.paused = true;
      this.hud.setPaused(true);
      return;
    }
    if (!this.lockShot && !this.overview && this.paused && !this.shell.modal) {
      this.paused = false;
      this.hud.setPaused(false);
    }
    this.react(input, wasPlay && gate === 'play');
    const shellTook = !wasPlay && !!(input.confirmPressed || input.menuConfirm || input.backPressed || input.menuBack);
    if (this.learn) {
      if (!shellTook) this.applyLearn(input, dt);
      return;
    }
    if (input.dockPressed && this.paused) this.toggleScenario();
    if (input.assistPressed) this.toggleAssist();
    if (input.qualityPressed) this.cycleQuality();
    if (input.resetPressed) {
      if (this.marina) this.marina.reset();
      else if (this.dock) this.dock.reset();
      else this.sim.resetBoat();
    }
    if (input.camera) this.camMode = input.camera;
    if (input.cycleCamera) {
      this.camMode = MODES[(MODES.indexOf(this.camMode) + 1) % MODES.length];
    }
    this.orbit += input.orbitX * dt * 1.6;
    this.pitch = Math.max(-0.15, Math.min(1.05, this.pitch - input.orbitY * dt));
    this.orbit *= Math.exp(-dt * 0.45);

    this.updateIntro(input);
    if (gate === 'menu' && !this.latched) {
      if (Math.abs(input.rudder) > 0.35 || input.sheetIn > 0.4 || input.sheetOut > 0.4) this.latched = true;
      else return;
    }
    const driven = this.withAssist(input);
    if (!this.paused) {
      this.acc += dt * this.pace;
      let guard = 0;
      const guardMax = this.coop ? 8 : this.pace > 1 ? 90 : this.reel ? 24 : 5;
      while (this.acc >= this.step && guard < guardMax) {
        let frameInput = this.stick ? { ...input, ...this.stick } : input;
        if (this.reel && this.marina && !this.stick) frameInput = reelStick(frameInput, this.sim.heading, this.reelHeading, this.reelT, this.sim.snapshot.speed);
        if (this.marina) this.marina.step(this.step, frameInput);
        else if (this.dock) this.dock.step(this.step, frameInput);
        else if (this.coop) {
          this.coop.noteTime(this.sim.time);
          const controls = this.coop.tick(this.step, readPads()[0], readPads()[1], readCoopKeys(), {
            twa: this.sim.snapshot.twa,
            awa: this.sim.snapshot.awa,
            sheet: this.sim.sheet,
            suggested: this.sim.snapshot.suggestedSheet,
            heel: this.sim.heel,
            crew: this.sim.crew,
            tackQuality: this.sim.lastTackQuality,
            x: this.sim.x,
            y: this.sim.y,
            heading: this.sim.heading,
            time: this.sim.time,
            windFrom: this.sim.wind.baseFrom,
            tackCount: this.sim.marks.filter((mark) => mark.type === 'tack').length,
          });
          this.sim.step(this.step, controls);
        } else {
          this.sim.step(this.step, this.stick ?? {
            rudder: driven.rudder,
            sheetIn: driven.sheetIn,
            sheetOut: driven.sheetOut,
            hike: driven.hike,
            moveIn: driven.moveIn,
          });
        }
        const buzz = this.sim.consumeRumble();
        if (buzz) this.feel(buzz.strong, buzz.weak, buzz.ms);
        this.acc -= this.step;
        guard++;
      }
      if (this.acc > this.step) this.acc = 0;
    }
  }

  private draw(dt: number): void {
    const s = this.sim.snapshot;
    const time = this.sim.time;
    const fx = Math.cos(s.heading);
    const fz = Math.sin(s.heading);
    const sx = Math.sin(s.heading);
    const sz = -Math.cos(s.heading);
    const surf = (along: number, port: number) =>
      this.ocean.heightAt(s.x + fx * along - sx * port, s.y + fz * along - sz * port, time);
    const pose = hullFloat({
      bow: surf(1.65, 0),
      stern: surf(-1.65, 0),
      cock: surf(-0.45, 0),
      port: surf(-0.4, 0.48),
      stbd: surf(-0.4, -0.48),
    });
    if (this.harbour && this.dock) this.harbour.update(this.dock.view());
    if (this.herzliya && this.marina) this.herzliya.update(time);
    this.boat.group.position.set(s.x, pose.y + (s.capsized ? 0.05 : 0), s.y);
    this.boat.group.rotation.set(0, -s.heading, 0);
    this.boat.group.rotateX(-s.heel - pose.roll + (s.capsized ? s.capsizeSide * 1.15 : 0));
    this.boat.group.rotateZ(pose.pitch);
    this.boat.update(s, s.rudder);
    const shake = s.shake;
    this.boat.group.position.y += Math.sin(time * 40) * shake * 0.08;

    const clock = this.learn && this.learn.phase !== 'sail' ? this.visual : time;
    this.ocean.update(clock, s.x, s.y, s.heading, s.speed, s.windFrom, s.tws, this.sim.gusts(), dt, !this.paused);
    const windToX = -Math.cos(s.windFrom) * s.tws;
    const windToZ = -Math.sin(s.windFrom) * s.tws;
    this.cues.update(s.x, s.y, s.windFrom, windToX, windToZ, this.sim.gusts(), this.sim.assisted, clock, s.heading);
    if (s.speed > 0.4 && !this.paused) {
      const sx = s.x - Math.cos(s.heading) * 1.9;
      const sz = s.y - Math.sin(s.heading) * 1.9;
      this.wake.push(sx, sz, s.heading, s.speed, dt);
    }
    const heightAt = (x: number, z: number) => this.ocean.heightAt(x, z, time);
    this.wake.conform(heightAt);
    const bowSlope = this.ocean.slopeAt(s.x + fx * 1.7, s.y + fz * 1.7, time);
    const impact = Math.min(2, Math.abs(bowSlope.slopeX) + Math.abs(bowSlope.slopeZ) + s.speed * 0.12);
    this.spray.update(dt, s.x, s.y, s.heading, s.speed, pose.y, this.camera.position, this.paused, impact);
    this.marks.update(time, (x, z) => this.ocean.heightAt(x, z, time));
    this.sky.sky.material.uniforms.time.value = clock;
    followBoat(this.sky, s.x, s.y, this.marina ? 130 : 36);
    this.placeCamera(s, pose.y, dt);
    this.renderer.render(this.scene, this.camera);
  }

  private placeCamera(s: SimSnapshot, waterY: number, dt: number): void {
    if (this.reel && this.marina && !this.overview) {
      this.camera.up.set(0, 1, 0);
      const frame = this.reelT < 32 ? berthFrame(this.sim) : entranceFrame(this.marina);
      this.camera.position.set(frame.px, frame.py, frame.pz);
      this.camera.lookAt(frame.lx, frame.ly, frame.lz);
      return;
    }
    if (this.overview && this.marina) {
      this.camera.up.set(0, 1, 0);
      const frame = this.shot === 'entrance' || this.shot === 'overview' ? entranceFrame(this.marina) : berthFrame(this.sim);
      this.camera.position.set(frame.px, frame.py, frame.pz);
      this.camera.lookAt(frame.lx, frame.ly, frame.lz);
      return;
    }
    if (this.lockShot) {
      this.camera.up.set(0, 1, 0);
      this.camera.position.set(-9.3, 4.15, -0.35);
      this.camera.lookAt(0.2, 1.05, -0.3);
      return;
    }
    const phase = this.demo?.phase ?? 'reach';
    const targetBias = phase === 'tack' ? 0.7 : phase === 'gybe' ? -0.4 : phase === 'bear' ? -0.1 : 0.28;
    this.cinemaBias += (targetBias - this.cinemaBias) * (1 - Math.exp(-dt * 0.7));
    const orbit = this.orbit + (this.camMode === 'cinema' ? this.cinemaBias : 0);
    const behind = s.heading + Math.PI + orbit;
    const dest = new Vector3();
    const look = new Vector3(s.x, waterY + 1.15, s.y);
    if (this.camMode === 'top') {
      dest.set(s.x, waterY + 36, s.y + 0.2);
      look.set(s.x, waterY, s.y);
      this.camera.up.set(0, 0, 1);
    } else if (this.camMode === 'cockpit') {
      const fx = Math.cos(s.heading);
      const fz = Math.sin(s.heading);
      dest.set(s.x - fx * 0.7, waterY + 1.35, s.y - fz * 0.7);
      look.set(s.x + fx * 14, waterY + 1.45, s.y + fz * 14);
      this.camera.up.set(0, 1, 0);
    } else if (this.camMode === 'chase' && !this.dock && !this.marina) {
      const aim = chaseAim(s.x, s.y, s.heading, s.awa, s.twa, waterY, this.pitch, this.heldQuarter(s));
      dest.set(aim.x, aim.y, aim.z);
      look.set(aim.lookX, aim.lookY, aim.lookZ);
      this.camera.up.set(0, 1, 0);
    } else {
      const dist = this.marina ? 22 : this.dock ? 18 : 12.4;
      const elev = this.marina ? 11 + this.pitch * 3 : this.dock ? 9.5 + this.pitch * 2.4 : 3.35 + this.pitch * 1.3;
      dest.set(s.x + Math.cos(behind) * dist, waterY + elev, s.y + Math.sin(behind) * dist);
      look.y = waterY + (this.dock ? 1.1 : 1.35);
      this.camera.up.set(0, 1, 0);
    }
    const chaseFollow = this.coop ? 9 : 2.8;
    const posK = 1 - Math.exp(-dt * (this.camMode === 'cinema' ? 1.45 : chaseFollow));
    const lookK = 1 - Math.exp(-dt * (this.camMode === 'cinema' ? 2.1 : this.coop ? 12 : 4.4));
    this.camPos.lerp(dest, posK);
    this.smooth.lerp(look, lookK);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.smooth);
    if (this.camMode !== 'top') {
      const gain = this.camMode === 'cockpit' ? 0.48 : this.camMode === 'cinema' ? 0.22 : 0.14;
      this.camera.rotateZ(-s.heel * gain);
    }
    const fov = this.camMode === 'cockpit' ? 70 : this.camMode === 'cinema' ? 42 : this.camMode === 'top' ? 46 : 50;
    if (this.camera.fov !== fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  private noteBench(realDt: number): void {
    if (!this.bench || this.benchDone) return;
    this.benchWarm += 1;
    if (this.benchWarm <= 40) return;
    this.benchFrames += 1;
    this.benchTime += realDt;
    if (this.benchFrames >= 180) {
      this.benchDone = true;
      const api = window.__BLUEWATER__;
      if (api) {
        api.bench = {
          fps: this.benchFrames / this.benchTime,
          ms: (this.benchTime / this.benchFrames) * 1000,
          quality: this.quality,
        };
      }
    }
  }

  private cycleQuality(): void {
    this.quality = this.quality === 'low' ? 'high' : 'low';
    this.ocean.setQuality(this.quality);
    if (this.marina) this.ocean.setHarbour(true, this.marina.world.basin);
    else this.ocean.setSheltered(!!this.dock);
    this.cues.setQuality(this.quality);
    this.spray.setQuality(this.quality);
    applySkyQuality(this.renderer, this.sky, this.quality);
    if (this.marina) setShadowStage(this.sky, 'harbour', this.quality === 'high');
    this.boat.setContactShadow(true);
    this.renderer.setPixelRatio(this.quality === 'high' ? Math.min(window.devicePixelRatio || 1, 1.25) : 1);
    this.resize();
  }

  private toggleScenario(): void {
    if (this.marina) this.enterOpen();
    else if (this.dock) this.enterOpen();
    else this.enterDock(false);
    this.paused = false;
    this.hud.setPaused(false);
  }

  private toggleHarbour(): void {
    if (this.marina) this.enterOpen();
    else this.enterHarbour(false);
    this.paused = false;
    this.hud.setPaused(false);
  }

  private closeLearn(): void {
    this.learn = null;
    this.pilotMode = 'off';
    this.cues.setTeaching(false);
    this.ribbon.clear();
    this.overlay.hide();
  }

  private clearCoop(): void {
    this.coop = null;
    this.coopOverlay.hide();
    this.boat.setPair(null, null);
    this.boat.setVang(null);
    this.marks.setCourse(null);
    this.hud.root.classList.remove('coop-on');
  }

  /** Keep the chase camera on the quarter it had when the call started. */
  private heldQuarter(s: SimSnapshot): number | undefined {
    if (!this.coop) return undefined;
    const live = windwardSign(s.awa, s.twa) || this.chaseSide;
    if (this.coop.call.phase === 'idle') this.chaseSide = live;
    return this.chaseSide || live;
  }

  private paintCoop(): void {
    this.hud.root.classList.toggle('coop-on', !!this.coop);
    if (!this.coop) return;
    const view = this.coop.view({
      sheet: this.sim.snapshot.sheet,
      suggested: this.sim.snapshot.suggestedSheet,
      time: this.sim.time,
    });
    this.boat.setPair(view.helmStbd, view.crewStbd);
    this.boat.setVang(view.vang);
    const pads = readPads().filter((pad) => pad.connected).length;
    this.hud.setLink(pads >= 2 ? '2 pads' : pads === 1 ? '1 pad' : 'Keyboard');
    if (view.phase === 'done') {
      this.paused = true;
      this.coopOverlay.showReport(this.coop.report(this.sim.time));
      return;
    }
    if (this.paused) return;
    if (view.phase === 'join') this.coopOverlay.showJoin();
    else this.coopOverlay.showSail(view);
  }

  private enterCoop(): void {
    this.clearCoop();
    this.closeLearn();
    this.dock = null;
    this.marina = null;
    this.pace = 1;
    if (this.harbour) this.harbour.group.visible = false;
    if (this.herzliya) this.herzliya.group.visible = false;
    this.coast.visible = true;
    this.marks.group.visible = true;
    this.ocean.setSheltered(false);
    this.sky.fog.density = 0.0085;
    this.setTime('day');
    setShadowStage(this.sky, 'boat', this.quality === 'high');
    setPadLayout('coop');
    this.sim = new Simulation({
      windSpeed: 5.66,
      windFrom: Math.PI / 2,
      steady: true,
      waves: false,
      assisted: true,
    });
    this.sim.placeCourse(46, 4.6, 1);
    this.sim.step(1 / 60, { rudder: 0, sheetIn: 0, sheetOut: 0, hike: 0, moveIn: 0 });
    this.coop = new CoopSession();
    this.coop.helmStbd = this.sim.crew;
    this.coop.crewStbd = this.sim.crew;
    this.marks.setCourse([
      [LEFT_MARK.x, LEFT_MARK.y],
      [RIGHT_MARK.x, RIGHT_MARK.y],
    ]);
    this.hud.setScenario('coop');
    this.sim.assisted = this.settings.assist === 'assisted';
    this.paused = false;
    this.hud.setPaused(false);
  }

  private enterDock(demo: boolean): void {
    this.clearCoop();
    this.closeLearn();
    this.dock = new DockSession({ demo });
    this.sim = this.dock.sim;
    if (!this.harbour) {
      this.harbour = new HarbourView();
      this.scene.add(this.harbour.group);
    }
    this.harbour.group.visible = true;
    this.marks.group.visible = false;
    this.ocean.setSheltered(true);
    setPadLayout('dock');
    this.hud.setScenario('dock');
    this.sim.assisted = this.settings.assist === 'assisted';
    this.pitch = 0.55;
  }

  private enterHarbour(demo: boolean): void {
    this.clearCoop();
    this.closeLearn();
    if (this.dock) {
      this.dock = null;
      if (this.harbour) this.harbour.group.visible = false;
    }
    this.marina = new HarbourSession({ demo, wind: demo ? 3 : 0 });
    this.sim = this.marina.sim;
    if (!this.herzliya) {
      this.herzliya = new HerzliyaView(this.quality, this.marina.world);
      this.scene.add(this.herzliya.group);
    }
    this.herzliya.group.visible = true;
    this.coast.visible = false;
    this.marks.group.visible = false;
    this.ocean.setHarbour(true, this.marina.world.basin);
    this.sky.fog.density = 0.00115;
    this.setTime('golden');
    setShadowStage(this.sky, 'harbour', this.quality === 'high');
    setPadLayout('dock');
    this.hud.setScenario('harbour');
    this.sim.assisted = this.settings.assist === 'assisted';
    this.pitch = 0.35;
    const home = berthFrame(this.sim);
    this.camPos.set(home.px, home.py, home.pz);
    this.smooth.set(home.lx, home.ly, home.lz);
    this.marina.step(1 / 60, blankInput());
    if (this.reel) {
      const course = this.marina.world.course;
      this.reelHeading = Math.atan2(course.cleat.y - course.start.y, course.cleat.x - course.start.x);
    }
    if (this.overview) this.paused = true;
  }

  private enterOpen(): void {
    this.clearCoop();
    this.closeLearn();
    this.dock = null;
    this.marina = null;
    this.pace = 1;
    this.sim = openWater();
    if (this.harbour) this.harbour.group.visible = false;
    if (this.herzliya) this.herzliya.group.visible = false;
    this.coast.visible = true;
    this.marks.group.visible = true;
    this.ocean.setSheltered(false);
    this.sky.fog.density = 0.0085;
    this.setTime('day');
    setShadowStage(this.sky, 'boat', this.quality === 'high');
    setPadLayout('sail');
    this.hud.setScenario('open');
    this.sim.assisted = this.settings.assist === 'assisted';
    this.hud.setStrip(null);
  }

  private setTime(mode: TimeOfDay): void {
    applyTimeOfDay(this.sky, mode);
    this.renderer.toneMappingExposure = mode === 'day' ? 0.84 : mode === 'dusk' ? 1.05 : 1.35;
    this.ocean.setSun(this.sky.sunDir, this.sky.horizon);
    this.hud.setTime(mode);
  }

  private applyLearn(input: InputState, dt: number): void {
    const learn = this.learn;
    if (!learn) return;
    if (input.qualityPressed) this.cycleQuality();
    if (input.assistPressed) this.toggleAssist();
    if (learn.phase !== 'sail') {
      setPadLayout('menu');
      if (input.menuUp) learn.move(-1);
      if (input.menuDown) learn.move(1);
      if (input.menuConfirm) this.confirmLearn();
      if (input.menuBack || input.pausePressed) this.backLearn();
      return;
    }
    setPadLayout(this.dock ? 'dock' : 'sail');
    if (input.pausePressed) return;
    if (input.resetPressed) {
      this.launchLesson(learn.restart());
      return;
    }
    if (input.camera) this.camMode = input.camera;
    if (input.cycleCamera) this.camMode = MODES[(MODES.indexOf(this.camMode) + 1) % MODES.length];
    this.orbit += input.orbitX * dt * 1.6;
    this.pitch = Math.max(-0.15, Math.min(1.05, this.pitch - input.orbitY * dt));
    this.orbit *= Math.exp(-dt * 0.45);

    this.acc += dt * this.pace;
    let stepped = 0;
    const marksBefore = this.sim.marks.length;
    let guard = 0;
    while (this.acc >= this.step && guard < 5) {
      const preview = sampleOf(this.sim.snapshot, this.sim.lastTackQuality);
      const lesson = learn.lesson;
      const pilot =
        this.pilotMode !== 'off' && !this.stick && lesson
          ? pilotStick(lesson.id, learn.stepId, preview, learn.memory.helmSide)
          : null;
      const stick = this.stick ?? pilot;
      const frameInput = stick ? { ...input, ...stick } : input;
      if (this.dock) this.dock.step(this.step, frameInput);
      else {
        this.sim.step(this.step, {
          rudder: frameInput.rudder,
          sheetIn: frameInput.sheetIn,
          sheetOut: frameInput.sheetOut,
          hike: frameInput.hike,
          moveIn: frameInput.moveIn,
        });
      }
      const buzz = this.sim.consumeRumble();
      if (buzz) this.feel(buzz.strong, buzz.weak, buzz.ms);
      this.acc -= this.step;
      stepped += this.step;
      guard++;
    }
    if (this.acc > this.step) this.acc = 0;
    if (stepped <= 0) return;
    const added = this.sim.marks.length > marksBefore ? this.sim.marks[this.sim.marks.length - 1].type : null;
    const phase = learn.tick(stepped, sampleOf(this.sim.snapshot, this.sim.lastTackQuality), this.dockGrade(), added);
    if (phase === 'debrief') this.onLearnDebrief();
  }

  private confirmLearn(): void {
    if (!this.learn) return;
    const launch = this.learn.confirm();
    if (launch) this.launchLesson(launch);
  }

  private backLearn(): void {
    if (!this.learn) return;
    if (this.learn.back() === 'close') {
      this.enterOpen();
      this.latched = false;
      this.shell.openMain();
    } else setPadLayout('menu');
  }

  private onLearnDebrief(): void {
    setPadLayout('menu');
    if (this.pilotMode === 'basics' && this.learn && this.learn.lessonNumber < 2) {
      this.launchLesson(this.learn.begin(this.learn.lessonNumber));
    }
  }

  private dockGrade(): DockView | null {
    if (!this.dock) return null;
    const report = this.dock.report();
    return {
      moored: report.moored,
      approachKn: report.approachKn,
      impactClass: report.impactClass,
      distAtStop: report.distAtStop,
      stopped: report.distAtStop != null,
    };
  }

  private launchLesson(launch: LessonLaunch): void {
    const director = this.learn;
    const pilot = this.pilotMode;
    if (!director) return;
    if (launch.world === 'dock') this.enterDock(false);
    else {
      this.enterOpen();
      this.sim = openFrom(launch);
    }
    this.learn = director;
    this.pilotMode = pilot;
    this.sim.assisted = this.settings.assist === 'assisted';
    this.paused = false;
    this.hud.setPaused(false);
    this.hud.setScenario('learn');
    this.cues.setTeaching(true);
    this.ribbon.clear();
    setPadLayout(launch.world === 'dock' ? 'dock' : 'sail');
  }

  private parkMenuBoat(): void {
    this.sim = openFrom(launchFor(2));
    const still = { rudder: 0, sheetIn: 0, sheetOut: 0, hike: 0, moveIn: 0 };
    for (let i = 0; i < 90; i++) this.sim.step(1 / 60, still);
  }

  private enterLearn(fromQuery: boolean): void {
    const pilot = fromQuery ? this.pilotMode : 'off';
    const lessonN = fromQuery ? this.lessonQuery : 0;
    this.enterOpen();
    this.learn = new LearnDirector();
    this.pilotMode = pilot;
    this.hud.setScenario('learn');
    this.cues.setTeaching(true);
    setPadLayout('menu');
    this.parkMenuBoat();
    this.sim.assisted = this.settings.assist === 'assisted';
    if (!fromQuery || !this.learn) return;
    if (this.pilotMode === 'tack') this.launchLesson(this.learn.begin(Math.max(0, LESSONS.findIndex((lesson) => lesson.id === 'tack'))));
    else if (lessonN >= 1) this.launchLesson(this.learn.begin(lessonN - 1));
    else if (this.pilotMode === 'basics') this.launchLesson(this.learn.begin(0));
  }

  private goPlace(place: 'open' | 'dock' | 'harbour' | 'learn' | 'coop'): void {
    this.pickPlace(place);
  }

  private pickPlace(place: 'open' | 'dock' | 'harbour' | 'learn' | 'coop'): void {
    this.latched = true;
    this.introStep = 0;
    if (place === 'open') {
      this.enterOpen();
      if (!this.settings.introDone) this.introStep = 1;
    } else if (place === 'dock') this.enterDock(false);
    else if (place === 'learn') this.enterLearn(false);
    else if (place === 'coop') this.enterCoop();
    else this.enterHarbour(false);
    this.shell.setMode(place);
    this.paused = false;
    this.hud.setPaused(false);
  }

  private restartHere(): void {
    this.paused = false;
    this.hud.setPaused(false);
    if (this.learn && this.learn.phase !== 'menu') this.launchLesson(this.learn.restart());
    else if (this.marina) this.marina.reset();
    else if (this.dock) this.dock.reset();
    else this.sim.resetBoat();
    this.shell.toast('Restarted');
  }

  private toggleAssist(): void {
    const assisted = this.settings.assist !== 'assisted';
    this.applySettings({ ...this.settings, assist: assisted ? 'assisted' : 'manual' });
    this.shell.toast(assisted ? 'Assisted. The sail trims itself.' : 'Manual trim.');
    this.feel(0.12, 0.2, 70);
  }

  private applySettings(settings: Settings): void {
    this.settings = settings;
    this.sim.assisted = settings.assist === 'assisted';
    setInputOptions({ invert: settings.invert, remap: settings.remap });
    saveSettings(settings);
    this.shell.setSettings(settings);
    document.documentElement.dataset.text = settings.text;
  }

  private syncLayout(): void {
    if (this.shell.modal || this.shell.screen === 'main' || (this.learn && this.learn.phase !== 'sail')) setPadLayout('menu');
    else if (this.coop) setPadLayout('coop');
    else if (this.dock || this.marina) setPadLayout('dock');
    else setPadLayout('sail');
  }

  private withAssist(input: InputState): InputState {
    let next = input;
    if (this.sim.time < this.tackUntil) {
      const twa = this.sim.snapshot.twa;
      const through = Math.sign(twa) === -this.tackSide && Math.abs(twa) > 0.55;
      if (through) {
        this.tackUntil = 0;
        this.lastTackAt = this.sim.time;
      } else {
        next = {
          ...next,
          rudder: -this.tackSide * 0.38,
          sheetOut: Math.abs(twa) < 0.9 ? Math.max(next.sheetOut, 0.75) : next.sheetOut,
        };
      }
    }
    if (this.settings.assist !== 'assisted' || this.introStep === 2) return next;
    if (input.sheetIn > 0.2 || input.sheetOut > 0.2) return next;
    const err = this.sim.snapshot.suggestedSheet - this.sim.sheet;
    if (err > 0.04) return { ...next, sheetIn: Math.max(next.sheetIn, 0.65) };
    if (err < -0.04) return { ...next, sheetOut: Math.max(next.sheetOut, 0.65) };
    return next;
  }

  private react(input: InputState, sailing: boolean): void {
    if (!sailing) {
      this.prevSheetIn = input.sheetIn;
      this.prevSheetOut = input.sheetOut;
      this.prevHike = input.hike;
      this.prevMove = input.moveIn;
      return;
    }
    const rose = (now: number, prev: number) => now > 0.45 && prev <= 0.45;
    if (input.confirmPressed && this.settings.assist === 'assisted' && !this.learn && !this.coop && !this.dock && !this.marina) {
      this.tackSide = Math.sign(this.sim.snapshot.twa) || this.tackSide || 1;
      this.tackUntil = this.sim.time + 2.6;
      this.say('Tacking...');
    } else if (rose(input.sheetOut, this.prevSheetOut)) this.say('Sheet eased');
    else if (rose(input.sheetIn, this.prevSheetIn)) this.say('Trimming in');
    else if (rose(input.hike, this.prevHike)) this.say('Hiking out');
    else if (rose(input.moveIn, this.prevMove)) this.say('Moving in');
    else if (input.windPressed) this.say('Wind changed');
    else if (input.moorPressed) this.say('Mooring line');
    else if (input.anchorPressed) this.say('Anchor');
    else if (input.paddle && this.prevMove === 0) this.say('Paddling');
    this.prevSheetIn = input.sheetIn;
    this.prevSheetOut = input.sheetOut;
    this.prevHike = input.hike;
    this.prevMove = input.moveIn;
  }

  private say(text: string): void {
    this.shell.toast(text);
    this.feel(0.15, 0.28, 90);
    if (text.startsWith('Sheet') || text.startsWith('Trimming')) this.hud.pulse('sheet');
    if (text.startsWith('Hiking') || text.startsWith('Moving')) this.hud.pulse('sailor');
  }

  private updateIntro(input: InputState): void {
    if (this.introStep === 0) {
      this.shell.setIntro(null);
      return;
    }
    const card = [
      { n: 1, title: 'Steer', body: 'Push the left stick until the bow turns.' },
      { n: 2, title: 'Trim', body: 'Hold the right trigger and bring the sheet in. After this, Assisted will trim for you.' },
      { n: 3, title: 'Tack', body: 'Tap A, or steer the bow through the wind.' },
    ][this.introStep - 1];
    this.shell.setIntro(card);
    if (input.backPressed) {
      this.finishIntro();
      return;
    }
    if (this.introStep === 1 && Math.abs(input.rudder) > 0.28) this.introStep = 2;
    else if (this.introStep === 2 && input.sheetIn > 0.45) this.introStep = 3;
    else if (this.introStep === 3 && (input.confirmPressed || this.sim.marks.some((mark) => mark.type === 'tack'))) this.finishIntro();
  }

  private finishIntro(): void {
    this.introStep = 0;
    this.shell.setIntro(null);
    this.applySettings({ ...this.settings, introDone: true });
    this.shell.toast('You are sailing. Manual trim is in Settings.');
  }

  private paintShell(): void {
    const s = this.sim.snapshot;
    const kn = Math.max(0, s.vFwd) * KT;
    const showStatus = this.shell.screen === 'play' && !this.learn;
    this.shell.setStatus(boatReadout({
      twa: s.twa,
      sail: s.sail,
      inIrons: s.inIrons,
      capsized: s.capsized,
      heel: s.heel,
      speedKn: kn,
      grounded: !!this.marina?.isAground(),
      collided: !!this.dock && this.dock.report().impactClass === 'hard',
    }), showStatus);
    const afterTack = this.sim.time - this.lastTackAt < 6 && this.lastTackAt >= 0;
    const screen = this.shell.screen === 'play' && this.learn && this.learn.phase !== 'sail'
      ? 'learn-menu'
      : this.shell.screen;
    this.shell.setPrompts(promptsFor({
      screen,
      mode: this.scenario(),
      assisted: this.settings.assist === 'assisted',
      heeling: Math.abs(s.heel) > 0.22,
      afterTack,
      tacking: this.sim.time < this.tackUntil,
      intro: this.introStep > 0,
    }));
    this.shell.fadeToast(performance.now());
    this.shell.setMode(this.scenario());
  }

  private noteGamepad(dt: number): void {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads[0];
    if (!pad || !pad.connected) {
      this.watch = watchGamepad(this.watch, null, dt);
    } else {
      const active = pad.buttons.some((button) => button.pressed || button.value > 0.2) || pad.axes.some((axis) => Math.abs(axis) > 0.25);
      this.watch = watchGamepad(this.watch, { connected: true, timestamp: pad.timestamp, active }, dt);
    }
    this.shell.setGamepadHint(this.watch.show);
  }

  private feel(strong: number, weak: number, ms: number): void {
    if (!this.settings.rumble) return;
    rumble(strong, weak, ms);
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }
}

/** South of the dinghy, looking north across the berth into the marina. */
function blankInput(): InputState {
  return {
    rudder: 0,
    sheetIn: 0,
    sheetOut: 0,
    hike: 0,
    moveIn: 0,
    orbitX: 0,
    orbitY: 0,
    assistPressed: false,
    resetPressed: false,
    pausePressed: false,
    qualityPressed: false,
    camera: null,
    cycleCamera: false,
    usingGamepad: false,
    dockPressed: false,
    anchorPressed: false,
    moorPressed: false,
    scopeOut: false,
    scopeIn: false,
    windPressed: false,
    tidePressed: false,
  };
}

function reelStick(input: InputState, heading: number, target: number, reelT: number, speed: number): InputState {
  const err = wrapPi(target - heading);
  const sail = reelT < 34;
  return {
    ...input,
    rudder: Math.max(-0.5, Math.min(0.5, -err * 1.4)),
    sheetIn: sail ? 1 : 0,
    sheetOut: sail ? 0 : 1,
    hike: 0.15,
    moveIn: 0,
    paddle: sail && speed < 0.7,
  };
}

function openFrom(launch: LessonLaunch): Simulation {
  const sim = new Simulation({
    windSpeed: launch.windSpeed,
    windFrom: launch.windFrom,
    steady: true,
    waves: false,
    assisted: true,
    heading: launch.heading,
    x: launch.x,
    y: launch.y,
    vx: launch.vx,
    vy: launch.vy,
    sheet: launch.sheet,
  });
  sim.boom = launch.boom;
  return sim;
}

export function berthFrame(sim: { x: number; y: number }): { px: number; py: number; pz: number; lx: number; ly: number; lz: number } {
  return { px: sim.x + 16, py: 6.4, pz: sim.y - 13, lx: sim.x - 1.5, ly: 1.35, lz: sim.y + 3 };
}

/** Just outside the entrance, looking in past the breakwater lights. */
export function entranceFrame(session: HarbourSession): { px: number; py: number; pz: number; lx: number; ly: number; lz: number } {
  const g = session.world.course.gate;
  return { px: g.x - 26, py: 9.5, pz: g.y + 18, lx: g.x + 22, ly: 2.2, lz: g.y - 14 };
}
