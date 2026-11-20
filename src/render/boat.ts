import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { SimSnapshot } from '../../core/sim/sim';
import { sailPoint } from './sail-mesh';
import { tillerYaw } from './tiller';

const HULL = new Color('#f5f7f8');
const DECK = new Color('#ebe6dc');
const COCKPIT = new Color('#c5ced4');
const RAIL = new Color('#d6453a');
const METAL = new Color('#d5dbe2');
const WOOD = new Color('#8d5a34');
const SUIT = new Color('#1a2330');
const VEST = new Color('#f0c14a');
const CREW_VEST = new Color('#2f8fb5');
const SKIN = new Color('#e2b89a');

/**
 * Procedural ILCA-style dinghy. Original geometry written for this project;
 * no third-party mesh.
 */
export class DinghyView {
  readonly group = new Group();
  private sail: Mesh;
  private sailGeo: BufferGeometry;
  private boom: Group;
  private rudder: Group;
  private sailor: Group;
  private torso: Group;
  private helmBody: Group;
  private helmTorso: Group;
  private crewBody: Group;
  private crewTorso: Group;
  private vangLine: Mesh;
  private pair: { helm: number; crew: number } | null = null;
  private telltales: Mesh[] = [];
  private contact: Mesh;
  private readonly cols = 12;
  private readonly rows = 16;

  constructor() {
    const hull = this.hullMesh();
    hull.castShadow = true;
    hull.receiveShadow = true;
    this.group.add(hull);
    const deck = this.deckMesh();
    deck.castShadow = true;
    deck.receiveShadow = true;
    this.group.add(deck);
    this.group.add(cockpit());
    this.group.add(daggerboard());

    const mast = new Mesh(
      new CylinderGeometry(0.028, 0.042, 4.7, 10),
      new MeshStandardMaterial({ color: METAL, roughness: 0.32, metalness: 0.72 }),
    );
    mast.position.set(0.95, 2.75, 0);
    mast.castShadow = true;
    this.group.add(mast);

    this.boom = new Group();
    const boomMesh = new Mesh(
      new CylinderGeometry(0.022, 0.028, 2.35, 8),
      new MeshStandardMaterial({ color: METAL, roughness: 0.38, metalness: 0.6 }),
    );
    boomMesh.rotation.z = Math.PI / 2;
    boomMesh.position.set(-1.15, 0, 0);
    boomMesh.castShadow = true;
    const vang = new Mesh(
      new CylinderGeometry(0.012, 0.012, 0.7, 5),
      new MeshStandardMaterial({ color: METAL, roughness: 0.4, metalness: 0.5 }),
    );
    vang.position.set(-0.45, -0.28, 0);
    vang.rotation.z = 0.55;
    this.vangLine = vang;
    this.boom.add(boomMesh, vang);
    this.boom.position.set(0.95, 0.86, 0);
    this.group.add(this.boom);

    this.sailGeo = sailGeometry(this.cols, this.rows);
    this.sail = new Mesh(
      this.sailGeo,
      new MeshStandardMaterial({
        map: sailCloth(),
        color: '#fbf7f0',
        roughness: 0.72,
        metalness: 0,
        side: DoubleSide,
        envMapIntensity: 0.12,
      }),
    );
    this.sail.castShadow = true;
    this.group.add(this.sail);
    this.telltales = makeTelltales(this.sail);

    const sailor = makeSailor();
    this.sailor = sailor.root;
    this.torso = sailor.torso;
    this.group.add(this.sailor);
    const helm = makeSailor(VEST);
    const crew = makeSailor(CREW_VEST);
    this.helmBody = helm.root;
    this.helmTorso = helm.torso;
    this.crewBody = crew.root;
    this.crewTorso = crew.torso;
    this.helmBody.visible = false;
    this.crewBody.visible = false;
    this.group.add(this.helmBody, this.crewBody);

    this.rudder = new Group();
    this.rudder.add(rudderBlade(), tiller(), hikingStick());
    this.rudder.position.set(-2.02, 0.32, 0);
    this.group.add(this.rudder);

    this.contact = new Mesh(
      new CircleGeometry(1.25, 20),
      new MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
    );
    this.contact.rotation.x = -Math.PI / 2;
    this.contact.position.y = -0.05;
    this.contact.renderOrder = 1;
    this.group.add(this.contact);

    const vane = new Mesh(
      new CylinderGeometry(0.01, 0.035, 0.38, 4),
      new MeshStandardMaterial({ color: '#ff4d3a', roughness: 0.4 }),
    );
    vane.rotation.z = Math.PI / 2;
    vane.position.set(-0.14, 0, 0);
    const vanePivot = new Group();
    vanePivot.name = 'windex';
    vanePivot.position.set(0.9, 5.18, 0);
    vanePivot.add(vane);
    this.group.add(vanePivot);
  }

