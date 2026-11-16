import {
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  ShapeUtils,
} from 'three';
import type { Ring } from '../harbour/geo';
import { herzliya, type HarbourWorld } from '../harbour/world';

const SAND = new MeshStandardMaterial({ color: '#e4c98a', roughness: 1 });
const DECK = new MeshStandardMaterial({ color: '#3f3b36', roughness: 1, metalness: 0 });
const SKIRT = new MeshStandardMaterial({ color: '#3e3a35', roughness: 0.94 });
const FENDER = new MeshStandardMaterial({ color: '#141618', roughness: 0.66 });
const ROCK_MAT = new MeshStandardMaterial({ color: '#2a2622', roughness: 1, vertexColors: true });
const CAP_MAT = new MeshStandardMaterial({ color: '#9a9488', roughness: 0.84 });
const MARK = new MeshStandardMaterial({
  color: '#ffd15c',
  emissive: new Color('#ffb703'),
  emissiveIntensity: 0.35,
  roughness: 0.4,
});

const HULL_COLOURS = ['#f7f4ef', '#f3f7fb', '#1d3a5f', '#f4f1ea', '#e7eef2', '#fbf8f2'];

/** Herzliya from the checked-in coast: rock moles, pontoons, yachts, and the town. */
export class HerzliyaView {
  readonly group = new Group();
  private lights: { mesh: Mesh; period: number; offset: number }[] = [];
  private quality: 'low' | 'high';
  private world: HarbourWorld;
  private fleetRoot: Group | null = null;

  constructor(quality: 'low' | 'high', world: HarbourWorld = herzliya) {
    this.quality = quality;
    this.world = world;
    this.group.add(this.beach());
    this.group.add(this.moles());
    this.group.add(this.pontoons());
    this.group.add(this.town());
    this.group.add(this.yachts(quality === 'high' ? 64 : 36));
    this.group.add(this.seamarks());
    this.group.add(this.practiceMarks());
  }

  setQuality(quality: 'low' | 'high'): void {
    if (quality === this.quality) return;
    this.quality = quality;
    if (this.fleetRoot) {
      this.group.remove(this.fleetRoot);
      this.fleetRoot = null;
    }
    this.group.add(this.yachts(quality === 'high' ? 64 : 36));
  }

  update(time: number): void {
    for (const light of this.lights) {
      const on = (time + light.offset) % light.period < 0.55;
      const mat = light.mesh.material as MeshStandardMaterial;
      mat.emissiveIntensity = on ? 3.2 : 1.15;
    }
  }

