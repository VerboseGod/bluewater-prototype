import {
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  ShapeUtils,
  SphereGeometry,
  Vector2,
  Vector3,
} from 'three';
import type { Ring } from '../harbour/geo';
import { herzliya, PIER_WIDTH, type HarbourWorld } from '../harbour/world';

const HULL = new MeshStandardMaterial({ color: '#f4f7f8', roughness: 0.45, metalness: 0.08 });
const MAST = new MeshStandardMaterial({ color: '#d7c7a2', roughness: 0.7 });
const ROCK = new MeshStandardMaterial({ color: '#6a645c', roughness: 0.94, vertexColors: true });
const DECK = new MeshStandardMaterial({ color: '#c5ced4', roughness: 0.62, metalness: 0.12 });
const WALL = new MeshStandardMaterial({ color: '#f3efe6', roughness: 0.84, vertexColors: true });
const SAND = new MeshStandardMaterial({ color: '#cbb892', roughness: 1 });
const MARK = new MeshStandardMaterial({ color: '#ffd15c', roughness: 0.4, emissive: new Color('#ffd15c'), emissiveIntensity: 0.25 });

/** Procedural Herzliya: breakwaters, pontoons, buildings, boats, and the entrance lights. */
export class HerzliyaView {
  readonly group = new Group();
  private world: HarbourWorld;
  private boats: InstancedMesh | null = null;
  private masts: InstancedMesh | null = null;
  private lights: { mesh: Mesh; period: number; offset: number; colour: string }[] = [];
  private quality: 'low' | 'high';

  constructor(quality: 'low' | 'high', world: HarbourWorld = herzliya) {
    this.world = world;
    this.quality = quality;
    this.group.add(this.land());
    this.group.add(this.prisms(world.extract.breakwaters.map((b) => ({ pts: open(b.pts, b.closed), h: b.length > 200 ? 4.5 : 3 })), ROCK));
    this.group.add(this.piers());
    this.group.add(this.prisms(world.buildings.map((b) => ({ pts: b.pts, h: b.height })), WALL));
    this.fleet(quality === 'high' ? 72 : 36);
    this.group.add(this.seamarks());
    this.group.add(this.practiceMarks());
  }

  setQuality(quality: 'low' | 'high'): void {
    if (quality === this.quality) return;
    this.quality = quality;
    if (this.boats) {
      this.group.remove(this.boats);
      this.boats.geometry.dispose();
      this.boats = null;
    }
    if (this.masts) {
      this.group.remove(this.masts);
      this.masts.geometry.dispose();
      this.masts = null;
    }
    this.fleet(quality === 'high' ? 72 : 36);
  }

  update(time: number): void {
    for (const light of this.lights) {
      const on = (time + light.offset) % light.period < 0.45;
      const mat = light.mesh.material as MeshStandardMaterial;
      mat.emissiveIntensity = on ? 2.4 : 0.05;
    }
    this.group.position.y = Math.sin(time * 0.8) * 0.02;
  }

