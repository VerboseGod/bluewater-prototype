import {
  Color,
  CubeTexture,
  DoubleSide,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import { WAVES } from '../sim/water';
import type { Gust } from '../sim/wind';
import { buildGerstner, gerstnerAt, physicsChop, waveCountFor, type GerstnerWave } from './waves';

const VERT = /* glsl */ `
uniform float uTime;
uniform int uCount;
uniform vec4 uA[8];
uniform vec4 uB[8];
uniform int uPhys;
uniform vec4 uPhysA[4];
uniform vec4 uPhysB[4];
uniform int uBasinN;
uniform vec2 uBasin[48];

varying vec3 vWorld;
varying vec3 vNormal;
varying float vHeight;
varying float vFoam;
varying float vFogDepth;

vec3 gerstner(vec2 p, out vec3 n, out float foam) {
  vec3 disp = vec3(0.0);
  n = vec3(0.0, 1.0, 0.0);
  foam = 0.0;
  float count = max(float(uCount), 1.0);
  for (int i = 0; i < 8; i++) {
    float use = float(i < uCount);
    float k = 6.28318530718 / max(uA[i].w, 0.001);
    float amp = uA[i].z;
    float Q = uB[i].x / (k * max(amp, 0.0001) * count);
    float ph = k * dot(uA[i].xy, p) + uB[i].z - uB[i].y * uTime;
    float s = sin(ph);
    float c = cos(ph);
    disp.x += use * Q * amp * uA[i].x * c;
    disp.z += use * Q * amp * uA[i].y * c;
    disp.y += use * amp * s;
    float wa = k * amp;
    n.x -= use * uA[i].x * wa * c;
    n.z -= use * uA[i].y * wa * c;
    n.y -= use * Q * wa * s;
    foam += use * Q * wa * s;
  }
  for (int i = 0; i < 4; i++) {
    float use = float(i < uPhys);
    float k = 6.28318530718 / max(uPhysA[i].w, 0.001);
    float omega = sqrt(9.81 * k) * 0.55 + uPhysB[i].y * 0.15;
    float ph = k * dot(uPhysA[i].xy, p) + uPhysB[i].z - omega * uTime;
    float s = sin(ph);
    float c = cos(ph);
    disp.y += use * uPhysA[i].z * s;
    n.x -= use * uPhysA[i].x * k * uPhysA[i].z * c;
    n.z -= use * uPhysA[i].y * k * uPhysA[i].z * c;
  }
  return disp;
}

float basinShelter(vec2 p) {
  if (uBasinN < 3) return 1.0;
  bool inside = false;
  for (int i = 0; i < 48; i++) {
    if (i >= uBasinN) break;
    int j = i + 1;
    if (j >= uBasinN) j = 0;
    vec2 a = uBasin[i];
    vec2 b = uBasin[j];
    if ((a.y > p.y) != (b.y > p.y)) {
      float xint = (b.x - a.x) * (p.y - a.y) / (b.y - a.y + 1e-5) + a.x;
      if (p.x < xint) inside = !inside;
    }
  }
  return inside ? 0.2 : 1.0;
}

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vec3 n;
  float foam;
  vec3 d = gerstner(world.xz, n, foam);
  float shelter = basinShelter(world.xz);
  d *= shelter;
  foam *= shelter;
  world.x += d.x;
  world.z += d.z;
  world.y += d.y;
  vWorld = world.xyz;
  vNormal = normalize(n);
  vHeight = d.y;
  vFoam = foam;
  vec4 mv = viewMatrix * world;
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG_LOW = /* glsl */ `
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSun;
uniform vec3 uHorizon;
uniform vec2 uWind;
uniform float uTime;
uniform vec2 uBoat;
uniform float uHeading;
uniform float uSpeed;
uniform int uGusts;
uniform vec4 uGust[6];

varying vec3 vWorld;
varying vec3 vNormal;
varying float vHeight;
varying float vFoam;

#include <fog_pars_fragment>

float bwHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float bwNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = bwHash(i);
  float b = bwHash(i + vec2(1.0, 0.0));
  float c = bwHash(i + vec2(0.0, 1.0));
  float d = bwHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void bwRipple(inout vec3 n, vec3 world, float time) {
  float dist = distance(world.xz, cameraPosition.xz);
  float near = 1.0 - smoothstep(6.0, 36.0, dist);
  float amp = 0.07 + 0.2 * near;
  vec2 p = world.xz * 1.6 + vec2(time * 0.13, -time * 0.09);
  float e = 0.28;
  float h = bwNoise(p);
  n.x += (bwNoise(p + vec2(e, 0.0)) - h) / e * amp;
  n.z += (bwNoise(p + vec2(0.0, e)) - h) / e * amp;
  vec2 q = world.xz * 4.8 + vec2(-time * 0.28, time * 0.19);
  float h2 = bwNoise(q);
  n.x += (bwNoise(q + vec2(e, 0.0)) - h2) / e * amp * 0.4;
  n.z += (bwNoise(q + vec2(0.0, e)) - h2) / e * amp * 0.4;
}

float bwKelvin(vec2 worldXZ, vec2 boat, float heading, float speed, float time) {
  vec2 rel = worldXZ - boat;
  float c = cos(heading);
  float s = sin(heading);
  float fwd = rel.x * c + rel.y * s;
  float side = -rel.x * s + rel.y * c;
  float behind = max(0.0, -fwd);
  float kelvin = 0.354;
  float armDist = abs(abs(side) - behind * kelvin);
  float thick = 0.045 + behind * 0.022;
  float arm = exp(-pow(armDist / max(thick, 0.02), 2.0));
  float reach = smoothstep(0.45, 1.5, behind) * (1.0 - smoothstep(8.0, 18.0, behind));
  float inside = 1.0 - smoothstep(behind * kelvin * 0.2, behind * kelvin + 0.15, abs(side));
  float cross = pow(max(sin(behind * 2.2 - time * 1.5), 0.0), 2.0) * inside * smoothstep(1.0, 2.2, behind);
  float brk = smoothstep(0.22, 0.8, bwNoise(worldXZ * 0.7 + vec2(time * 0.17, behind * 0.05)) * 0.62 + bwNoise(worldXZ * 2.6 - vec2(time * 0.4, 0.3)) * 0.38);
  float spd = clamp(speed / 2.6, 0.0, 1.0);
  return (arm * 0.85 + cross * 0.22) * reach * brk * spd;
}

void main() {
  vec3 n = normalize(vNormal);
  bwRipple(n, vWorld, uTime);
  n = normalize(n);
  vec3 viewDir = normalize(cameraPosition - vWorld);
  float ndotv = max(dot(n, viewDir), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndotv, 5.0);
  vec3 R = reflect(-viewDir, n);
  float skyH = clamp(R.y * 1.2, 0.0, 1.0);
  vec3 sky = mix(uHorizon, vec3(0.16, 0.36, 0.66), pow(skyH, 0.6));
  float sunDot = max(dot(R, uSun), 0.0);
  sky += vec3(1.0, 0.96, 0.9) * pow(sunDot, 64.0) * 0.45;
  float hMix = clamp(vHeight * 2.2 + 0.35, 0.0, 1.0);
  vec3 water = mix(uDeep, uShallow, hMix);
  vec3 col = mix(water, sky, fres);
  vec3 H = normalize(uSun + viewDir);
  col += vec3(1.0, 0.97, 0.9) * pow(max(dot(n, H), 0.0), 96.0) * 0.55;
  vec2 rel = vWorld.xz - uBoat;
  float c = cos(uHeading);
  float s = sin(uHeading);
  float fwd = rel.x * c + rel.y * s;
  float side = -rel.x * s + rel.y * c;
  float spd = clamp(uSpeed / 3.2, 0.0, 1.0);
  float bow = smoothstep(0.8, 1.5, fwd) * (1.0 - smoothstep(1.7, 2.4, fwd));
  bow *= 1.0 - smoothstep(0.15, 0.7, abs(side));
  float crest = smoothstep(0.2, 0.5, vFoam);
  float wake = bwKelvin(vWorld.xz, uBoat, uHeading, uSpeed, uTime);
  col = mix(col, vec3(0.86, 0.93, 0.94), clamp(crest * 0.45 + bow * spd * 0.35 + wake, 0.0, 0.72));
  float gust = 0.0;
  for (int i = 0; i < 6; i++) {
    float use = float(i < uGusts);
    float d = distance(vWorld.xz, uGust[i].xy);
    float radius = max(uGust[i].z, 0.001);
    gust += use * (1.0 - smoothstep(radius * 0.2, radius, d)) * uGust[i].w;
  }
  col *= 1.0 - clamp(gust, 0.0, 1.0) * 0.28;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

const FRAG = /* glsl */ `
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uScatter;
uniform vec3 uSun;
uniform vec3 uHorizon;
uniform samplerCube uEnv;
uniform vec2 uWind;
uniform float uTime;
uniform vec2 uBoat;
uniform float uHeading;
uniform float uSpeed;
uniform int uWakeN;
uniform vec4 uWake[8];
uniform int uGusts;
uniform vec4 uGust[6];
uniform float uFoamScale;
uniform float uEnvMix;

varying vec3 vWorld;
varying vec3 vNormal;
varying float vHeight;
varying float vFoam;

#include <fog_pars_fragment>

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float bwNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float bwKelvin(vec2 worldXZ, vec2 boat, float heading, float speed, float time) {
  vec2 rel = worldXZ - boat;
  float c = cos(heading);
  float s = sin(heading);
  float fwd = rel.x * c + rel.y * s;
  float side = -rel.x * s + rel.y * c;
  float behind = max(0.0, -fwd);
  float kelvin = 0.354;
  float armDist = abs(abs(side) - behind * kelvin);
  float thick = 0.04 + behind * 0.02;
  float arm = exp(-pow(armDist / max(thick, 0.02), 2.0));
  float reach = smoothstep(0.4, 1.4, behind) * (1.0 - smoothstep(9.0, 22.0, behind));
  float inside = 1.0 - smoothstep(behind * kelvin * 0.15, behind * kelvin + 0.12, abs(side));
  float cross = pow(max(sin(behind * 2.4 - time * 1.6), 0.0), 2.0) * inside * smoothstep(0.8, 2.0, behind);
  float brk = smoothstep(0.2, 0.82, bwNoise(worldXZ * 0.85 + vec2(time * 0.2, behind * 0.04)) * 0.6 + bwNoise(worldXZ * 3.1 - vec2(time * 0.45, 0.2)) * 0.4);
  float spd = clamp(speed / 2.4, 0.0, 1.0);
  return (arm * 0.9 + cross * 0.25) * reach * brk * spd;
}

void main() {
  vec3 n = normalize(vNormal);
  vec2 wind = uWind;
  float wlen = length(wind);
  vec2 wdir = wlen > 0.001 ? wind / wlen : vec2(1.0, 0.0);
  vec2 wperp = vec2(-wdir.y, wdir.x);

  float rip = sin(dot(vWorld.xz, wdir) * 1.8 + uTime * 2.6) * sin(dot(vWorld.xz, wperp) * 2.4 - uTime * 1.7);
  n.x += wdir.x * rip * 0.07;
  n.z += wdir.y * rip * 0.07;
  float distCam = distance(vWorld.xz, cameraPosition.xz);
  float near = 1.0 - smoothstep(6.0, 40.0, distCam);
  float amp = 0.06 + 0.18 * near;
  vec2 rp = vWorld.xz * 2.2 + vec2(uTime * 0.16, -uTime * 0.1);
  float e = 0.22;
  float rh = bwNoise(rp);
  n.x += (bwNoise(rp + vec2(e, 0.0)) - rh) / e * amp;
  n.z += (bwNoise(rp + vec2(0.0, e)) - rh) / e * amp;
  vec2 rq = vWorld.xz * 6.4 + vec2(-uTime * 0.33, uTime * 0.21);
  float rh2 = bwNoise(rq);
  n.x += (bwNoise(rq + vec2(e, 0.0)) - rh2) / e * amp * 0.35;
  n.z += (bwNoise(rq + vec2(0.0, e)) - rh2) / e * amp * 0.35;

  float gust = 0.0;
  for (int i = 0; i < 6; i++) {
    float use = float(i < uGusts);
    float d = distance(vWorld.xz, uGust[i].xy);
    float radius = max(uGust[i].z, 0.001);
    float w = 1.0 - smoothstep(radius * 0.15, radius, d);
    gust += use * w * uGust[i].w;
  }
  gust = clamp(gust, 0.0, 1.0);
  float gustRip = sin(dot(vWorld.xz, wdir) * 4.5 - uTime * 7.0) * sin(dot(vWorld.xz, wperp) * 3.4 + uTime * 5.0);
  n.xz += wdir * gustRip * gust * 0.28;
  n = normalize(n);

  vec3 viewDir = normalize(cameraPosition - vWorld);
  float ndotv = max(dot(n, viewDir), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndotv, 5.0);

  vec3 R = reflect(-viewDir, n);
  float skyH = clamp(R.y * 1.25 + 0.05, 0.0, 1.0);
  vec3 zenith = vec3(0.12, 0.31, 0.62);
  vec3 sky = mix(uHorizon, zenith, pow(skyH, 0.6));
  float sunDot = max(dot(R, uSun), 0.0);
  sky += vec3(1.0, 0.78, 0.55) * pow(sunDot, 6.0) * 0.28;
  sky += vec3(1.0, 0.97, 0.92) * pow(sunDot, 280.0);
  sky = mix(sky, uDeep * 0.65, smoothstep(0.04, -0.2, R.y));
  if (uEnvMix > 0.001) {
    sky = mix(sky, textureCube(uEnv, R).rgb, uEnvMix);
  }

  float hMix = clamp(vHeight * 2.4 + 0.35, 0.0, 1.0);
  vec3 water = mix(uDeep, uShallow, hMix);
  float upwell = pow(max(dot(normalize(n + uSun), viewDir), 0.0), 2.2);
  water += uScatter * upwell * (1.0 - fres) * (0.35 + hMix * 0.8);

  vec3 col = mix(water, sky, fres);

  vec3 H = normalize(uSun + viewDir);
  float ndh = max(dot(n, H), 0.0);
  float spec = pow(ndh, 80.0);
  float glint = pow(ndh, 320.0);
  float spark = 0.55 + 0.45 * pow(max(sin(dot(vWorld.xz, wdir) * 9.0 + uTime * 3.5), 0.0), 6.0);
  col += vec3(1.0, 0.97, 0.9) * (spec * 0.45 + glint * 1.7) * spark;

  float crest = smoothstep(0.16, 0.48, vFoam) * uFoamScale;
  vec2 rel = vWorld.xz - uBoat;
  float c = cos(uHeading);
  float s = sin(uHeading);
  float fwd = rel.x * c + rel.y * s;
  float side = -rel.x * s + rel.y * c;
  float spd = clamp(uSpeed / 3.2, 0.0, 1.0);
  float bowBand = smoothstep(0.85, 1.45, fwd) * (1.0 - smoothstep(1.7, 2.45, fwd));
  float bow = bowBand * (1.0 - smoothstep(0.12, 0.62, abs(side)));
  float along = smoothstep(-1.7, 0.2, fwd) * (1.0 - smoothstep(0.45, 1.45, fwd));
  float shoulder = along * smoothstep(0.12, 0.38, abs(side)) * (1.0 - smoothstep(0.42, 0.95, abs(side)));
  float hullFoam = (bow * 1.2 + shoulder * 0.75) * spd;

  float wakeFoam = bwKelvin(vWorld.xz, uBoat, uHeading, uSpeed, uTime);
  wakeFoam += uWake[0].z * 0.0;

  float foam = clamp(crest * 0.85 + hullFoam * 0.45 + wakeFoam, 0.0, 1.0);
  float grain = 0.78 + 0.22 * bwNoise(vWorld.xz * 1.7 + vec2(uTime * 0.15, 0.0));
  vec3 foamCol = vec3(0.84, 0.92, 0.93) * grain;
  col = mix(col, foamCol, foam * 0.72);

  col *= mix(1.0, 0.62, gust);
  col = mix(col, vec3(0.03, 0.1, 0.14), gust * 0.22);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

interface WakeSample {
  x: number;
  z: number;
  age: number;
}

export class Ocean {
  readonly mesh: Mesh;
  private material: ShaderMaterial;
  private geometry: PlaneGeometry;
  private segments: number;
  private waves: GerstnerWave[] = [];
  private wake: WakeSample[] = [];
  private amp = 1;
  private quality: 'low' | 'high';
  private extent = 300;
  private harbour = false;

  constructor(quality: 'low' | 'high', env: CubeTexture) {
    this.quality = quality;
    this.segments = quality === 'high' ? 160 : 72;
    this.geometry = this.makeGeometry(this.segments);
    const physA = WAVES.map((w) => new Vector4(w.dirX, w.dirZ, w.amplitude, w.wavelength));
    const physB = WAVES.map((w) => new Vector4(w.steepness, w.speed, w.phase, 0));
    this.material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: quality === 'high' ? FRAG : FRAG_LOW,
      uniforms: {
        uTime: { value: 0 },
        uCount: { value: waveCountFor(quality) },
        uA: { value: Array.from({ length: 8 }, () => new Vector4()) },
        uB: { value: Array.from({ length: 8 }, () => new Vector4()) },
        uPhys: { value: 4 },
        uPhysA: { value: physA },
        uPhysB: { value: physB },
        uBasinN: { value: 0 },
        uBasin: { value: Array.from({ length: 48 }, () => new Vector2()) },
        uDeep: { value: new Color('#062433') },
        uShallow: { value: new Color('#1c8f86') },
        uScatter: { value: new Color('#3ecfb4') },
        uHorizon: { value: new Color('#b9cddd') },
        uSun: { value: new Vector3(0.45, 0.55, 0.15).normalize() },
        uWind: { value: new Vector2(1, 0) },
        uBoat: { value: new Vector2() },
        uHeading: { value: 0 },
        uSpeed: { value: 0 },
        uWakeN: { value: 0 },
        uWake: { value: Array.from({ length: 8 }, () => new Vector4()) },
        uGusts: { value: 0 },
        uGust: { value: Array.from({ length: 6 }, () => new Vector4()) },
        uFoamScale: { value: quality === 'high' ? 1 : 0.85 },
        uEnv: { value: env },
        uEnvMix: { value: quality === 'high' ? 0.55 : 0 },
        fogColor: { value: new Color('#c5d4e1') },
        fogDensity: { value: 0.011 },
        fogNear: { value: 1 },
        fogFar: { value: 400 },
      },
      side: DoubleSide,
      fog: true,
    });
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = false;
    this.syncWaves(Math.PI / 2, 5.66);
  }

  /**
   * Sheltered water passes 0, which also drops the short physics chop.
   * Any other count is a Gerstner octave count.
   */
  setWaveCount(count: number): void {
    this.material.uniforms.uCount.value = count;
    this.material.uniforms.uPhys.value = count === 0 ? 0 : 4;
    this.syncWaves(this.windFrom, this.windSpeed);
  }

  /** Flat basin, or the swell that belongs to the current quality. */
  setSheltered(sheltered: boolean): void {
    this.harbour = false;
    this.extent = 300;
    this.rebuild(this.quality === 'high' ? 160 : 72);
    this.setBasin([]);
    this.setWaveCount(sheltered ? 0 : waveCountFor(this.quality));
  }

  /**
   * Harbour water: a wider mesh, and a calmer basin wherever the polygon says
   * the boat is inside the breakwater. Open water leaves the polygon empty.
   */
  setHarbour(on: boolean, basin: { x: number; y: number }[]): void {
    this.harbour = on;
    this.extent = on ? 1100 : 300;
    const segments = on ? (this.quality === 'high' ? 150 : 70) : this.quality === 'high' ? 160 : 72;
    this.rebuild(segments);
    this.setBasin(on ? basin : []);
    if (on) this.setWaveCount(waveCountFor(this.quality));
  }

  setBasin(points: { x: number; y: number }[]): void {
    const n = Math.min(48, points.length);
    this.material.uniforms.uBasinN.value = n;
    const arr = this.material.uniforms.uBasin.value as Vector2[];
    for (let i = 0; i < 48; i++) {
      const p = points[i];
      if (p) arr[i].set(p.x, p.y);
    }
  }

  setQuality(quality: 'low' | 'high'): void {
    this.quality = quality;
    const segments = this.harbour
      ? quality === 'high'
        ? 150
        : 70
      : quality === 'high'
        ? 160
        : 72;
    this.rebuild(segments);
    this.material.fragmentShader = quality === 'high' ? FRAG : FRAG_LOW;
    this.material.needsUpdate = true;
    this.material.uniforms.uCount.value = waveCountFor(quality);
    this.material.uniforms.uFoamScale.value = quality === 'high' ? 1 : 0.85;
    this.material.uniforms.uEnvMix.value = quality === 'high' ? 0.55 : 0;
    this.mesh.receiveShadow = false;
    this.syncWaves(this.windFrom, this.windSpeed);
  }

  private windFrom = Math.PI / 2;
  private windSpeed = 5.66;

  /** Rendered water height: Gerstner swell plus the short chop, or flat when sheltered. */
  heightAt(x: number, z: number, time: number): number {
    const g = gerstnerAt(x, z, time, this.waves);
    const p = physicsChop(x, z, time, this.material.uniforms.uPhys.value as number);
    return g.height + p.height;
  }

  slopeAt(x: number, z: number, time: number): { slopeX: number; slopeZ: number } {
    const g = gerstnerAt(x, z, time, this.waves);
    const p = physicsChop(x, z, time, this.material.uniforms.uPhys.value as number);
    return { slopeX: g.slopeX + p.slopeX, slopeZ: g.slopeZ + p.slopeZ };
  }

  setSun(dir: Vector3, horizon: Color): void {
    (this.material.uniforms.uSun.value as Vector3).copy(dir).normalize();
    (this.material.uniforms.uHorizon.value as Color).copy(horizon);
  }

  update(
    time: number,
    boatX: number,
    boatZ: number,
    heading: number,
    speed: number,
    windFrom: number,
    windSpeed: number,
    gusts: Gust[],
    dt: number,
    moving: boolean,
  ): void {
    const cell = 300 / this.segments;
    this.mesh.position.x = Math.round(boatX / cell) * cell;
    this.mesh.position.z = Math.round(boatZ / cell) * cell;
    this.material.uniforms.uTime.value = time;
    this.windFrom = windFrom;
    this.windSpeed = windSpeed;
    const target = Math.max(0.5, Math.min(1.65, windSpeed / 5.66));
    this.amp += (target - this.amp) * (1 - Math.exp(-dt * 0.35));
    this.syncWaves(windFrom, 5.66 * this.amp);

    const wind = this.material.uniforms.uWind.value as Vector2;
    wind.set(-Math.cos(windFrom), -Math.sin(windFrom));
    (this.material.uniforms.uBoat.value as Vector2).set(boatX, boatZ);
    this.material.uniforms.uHeading.value = heading;
    this.material.uniforms.uSpeed.value = speed;

    if (moving && speed > 0.45) {
      for (const p of this.wake) p.age += dt;
      this.wake = this.wake.filter((p) => p.age < 6.5);
      const sx = boatX - Math.cos(heading) * 1.7;
      const sz = boatZ - Math.sin(heading) * 1.7;
      const last = this.wake[this.wake.length - 1];
      if (!last || Math.hypot(sx - last.x, sz - last.z) > 0.85) {
        this.wake.push({ x: sx, z: sz, age: 0 });
        if (this.wake.length > 24) this.wake.shift();
      }
    }
    const packed = this.material.uniforms.uWake.value as Vector4[];
    const samples = this.wake.slice(-8);
    this.material.uniforms.uWakeN.value = samples.length;
    for (let i = 0; i < samples.length; i++) {
      const p = samples[i];
      const widen = 0.45 + p.age * 0.42 + speed * 0.08;
      packed[i].set(p.x, p.z, p.age / 6.5, widen);
    }

    const gustPacked = this.material.uniforms.uGust.value as Vector4[];
    const n = Math.min(6, gusts.length);
    this.material.uniforms.uGusts.value = n;
    for (let i = 0; i < n; i++) {
      gustPacked[i].set(gusts[i].x, gusts[i].y, gusts[i].r, gusts[i].amp);
    }
  }

  private syncWaves(windFrom: number, windSpeed: number): void {
    const count = this.material.uniforms.uCount.value as number;
    this.waves = buildGerstner(windFrom, windSpeed, count);
    const a = this.material.uniforms.uA.value as Vector4[];
    const b = this.material.uniforms.uB.value as Vector4[];
    for (let i = 0; i < this.waves.length; i++) {
      const w = this.waves[i];
      a[i].set(w.dirX, w.dirZ, w.amplitude, w.wavelength);
      b[i].set(w.steepness, w.omega, w.phase, 0);
    }
  }

  private rebuild(segments: number): void {
    if (segments === this.segments && this.geometry.parameters.width === this.extent) return;
    this.segments = segments;
    this.geometry.dispose();
    this.geometry = this.makeGeometry(segments);
    this.mesh.geometry = this.geometry;
  }

  private makeGeometry(segments: number): PlaneGeometry {
    const geo = new PlaneGeometry(this.extent, this.extent, segments, segments);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
