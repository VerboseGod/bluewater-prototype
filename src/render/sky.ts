import {
  BackSide,
  Color,
  CubeCamera,
  CubeTexture,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  LinearFilter,
  LinearMipmapLinearFilter,
  LinearSRGBColorSpace,
  Mesh,
  PCFSoftShadowMap,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  UnsignedByteType,
  Vector3,
  WebGLCubeRenderTarget,
  WebGLRenderer,
} from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

export interface SkyRig {
  sky: Sky;
  sun: DirectionalLight;
  hemi: HemisphereLight;
  sunDir: Vector3;
  horizon: Color;
  fog: FogExp2;
  envCube: CubeTexture;
  cheap: Mesh;
}

const ELEVATION = 32 * (Math.PI / 180);
const AZIMUTH = 0.62;

export function createSky(renderer: WebGLRenderer, scene: Scene, quality: 'low' | 'high'): SkyRig {
  const sunDir = new Vector3(
    Math.cos(ELEVATION) * Math.cos(AZIMUTH),
    Math.sin(ELEVATION),
    -Math.cos(ELEVATION) * Math.sin(AZIMUTH),
  ).normalize();

  const sky = new Sky();
  sky.scale.setScalar(4500);
  sky.frustumCulled = false;
  sky.material.fog = false;
  sky.material.fragmentShader = sky.material.fragmentShader.replace(
    'gl_FragColor = vec4( texColor, 1.0 );',
    'gl_FragColor = vec4( texColor * 0.42, 1.0 );',
  );
  sky.material.needsUpdate = true;
  const u = sky.material.uniforms;
  u.turbidity.value = 2.1;
  u.rayleigh.value = 2.4;
  u.mieCoefficient.value = 0.0045;
  u.mieDirectionalG.value = 0.82;
  u.sunPosition.value.copy(sunDir);
  u.cloudCoverage.value = quality === 'high' ? 0.34 : 0;
  u.cloudDensity.value = 0.45;
  u.cloudElevation.value = 0.55;
  u.cloudScale.value = 0.00018;
  u.cloudSpeed.value = 0.000012;

  const horizon = new Color('#8eafc8');
  const fog = new FogExp2(horizon, 0.0085);
  scene.fog = fog;
  scene.background = horizon;

  const hemi = new HemisphereLight('#d5e6f5', '#1a3a34', 0.55);
  const sun = new DirectionalLight('#fff1d6', 3.1);
  sun.position.copy(sunDir).multiplyScalar(40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 80;
  sun.shadow.camera.left = -14;
  sun.shadow.camera.right = 14;
  sun.shadow.camera.top = 14;
  sun.shadow.camera.bottom = -14;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(hemi, sun, sun.target);

  const envScene = new Scene();
  envScene.add(sky);
  const previousSpace = renderer.outputColorSpace;
  renderer.outputColorSpace = LinearSRGBColorSpace;
  sky.material.toneMapped = false;
  sky.material.needsUpdate = true;

  const cubeRT = new WebGLCubeRenderTarget(256, {
    type: UnsignedByteType,
    generateMipmaps: true,
    minFilter: LinearMipmapLinearFilter,
    magFilter: LinearFilter,
    colorSpace: LinearSRGBColorSpace,
  });
  const cube = new CubeCamera(1, 8000, cubeRT);
  cube.update(renderer, envScene);

  const pmrem = new PMREMGenerator(renderer);
  const env = pmrem.fromScene(envScene, 0.04, 1, 8000);
  pmrem.dispose();

  renderer.outputColorSpace = previousSpace;
  sky.material.toneMapped = true;
  sky.material.needsUpdate = true;
  scene.add(sky);
  const cheap = gradientSky(sunDir);
  scene.add(cheap);
  scene.environment = env.texture;

  applyQuality(renderer, sun, sky, cheap, quality);

  return { sky, sun, hemi, sunDir, horizon, fog, envCube: cubeRT.texture, cheap };
}

export function applySkyQuality(
  renderer: WebGLRenderer,
  rig: SkyRig,
  quality: 'low' | 'high',
): void {
  applyQuality(renderer, rig.sun, rig.sky, rig.cheap, quality);
}

function applyQuality(
  renderer: WebGLRenderer,
  sun: DirectionalLight,
  sky: Sky,
  cheap: Mesh,
  quality: 'low' | 'high',
): void {
  const high = quality === 'high';
  renderer.shadowMap.enabled = high;
  renderer.shadowMap.type = PCFSoftShadowMap;
  sun.castShadow = high;
  sun.shadow.mapSize.set(high ? 1024 : 512, high ? 1024 : 512);
  sky.material.uniforms.cloudCoverage.value = high ? 0.34 : 0;
  sky.visible = high;
  cheap.visible = !high;
}

function gradientSky(sunDir: Vector3): Mesh {
  const material = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { uSun: { value: sunDir.clone() } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vDir = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
        gl_Position.z = gl_Position.w;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform vec3 uSun;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y * 1.15, 0.0, 1.0);
        vec3 col = mix(vec3(0.55, 0.68, 0.78), vec3(0.15, 0.36, 0.68), pow(h, 0.55));
        float sun = max(dot(d, normalize(uSun)), 0.0);
        col += vec3(1.0, 0.86, 0.62) * pow(sun, 12.0) * 0.28;
        col += vec3(1.0, 0.98, 0.94) * pow(sun, 500.0);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new Mesh(new SphereGeometry(4200, 20, 12), material);
  mesh.frustumCulled = false;
  return mesh;
}

/** Day is the open-water sun. Golden is a low western sun for the harbour. */
export function applyTimeOfDay(rig: SkyRig, mode: 'day' | 'golden'): void {
  const elev = (mode === 'golden' ? 8 : 32) * (Math.PI / 180);
  const az = mode === 'golden' ? Math.PI - 0.35 : 0.62;
  rig.sunDir
    .set(Math.cos(elev) * Math.cos(az), Math.sin(elev), -Math.cos(elev) * Math.sin(az))
    .normalize();
  rig.sky.material.uniforms.sunPosition.value.copy(rig.sunDir);
  const cheapSun = (rig.cheap.material as ShaderMaterial).uniforms.uSun.value as Vector3;
  cheapSun.copy(rig.sunDir);
  const u = rig.sky.material.uniforms;
  if (mode === 'golden') {
    u.turbidity.value = 8;
    u.rayleigh.value = 3.1;
    u.mieCoefficient.value = 0.018;
    rig.horizon.set('#e7a56a');
    rig.sun.color.set('#ffb07a');
    rig.sun.intensity = 2.4;
    rig.hemi.color.set('#ffd0a8');
    rig.hemi.groundColor.set('#2a3330');
    rig.hemi.intensity = 0.38;
  } else {
    u.turbidity.value = 2.1;
    u.rayleigh.value = 2.4;
    u.mieCoefficient.value = 0.0045;
    rig.horizon.set('#8eafc8');
    rig.sun.color.set('#fff1d6');
    rig.sun.intensity = 3.1;
    rig.hemi.color.set('#d5e6f5');
    rig.hemi.groundColor.set('#1a3a34');
    rig.hemi.intensity = 0.55;
  }
  rig.fog.color.copy(rig.horizon);
}

export function followBoat(rig: SkyRig, x: number, z: number): void {
  rig.sun.position.set(
    x + rig.sunDir.x * 36,
    rig.sunDir.y * 36,
    z + rig.sunDir.z * 36,
  );
  rig.sun.target.position.set(x, 0, z);
  rig.sun.target.updateMatrixWorld();
}

