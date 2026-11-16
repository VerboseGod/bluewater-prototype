import { BufferGeometry, DoubleSide, Float32BufferAttribute, Mesh, MeshBasicMaterial } from 'three';

/** The sailed path, laid on the water as a pale ribbon. */
export class TrackRibbon {
  readonly mesh: Mesh;
  private geo = new BufferGeometry();

  constructor() {
    const mat = new MeshBasicMaterial({
      color: '#ffe08a',
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      side: DoubleSide,
    });
    this.mesh = new Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
  }

  update(pts: { x: number; y: number }[]): void {
    if (pts.length < 2) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    const positions: number[] = [];
    const half = 0.85;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      let dx = b.x - a.x;
      let dz = b.y - a.y;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      positions.push(p.x - dz * half, 0.28, p.y + dx * half);
      positions.push(p.x + dz * half, 0.28, p.y - dx * half);
    }
    this.geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
    const index: number[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const o = i * 2;
      index.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
    }
    this.geo.setIndex(index);
    this.geo.computeBoundingSphere();
  }

  clear(): void {
    this.mesh.visible = false;
  }
}
