import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Vector3,
} from 'three';
import type { Gust } from '../sim/wind';

const dummy = new Object3D();

export class WindCues {
  readonly group = new Group();
  private streamers: InstancedMesh;
  private origins: { x: number; z: number }[] = [];
  private arrow: Mesh;
  private wedge: Mesh;
  private count: number;

  constructor(quality: 'performance' | 'quality') {
    const max = 140;
    this.count = quality === 'quality' ? 140 : 80;
    const geo = new PlaneGeometry(2.1, 0.55);
    geo.translate(1.05, 0.4, 0);
    const mat = new MeshBasicMaterial({
      color: '#ffe7a3',
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      side: DoubleSide,
    });
    this.streamers = new InstancedMesh(geo, mat, max);
    this.streamers.frustumCulled = false;
    const span = 12;
    for (let i = 0; i < max; i++) {
      const col = i % span;
      const row = Math.floor(i / span);
      this.origins.push({
        x: (col - span / 2) * 7,
        z: (row - span / 2) * 7,
      });
    }
    this.group.add(this.streamers);

    const arrowGeo = new BufferGeometry();
    arrowGeo.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([
        0, 0.35, 0,
        4.2, 0.7, 0,
        4.2, 0.15, 0,
        4.2, 0.95, 0,
        6.4, 0.42, 0,
        4.2, -0.05, 0,
      ]), 3),
    );
    arrowGeo.setIndex([0, 1, 2, 3, 4, 5]);
    arrowGeo.computeVertexNormals();
    this.arrow = new Mesh(
      arrowGeo,
      new MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.85, side: DoubleSide, depthWrite: false }),
    );
    this.group.add(this.arrow);

    const wedgeGeo = wedgeGeometry(42.5 * Math.PI / 180, 14, 14);
    this.wedge = new Mesh(
      wedgeGeo,
      new MeshBasicMaterial({ color: '#ff4d4d', transparent: true, opacity: 0.22, side: DoubleSide, depthWrite: false }),
    );
    this.group.add(this.wedge);
  }

  setQuality(quality: 'performance' | 'quality'): void {
    const next = quality === 'quality' ? 140 : 80;
    if (next === this.count) return;
    this.count = Math.min(next, this.origins.length);
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
  ): void {
    const speed = Math.hypot(windToX, windToZ) || 1;
    const dir = Math.atan2(windToZ, windToX);
    for (let i = 0; i < this.count; i++) {
      const o = this.origins[i];
      let x = boatX + o.x + ((time * speed * 0.35 + i * 3) % 42) - 21;
      let z = boatZ + o.z + Math.sin(time * 0.2 + i) * 0.4;
      const dx = x - boatX;
      const dz = z - boatZ;
      const along = dx * Math.cos(dir) + dz * Math.sin(dir);
      const across = -dx * Math.sin(dir) + dz * Math.cos(dir);
      const wrapped = ((along + 28) % 56) - 28;
      x = boatX + wrapped * Math.cos(dir) - across * Math.sin(dir);
      z = boatZ + wrapped * Math.sin(dir) + across * Math.cos(dir);
      let gust = 1;
      for (const g of gusts) {
        const d = Math.hypot(x - g.x, z - g.y);
        if (d < g.r) gust += g.amp * (1 - d / g.r);
      }
      dummy.position.set(x, 0.25, z);
      dummy.rotation.set(0, -dir, 0);
      dummy.scale.set(0.7 + gust * 0.45, 1, 1);
      dummy.updateMatrix();
      this.streamers.setMatrixAt(i, dummy.matrix);
    }
    this.streamers.instanceMatrix.needsUpdate = true;
    this.streamers.count = this.count;

    this.arrow.position.set(boatX + Math.sin(windFrom) * 6, 0.2, boatZ - Math.cos(windFrom) * 6);
    this.arrow.rotation.y = -dir;

    this.wedge.visible = assisted;
    this.wedge.position.set(boatX, 0.18, boatZ);
    this.wedge.rotation.y = -windFrom;
  }
}

function wedgeGeometry(half: number, radius: number, segs: number): BufferGeometry {
  const positions: number[] = [0, 0, 0];
  const indices: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = -half + (2 * half * i) / segs;
    positions.push(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    if (i > 0) indices.push(0, i, i + 1);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export class Wake {
  readonly mesh: Mesh;
  private positions: Float32Array;
  private count: number;
  private head = 0;
  private filled = 0;
  private last = new Vector3(9999, 0, 0);

  constructor(quality: 'performance' | 'quality') {
    this.count = quality === 'quality' ? 96 : 60;
    this.positions = new Float32Array(this.count * 2 * 3);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.positions, 3));
    const indices: number[] = [];
    for (let i = 0; i < this.count - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(indices);
    this.mesh = new Mesh(
      geo,
      new MeshBasicMaterial({
        color: '#e7f7f8',
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  push(x: number, z: number, heading: number, speed: number): void {
    if (Math.hypot(x - this.last.x, z - this.last.z) < 0.35 && this.filled > 0) return;
    this.last.set(x, 0, z);
    const side = Math.min(0.55, 0.12 + speed * 0.08);
    const px = Math.sin(heading);
    const pz = -Math.cos(heading);
    const i = this.head;
    const o = i * 6;
    this.positions[o] = x + px * side;
    this.positions[o + 1] = 0.12;
    this.positions[o + 2] = z + pz * side;
    this.positions[o + 3] = x - px * side;
    this.positions[o + 4] = 0.12;
    this.positions[o + 5] = z - pz * side;
    this.head = (this.head + 1) % this.count;
    this.filled = Math.min(this.count, this.filled + 1);
    this.rebuild();
  }

  private rebuild(): void {
    const attr = this.mesh.geometry.getAttribute('position') as BufferAttribute;
    const tmp = new Float32Array(this.count * 6);
    for (let n = 0; n < this.filled; n++) {
      const src = ((this.head - this.filled + n + this.count) % this.count) * 6;
      tmp.set(this.positions.subarray(src, src + 6), n * 6);
    }
    (attr.array as Float32Array).set(tmp);
    attr.needsUpdate = true;
    const segs = Math.max(0, this.filled - 1);
    this.mesh.geometry.setDrawRange(0, segs * 6);
  }
}