  setContactShadow(on: boolean): void {
    this.contact.visible = on;
  }

  /** Two bodies for co-op. Null keeps the single sailor on the combined weight. */
  setPair(helm: number | null, crew: number | null): void {
    this.pair = helm === null || crew === null ? null : { helm, crew };
  }

  /** Null leaves the kicker the colour it was built with. */
  setVang(tight: number | null): void {
    const mat = this.vangLine.material;
    if (!(mat instanceof MeshStandardMaterial)) return;
    mat.color.set(tight === null ? METAL : tight > 0.5 ? '#d6453a' : '#c5ced4');
  }

  update(s: SimSnapshot, rudderCmd: number): void {
    this.boom.rotation.y = -s.boom;
    this.rudder.rotation.y = tillerYaw(rudderCmd);
    this.shapeSail(s);
    const windex = this.group.getObjectByName('windex');
    if (windex) {
      const target = -s.awa;
      let d = target - windex.rotation.y;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      windex.rotation.y += d * 0.12;
    }
    // Crew is starboard-positive. Mesh +z is the positive-awa side, so the pose flips it.
    // Out on the rail the torso hikes; sitting in or to leeward stays nearer the cockpit.
    if (this.pair && !s.capsized) {
      this.sailor.visible = false;
      this.poseSailor(this.helmBody, this.helmTorso, this.pair.helm, -0.85);
      this.poseSailor(this.crewBody, this.crewTorso, this.pair.crew, 0.2);
    } else {
      this.helmBody.visible = false;
      this.crewBody.visible = false;
      this.poseSailor(this.sailor, this.torso, s.crew, -0.15);
      this.sailor.visible = !s.capsized;
    }
  }

  private poseSailor(root: Group, torso: Group, starboard: number, along: number): void {
    const meshZ = -starboard;
    const mag = Math.abs(meshZ);
    const side = Math.sign(meshZ || 1);
    const hikeAmt = Math.max(0, Math.min(1, (mag - 0.18) / 0.84));
    root.position.set(along, 0.42, side * mag * (0.88 / 1.02));
    root.rotation.x = 0;
    root.rotation.z = -side * hikeAmt * 0.95;
    torso.rotation.z = -side * hikeAmt * 0.28;
    root.visible = true;
  }

  private shapeSail(s: SimSnapshot): void {
    const pos = this.sailGeo.getAttribute('position') as BufferAttribute;
    let n = 0;
    for (let r = 0; r <= this.rows; r++) {
      const v = r / this.rows;
      for (let c = 0; c <= this.cols; c++) {
        const u = c / this.cols;
        const p = sailPoint(u, v, s.boom, s.sheet, s.sail, s.time);
        pos.setXYZ(n, p.x, p.y, p.z);
        n++;
      }
    }
    pos.needsUpdate = true;
    this.sailGeo.computeVertexNormals();
    const tack = sailPoint(0, 0, s.boom, s.sheet, s.sail, s.time);
    const clew = sailPoint(1, 0, s.boom, s.sheet, s.sail, s.time);
    const head = sailPoint(0, 1, s.boom, s.sheet, s.sail, s.time);
    this.placeTelltales(s, new Vector3(tack.x, tack.y, tack.z), new Vector3(clew.x, clew.y, clew.z), new Vector3(head.x, head.y, head.z));
  }

