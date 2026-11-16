import {
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
} from 'three';
import { sampleWater } from '../sim/water';

/** Distant shore and a few racing marks, for scale. Original geometry. */
export function makeCoast(): Group {
  const root = new Group();
  root.add(shore(0, 300, 1800, 520, 0.007, '#234232'));
  root.add(shore(620, 140, 460, 360, 0.018, '#2c4a38'));
  root.add(shore(-520, 200, 500, 340, 0.015, '#1c3a2c'));
  return root;
}

function shore(x: number, nearZ: number, width: number, depth: number, freq: number, color: string): Mesh {
  const segX = 48;
  const segZ = 16;
  const geo = new PlaneGeometry(width, depth, segX, segZ);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const lz = pos.getZ(i);
    const inland = (lz + depth / 2) / depth;
    const ridge =
      Math.sin(lx * freq) * 16 +
      Math.sin(lx * freq * 2.4 + 1.1) * 7 +
      Math.sin(lx * freq * 0.35) * 22;
    const beach = inland < 0.07 ? inland / 0.07 : 1;
    const h = Math.max(0, Math.pow(Math.max(0, inland), 1.2) * (10 + ridge) * beach);
    pos.setY(i, h);
  }
  geo.computeVertexNormals();
  const mesh = new Mesh(
    geo,
    new MeshStandardMaterial({ color: new Color(color), roughness: 1, metalness: 0 }),
  );
  mesh.position.set(x, 0, nearZ + depth / 2);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

interface Mark {
  x: number;
  z: number;
  mesh: Group;
}

const OPEN_MARKS: [number, number][] = [
  [18, 14],
  [42, -22],
  [-26, 30],
  [78, 10],
  [8, -36],
];

export class Marks {
  readonly group = new Group();
  private marks: Mark[] = [];

  constructor() {
    this.setCourse(null);
  }

  /** Replace the buoys. Null puts the open-water set back. */
  setCourse(spots: [number, number][] | null): void {
    for (const mark of this.marks) this.group.remove(mark.mesh);
    this.marks = [];
    for (const [x, z] of spots ?? OPEN_MARKS) {
      const mesh = makeBuoy();
      mesh.position.set(x, 0, z);
      this.group.add(mesh);
      this.marks.push({ x, z, mesh });
    }
  }

  update(time: number, swell: (x: number, z: number) => number): void {
    for (const m of this.marks) {
      const h = sampleWater(m.x, m.z, time, true, 4).height + swell(m.x, m.z);
      m.mesh.position.y = h;
      m.mesh.rotation.z = Math.sin(time * 1.2 + m.x) * 0.06;
      m.mesh.rotation.x = Math.cos(time * 0.9 + m.z) * 0.04;
    }
  }
}

function makeBuoy(): Group {
  const g = new Group();
  const hull = new Mesh(
    new SphereGeometry(0.42, 14, 10),
    new MeshStandardMaterial({ color: '#ff6a1a', roughness: 0.45, metalness: 0.05 }),
  );
  hull.scale.y = 0.72;
  hull.position.y = 0.28;
  const band = new Mesh(
    new CylinderGeometry(0.44, 0.44, 0.08, 14),
    new MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.5 }),
  );
  band.position.y = 0.32;
  const spar = new Mesh(
    new CylinderGeometry(0.025, 0.03, 1.5, 6),
    new MeshStandardMaterial({ color: '#f7f7f4', roughness: 0.6 }),
  );
  spar.position.y = 1.05;
  const flagGeo = new PlaneGeometry(0.38, 0.22);
  flagGeo.translate(0.2, 0, 0);
  const flag = new Mesh(
    flagGeo,
    new MeshStandardMaterial({ color: '#ffe14a', roughness: 0.7, side: 2 }),
  );
  flag.position.y = 1.7;
  g.add(hull, band, spar, flag);
  return g;
}
