import {
  Color,
  DoubleSide,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
  Vector4,
} from 'three';
import { WAVES } from '../sim/water';
import type { Gust } from '../sim/wind';

const VERT = /* glsl */ `
uniform float uTime;
uniform int uWaves;
uniform vec4 uWaveA[4];
uniform vec4 uWaveB[4];
varying vec3 vWorld;
varying float vHeight;

float omega(float k, float speed) {
  return sqrt(9.81 * k) * 0.55 + speed * 0.15;
}

float heightAt(vec2 p) {
  float h = 0.0;
  for (int i = 0; i < 4; i++) {
    float use = float(i < uWaves);
    float k = 6.2831853 / max(uWaveA[i].w, 0.001);
    float ph = k * dot(uWaveA[i].xy, p) + uWaveB[i].z - omega(k, uWaveB[i].y) * uTime;
    h += use * uWaveA[i].z * sin(ph);
  }
  return h;
}

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  float h = heightAt(world.xz);
  world.y += h;
  vWorld = world.xyz;
  vHeight = h;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSun;
uniform vec3 uHorizon;
uniform int uGusts;
uniform vec4 uGust[6];
varying vec3 vWorld;
varying float vHeight;

void main() {
  vec3 dx = dFdx(vWorld);
  vec3 dy = dFdy(vWorld);
  vec3 n = normalize(cross(dx, dy));
  vec3 viewDir = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
  float hMix = clamp(vHeight * 6.0 + 0.45, 0.0, 1.0);
  vec3 col = mix(uDeep, uShallow, hMix);
  col = mix(col, uHorizon, fres * 0.55);
  vec3 halfV = normalize(uSun + viewDir);
  float spec = pow(max(dot(n, halfV), 0.0), 90.0);
  col += spec * vec3(1.0, 0.96, 0.88) * 0.85;
  float gust = 0.0;
  for (int i = 0; i < 6; i++) {
    float use = float(i < uGusts);
    float d = distance(vWorld.xz, uGust[i].xy);
    float radius = max(uGust[i].z, 0.001);
    float w = 1.0 - smoothstep(radius * 0.25, radius, d);
    gust += use * w * uGust[i].w;
  }
  col *= 1.0 - clamp(gust, 0.0, 1.0) * 0.38;
  col = mix(col, vec3(0.05, 0.16, 0.2), clamp(gust, 0.0, 1.0) * 0.25);
  float foam = smoothstep(0.07, 0.16, vHeight);
  col = mix(col, vec3(0.86, 0.95, 0.96), foam * 0.55);
  gl_FragColor = vec4(col, 1.0);
}
`;

export class Ocean {
  readonly mesh: Mesh;
  private material: ShaderMaterial;
  private geometry: PlaneGeometry;
  segments: number;

  constructor(quality: 'performance' | 'quality') {
    this.segments = quality === 'quality' ? 160 : 96;
    this.geometry = new PlaneGeometry(420, 420, this.segments, this.segments);
    this.geometry.rotateX(-Math.PI / 2);
    const waveA = WAVES.map((w) => new Vector4(w.dirX, w.dirZ, w.amplitude, w.wavelength));
    const waveB = WAVES.map((w) => new Vector4(w.steepness, w.speed, w.phase, 0));
    this.material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uWaves: { value: quality === 'quality' ? 4 : 3 },
        uWaveA: { value: waveA },
        uWaveB: { value: waveB },
        uDeep: { value: new Color('#083246') },
        uShallow: { value: new Color('#1f8f92') },
        uHorizon: { value: new Color('#b7d5d4') },
        uSun: { value: new Vector3(0.35, 0.82, 0.28).normalize() },
        uGusts: { value: 0 },
        uGust: { value: Array.from({ length: 6 }, () => new Vector4()) },
      },
      side: DoubleSide,
    });
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
  }

  setQuality(quality: 'performance' | 'quality'): void {
    const segments = quality === 'quality' ? 160 : 96;
    if (segments !== this.segments) {
      this.segments = segments;
      this.geometry.dispose();
      this.geometry = new PlaneGeometry(420, 420, segments, segments);
      this.geometry.rotateX(-Math.PI / 2);
      this.mesh.geometry = this.geometry;
    }
    this.material.uniforms.uWaves.value = quality === 'quality' ? 4 : 3;
  }

  update(time: number, boatX: number, boatZ: number, gusts: Gust[]): void {
    const cell = 420 / this.segments;
    this.mesh.position.x = Math.round(boatX / cell) * cell;
    this.mesh.position.z = Math.round(boatZ / cell) * cell;
    this.material.uniforms.uTime.value = time;
    const packed = this.material.uniforms.uGust.value as Vector4[];
    const n = Math.min(6, gusts.length);
    this.material.uniforms.uGusts.value = n;
    for (let i = 0; i < n; i++) {
      packed[i].set(gusts[i].x, gusts[i].y, gusts[i].r, gusts[i].amp);
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
