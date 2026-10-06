import {
  BufferAttribute, Mesh, MeshStandardNodeMaterial, type BufferGeometry, type MeshStandardMaterial, type Object3D,
} from 'three/webgpu';
import { attribute } from 'three/tsl';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { wearFor, weathered } from './weathering';

const loader = new GLTFLoader();
const cache = new Map<string, Promise<Object3D>>();

/**
 * One material for every model. Our Blender materials are flat colours, so
 * each part's colour, roughness, metalness, glow and wear ride along as vertex
 * attributes and every model node draws in a single call (plus its shadow).
 * Blender's baked ambient occlusion (vertex colour) darkens ambient and
 * environment light only, never the direct sun.
 */
const surface = (() => {
  const m = new MeshStandardNodeMaterial();
  const base = attribute<'vec4'>('surfaceBase');
  const extra = attribute<'vec4'>('surfaceExtra');
  const wear = attribute<'vec3'>('surfaceWear');
  const w = weathered(base.xyz, base.w, wear);
  m.colorNode = w.color;
  m.roughnessNode = w.roughness;
  m.metalnessNode = extra.x;
  m.emissiveNode = extra.yzw;
  m.aoNode = attribute<'vec4'>('color').r;
  m.name = 'model-surface';
  return m;
})();

const KEEP = ['position', 'normal', 'color', 'surfaceBase', 'surfaceExtra', 'surfaceWear'];

/** Bake one primitive's material into per-vertex attributes, in its node's space. */
function bake(mesh: Mesh, node: Object3D) {
  const src = mesh.material as MeshStandardMaterial;
  let g = mesh.geometry.clone();
  if (g.index) g = g.toNonIndexed();
  if (mesh !== node) {
    mesh.updateMatrix();
    g.applyMatrix4(mesh.matrix);
  }
  const n = g.getAttribute('position').count;
  const baseArr = new Float32Array(n * 4);
  const extraArr = new Float32Array(n * 4);
  const wearArr = new Float32Array(n * 3);
  const e = src.emissive.clone().multiplyScalar(src.emissiveIntensity ?? 1);
  const wear = wearFor(src.name);
  for (let i = 0; i < n; i++) {
    baseArr.set([src.color.r, src.color.g, src.color.b, src.roughness], i * 4);
    extraArr.set([src.metalness, e.r, e.g, e.b], i * 4);
    wearArr.set(wear, i * 3);
  }
  g.setAttribute('surfaceBase', new BufferAttribute(baseArr, 4));
  g.setAttribute('surfaceExtra', new BufferAttribute(extraArr, 4));
  g.setAttribute('surfaceWear', new BufferAttribute(wearArr, 3));
  if (!g.hasAttribute('color')) g.setAttribute('color', new BufferAttribute(new Float32Array(n * 4).fill(1), 4));
  const color = g.getAttribute('color');
  if (color.itemSize !== 4 || color.normalized) {
    // glTF stores AO as normalised shorts; merge needs one consistent layout.
    const out = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) out.set([color.getX(i), color.getY(i), color.getZ(i), 1], i * 4);
    g.setAttribute('color', new BufferAttribute(out, 4));
  }
  for (const k of Object.keys(g.attributes)) if (!KEEP.includes(k)) g.deleteAttribute(k);
  return g;
}

/** Replace each model node's parts with one merged mesh using the shared material. */
function flatten(scene: Object3D) {
  for (const node of [...scene.children]) {
    const parts: Mesh[] = [];
    node.traverse((o) => { if (o instanceof Mesh) parts.push(o); });
    if (!parts.length) continue;
    const geos: BufferGeometry[] = parts.map((p) => bake(p, node));
    const merged = mergeGeometries(geos, false);
    if (!merged) throw new Error(`could not merge the parts of ${node.name}`);
    const mesh = new Mesh(merged, surface);
    mesh.name = node.name;
    mesh.position.copy(node.position);
    mesh.quaternion.copy(node.quaternion);
    mesh.scale.copy(node.scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.remove(node);
    scene.add(mesh);
  }
  return scene;
}

/** Load a model built by `npm run models`, flattened to one draw per node. */
export function loadModel(name: string): Promise<Object3D> {
  let p = cache.get(name);
  if (!p) {
    p = loader.loadAsync(`${import.meta.env.BASE_URL}models/${name}.glb`).then((gltf) => flatten(gltf.scene));
    cache.set(name, p);
  }
  return p.then((scene) => scene.clone(true));
}

/** Start loading models ahead of first use; `onEach` fires as each one finishes. */
export function preloadModels(names: string[], onEach?: (name: string) => void) {
  return Promise.all(names.map((n) => loadModel(n).then((m) => { onEach?.(n); return m; })));
}
