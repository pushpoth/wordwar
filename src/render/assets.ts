import {
  BufferAttribute, Mesh, MeshStandardNodeMaterial, Vector2, type BufferGeometry, type MeshStandardMaterial, type Object3D,
} from 'three/webgpu';
import { attribute, float, fract, positionWorld, smoothstep, uniform, vec3 } from 'three/tsl';
import { simTime } from './clock';
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
function makeSurface(reveal: boolean) {
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
  if (reveal) {
    // Each mesh carries its own reveal radius (userData.reveal; none means fully shown).
    const radius = uniform(1e4).onObjectUpdate(({ object }) => (object?.userData.reveal as number | undefined) ?? 1e4);
    const d = positionWorld.xz.sub(revealCenter).length();
    const band = float(REVEAL_BAND);
    // 0 well inside the radius, 1 at the scan front.
    const front = smoothstep(radius.sub(band), radius, d);
    // In the band the hull shows as scan lines that thin out toward the front.
    const lines = fract(positionWorld.y.mul(16).add(d.mul(2)).sub(simTime.mul(4)));
    m.maskNode = d.lessThan(radius).and(lines.greaterThan(front.mul(0.92)));
    const glow = front.mul(d.lessThan(radius).select(float(1), float(0))).mul(2.4);
    m.emissiveNode = extra.yzw.add(vec3(0.35, 1.0, 0.45).mul(glow));
    m.name = 'model-surface-reveal';
  }
  return m;
}

/** Where ship reveals spread from (the sub), and the width of the scan band at their front, in cells. */
export const revealCenter = uniform(new Vector2());
export const REVEAL_BAND = 0.9;
const surface = makeSurface(false);
/** The material for enemy ships, which the radar reveals with a growing ring (see `setReveal`). */
const revealSurface = makeSurface(true);

/**
 * Switch a model to the reveal material (once) and set how far the reveal has
 * spread from `revealCenter`; null shows it whole. Hidden parts cast no shadow.
 */
export function setReveal(model: Object3D, radius: number | null) {
  model.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    if (o.material === surface) o.material = revealSurface;
    o.userData.reveal = radius ?? undefined;
    o.castShadow = radius === null;
  });
}

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