  private beach(): Mesh {
    const positions: number[] = [];
    for (const line of this.world.extract.coastline) {
      const pts = line.pts;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        if (this.world.depth.insideMarina(mx, my)) continue;
        if (my < -120 || my > 620 || mx < -40 || mx > 320) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = (-dy / len);
        const ny = dx / len;
        const inland = nx > 0 ? 1 : -1;
        const w = 48;
        const ix = nx * inland * w;
        const iy = ny * inland * w;
        positions.push(a.x, 0.2, a.y, b.x, 0.2, b.y, a.x + ix, 1.1, a.y + iy);
        positions.push(b.x, 0.2, b.y, b.x + ix, 1.1, b.y + iy, a.x + ix, 1.1, a.y + iy);
      }
    }
    return meshFrom(positions, SAND);
  }

  private moles(): Group {
    const g = new Group();
    const rockPos: number[] = [];
    const capPos: number[] = [];
    for (const line of this.world.extract.breakwaters) {
      const ring = openRing(line.pts, line.closed);
      if (ring.length < 3) continue;
      const crest = line.length > 200 ? 3.6 : 2.6;
      slopedArmour(rockPos, ring, -1.6, crest, 0.62);
      pushPrism(capPos, inset(ring, 0.5), 0.42, crest - 0.05);
    }
    g.add(meshFrom(rockPos, ROCK_MAT, true));
    g.add(meshFrom(capPos, CAP_MAT, true));
    return g;
  }

  private pontoons(): Group {
    const g = new Group();
    const deck: number[] = [];
    const skirt: number[] = [];
    const fender: number[] = [];
    for (const pier of this.world.extract.piers) {
      addRibbon(deck, pier.pts, 3.4, 0.62, 0.28);
      addRibbon(skirt, pier.pts, 3.55, 0.22, -0.25);
      addFender(fender, pier.pts, 3.4);
      addEdgeLine(fender, pier.pts, 3.4, 0.66);
      for (let i = 1; i < pier.pts.length; i++) {
        const a = pier.pts[i - 1];
        const b = pier.pts[i];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const heading = Math.atan2(b.y - a.y, b.x - a.x);
        const fingers = Math.floor(len / 12);
        for (let f = 1; f < fingers; f++) {
          const t = f / fingers;
          const x = a.x + (b.x - a.x) * t;
          const y = a.y + (b.y - a.y) * t;
          if (Math.hypot(x - this.world.course.start.x, y - this.world.course.start.y) < 9) continue;
          const side = f % 2 === 0 ? 1 : -1;
          const fx = Math.sin(heading) * side;
          const fy = -Math.cos(heading) * side;
          const tip = { x: x + fx * 7.2, y: y + fy * 7.2 };
          addRibbon(deck, [{ x, y }, tip], 1.55, 0.55, 0.26);
          addRibbon(skirt, [{ x, y }, tip], 1.7, 0.18, -0.2);
          addFender(fender, [{ x, y }, tip], 1.55);
          addEdgeLine(fender, [{ x, y }, tip], 1.55, 0.58);
        }
      }
    }
    g.add(meshFrom(deck, DECK));
    g.add(meshFrom(skirt, SKIRT));
    g.add(meshFrom(fender, FENDER));
    return g;
  }

  private town(): Mesh {
    const positions: number[] = [];
    const uvs: number[] = [];
    const roof: number[] = [];
    const facade = facadeTexture();
    const wallMat = new MeshStandardMaterial({ map: facade, color: '#ffffff', roughness: 0.78, metalness: 0.02, vertexColors: true });
    const roofMat = new MeshStandardMaterial({ color: '#b85a3d', roughness: 0.7 });
    const tints = [new Color('#f7f1e6'), new Color('#f3e6d4'), new Color('#efe0c8'), new Color('#f6efe4'), new Color('#e7d7c2'), new Color('#e4eef2')];
    const wallColors: number[] = [];
    for (const [index, building] of this.world.buildings.entries()) {
      const ring = dedupe(building.pts);
      if (ring.length < 3) continue;
      if (area(ring) < 0) ring.reverse();
      const faces = ShapeUtils.triangulateShape(ring.map((p) => new Vector2(p.x, p.y)), []);
      if (!faces.length) continue;
      const h = Math.max(6, building.height);
      const tint = tints[index % tints.length];
      for (const face of faces) {
        for (const idx of face) {
          const p = ring[idx];
          roof.push(p.x, h, p.y);
        }
      }
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        const span = Math.hypot(b.x - a.x, b.y - a.y) / 3.2;
        positions.push(a.x, 0, a.y, b.x, 0, b.y, b.x, h, b.y, a.x, 0, a.y, b.x, h, b.y, a.x, h, a.y);
        uvs.push(0, 0, span, 0, span, h / 3.2, 0, 0, span, h / 3.2, 0, h / 3.2);
        for (let k = 0; k < 6; k++) wallColors.push(tint.r, tint.g, tint.b);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new Float32BufferAttribute(wallColors, 3));
    geo.computeVertexNormals();
    const walls = new Mesh(geo, wallMat);
    walls.castShadow = this.quality === 'high';
    walls.receiveShadow = true;
    const roofGeo = new BufferGeometry();
    roofGeo.setAttribute('position', new Float32BufferAttribute(roof, 3));
    roofGeo.computeVertexNormals();
    const roofMesh = new Mesh(roofGeo, roofMat);
    roofMesh.castShadow = this.quality === 'high';
    this.group.add(roofMesh);
    return walls;
  }

  private yachts(count: number): Group {
    const root = new Group();
    this.fleetRoot = root;
    const spots = berths(this.world, count);
    const hull = new InstancedMesh(yachtHull(), new MeshStandardMaterial({ roughness: 0.42, metalness: 0.08 }), count);
    const cabin = new InstancedMesh(box(2.2, 0.7, 1.3), new MeshStandardMaterial({ color: '#f7f4ef', roughness: 0.5 }), count);
    const mast = new InstancedMesh(new CylinderGeometry(0.05, 0.07, 1, 5), new MeshStandardMaterial({ color: '#ece7dc', roughness: 0.45 }), count);
    const dummy = new Object3D();
    for (let i = 0; i < count; i++) {
      const s = spots[i];
      const colour = new Color(HULL_COLOURS[i % HULL_COLOURS.length]);
      dummy.position.set(s.x, 0.45, s.y);
      dummy.rotation.set(0, -s.heading, 0);
      dummy.scale.setScalar(s.scale);
      dummy.updateMatrix();
      hull.setMatrixAt(i, dummy.matrix);
      hull.setColorAt(i, colour);
      dummy.position.set(s.x - Math.cos(s.heading) * 0.4 * s.scale, 1.15 * s.scale, s.y - Math.sin(s.heading) * 0.4 * s.scale);
      dummy.updateMatrix();
      cabin.setMatrixAt(i, dummy.matrix);
      dummy.position.set(s.x, 2.4 * s.scale, s.y);
      dummy.scale.set(1, 7.5 * s.scale, 1);
      dummy.updateMatrix();
      mast.setMatrixAt(i, dummy.matrix);
      dummy.scale.setScalar(1);
    }
    hull.instanceMatrix.needsUpdate = true;
    cabin.instanceMatrix.needsUpdate = true;
    mast.instanceMatrix.needsUpdate = true;
    if (hull.instanceColor) hull.instanceColor.needsUpdate = true;
    hull.castShadow = this.quality === 'high';
    cabin.castShadow = this.quality === 'high';
    root.add(hull, cabin, mast);
    return root;
  }

  private seamarks(): Group {
    const g = new Group();
    this.lights = [];
    for (const mark of this.world.lights) {
      const colour = mark.colour === 'green' ? '#3dd68c' : '#ff5a4a';
      const mat = new MeshStandardMaterial({
        color: colour,
        emissive: new Color(colour),
        emissiveIntensity: 1.4,
        roughness: 0.28,
      });
      const pole = new Mesh(
        new CylinderGeometry(0.14, 0.2, 7.5, 6),
        new MeshStandardMaterial({ color: '#e7e1d6', roughness: 0.4, metalness: 0.35 }),
      );
      pole.position.set(mark.x, 3.6, mark.y);
      const lamp = new Mesh(new SphereGeometry(0.42, 12, 10), mat);
      lamp.position.set(mark.x, 7.5, mark.y);
      const glow = new Mesh(
        new SphereGeometry(1.1, 10, 8),
        new MeshStandardMaterial({
          color: colour,
          emissive: new Color(colour),
          emissiveIntensity: 0.8,
          transparent: true,
          opacity: 0.28,
          depthWrite: false,
        }),
      );
      glow.position.copy(lamp.position);
      g.add(pole, lamp, glow);
      this.lights.push({ mesh: lamp, period: mark.period > 0 ? mark.period : 5, offset: mark.colour === 'green' ? 2.1 : 0 });
    }
    return g;
  }

  private practiceMarks(): Group {
    const g = new Group();
    for (const mark of this.world.course.marks) {
      const buoy = new Mesh(new SphereGeometry(0.85, 14, 10), MARK);
      buoy.scale.set(1, 0.75, 1);
      buoy.position.set(mark.x, 0.55, mark.y);
      g.add(buoy);
    }
    return g;
  }
}

function facadeTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#f6f0e6';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#24343f';
    for (let y = 14; y <= 48; y += 16) {
      for (let x = 8; x <= 48; x += 16) ctx.fillRect(x, y, 8, 9);
    }
  }
  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function yachtHull(): BufferGeometry {
  const positions = [
    -3.6, 0.15, 0.7, 3.4, 0.05, 0.15, 3.4, 0.05, -0.15,
    -3.6, 0.15, 0.7, 3.4, 0.05, -0.15, -3.6, 0.15, -0.7,
    -3.6, 0.15, 0.7, -3.6, -0.25, 0.35, 3.4, -0.1, 0.08,
    -3.6, 0.15, 0.7, 3.4, -0.1, 0.08, 3.4, 0.05, 0.15,
    -3.6, 0.15, -0.7, 3.4, 0.05, -0.15, 3.4, -0.1, -0.08,
    -3.6, 0.15, -0.7, 3.4, -0.1, -0.08, -3.6, -0.25, -0.35,
  ];
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

function box(w: number, h: number, d: number): BufferGeometry {
  const x = w / 2;
  const y = h / 2;
  const z = d / 2;
  const positions = [
    -x, -y, z, x, -y, z, x, y, z, -x, -y, z, x, y, z, -x, y, z,
    -x, -y, -z, -x, y, -z, x, y, -z, -x, -y, -z, x, y, -z, x, -y, -z,
  ];
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

function berths(world: HarbourWorld, count: number): { x: number; y: number; heading: number; scale: number }[] {
  const out: { x: number; y: number; heading: number; scale: number }[] = [];
  const start = world.course.start;
  for (const pier of world.extract.piers) {
    for (let i = 1; i < pier.pts.length; i++) {
      const a = pier.pts[i - 1];
      const b = pier.pts[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const heading = Math.atan2(b.y - a.y, b.x - a.x);
      const steps = Math.max(1, Math.floor(len / 11));
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        const side = s % 2 === 0 ? 1 : -1;
        const bx = x + Math.sin(heading) * side * 6.2;
        const by = y - Math.cos(heading) * side * 6.2;
        if (Math.hypot(bx - start.x, by - start.y) < 11) continue;
        out.push({ x: bx, y: by, heading: heading + (side > 0 ? 0 : Math.PI), scale: 0.9 + hash(out.length) * 0.4 });
      }
    }
  }
  out.sort((a, b) => Math.hypot(a.x - start.x, a.y - start.y) - Math.hypot(b.x - start.x, b.y - start.y));
  const picked = out.slice(0, count);
  while (picked.length < count) picked.push(picked[picked.length - 1] ?? { x: start.x + 18, y: start.y - 8, heading: 0, scale: 1 });
  return picked;
}

function meshFrom(positions: number[], material: MeshStandardMaterial, shadow = false): Mesh {
  if (positions.length < 9) return new Mesh(new BufferGeometry(), material);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  if (material.vertexColors) {
    const colors: number[] = [];
    for (let i = 0; i < positions.length; i += 3) {
      const n = 0.78 + hash(i) * 0.28;
      colors.push(n, n, n);
    }
    geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
  }
  geo.computeVertexNormals();
  const mesh = new Mesh(geo, material);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

function slopedArmour(out: number[], ring: Ring[], baseY: number, crestY: number, insetScale: number): void {
  const crest = inset(ring, insetScale);
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    const a = ring[i];
    const b = ring[j];
    const c = crest[i];
    const d = crest[j];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.round(len / 5));
    for (let s = 0; s < steps; s++) {
      const t0 = s / steps;
      const t1 = (s + 1) / steps;
      const wobble = (seed: number, t: number) => (hash(seed + Math.floor(t * 17)) - 0.5) * 0.85;
      const ax = a.x + (b.x - a.x) * t0;
      const ay = a.y + (b.y - a.y) * t0;
      const bx = a.x + (b.x - a.x) * t1;
      const by = a.y + (b.y - a.y) * t1;
      const cx = c.x + (d.x - c.x) * t0 + wobble(i * 13, t0);
      const cy = c.y + (d.y - c.y) * t0 + wobble(i * 29, t0);
      const dx = c.x + (d.x - c.x) * t1 + wobble(i * 13, t1);
      const dy = c.y + (d.y - c.y) * t1 + wobble(i * 29, t1);
      const h0 = crestY + wobble(i * 3, t0) * 0.7;
      const h1 = crestY + wobble(i * 3, t1) * 0.7;
      out.push(ax, baseY, ay, bx, baseY, by, dx, h1, dy);
      out.push(ax, baseY, ay, dx, h1, dy, cx, h0, cy);
    }
  }
}

function addEdgeLine(out: number[], pts: Ring[], deckWidth: number, y: number): void {
  const half = deckWidth / 2;
  const outer = half - 0.05;
  const inner = half - 0.42;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    for (const sign of [1, -1]) {
      const ox = nx * sign;
      const oy = ny * sign;
      out.push(
        a.x + ox * inner, y, a.y + oy * inner,
        b.x + ox * inner, y, b.y + oy * inner,
        b.x + ox * outer, y, b.y + oy * outer,
      );
      out.push(
        a.x + ox * inner, y, a.y + oy * inner,
        b.x + ox * outer, y, b.y + oy * outer,
        a.x + ox * outer, y, a.y + oy * outer,
      );
    }
  }
}