  private placeTelltales(s: SimSnapshot, tack: Vector3, clew: Vector3, head: Vector3): void {
    const spots = [0.28, 0.48, 0.68];
    const windwardLift = s.aoa < 0.14 ? 0.85 : 0.05;
    const leewardLift = s.aoa > 0.46 ? 0.85 : 0.05;
    const flutter = (s.sail === 'luffing' || s.sail === 'stalled' ? 1 : 0.15) * Math.sin(s.time * 16);
    const side = -Math.sign(s.boom || s.awa || 1);
    spots.forEach((v, i) => {
      const foot = tack.clone().lerp(clew, 0.18);
      const p = foot.clone().lerp(head, v);
      const wind = this.telltales[i * 2];
      const lee = this.telltales[i * 2 + 1];
      wind.position.copy(p).add(new Vector3(-0.02, 0, side * 0.05));
      lee.position.copy(p).add(new Vector3(-0.02, 0, -side * 0.05));
      wind.rotation.z = -0.35 - windwardLift * 1.15 + flutter * windwardLift;
      lee.rotation.z = -0.35 - leewardLift * 1.15 - flutter * leewardLift;
    });
  }

  private hullMesh(): Mesh {
    const stations = [
      { x: 2.12, beam: 0.015, deck: 0.3, keel: 0.16 },
      { x: 1.82, beam: 0.18, deck: 0.38, keel: 0.05 },
      { x: 1.45, beam: 0.38, deck: 0.42, keel: -0.02 },
      { x: 1.05, beam: 0.54, deck: 0.43, keel: -0.08 },
      { x: 0.6, beam: 0.64, deck: 0.41, keel: -0.12 },
      { x: 0.1, beam: 0.68, deck: 0.39, keel: -0.135 },
      { x: -0.4, beam: 0.66, deck: 0.37, keel: -0.12 },
      { x: -0.9, beam: 0.56, deck: 0.35, keel: -0.06 },
      { x: -1.35, beam: 0.5, deck: 0.34, keel: -0.01 },
      { x: -1.75, beam: 0.46, deck: 0.33, keel: 0.02 },
      { x: -2.12, beam: 0.4, deck: 0.32, keel: 0.05 },
    ];
    const rings = stations.map((s) => section(s.x, s.beam, s.keel, s.deck));
    const geo = stitch(rings);
    const mesh = new Mesh(
      geo,
      new MeshPhysicalMaterial({
        color: HULL,
        roughness: 0.36,
        metalness: 0.02,
        clearcoat: 0.62,
        clearcoatRoughness: 0.16,
        envMapIntensity: 0.9,
      }),
    );
    mesh.add(rubRail(stations, 1), rubRail(stations, -1));
    return mesh;
  }

