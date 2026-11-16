import {
  ACESFilmicToneMapping,
  Color,
  Fog,
  HemisphereLight,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
  Vector3,
} from 'three';
import { DinghyView } from './render/boat';
import { Wake, WindCues } from './render/effects';
import { Ocean } from './render/ocean';
import { Hud, hintFor } from './hud';
import { attachKeyboard, readInput, rumble } from './input';
import { sampleWater } from './sim/water';
import { Simulation, type SimSnapshot } from './sim/sim';

type CamMode = 'chase' | 'cockpit' | 'top';
type Quality = 'performance' | 'quality';

const MODES: CamMode[] = ['chase', 'cockpit', 'top'];

export class Game {
  private sim = new Simulation({
    windSpeed: 5.66,
    windFrom: Math.PI / 2,
    steady: false,
    waves: true,
    assisted: true,
    heading: 0,
    sheet: 0.06,
  });
  private hud: Hud;
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(58, 1, 0.1, 600);
  private ocean: Ocean;
  private boat = new DinghyView();
  private yawRig = new Vector3();
  private cues: WindCues;
  private wake: Wake;
  private quality: Quality = 'performance';
  private camMode: CamMode = 'chase';
  private paused = false;
  private orbit = 0;
  private pitch = 0.2;
  private camPos = new Vector3(0, 6, 12);
  private smooth = new Vector3();
  private last = 0;
  private acc = 0;
  private fps = 60;
  private readonly step = 1 / 60;

