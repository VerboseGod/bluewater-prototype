import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  ConeGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { Gust } from '../sim/wind';

const dummy = new Object3D();

/** Faint wind streaks and, in assisted mode, the no-go guides. */
export class WindCues {
  readonly group = new Group();
  private streamers: InstancedMesh;
  private origins: { x: number; z: number }[] = [];
  private wedge: Line;
  private arrow: Group;
  private count: number;
  private teaching = false;

  constructor(quality: 'low' | 'high') {
    const max = 36;
    this.count = quality === 'high' ? 28 : 16;
    const geo = new PlaneGeometry(1.4, 0.08);
    geo.translate(0.7, 0.15, 0);
    const mat = new MeshBasicMaterial({
      color: '#f4fbff',
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: DoubleSide,
    });
    this.streamers = new InstancedMesh(geo, mat, max);
    this.streamers.frustumCulled = false;
    this.streamers.renderOrder = 2;
    const span = 6;
    for (let i = 0; i < max; i++) {
      const col = i % span;
      const row = Math.floor(i / span);
      this.origins.push({
        x: (col - span / 2) * 9,
        z: (row - 2) * 8,
      });
    }
    this.streamers.visible = false;
    this.group.add(this.streamers);
    this.wedge = noGoLine();
    this.group.add(this.wedge);
    this.arrow = windArrow();
    this.group.add(this.arrow);
  }

  /** Wind streaks, the no-go arc, and an arrow toward where the wind comes from. */
  setTeaching(on: boolean): void {
    this.teaching = on;
    this.streamers.visible = on;
    this.arrow.visible = on;
    const mat = this.streamers.material as MeshBasicMaterial;
    mat.opacity = on ? 0.72 : 0.22;
  }

  setQuality(quality: 'low' | 'high'): void {
    this.count = quality === 'high' ? 28 : 16;
  }

  update(
    boatX: number,
    boatZ: number,
    windFrom: number,
    windToX: number,
    windToZ: number,
    gusts: Gust[],
    assisted: boolean,
    time: number,
    heading = 0,
  ): void {
    const speed = Math.hypot(windToX, windToZ) || 1;
    const dir = Math.atan2(windToZ, windToX);
    for (let i = 0; i < this.count; i++) {
      const o = this.origins[i];
      let x = boatX + o.x;
      let z = boatZ + o.z;
      const dx = x - boatX;
      const dz = z - boatZ;
      const along = dx * Math.cos(dir) + dz * Math.sin(dir);
      const across = -dx * Math.sin(dir) + dz * Math.cos(dir);
      const wrapped = ((along + time * speed * 0.45 + 18) % 36) - 18;
      x = boatX + wrapped * Math.cos(dir) - across * Math.sin(dir);
      z = boatZ + wrapped * Math.sin(dir) + across * Math.cos(dir);
      let gust = 1;
      for (const g of gusts) {
        const d = Math.hypot(x - g.x, z - g.y);
        if (d < g.r) gust += g.amp * (1 - d / g.r);
      }
      dummy.position.set(x, 0.35, z);
      dummy.rotation.set(-0.15, -dir, 0);
      dummy.scale.set((this.teaching ? 1.8 : 0.55) + gust * 0.35, 1, 1);
      dummy.updateMatrix();
      this.streamers.setMatrixAt(i, dummy.matrix);
    }
    this.streamers.instanceMatrix.needsUpdate = true;
    this.streamers.count = this.count;

    this.wedge.visible = assisted || this.teaching;
    this.wedge.position.set(boatX, 0.4, boatZ);
    this.wedge.rotation.y = -windFrom;
    this.arrow.visible = this.teaching;
    const ahead = 9;
    const hx = Math.cos(heading);
    const hz = Math.sin(heading);
    const wx = Math.cos(windFrom);
    const wz = Math.sin(windFrom);
    this.arrow.position.set(boatX + hx * ahead + wx * 2.5, 1.8, boatZ + hz * ahead + wz * 2.5);
    this.arrow.rotation.y = -windFrom;
  }
}