function addFender(out: number[], pts: Ring[], deckWidth: number): void {
  const half = deckWidth / 2;
  const outer = half + 0.38;
  const inner = half - 0.08;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    for (const sign of [1, -1]) {
      const ox = nx * sign;
      const oy = ny * sign;
      out.push(
        a.x + ox * inner, 0.58, a.y + oy * inner,
        b.x + ox * inner, 0.58, b.y + oy * inner,
        b.x + ox * outer, 0.12, b.y + oy * outer,
      );
      out.push(
        a.x + ox * inner, 0.58, a.y + oy * inner,
        b.x + ox * outer, 0.12, b.y + oy * outer,
        a.x + ox * outer, 0.12, a.y + oy * outer,
      );
    }
  }
}

function addRibbon(out: number[], pts: Ring[], width: number, top: number, bottom: number): void {
  const half = width / 2;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * half;
    const ny = (dx / len) * half;
    out.push(a.x + nx, top, a.y + ny, b.x + nx, top, b.y + ny, b.x - nx, top, b.y - ny);
    out.push(a.x + nx, top, a.y + ny, b.x - nx, top, b.y - ny, a.x - nx, top, a.y - ny);
    out.push(a.x + nx, top, a.y + ny, a.x + nx, bottom, a.y + ny, b.x + nx, bottom, b.y + ny);
    out.push(a.x + nx, top, a.y + ny, b.x + nx, bottom, b.y + ny, b.x + nx, top, b.y + ny);
  }
}