  private deckMesh(): Mesh {
    const geo = new BufferGeometry();
    const positions = new Float32Array([
      1.9, 0.4, 0,
      1.15, 0.44, -0.36,
      1.15, 0.44, 0.36,
      0.35, 0.42, -0.42,
      0.35, 0.42, 0.42,
      -1.55, 0.36, -0.22,
      -1.55, 0.36, 0.22,
      -0.15, 0.4, 0,
    ]);
    const indices = [
      0, 1, 2,
      1, 3, 7,
      2, 7, 4,
      1, 7, 2,
      3, 5, 7,
      4, 7, 6,
    ];
    geo.setAttribute('position', new BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return new Mesh(
      geo,
      new MeshStandardMaterial({ color: DECK, roughness: 0.72, metalness: 0, envMapIntensity: 0.25 }),
    );
  }
}

function section(x: number, beam: number, keel: number, deck: number): Vector3[] {
  const b = Math.max(beam, 0.012);
  const bilge = keel + (deck - keel) * 0.42;
  return [
    new Vector3(x, keel, 0),
    new Vector3(x, keel + 0.02, -b * 0.42),
    new Vector3(x, bilge * 0.65 + keel * 0.35, -b * 0.82),
    new Vector3(x, bilge, -b),
    new Vector3(x, deck * 0.72 + bilge * 0.28, -b * 0.94),
    new Vector3(x, deck, -b * 0.7),
    new Vector3(x, deck + 0.018, -b * 0.22),
    new Vector3(x, deck + 0.018, b * 0.22),
    new Vector3(x, deck, b * 0.7),
    new Vector3(x, deck * 0.72 + bilge * 0.28, b * 0.94),
    new Vector3(x, bilge, b),
    new Vector3(x, bilge * 0.65 + keel * 0.35, b * 0.82),
    new Vector3(x, keel + 0.02, b * 0.42),
  ];
}

function stitch(rings: Vector3[][]): BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const cols = rings[0].length;
  rings.forEach((ring) => ring.forEach((p) => positions.push(p.x, p.y, p.z)));
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

function rubRail(stations: { x: number; beam: number; deck: number }[], side: number): Mesh {
  const geo = new BufferGeometry();
  const positions: number[] = [];
  const indices: number[] = [];
  stations.forEach((s, i) => {
    const y = s.deck * 0.78;
    const z = side * s.beam * 0.98;
    positions.push(s.x, y, z, s.x, y + 0.025, z + side * 0.01);
    if (i > 0) {
      const a = (i - 1) * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  geo.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return new Mesh(geo, new MeshStandardMaterial({ color: RAIL, roughness: 0.5 }));
}

function cockpit(): Mesh {
  const geo = new BufferGeometry();
  geo.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([
      0.15, 0.4, -0.28,
      0.15, 0.4, 0.28,
      -1.15, 0.36, -0.22,
      -1.15, 0.36, 0.22,
      0.05, 0.3, -0.18,
      0.05, 0.3, 0.18,
      -1.0, 0.28, -0.14,
      -1.0, 0.28, 0.14,
    ]), 3),
  );
  geo.setIndex([
    0, 4, 1, 1, 4, 5,
    1, 5, 3, 3, 5, 7,
    3, 7, 2, 2, 7, 6,
    2, 6, 0, 0, 6, 4,
    4, 6, 5, 5, 6, 7,
  ]);
  geo.computeVertexNormals();
  return new Mesh(geo, new MeshStandardMaterial({ color: COCKPIT, roughness: 0.92 }));
}

function daggerboard(): Mesh {
  const shape = new Shape();
  shape.moveTo(0.2, -0.02);
  shape.lineTo(-0.32, -0.02);
  shape.quadraticCurveTo(-0.5, -0.4, -0.12, -0.86);
  shape.lineTo(0.06, -0.5);
  shape.closePath();
  const geo = new ExtrudeGeometry(shape, {
    depth: 0.03,
    bevelEnabled: true,
    bevelSize: 0.006,
    bevelThickness: 0.004,
    bevelSegments: 1,
  });
  geo.translate(0.15, 0, -0.015);
  const mesh = new Mesh(
    geo,
    new MeshStandardMaterial({ color: '#e4e8ee', roughness: 0.35, metalness: 0.25, side: DoubleSide }),
  );
  return mesh;
}

function rudderBlade(): Mesh {
  const shape = new Shape();
  shape.moveTo(0.05, 0.05);
  shape.lineTo(-0.06, 0.05);
  shape.lineTo(-0.08, -0.55);
  shape.lineTo(0.02, -0.48);
  shape.closePath();
  const geo = new ExtrudeGeometry(shape, { depth: 0.018, bevelEnabled: false });
  geo.translate(0, 0, -0.009);
  return new Mesh(geo, new MeshStandardMaterial({ color: WOOD, roughness: 0.55, side: DoubleSide }));
}

function tiller(): Mesh {
  const mesh = new Mesh(
    new CylinderGeometry(0.016, 0.016, 0.78, 6),
    new MeshStandardMaterial({ color: WOOD, roughness: 0.5 }),
  );
  mesh.rotation.z = Math.PI / 2;
  mesh.position.set(0.36, 0.16, 0);
  return mesh;
}

function hikingStick(): Mesh {
  const mesh = new Mesh(
    new CylinderGeometry(0.01, 0.01, 0.95, 5),
    new MeshStandardMaterial({ color: WOOD, roughness: 0.5 }),
  );
  mesh.rotation.z = 1.05;
  mesh.position.set(0.78, 0.42, 0);
  return mesh;
}

function sailGeometry(cols: number, rows: number): BufferGeometry {
  const geo = new BufferGeometry();
  const count = (cols + 1) * (rows + 1);
  geo.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
  const uv = new Float32Array(count * 2);
  let n = 0;
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      uv[n * 2] = c / cols;
      uv[n * 2 + 1] = r / rows;
      n++;
    }
  }
  geo.setAttribute('uv', new BufferAttribute(uv, 2));
  const indices: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c;
      indices.push(a, a + cols + 1, a + 1, a + 1, a + cols + 1, a + cols + 2);
    }
  }
  geo.setIndex(indices);
  return geo;
}

