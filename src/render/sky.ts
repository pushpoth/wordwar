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
import { tune } from '../config/tunables';

export function sunDirection(out = new Vector3()) {
  const el = MathUtils.degToRad(tune.get('sun.elevation'));
  const az = MathUtils.degToRad(tune.get('sun.azimuth'));
  return out.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
}

function makeSky() {
  const sky = new SkyMesh();
  sky.scale.setScalar(1000);
  sky.turbidity.value = LOOK.sky.turbidity;
  sky.rayleigh.value = LOOK.sky.rayleigh;
  sky.mieCoefficient.value = LOOK.sky.mieCoefficient;
  sky.mieDirectionalG.value = LOOK.sky.mieDirectionalG;
  sky.showSunDisc.value = 0;
  return sky;
}

/**
 * Physical sky, a matching image-based environment for reflections, and a
 * warm low sun that casts the board's shadows. The sun follows the tuner; the
 * reflection map is re-rendered (debounced) when it moves.
 */
export function createSky(scene: Scene, renderer: WebGPURenderer) {
  const sun = sunDirection();

  const sky = makeSky();
  sky.sunPosition.value.copy(sun);
  scene.add(sky);

  // Environment map rendered from the sky alone.
  const envScene = new Scene();
  const envSky = makeSky();
  envSky.sunPosition.value.copy(sun);
  envScene.add(envSky);
  const pmrem = new PMREMGenerator(renderer);
  let env = pmrem.fromScene(envScene, 0.02, 1, 2000);
  scene.environment = env.texture;
  scene.environmentIntensity = tune.get('sky.envIntensity');

  const hemi = new HemisphereLight(LOOK.ambient.skyColor, LOOK.ambient.groundColor, LOOK.ambient.intensity);
  scene.add(hemi);

  const light = new DirectionalLight(LOOK.sun.color, tune.get('sun.intensity'));
  light.position.copy(sun).multiplyScalar(40);
  light.castShadow = true;
  light.shadow.mapSize.setScalar(tune.get('quality.shadowMapSize'));
  const s = 14;
  Object.assign(light.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 100 });
  light.shadow.bias = -0.0004;
  light.shadow.normalBias = 0.02;
  light.shadow.radius = 3;
  scene.add(light, light.target);

  const moved = new Set<(sun: Vector3) => void>();
  let envTimer = 0;
  tune.onAny(['sun.elevation', 'sun.azimuth'], () => {
    sunDirection(sun);
    sky.sunPosition.value.copy(sun);
    envSky.sunPosition.value.copy(sun);
    light.position.copy(sun).multiplyScalar(40);
    for (const fn of moved) fn(sun);
    clearTimeout(envTimer);
    envTimer = window.setTimeout(() => {
      env.dispose();
      env = pmrem.fromScene(envScene, 0.02, 1, 2000);
      scene.environment = env.texture;
    }, 250);
  });
  tune.on('sun.intensity', (v) => (light.intensity = v as number));
  tune.on('sky.envIntensity', (v) => (scene.environmentIntensity = v as number));

  return { sky, sun, light, onSunMove: (fn: (sun: Vector3) => void) => moved.add(fn) };
}