function pushPrism(out: number[], ring: Ring[], height: number, y0 = 0): void {
  if (ring.length < 3 || height <= 0) return;
  const faces = ShapeUtils.triangulateShape(ring.map((p) => new Vector2(p.x, p.y)), []);
  for (const face of faces) {
    for (const idx of face) out.push(ring[idx].x, y0 + height, ring[idx].y);
  }
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    out.push(a.x, y0, a.y, b.x, y0, b.y, b.x, y0 + height, b.y);
    out.push(a.x, y0, a.y, b.x, y0 + height, b.y, a.x, y0 + height, a.y);
  }
}

function inset(ring: Ring[], scale: number): Ring[] {
  let cx = 0;
  let cy = 0;
  for (const p of ring) {
    cx += p.x;
    cy += p.y;
  }
  cx /= ring.length;
  cy /= ring.length;
  return ring.map((p) => ({ x: cx + (p.x - cx) * scale, y: cy + (p.y - cy) * scale }));
}

function openRing(pts: Ring[], closed: boolean): Ring[] {
  const ring = closed && pts.length > 1 ? pts.slice(0, -1) : pts.slice();
  return dedupe(ring);
}

function dedupe(pts: Ring[]): Ring[] {
  return pts.filter((p, i, arr) => i === 0 || Math.hypot(p.x - arr[i - 1].x, p.y - arr[i - 1].y) > 0.3);
}

function area(ring: Ring[]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    a += ring[i].x * ring[j].y - ring[j].x * ring[i].y;
  }
  return a;
}

function hash(n: number): number {
  let x = Math.imul(n + 1, 374761393);
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
