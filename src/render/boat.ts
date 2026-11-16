import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import type { SimSnapshot } from '../sim/sim';
import { tillerYaw } from './tiller';

const HULL = new Color('#f4f1ea');
const DECK = new Color('#efeae2');
const STRIPE = new Color('#c44536');
const METAL = new Color('#c5ccd4');
const SAIL = new Color('#f7f3ea');
const WOOD = new Color('#8a5a32');

export class DinghyView {
  readonly group = new Group();
  private sail: Mesh;
  private sailGeo: BufferGeometry;
  private boom: Group;
  private rudder: Group;
  private sailor: Group;
  private telltales: Mesh[] = [];
  private readonly cols = 8;
  private readonly rows = 6;

  constructor() {
    this.group.add(this.hullMesh());
    this.group.add(this.deckMesh());
    this.group.add(centerboard());
    const mast = new Mesh(
      new CylinderGeometry(0.035, 0.045, 5.15, 8),
      new MeshStandardMaterial({ color: METAL, roughness: 0.35, metalness: 0.6 }),
    );
    mast.position.set(0.2, 2.7, 0);
    this.group.add(mast);

    this.boom = new Group();
    const boomMesh = new Mesh(
      new CylinderGeometry(0.025, 0.03, 2.25, 6),
      new MeshStandardMaterial({ color: METAL, roughness: 0.4, metalness: 0.5 }),
    );
    boomMesh.rotation.z = Math.PI / 2;
    boomMesh.position.set(-1.05, 0, 0);
    this.boom.add(boomMesh);
    this.boom.position.set(0.2, 0.62, 0);
    this.group.add(this.boom);

    this.sailGeo = sailGeometry(this.cols, this.rows);
    this.sail = new Mesh(
      this.sailGeo,
      new MeshStandardMaterial({ color: SAIL, roughness: 0.7, metalness: 0, emissive: '#3a2a21', emissiveIntensity: 0.25, side: DoubleSide }),
    );
    this.group.add(this.sail);
    this.telltales = makeTelltales(this.sail);
    this.sailor = makeSailor();
    this.group.add(this.sailor);

    this.rudder = new Group();
    const blade = new Mesh(
      new CylinderGeometry(0.012, 0.012, 0.72, 4),
      new MeshStandardMaterial({ color: WOOD, roughness: 0.6 }),
    );
    blade.scale.set(1, 1, 3.2);
    blade.position.y = -0.28;
    const tiller = new Mesh(
      new CylinderGeometry(0.015, 0.015, 0.85, 5),
      new MeshStandardMaterial({ color: WOOD, roughness: 0.55 }),
    );
    tiller.rotation.z = Math.PI / 2;
    tiller.position.set(0.38, 0.18, 0);
    this.rudder.add(blade, tiller);
    this.rudder.position.set(-1.95, 0.28, 0);
    this.group.add(this.rudder);

    const shadow = new Mesh(
      new CircleGeometry(1.15, 16),
      new MeshBasicMaterial({
        map: shadowTexture(),
        transparent: true,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.18;
    shadow.name = 'shadow';
    this.group.add(shadow);

    const vane = new Mesh(
      new CylinderGeometry(0.012, 0.04, 0.42, 4),
      new MeshStandardMaterial({ color: '#ff4d3a', roughness: 0.4 }),
    );
    vane.rotation.z = Math.PI / 2;
    vane.position.set(-0.16, 0, 0);
    const vanePivot = new Group();
    vanePivot.name = 'windex';
    vanePivot.position.set(0.05, 5.35, 0);
    vanePivot.add(vane);
    this.group.add(vanePivot);
  }

  update(s: SimSnapshot, rudderCmd: number): void {
    this.boom.rotation.y = -s.boom;
    this.rudder.rotation.y = tillerYaw(rudderCmd);
    this.shapeSail(s);
    const windex = this.group.getObjectByName('windex');
    if (windex) {
      const target = -s.awa;
      windex.rotation.y += (target - windex.rotation.y) * 0.12;
    }
    const windward = Math.sign(s.awa || s.twa || 1);
    const hike = s.hike;
    this.sailor.position.set(-0.35, 0.55, windward * (0.05 + hike * 0.72));
    this.sailor.rotation.x = 0;
    this.sailor.rotation.z = -windward * hike * 0.5;
    this.sailor.visible = !s.capsized;
  }

  private shapeSail(s: SimSnapshot): void {
    const pos = this.sailGeo.getAttribute('position') as BufferAttribute;
    const boom = s.boom;
    const clew = new Vector3(0.2 - Math.cos(boom) * 2.2, 0.62, -Math.sin(boom) * 2.2);
    const head = new Vector3(0.05, 5.2, 0);
    const tack = new Vector3(0.2, 0.62, 0);
    const powered = s.sail === 'trimmed' ? 1 : s.sail === 'stalled' ? 0.45 : 0.05;
    const flutter = s.sail === 'luffing' || s.sail === 'aback' || s.sail === 'stalled' ? 1 : 0.15;
    const t = s.time;
    let n = 0;
    for (let r = 0; r <= this.rows; r++) {
      const v = r / this.rows;
      for (let c = 0; c <= this.cols; c++) {
        const u = c / this.cols;
        const foot = tack.clone().lerp(clew, u);
        const leechTop = head;
        const p = foot.clone().lerp(leechTop, v);
        const belly = Math.sin(Math.PI * u) * Math.sin(Math.PI * v) * 0.28 * powered;
        const side = -Math.sign(boom || s.awa || 1);
        p.z += side * belly;
        p.x += Math.sin(t * 9 + v * 6 + u * 4) * 0.045 * flutter * (0.3 + v);
        pos.setXYZ(n, p.x, p.y, p.z);
        n++;
      }
    }
    pos.needsUpdate = true;
    this.sailGeo.computeVertexNormals();
    this.placeTelltales(s, tack, clew, head);
  }

  private placeTelltales(s: SimSnapshot, tack: Vector3, clew: Vector3, head: Vector3): void {
    const spots = [0.25, 0.5, 0.75];
    const aoa = s.aoa;
    const windwardLift = aoa < 0.14 ? 0.8 : 0.05;
    const leewardLift = aoa > 0.46 ? 0.8 : 0.05;
    const flutter = (s.sail === 'luffing' || s.sail === 'stalled' ? 1 : 0.2) * Math.sin(s.time * 18);
    spots.forEach((v, i) => {
      const foot = tack.clone().lerp(clew, 0.72);
      const p = foot.clone().lerp(head, v);
      const wind = this.telltales[i * 2];
      const lee = this.telltales[i * 2 + 1];
      const side = -Math.sign(s.boom || s.awa || 1);
      wind.position.copy(p).add(new Vector3(-0.05, 0, side * 0.06));
      lee.position.copy(p).add(new Vector3(-0.05, 0, -side * 0.06));
      wind.rotation.z = -0.4 - windwardLift * 1.1 + flutter * windwardLift;
      lee.rotation.z = -0.4 - leewardLift * 1.1 - flutter * leewardLift;
    });
  }

  private hullMesh(): Mesh {
    const stations = [
      { x: 2.15, beam: 0.02, deck: 0.2, keel: 0.06 },
      { x: 1.75, beam: 0.22, deck: 0.32, keel: 0.0 },
      { x: 1.15, beam: 0.48, deck: 0.38, keel: -0.08 },
      { x: 0.4, beam: 0.64, deck: 0.4, keel: -0.12 },
      { x: -0.35, beam: 0.66, deck: 0.39, keel: -0.1 },
      { x: -1.05, beam: 0.55, deck: 0.36, keel: -0.04 },
      { x: -1.65, beam: 0.36, deck: 0.32, keel: 0.04 },
      { x: -2.1, beam: 0.14, deck: 0.26, keel: 0.1 },
    ];
    const rings: Vector3[][] = stations.map((s) => {
      const b = s.beam;
      return [
        new Vector3(s.x, s.keel, 0),
        new Vector3(s.x, s.keel + 0.04, -b * 0.55),
        new Vector3(s.x, s.deck * 0.45, -b),
        new Vector3(s.x, s.deck, -b * 0.72),
        new Vector3(s.x, s.deck, b * 0.72),
        new Vector3(s.x, s.deck * 0.45, b),
        new Vector3(s.x, s.keel + 0.04, b * 0.55),
      ];
    });
    const geo = stitch(rings);
    const mat = new MeshStandardMaterial({ color: HULL, roughness: 0.62, metalness: 0.02 });
    const mesh = new Mesh(geo, mat);
    const stripe = new Mesh(
      new CylinderGeometry(0.02, 0.02, 3.4, 5),
      new MeshStandardMaterial({ color: STRIPE, roughness: 0.5 }),
    );
    stripe.rotation.z = Math.PI / 2;
    stripe.position.set(0, 0.34, 0.62);
    mesh.add(stripe);
    const stripe2 = stripe.clone();
    stripe2.position.z = -0.62;
    mesh.add(stripe2);
    return mesh;
  }

  private deckMesh(): Mesh {
    const geo = new BufferGeometry();
    const positions = new Float32Array([
      1.7, 0.36, 0,
      0.4, 0.42, -0.42,
      0.4, 0.42, 0.42,
      -1.5, 0.34, -0.28,
      -1.5, 0.34, 0.28,
      -0.2, 0.4, 0,
    ]);
    const indices = [0, 1, 2, 1, 3, 5, 2, 5, 4, 1, 5, 2, 3, 4, 5];
    geo.setAttribute('position', new BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return new Mesh(geo, new MeshStandardMaterial({ color: DECK, roughness: 0.7 }));
  }
}

function stitch(rings: Vector3[][]): BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const cols = rings[0].length;
  rings.forEach((ring) => {
    ring.forEach((p) => positions.push(p.x, p.y, p.z));
  });
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * cols + j;
      const b = i * cols + ((j + 1) % cols);
      const c = (i + 1) * cols + j;
      const d = (i + 1) * cols + ((j + 1) % cols);
      indices.push(a, c, b, b, c, d);
    }
  }
  const bow = 0;
  for (let j = 1; j < cols - 1; j++) indices.push(bow, j + 1, j);
  const stern = (rings.length - 1) * cols;
  for (let j = 1; j < cols - 1; j++) indices.push(stern, stern + j, stern + j + 1);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function centerboard(): Mesh {
  const geo = new BufferGeometry();
  geo.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([
      0.15, -0.05, 0,
      -0.55, -0.05, 0,
      -0.15, -0.72, 0,
    ]), 3),
  );
  geo.setIndex([0, 1, 2]);
  geo.computeVertexNormals();
  return new Mesh(geo, new MeshStandardMaterial({ color: '#d7dde4', side: DoubleSide, roughness: 0.4, metalness: 0.2 }));
}