function sailCloth(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const g = c.getContext('2d');
  if (!g) {
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    return tex;
  }
  g.fillStyle = '#f4f0e6';
  g.fillRect(0, 0, 512, 512);
  const cloth = g.createLinearGradient(0, 0, 512, 512);
  cloth.addColorStop(0, 'rgba(255,255,255,0.35)');
  cloth.addColorStop(1, 'rgba(180,170,150,0.18)');
  g.fillStyle = cloth;
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(60,50,40,0.08)';
  g.lineWidth = 2;
  for (let y = 40; y < 512; y += 46) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(512, y + 8);
    g.stroke();
  }
  g.fillStyle = 'rgba(150, 196, 206, 0.55)';
  g.fillRect(250, 250, 120, 78);
  g.strokeStyle = 'rgba(40,40,40,0.25)';
  g.strokeRect(250, 250, 120, 78);
  g.fillStyle = '#c4372f';
  g.beginPath();
  g.arc(120, 300, 36, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#f4f0e6';
  g.font = 'bold 54px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('7', 120, 302);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeTelltales(parent: Mesh): Mesh[] {
  const list: Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const geo = new BufferGeometry();
    geo.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([0, 0, 0, 0.18, 0.015, 0, 0.18, -0.015, 0]), 3),
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

function makeSailor(vestColor: Color = VEST): { root: Group; torso: Group } {
  const root = new Group();
  const suit = new MeshStandardMaterial({ color: SUIT, roughness: 0.8 });
  const vestMat = new MeshStandardMaterial({ color: vestColor, roughness: 0.55 });
  const skin = new MeshStandardMaterial({ color: SKIN, roughness: 0.7 });

  const thigh = (z: number) => {
    const m = new Mesh(new CylinderGeometry(0.05, 0.045, 0.36, 6), suit);
    m.position.set(0.12, 0.16, z);
    m.rotation.z = 1.15;
    m.castShadow = true;
    return m;
  };
  const shin = (z: number) => {
    const m = new Mesh(new CylinderGeometry(0.04, 0.038, 0.32, 6), suit);
    m.position.set(0.32, 0.08, z);
    m.rotation.z = 0.15;
    m.castShadow = true;
    return m;
  };
  root.add(thigh(0.07), thigh(-0.07), shin(0.08), shin(-0.08));

  const torso = new Group();
  const chest = new Mesh(new CylinderGeometry(0.11, 0.13, 0.4, 8), suit);
  chest.position.y = 0.22;
  chest.castShadow = true;
  const vest = new Mesh(new CylinderGeometry(0.125, 0.145, 0.28, 8), vestMat);
  vest.position.y = 0.26;
  const head = new Mesh(new SphereGeometry(0.1, 10, 8), skin);
  head.position.y = 0.52;
  head.castShadow = true;
  const cap = new Mesh(new SphereGeometry(0.105, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), vestMat);
  cap.position.y = 0.54;
  const brim = new Mesh(new CylinderGeometry(0.12, 0.12, 0.02, 8), vestMat);
  brim.position.set(0.06, 0.5, 0);
  const arm = new Mesh(new CylinderGeometry(0.035, 0.032, 0.36, 6), suit);
  arm.position.set(0.16, 0.18, 0.14);
  arm.rotation.z = 0.8;
  const arm2 = arm.clone();
  arm2.position.z = -0.16;
  torso.add(chest, vest, head, cap, brim, arm, arm2);
  torso.position.y = 0.28;
  root.add(torso);
  return { root, torso };
}

function shadowTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32);
    grad.addColorStop(0, 'rgba(0,0,0,0.28)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  return new CanvasTexture(c);
}
