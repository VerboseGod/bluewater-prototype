import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
} from 'three';
import type { HarbourState } from '../dock/session';
import { BREAKWATER_E, BREAKWATER_N, BUOY, CLEAT, FINGER, PONTOON, bowOf } from '../dock/layout';

const DECK = new MeshStandardMaterial({ color: '#b7c0c4', roughness: 0.72, metalness: 0.08 });
const EDGE = new MeshStandardMaterial({ color: '#5e6d76', roughness: 0.6, metalness: 0.12 });
const PILE = new MeshStandardMaterial({ color: '#2c3338', roughness: 0.8 });
const RUBBER = new MeshStandardMaterial({ color: '#1c242c', roughness: 0.55 });
const ROCK = new MeshStandardMaterial({ color: '#3e4a46', roughness: 0.92 });
const BUOY_RED = new MeshStandardMaterial({ color: '#d24b3e', roughness: 0.45 });
const BUOY_WHITE = new MeshStandardMaterial({ color: '#f4f7f8', roughness: 0.4 });
const METAL = new MeshStandardMaterial({ color: '#d5dde2', roughness: 0.35, metalness: 0.7 });
const AMBER = new MeshStandardMaterial({
  color: '#ffb703',
  emissive: new Color('#ffb703'),
  emissiveIntensity: 0.55,
  roughness: 0.4,
});

function pontoonBox(minX: number, maxX: number, minY: number, maxY: number, top: number, depth: number): Group {
  const g = new Group();
  const w = maxX - minX;
  const d = maxY - minY;
  const deck = new Mesh(new BoxGeometry(w, depth, d), DECK);
  deck.position.set((minX + maxX) / 2, top - depth / 2, (minY + maxY) / 2);
  const skirt = new Mesh(new BoxGeometry(w + 0.08, 0.28, d + 0.08), EDGE);
  skirt.position.set((minX + maxX) / 2, top - depth - 0.08, (minY + maxY) / 2);
  g.add(deck, skirt);
  return g;
}

function piles(minX: number, maxX: number, minY: number, maxY: number): Group {
  const g = new Group();
  const geo = new CylinderGeometry(0.09, 0.11, 2.4, 7);
  const spots: [number, number][] = [
    [minX + 0.4, minY + 0.35],
    [minX + 0.4, maxY - 0.35],
    [maxX - 0.4, minY + 0.35],
    [maxX - 0.4, maxY - 0.35],
  ];
  const step = Math.max(2.4, (maxX - minX) / 6);
  for (let x = minX + step; x < maxX - 0.6; x += step) {
    spots.push([x, minY + 0.35], [x, maxY - 0.35]);
  }
  for (const [x, z] of spots) {
    const p = new Mesh(geo, PILE);
    p.position.set(x, -0.55, z);
    g.add(p);
  }
  return g;
}

function fenders(): Group {
  const g = new Group();
  const geo = new SphereGeometry(0.2, 10, 8);
  for (let x = PONTOON.minX + 0.8; x < FINGER.minX - 0.4; x += 1.35) {
    const f = new Mesh(geo, RUBBER);
    f.scale.set(1, 0.85, 1);
    f.position.set(x, 0.22, PONTOON.minY - 0.02);
    g.add(f);
  }
  return g;
}

function line(color: string): Line {
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(6), 3));
  const mesh = new Line(geo, new LineBasicMaterial({ color }));
  mesh.frustumCulled = false;
  mesh.visible = false;
  return mesh;
}

export class HarbourView {
  readonly group = new Group();
  private buoy: Group;
  private rode: Line;
  private warp: Line;

  constructor() {
    this.group.add(pontoonBox(PONTOON.minX, PONTOON.maxX, PONTOON.minY, PONTOON.maxY, 0.72, 0.22));
    this.group.add(pontoonBox(FINGER.minX, FINGER.maxX, FINGER.minY, FINGER.maxY, 0.66, 0.18));
    this.group.add(piles(PONTOON.minX, PONTOON.maxX, PONTOON.minY, PONTOON.maxY));
    this.group.add(fenders());

    const north = new Mesh(
      new BoxGeometry(BREAKWATER_N.maxX - BREAKWATER_N.minX, 1.15, BREAKWATER_N.maxY - BREAKWATER_N.minY),
      ROCK,
    );
    north.position.set(
      (BREAKWATER_N.minX + BREAKWATER_N.maxX) / 2,
      0.35,
      (BREAKWATER_N.minY + BREAKWATER_N.maxY) / 2,
    );
    const east = new Mesh(
      new BoxGeometry(BREAKWATER_E.maxX - BREAKWATER_E.minX, 1.05, BREAKWATER_E.maxY - BREAKWATER_E.minY),
      ROCK,
    );
    east.position.set(
      (BREAKWATER_E.minX + BREAKWATER_E.maxX) / 2,
      0.28,
      (BREAKWATER_E.minY + BREAKWATER_E.maxY) / 2,
    );
    this.group.add(north, east);

    const pad = new Mesh(
      new BoxGeometry(3.4, 0.02, 1.5),
      new MeshBasicMaterial({ color: '#ffb703', transparent: true, opacity: 0.28, depthWrite: false }),
    );
    pad.position.set(CLEAT.x, 0.03, PONTOON.minY - 0.9);
    this.group.add(pad);

    const post = new Mesh(new CylinderGeometry(0.035, 0.045, 1.15, 6), METAL);
    post.position.set(CLEAT.x, 0.85, CLEAT.y - 0.12);
    const lamp = new Mesh(new SphereGeometry(0.09, 8, 8), AMBER);
    lamp.position.set(CLEAT.x, 1.48, CLEAT.y - 0.12);
    const horn = new Mesh(new BoxGeometry(0.28, 0.06, 0.08), METAL);
    horn.position.set(CLEAT.x, 0.55, CLEAT.y - 0.05);
    this.group.add(post, lamp, horn);

    this.buoy = new Group();
    const body = new Mesh(new SphereGeometry(BUOY.r, 16, 12), BUOY_RED);
    body.scale.set(1, 0.82, 1);
    body.position.y = 0.28;
    const band = new Mesh(new CylinderGeometry(BUOY.r * 0.92, BUOY.r * 0.92, 0.16, 14), BUOY_WHITE);
    band.position.y = 0.32;
    const top = new Mesh(new ConeGeometry(0.08, 0.38, 5), METAL);
    top.position.y = 0.85;
    this.buoy.add(body, band, top);
    this.buoy.position.set(BUOY.x, 0, BUOY.y);
    this.group.add(this.buoy);

    this.rode = line('#f0e6cf');
    this.warp = line('#9ef0b0');
    this.group.add(this.rode, this.warp);
  }

  update(state: HarbourState): void {
    this.buoy.position.y = Math.sin(state.time * 1.3) * 0.05;
    const bow = bowOf(state.x, state.y, state.heading);
    this.setLine(this.rode, bow.x, 0.45, bow.y, state.anchorX, 0.02, state.anchorY, state.anchorDown);
    this.setLine(this.warp, state.fairX, 0.4, state.fairY, CLEAT.x, 0.55, CLEAT.y - 0.05, state.moored);
    const mat = this.rode.material as LineBasicMaterial;
    mat.color.set(state.anchorHeld ? '#9ef0b0' : '#e7d7b0');
  }

  private setLine(mesh: Line, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, show: boolean): void {
    const attr = mesh.geometry.getAttribute('position') as BufferAttribute;
    attr.setXYZ(0, x1, y1, z1);
    attr.setXYZ(1, x2, y2, z2);
    attr.needsUpdate = true;
    mesh.visible = show;
  }
}