function sailGeometry(cols: number, rows: number): BufferGeometry {
  const geo = new BufferGeometry();
  const count = (cols + 1) * (rows + 1);
  geo.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
  const indices: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c;
      indices.push(a, a + 1, a + cols + 1, a + 1, a + cols + 2, a + cols + 1);
    }
  }
  geo.setIndex(indices);
  return geo;
}

function makeTelltales(parent: Mesh): Mesh[] {
  const list: Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const geo = new BufferGeometry();
    geo.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([0, 0, 0, 0.22, 0.02, 0, 0.22, -0.02, 0]), 3),
    );
    geo.setIndex([0, 1, 2]);
    geo.computeVertexNormals();
    const color = i % 2 === 0 ? '#e23b3b' : '#2f9e44';
    const mesh = new Mesh(geo, new MeshBasicMaterial({ color, side: DoubleSide }));
    parent.add(mesh);
    list.push(mesh);
  }
  return list;
}

function makeSailor(): Group {
  const g = new Group();
  const suit = new MeshStandardMaterial({ color: '#1c2430', roughness: 0.8 });
  const vest = new MeshStandardMaterial({ color: '#f2c14e', roughness: 0.6 });
  const torso = new Mesh(new CylinderGeometry(0.11, 0.13, 0.42, 8), suit);
  torso.position.y = 0.42;
  const life = new Mesh(new CylinderGeometry(0.13, 0.15, 0.28, 8), vest);
  life.position.y = 0.48;
  const head = new Mesh(new SphereGeometry(0.1, 8, 8), new MeshStandardMaterial({ color: '#e6c2a2', roughness: 0.7 }));
  head.position.y = 0.74;
  const leg = new Mesh(new CylinderGeometry(0.045, 0.05, 0.4, 6), suit);
  leg.position.set(0.08, 0.12, 0.05);
  leg.rotation.z = 0.5;
  const leg2 = leg.clone();
  leg2.position.z = -0.05;
  g.add(torso, life, head, leg, leg2);
  return g;
}

function shadowTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.35)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new CanvasTexture(c);
  return tex;
}