  private land(): Mesh {
    const positions: number[] = [];
    for (const line of this.world.extract.coastline) {
      const pts = line.pts;
      for (let i = 1; i < pts.length; i++) {
        const ax = pts[i - 1].x;
        const ay = pts[i - 1].y;
        const bx = pts[i].x;
        const by = pts[i].y;
        if ((ax + bx) / 2 < 40) continue;
        const dx = bx - ax;
        const dy = by - ay;
        const len = Math.hypot(dx, dy) || 1;
        let nx = -dy / len;
        let ny = dx / len;
        if (nx < 0) {
          nx = -nx;
          ny = -ny;
        }
        const w = 90;
        positions.push(ax, 0.15, ay, bx, 0.15, by, ax + nx * w, 1.6, ay + ny * w);
        positions.push(bx, 0.15, by, bx + nx * w, 1.6, by + ny * w, ax + nx * w, 1.6, ay + ny * w);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    const mesh = new Mesh(geo, SAND);
    mesh.frustumCulled = false;
    return mesh;
  }

  private piers(): Group {
    const g = new Group();
    const geo = ribbon(this.world.extract.piers.flatMap((p) => p.pts.length > 1 ? [p.pts] : []), PIER_WIDTH, 0.55);
    g.add(new Mesh(geo, DECK));
    return g;
  }

  private prisms(parts: { pts: Ring[]; h: number }[], material: MeshStandardMaterial): Mesh {
    const positions: number[] = [];
    const colors: number[] = [];
    for (const part of parts) {
      const ring = part.pts.filter((p, i, arr) => i === 0 || Math.hypot(p.x - arr[i - 1].x, p.y - arr[i - 1].y) > 0.2);
      if (ring.length < 3) continue;
      if (area(ring) < 0) ring.reverse();
      const contour = ring.map((p) => new Vector2(p.x, p.y));
      const faces = ShapeUtils.triangulateShape(contour, []);
      const tint = 0.82 + (ring.length % 5) * 0.035;
      const y = part.h;
      for (const face of faces) {
        for (const idx of face) {
          const p = ring[idx];
          positions.push(p.x, y, p.y);
          colors.push(tint, tint * 0.97, tint * 0.9);
        }
      }
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        const shade = 0.7;
        positions.push(a.x, 0, a.y, b.x, 0, b.y, b.x, y, b.y);
        positions.push(a.x, 0, a.y, b.x, y, b.y, a.x, y, a.y);
        for (let k = 0; k < 6; k++) colors.push(shade * tint, shade * tint * 0.96, shade * tint * 0.9);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new Mesh(geo, material);
    mesh.castShadow = this.quality === 'high';
    mesh.frustumCulled = false;
    return mesh;
  }

  private fleet(count: number): void {
    const mesh = new InstancedMesh(BoxHull(), HULL, count);
    const mast = new InstancedMesh(new CylinderGeometry(0.04, 0.05, 4.2, 5), MAST, count);
    const dummy = new Object3D();
    const spots = berths(this.world, count);
    const q = new Quaternion();
    for (let i = 0; i < count; i++) {
      const s = spots[i] ?? spots[spots.length - 1];
      dummy.position.set(s.x, 0.35, s.y);
      dummy.rotation.set(0, -s.heading, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      q.setFromAxisAngle(new Vector3(0, 1, 0), -s.heading);
      dummy.position.set(s.x, 2.3, s.y);
      dummy.quaternion.copy(q);
      dummy.updateMatrix();
      mast.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mast.instanceMatrix.needsUpdate = true;
    mesh.castShadow = this.quality === 'high';
    this.boats = mesh;
    this.masts = mast;
    this.group.add(mesh, mast);
  }

  private seamarks(): Group {
    const g = new Group();
    this.lights = [];
    for (const mark of this.world.lights) {
      const colour = mark.colour === 'green' ? '#3dd68c' : '#e15b4c';
      const mat = new MeshStandardMaterial({
        color: colour,
        emissive: new Color(colour),
        emissiveIntensity: 0.2,
        roughness: 0.35,
      });
      const pole = new Mesh(new CylinderGeometry(0.12, 0.16, 6, 6), new MeshStandardMaterial({ color: '#d5dbe0', roughness: 0.4, metalness: 0.4 }));
      pole.position.set(mark.x, 3, mark.y);
      const lamp = new Mesh(new SphereGeometry(0.35, 10, 8), mat);
      lamp.position.set(mark.x, 6.3, mark.y);
      g.add(pole, lamp);
      this.lights.push({
        mesh: lamp,
        period: mark.period > 0 ? mark.period : 5,
        offset: mark.colour === 'green' ? 1.7 : 0,
        colour,
      });
    }
    return g;
  }

  private practiceMarks(): Group {
    const g = new Group();
    for (const mark of this.world.course.marks) {
      const buoy = new Mesh(new SphereGeometry(0.7, 12, 10), MARK);
      buoy.scale.set(1, 0.8, 1);
      buoy.position.set(mark.x, 0.5, mark.y);
      const stick = new Mesh(new CylinderGeometry(0.04, 0.04, 1.6, 5), MAST);
      stick.position.set(mark.x, 1.5, mark.y);
      g.add(buoy, stick);
    }
    return g;
  }
}

function open(pts: Ring[], closed: boolean): Ring[] {
  if (closed && pts.length > 1) return pts.slice(0, -1);
  return pts;
}

function area(ring: Ring[]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    a += ring[i].x * ring[j].y - ring[j].x * ring[i].y;
  }
  return a;
}

function ribbon(lines: Ring[][], width: number, y: number): BufferGeometry {
  const positions: number[] = [];
  const half = width / 2;
  for (const pts of lines) {
    for (let i = 1; i < pts.length; i++) {
      const ax = pts[i - 1].x;
      const ay = pts[i - 1].y;
      const bx = pts[i].x;
      const by = pts[i].y;
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * half;
      const ny = (dx / len) * half;
      positions.push(ax + nx, y, ay + ny, bx + nx, y, by + ny, bx - nx, y, by - ny);
      positions.push(ax + nx, y, ay + ny, bx - nx, y, by - ny, ax - nx, y, ay - ny);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

function berths(world: HarbourWorld, count: number): { x: number; y: number; heading: number }[] {
  const out: { x: number; y: number; heading: number }[] = [];
  const start = world.course.start;
  const cleat = world.course.cleat;
  for (const pier of world.extract.piers) {
    for (let i = 1; i < pier.pts.length; i++) {
      const a = pier.pts[i - 1];
      const b = pier.pts[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const heading = Math.atan2(b.y - a.y, b.x - a.x);
      const steps = Math.max(1, Math.floor(len / 14));
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        const side = s % 2 === 0 ? 1 : -1;
        const nx = Math.sin(heading) * side * 3.2;
        const ny = -Math.cos(heading) * side * 3.2;
        const bx = x + nx;
        const by = y + ny;
        if (Math.hypot(bx - start.x, by - start.y) < 16) continue;
        if (Math.hypot(bx - cleat.x, by - cleat.y) < 14) continue;
        out.push({ x: bx, y: by, heading });
        if (out.length >= count) return out;
      }
    }
  }
  while (out.length < count) out.push(out[0] ?? { x: 0, y: 0, heading: 0 });
  return out;
}

/** A simple hard-chined hull, shared by every marina boat. */
function BoxHull(): BufferGeometry {
  const positions = [
    -1.7, 0.15, 0.55, 1.8, 0.05, 0.15, 1.8, 0.05, -0.15,
    -1.7, 0.15, 0.55, 1.8, 0.05, -0.15, -1.7, 0.15, -0.55,
    -1.7, 0.15, 0.55, -1.7, -0.15, 0.35, 1.8, -0.05, 0.1,
    -1.7, 0.15, 0.55, 1.8, -0.05, 0.1, 1.8, 0.05, 0.15,
    -1.7, 0.15, -0.55, 1.8, 0.05, -0.15, 1.8, -0.05, -0.1,
    -1.7, 0.15, -0.55, 1.8, -0.05, -0.1, -1.7, -0.15, -0.35,
  ];
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}
