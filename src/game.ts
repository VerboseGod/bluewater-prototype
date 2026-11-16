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
import { applySkyQuality, applyTimeOfDay, createSky, followBoat, type SkyRig } from './render/sky';
import { DockSession } from './dock/session';
import type { DockReport } from './dock/score';
import { HarbourSession, type HarbourReport } from './harbour/session';
import { HerzliyaView } from './render/herzliya';
import { Hud, hintFor } from './hud';
import { attachKeyboard, readInput, rumble, setPadLayout, type InputState } from './input';
import { HarbourView } from './render/harbour';
import { chaseAim } from './render/chase';
import { hullFloat } from './render/float';
import { KT } from './sim/math';
import { Simulation, type Controls, type SimSnapshot } from './sim/sim';

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

  constructor(root: HTMLElement) {
    const scenario = params.get('scenario');
    const dockQuery = scenario === 'dock';
    const harbourQuery = scenario === 'harbour';
    this.quality = params.get('quality') === 'high' || params.has('demo') ? 'high' : 'low';
    this.demo = params.has('demo') && !dockQuery && !harbourQuery ? new DemoDirector() : null;
    this.pace = harbourQuery ? Math.max(1, Math.min(16, Number(params.get('pace')) || 1)) : 1;
    this.overview = harbourQuery && params.get('shot') === 'overview';
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
    this.scene.add(this.ocean.mesh, this.coast, this.marks.group, this.cues.group, this.wake.mesh, this.spray.mesh, this.boat.group);

    this.hud.onToggleMode = () => {
      this.sim.assisted = !this.sim.assisted;
    };
    this.hud.onToggleQuality = () => this.cycleQuality();
    this.hud.onTogglePause = () => {
      this.paused = !this.paused;
      this.hud.setPaused(this.paused);
      if (this.paused) this.showDebrief();
    };
    this.hud.onToggleDock = () => this.toggleScenario();
    this.hud.onToggleHarbour = () => this.toggleHarbour();
    attachKeyboard(window);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    const query = new URLSearchParams(window.location.search);
    if (query.get('scenario') === 'dock') this.enterDock(query.get('demo') === '1');
    if (harbourQuery) this.enterHarbour(params.has('demo'));
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

  scenario(): 'open' | 'dock' | 'harbour' {
    if (this.marina) return 'harbour';
    return this.dock ? 'dock' : 'open';
  }

  dockReport(): DockReport | null {
    return this.dock ? this.dock.report() : null;
  }

  harbourReport(): HarbourReport | null {
    return this.marina ? this.marina.report() : null;
  }

  private frame(t: number): void {
    const raw = this.last ? (t - this.last) / 1000 : this.step;
    const real = Math.min(this.pace > 1 ? 0.12 : 0.05, raw);
    const dt = this.capture ? 1 / 30 : real;
    this.last = t;
    if (!this.capture) this.fps += (1 / Math.max(raw, 0.001) - this.fps) * 0.05;
    let input = readInput();
    if (this.demo && !this.dock && !this.paused) {
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
    const hint = this.marina ? this.marina.hint() : this.dock ? this.dock.hint() : this.demo ? { text: '', urgent: false } : hintFor(this.sim);
    if (this.marina) {
      const strip = this.marina.strip();
      this.hud.setStrip(strip.text, strip.kind);
    } else if (this.dock) {
      const strip = this.dock.strip();
      this.hud.setStrip(strip.text, strip.kind);
    } else this.hud.setStrip(null);
    this.hud.render(this.sim, hint.text, hint.urgent, this.quality);
    this.hud.setFps(this.capture ? 0 : this.fps);
    if (this.paused) this.showDebrief();
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
    if (input.pausePressed) {
      this.paused = !this.paused;
      this.hud.setPaused(this.paused);
      if (this.paused) this.showDebrief();
    }
    if (input.dockPressed && this.paused) this.toggleScenario();
    if (input.assistPressed) this.sim.assisted = !this.sim.assisted;
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

    if (!this.paused) {
      this.acc += dt * this.pace;
      let guard = 0;
      const guardMax = this.pace > 1 ? 90 : 5;
      while (this.acc >= this.step && guard < guardMax) {
        const frameInput = this.stick ? { ...input, ...this.stick } : input;
        if (this.marina) this.marina.step(this.step, frameInput);
        else if (this.dock) this.dock.step(this.step, frameInput);
        else {
          this.sim.step(this.step, this.stick ?? {
            rudder: input.rudder,
            sheetIn: input.sheetIn,
            sheetOut: input.sheetOut,
            hike: input.hike,
            moveIn: input.moveIn,
          });
        }
        const buzz = this.sim.consumeRumble();
        if (buzz) rumble(buzz.strong, buzz.weak, buzz.ms);
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

    this.ocean.update(time, s.x, s.y, s.heading, s.speed, s.windFrom, s.tws, this.sim.gusts(), dt, !this.paused);
    const windToX = -Math.cos(s.windFrom) * s.tws;
    const windToZ = -Math.sin(s.windFrom) * s.tws;
    this.cues.update(s.x, s.y, s.windFrom, windToX, windToZ, this.sim.gusts(), this.sim.assisted, time);
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
    this.sky.sky.material.uniforms.time.value = time;
    followBoat(this.sky, s.x, s.y);
    this.placeCamera(s, pose.y, dt);
    this.renderer.render(this.scene, this.camera);
  }

  private placeCamera(s: SimSnapshot, waterY: number, dt: number): void {
    if (this.overview && this.marina) {
      const c = this.marina.world.course;
      this.camera.up.set(0, 1, 0);
      this.camera.position.set(c.gate.x + 24, 16, c.gate.y - 18);
      this.camera.lookAt(c.gate.x - 12, 1.4, c.gate.y + 22);
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
      const aim = chaseAim(s.x, s.y, s.heading, s.awa, s.twa, waterY, this.pitch);
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
    const posK = 1 - Math.exp(-dt * (this.camMode === 'cinema' ? 1.45 : 2.8));
    const lookK = 1 - Math.exp(-dt * (this.camMode === 'cinema' ? 2.1 : 4.4));
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
    this.boat.setContactShadow(true);
    this.renderer.setPixelRatio(this.quality === 'high' ? Math.min(window.devicePixelRatio || 1, 1.25) : 1);
    this.resize();
  }

  private showDebrief(): void {
    if (this.marina) this.hud.drawHarbourDebrief(this.sim, this.marina.report(), this.marina.world);
    else if (this.dock) this.hud.drawDockDebrief(this.sim, this.dock.report());
    else this.hud.drawDebrief(this.sim);
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

  private enterDock(demo: boolean): void {
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
    this.pitch = 0.55;
  }

  private enterHarbour(demo: boolean): void {
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
    this.sky.fog.density = 0.0014;
    applyTimeOfDay(this.sky, 'golden');
    this.ocean.setSun(this.sky.sunDir, this.sky.horizon);
    setPadLayout('dock');
    this.hud.setScenario('harbour');
    this.pitch = 0.35;
    this.camPos.set(this.sim.x - 16, 8, this.sim.y - 8);
    if (this.overview) this.paused = true;
  }

  private enterOpen(): void {
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
    applyTimeOfDay(this.sky, 'day');
    this.ocean.setSun(this.sky.sunDir, this.sky.horizon);
    setPadLayout('sail');
    this.hud.setScenario('open');
    this.hud.setStrip(null);
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }
}
