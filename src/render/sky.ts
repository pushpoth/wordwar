import {
  DirectionalLight,
  HemisphereLight,
  MathUtils,
  PMREMGenerator,
  Scene,
  Vector3,
  type WebGPURenderer,
} from 'three/webgpu';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { LOOK } from '../config/look';

export function sunDirection() {
  const el = MathUtils.degToRad(LOOK.sun.elevationDeg);
  const az = MathUtils.degToRad(LOOK.sun.azimuthDeg);
  return new Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
}

/**
 * Physical sky, a matching image-based environment for reflections, and a
 * warm low sun that casts the board's shadows.
 */
export function createSky(scene: Scene, renderer: WebGPURenderer) {
  const sun = sunDirection();

  const sky = new SkyMesh();
  sky.scale.setScalar(1000);
  sky.turbidity.value = LOOK.sky.turbidity;
  sky.rayleigh.value = LOOK.sky.rayleigh;
  sky.mieCoefficient.value = LOOK.sky.mieCoefficient;
  sky.mieDirectionalG.value = LOOK.sky.mieDirectionalG;
  sky.sunPosition.value.copy(sun);
  sky.showSunDisc.value = 0;
  scene.add(sky);

  // Environment map rendered from the sky alone.
  const envScene = new Scene();
  const envSky = new SkyMesh();
  envSky.scale.setScalar(1000);
  envSky.turbidity.value = LOOK.sky.turbidity;
  envSky.rayleigh.value = LOOK.sky.rayleigh;
  envSky.mieCoefficient.value = LOOK.sky.mieCoefficient;
  envSky.mieDirectionalG.value = LOOK.sky.mieDirectionalG;
  envSky.sunPosition.value.copy(sun);
  envSky.showSunDisc.value = 0;
  envScene.add(envSky);
  const pmrem = new PMREMGenerator(renderer);
  const env = pmrem.fromScene(envScene, 0.02, 1, 2000);
  scene.environment = env.texture;
  scene.environmentIntensity = LOOK.ambient.envIntensity;

  const hemi = new HemisphereLight(LOOK.ambient.skyColor, LOOK.ambient.groundColor, LOOK.ambient.intensity);
  scene.add(hemi);

  const light = new DirectionalLight(LOOK.sun.color, LOOK.sun.intensity);
  light.position.copy(sun).multiplyScalar(40);
  light.castShadow = true;
  light.shadow.mapSize.setScalar(LOOK.sun.shadowMapSize);
  const s = 14;
  Object.assign(light.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 100 });
  light.shadow.bias = -0.0004;
  light.shadow.normalBias = 0.02;
  light.shadow.radius = 3;
  scene.add(light, light.target);

  return { sky, sun, light };
}