function windArrow(): Group {
  const group = new Group();
  const mat = new MeshBasicMaterial({
    color: '#ffe08a',
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    side: DoubleSide,
  });
  const shaftV = new Mesh(new PlaneGeometry(8, 0.55), mat);
  shaftV.position.x = 4;
  const shaftH = new Mesh(new PlaneGeometry(8, 0.55), mat);
  shaftH.rotation.x = -Math.PI / 2;
  shaftH.position.x = 4;
  const head = new Mesh(new ConeGeometry(1.15, 2.4, 4), mat);
  head.rotation.z = -Math.PI / 2;
  head.position.x = 9.2;
  group.add(shaftV, shaftH, head);
  group.visible = false;
  return group;
}

function noGoLine(): Line {
  const half = 45 * (Math.PI / 180);
  const radius = 11;
  const pts: Vector3[] = [];
  for (let i = 0; i <= 24; i++) {
    const a = -half + (2 * half * i) / 24;
    pts.push(new Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
  }
  const geo = new BufferGeometry().setFromPoints(pts);
  const line = new Line(
    geo,
    new LineBasicMaterial({ color: '#ff8d8d', transparent: true, opacity: 0.45, depthWrite: false }),
  );
  line.frustumCulled = false;
  return line;
}

interface Drop {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  /** Long axis of the streak, in metres. */
  len: number;
  /** Short axis. Droplets stay near this; sheet spray is flatter. */
  wid: number;
  spin: number;
}

/** Fine bow droplets and a short sheet of spray. Count stays small. */
export class BowSpray {
  readonly mesh: InstancedMesh;
  private drops: Drop[] = [];
  private max: number;
  private carry = 0;

  constructor(quality: 'low' | 'high') {
    this.max = quality === 'high' ? 180 : 64;
    const geo = new PlaneGeometry(1, 1);
    const mat = new MeshBasicMaterial({
      map: streak(),
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      opacity: 0.8,
      side: DoubleSide,
    });
    this.mesh = new InstancedMesh(geo, mat, 180);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.count = 0;
  }

  setQuality(quality: 'low' | 'high'): void {
    this.max = quality === 'high' ? 180 : 64;
    if (this.drops.length > this.max) this.drops.length = this.max;
  }

  update(
    dt: number,
    x: number,
    z: number,
    heading: number,
    speed: number,
    waterY: number,
    camera: Vector3,
    paused: boolean,
    impact = 0,
  ): void {
    const vigour = Math.max(0, speed - 0.7) * (0.45 + Math.min(1.4, impact));
    if (!paused && vigour > 0.05) {
      const rate = Math.min(90, vigour * (this.max > 64 ? 26 : 12));
      this.carry += rate * dt;
      const sideX = Math.sin(heading);
      const sideZ = -Math.cos(heading);
      const bowX = x + Math.cos(heading) * 1.85;
      const bowZ = z + Math.sin(heading) * 1.85;
      while (this.carry >= 1 && this.drops.length < this.max) {
        this.carry -= 1;
        const sheet = Math.random() < 0.28 + impact * 0.25;
        const s = Math.random() < 0.5 ? -1 : 1;
        const kick = sheet ? 0.35 + speed * 0.2 : 0.9 + speed * 0.55 + impact * 0.8;
        this.drops.push({
          x: bowX + sideX * s * (sheet ? 0.16 : 0.22 + Math.random() * 0.12),
          y: waterY + (sheet ? 0.05 : 0.08 + Math.random() * 0.06),
          z: bowZ + sideZ * s * (sheet ? 0.16 : 0.22 + Math.random() * 0.12),
          vx: -Math.cos(heading) * 0.15 + sideX * s * kick,
          vy: sheet ? 0.15 + impact * 0.35 + Math.random() * 0.2 : 0.45 + speed * 0.22 + impact * 1.1 + Math.random() * 0.35,
          vz: -Math.sin(heading) * 0.15 + sideZ * s * kick,
          life: 0,
          max: sheet ? 0.1 + Math.random() * 0.1 : 0.14 + Math.random() * 0.16,
          len: sheet ? 0.16 + speed * 0.04 : 0.035 + Math.random() * 0.03,
          wid: sheet ? 0.012 : 0.012 + Math.random() * 0.01,
          spin: Math.random() * Math.PI,
        });
      }
    } else {
      this.carry = 0;
    }

    let n = 0;
    const alive: Drop[] = [];
    for (const d of this.drops) {
      d.life += dt;
      if (d.life > d.max) continue;
      d.vy -= 9.8 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      if (d.y < waterY - 0.02) continue;
      alive.push(d);
      if (n >= this.max) continue;
      const t = d.life / d.max;
      dummy.position.set(d.x, d.y, d.z);
      dummy.lookAt(camera);
      dummy.rotateZ(d.spin + t * 2.5);
      const fade = 1 - t * t;
      dummy.scale.set(d.len * fade, d.wid * (0.6 + fade), 1);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(n, dummy.matrix);
      n++;
    }
    this.drops = alive;
    this.mesh.count = n;
    if (n > 0) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

function streak(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 16;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createLinearGradient(0, 8, 32, 8);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.85)');
    grad.addColorStop(0.7, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 5, 32, 6);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath();
    g.ellipse(22, 8, 2.2, 1.4, 0, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

interface WakePoint {
  x: number;
  z: number;
  age: number;
  half: number;
}

/** A soft white trail that sits on the swell behind the transom. */
export class Wake {
  readonly mesh: Mesh;
  private points: WakePoint[] = [];
  private max: number;

  constructor(quality: 'low' | 'high') {
    this.max = quality === 'high' ? 48 : 28;
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(this.max * 2 * 3), 3));
    geo.setAttribute('color', new BufferAttribute(new Float32Array(this.max * 2 * 4), 4));
    const indices: number[] = [];
    for (let i = 0; i < this.max - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(indices);
    this.mesh = new Mesh(
      geo,
      new MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    // The bright trail is drawn in the water shader so it sits on the swell.
    this.mesh.visible = false;
  }

  push(x: number, z: number, heading: number, speed: number, dt: number): void {
    for (const p of this.points) p.age += dt;
    this.points = this.points.filter((p) => p.age < 8);
    const last = this.points[this.points.length - 1];
    if (last && Math.hypot(x - last.x, z - last.z) < 0.4) return;
    const half = Math.min(0.7, 0.12 + speed * 0.1);
    this.points.push({ x, z, age: 0, half });
    if (this.points.length > this.max) this.points.shift();
    void heading;
  }

  conform(heightAt: (x: number, z: number) => number): void {
    const pos = this.mesh.geometry.getAttribute('position') as BufferAttribute;
    const col = this.mesh.geometry.getAttribute('color') as BufferAttribute;
    const n = Math.min(this.points.length, this.max);
    for (let i = 0; i < this.max; i++) {
      const p = i < n ? this.points[i] : null;
      const o = i * 6;
      if (!p) {
        pos.setXYZ(i * 2, 0, -10, 0);
        pos.setXYZ(i * 2 + 1, 0, -10, 0);
        continue;
      }
      const fade = 1 - p.age / 8;
      const wide = p.half * (1 + p.age * 0.55);
      const prev = this.points[Math.max(0, i - 1)];
      const next = this.points[Math.min(n - 1, i + 1)];
      const dx = next.x - prev.x;
      const dz = next.z - prev.z;
      const len = Math.hypot(dx, dz) || 1;
      const px = -dz / len;
      const pz = dx / len;
      const y = heightAt(p.x, p.z) + 0.06;
      pos.array[o] = p.x + px * wide;
      pos.array[o + 1] = y;
      pos.array[o + 2] = p.z + pz * wide;
      pos.array[o + 3] = p.x - px * wide;
      pos.array[o + 4] = y;
      pos.array[o + 5] = p.z - pz * wide;
      const a = fade * fade * 0.7;
      col.setXYZW(i * 2, 0.9, 0.96, 0.97, a);
      col.setXYZW(i * 2 + 1, 0.9, 0.96, 0.97, a);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    const segs = Math.max(0, n - 1);
    this.mesh.geometry.setDrawRange(0, segs * 6);
  }
}
