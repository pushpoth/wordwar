import { Mesh, MeshStandardNodeMaterial, type MeshStandardMaterial, type Object3D } from 'three/webgpu';
import { attribute } from 'three/tsl';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map<string, Promise<Object3D>>();

/**
 * Load a model built by `npm run models`. Blender bakes ambient occlusion into
 * the vertex colour attribute; here it becomes the material's AO term, so it
 * darkens ambient and environment light only, never the direct sun.
 */
export function loadModel(name: string): Promise<Object3D> {
  let p = cache.get(name);
  if (!p) {
    p = loader.loadAsync(`${import.meta.env.BASE_URL}models/${name}.glb`).then((gltf) => {
      gltf.scene.traverse((o) => {
        if (!(o instanceof Mesh)) return;
        o.castShadow = true;
        o.receiveShadow = true;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const hasAO = o.geometry.hasAttribute('color');
        const upgraded = mats.map((m: MeshStandardMaterial) => upgrade(m, hasAO));
        o.material = Array.isArray(o.material) ? upgraded : upgraded[0];
      });
      return gltf.scene;
    });
    cache.set(name, p);
  }
  return p.then((scene) => scene.clone(true));
}

function upgrade(src: MeshStandardMaterial, hasAO: boolean) {
  const m = new MeshStandardNodeMaterial();
  m.name = src.name;
  m.color.copy(src.color);
  m.roughness = src.roughness;
  m.metalness = src.metalness;
  m.emissive.copy(src.emissive);
  m.emissiveIntensity = src.emissiveIntensity;
  m.map = src.map;
  m.side = src.side;
  if (hasAO) m.aoNode = attribute<'vec4'>('color').r;
  return m;
}