  constructor(root: HTMLElement) {
    this.hud = new Hud(root);
    this.renderer = new WebGLRenderer({
      canvas: this.hud.canvas,
      antialias: false,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setPixelRatio(1);
    this.scene.background = new Color('#9ec8d4');
    this.scene.fog = new Fog('#c5e0e2', 70, 240);
    this.scene.add(new HemisphereLight('#d7f3ff', '#1c4a46', 1.05));
    const sun = new DirectionalLight('#fff4dc', 1.35);
    sun.position.set(40, 80, 20);
    this.scene.add(sun);
    this.ocean = new Ocean(this.quality);
    this.cues = new WindCues(this.quality);
    this.wake = new Wake(this.quality);
    this.scene.add(this.ocean.mesh, this.cues.group, this.wake.mesh, this.boat.group);
    this.hud.onToggleMode = () => {
      this.sim.assisted = !this.sim.assisted;
    };
    this.hud.onToggleQuality = () => this.cycleQuality();
    this.hud.onTogglePause = () => {
      this.paused = !this.paused;
      this.hud.setPaused(this.paused);
      if (this.paused) this.hud.drawDebrief(this.sim);
    };
    attachKeyboard(window);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  start(): void {
    requestAnimationFrame((t) => this.frame(t));
  }

  state(): SimSnapshot {
    return this.sim.snapshot;
  }

  private frame(t: number): void {
    const dt = Math.min(0.05, this.last ? (t - this.last) / 1000 : this.step);
    this.last = t;
    this.fps += (1 / Math.max(dt, 0.001) - this.fps) * 0.05;
    const input = readInput();
    if (input.pausePressed) {
      this.paused = !this.paused;
      this.hud.setPaused(this.paused);
      if (this.paused) this.hud.drawDebrief(this.sim);
    }
    if (input.assistPressed) this.sim.assisted = !this.sim.assisted;
    if (input.qualityPressed) this.cycleQuality();
    if (input.resetPressed) this.sim.resetBoat();
    if (input.camera) this.camMode = input.camera;
    if (input.cycleCamera) {
      this.camMode = MODES[(MODES.indexOf(this.camMode) + 1) % MODES.length];
    }
    this.orbit += input.orbitX * dt * 1.6;
    this.pitch = Math.max(-0.15, Math.min(1.05, this.pitch - input.orbitY * dt));
    this.orbit *= Math.exp(-dt * 0.45);

    if (!this.paused) {
      this.acc += dt;
      let guard = 0;
      while (this.acc >= this.step && guard < 5) {
        this.sim.step(this.step, {
          rudder: input.rudder,
          sheetIn: input.sheetIn,
          sheetOut: input.sheetOut,
          hike: input.hike,
        });
        const buzz = this.sim.consumeRumble();
        if (buzz) rumble(buzz.strong, buzz.weak, buzz.ms);
        this.acc -= this.step;
        guard++;
      }
      if (this.acc > this.step) this.acc = 0;
    }

    this.draw(dt);
    const hint = hintFor(this.sim);
    this.hud.render(this.sim, hint.text, hint.urgent, this.quality);
    this.hud.setFps(this.fps);
    if (this.paused) this.hud.drawDebrief(this.sim);
    requestAnimationFrame((now) => this.frame(now));
  }

  private draw(_dt: number): void {
    const s = this.sim.snapshot;
    const water = sampleWater(s.x, s.y, this.sim.time, true, this.quality === 'quality' ? 4 : 3);
    this.boat.group.position.set(s.x, water.height + (s.capsized ? 0.05 : 0), s.y);
    this.boat.group.rotation.set(0, -s.heading, 0);
    this.boat.group.rotateX(-s.heel + (s.capsized ? s.capsizeSide * 1.15 : 0));
    const climb = -(water.normalX * Math.cos(s.heading) + water.normalZ * Math.sin(s.heading));
    this.boat.group.rotateZ(climb * 0.45);
    this.boat.update(s, s.rudder);
    const shake = s.shake;
    this.boat.group.position.y += Math.sin(this.sim.time * 40) * shake * 0.08;

    this.ocean.update(this.sim.time, s.x, s.y, this.sim.gusts());
    const windToX = -Math.cos(s.windFrom) * s.tws;
    const windToZ = -Math.sin(s.windFrom) * s.tws;
    this.cues.update(s.x, s.y, s.windFrom, windToX, windToZ, this.sim.gusts(), this.sim.assisted, this.sim.time);
    if (s.speed > 0.4 && !this.paused) {
      const sx = s.x - Math.cos(s.heading) * 1.9;
      const sz = s.y - Math.sin(s.heading) * 1.9;
      this.wake.push(sx, sz, s.heading, s.speed);
    }
    this.placeCamera(s, water.height);
    this.renderer.render(this.scene, this.camera);
  }

  private placeCamera(s: SimSnapshot, waterY: number): void {
    const behind = s.heading + Math.PI + this.orbit;
    const dest = new Vector3();
    const look = new Vector3(s.x, waterY + 1.1, s.y);
    if (this.camMode === 'top') {
      dest.set(s.x, waterY + 34, s.y + 0.2);
      look.set(s.x, waterY, s.y);
      this.camera.up.set(0, 0, 1);
    } else if (this.camMode === 'cockpit') {
      dest.set(
        s.x - Math.cos(s.heading) * 0.85,
        waterY + 1.45,
        s.y - Math.sin(s.heading) * 0.85,
      );
      look.set(
        s.x + Math.cos(s.heading) * 12,
        waterY + 1.3,
        s.y + Math.sin(s.heading) * 12,
      );
      this.camera.up.set(0, 1, 0);
    } else {
      const dist = 9.5;
      const elev = 3.3 + this.pitch * 2.4;
      dest.set(
        s.x + Math.cos(behind) * dist,
        waterY + elev,
        s.y + Math.sin(behind) * dist,
      );
      this.camera.up.set(0, 1, 0);
    }
    this.camPos.lerp(dest, 0.08);
    this.smooth.lerp(look, 0.12);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.smooth);
    this.yawRig.copy(dest);
  }

  private cycleQuality(): void {
    this.quality = this.quality === 'performance' ? 'quality' : 'performance';
    this.ocean.setQuality(this.quality);
    this.cues.setQuality(this.quality);
    this.renderer.setPixelRatio(this.quality === 'quality' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1);
    this.resize();
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.fov = this.camMode === 'cockpit' ? 72 : 55;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }
}
