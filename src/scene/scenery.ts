import type { Group, Object3D } from 'three/webgpu';
import { loadModel } from '../render/assets';
import type { IslandShore } from '../render/ocean';
import type { Floater } from './buoyancy';

/**
 * Islands and buoys, laid out for a 10×10 board (cells span x, z ∈ [-5, 5]).
 * For other sizes the positions stretch with the board; entries with `minSize`
 * appear only on boards at least that big.
 */
const ISLANDS = [
  { model: 'island_lighthouse', x: -8.9, z: -1.2, yaw: 0.35, scale: 1.0 },
  { model: 'island_wooded', x: 8.7, z: -4.8, yaw: 2.1, scale: 0.95 },
  { model: 'island_rock', x: 7.6, z: 1.6, yaw: 0.8, scale: 1.0 },
  { model: 'island_wooded', x: 8.3, z: 7.9, yaw: -0.6, scale: 1.25 },
  { model: 'island_rock', x: -7.2, z: 7.4, yaw: 2.6, scale: 0.85 },
  { model: 'island_rock', x: -4.0, z: -8.4, yaw: 1.2, scale: 0.7 },
  { model: 'island_wooded', x: -9.5, z: 3.5, yaw: 0.9, scale: 0.9, minSize: 13 },
  { model: 'island_rock', x: 3.4, z: -9.2, yaw: 2.4, scale: 0.8, minSize: 13 },
];
/** Island kit footprint (sx, sy) per model, and a global size boost. */
const ISLAND_SIZE: Record<string, [number, number]> = {
  island_lighthouse: [1.75, 1.3], island_wooded: [1.3, 1.05], island_rock: [0.8, 0.65],
};
const ISLAND_SCALE = 1.2;
const BUOYS: { x: number; z: number; minSize?: number }[] = [
  ...([[-6.0, 4.6], [6.1, -1.4], [3.2, 6.1], [-2.6, -6.2], [5.9, 4.2], [-6.1, -4.1], [1.5, -6.0]] as [number, number][]).map(([x, z]) => ({ x, z })),
  { x: -6.6, z: 0.8, minSize: 13 }, { x: 6.8, z: -5.6, minSize: 13 }, { x: 0.4, z: 6.8, minSize: 13 },
];

/**
 * Static scenery around the board: islands (whose waterlines feed the ocean's
 * surf) and buoys (which float).
 */
export async function addScenery(root: Group) {
  type Isle = { def: (typeof ISLANDS)[number]; obj: Group | Object3D; shore: IslandShore };
  const isles: Isle[] = [];
  const buoys: { def: (typeof BUOYS)[number]; floater: Floater }[] = [];
  /** The islands currently on the water, as the ocean's surf needs them (same objects, updated in place). */
  const islands: IslandShore[] = [];
  const floaters: Floater[] = [];
  // Waterline radii come from the island kit's sx/sy (Blender Y becomes
  // three.js -Z, which an ellipse doesn't care about).
  for (const def of ISLANDS) {
    const obj = await loadModel(def.model);
    obj.rotation.y = def.yaw;
    root.add(obj);
    isles.push({ def, obj, shore: { x: 0, z: 0, rx: 1, rz: 1, yaw: def.yaw } });
  }
  for (const [i, def] of BUOYS.entries()) {
    const b = await loadModel('buoy');
    b.scale.setScalar(1.15);
    b.traverse((o) => { o.castShadow = false; }); // too small to matter; saves a shadow draw each
    root.add(b);
    const floater: Floater = { obj: b, x: def.x, z: def.z, yaw: i * 1.7 };
    floaters.push(floater);
    buoys.push({ def, floater });
  }

  /** Arrange the scenery around an n × n board. */
  function layout(size: number) {
    const k = size / 10; // positions stretch with the board; the islands themselves grow a little
    const grow = Math.sqrt(Math.max(k, 0.8));
    islands.length = 0;
    for (const { def, obj, shore } of isles) {
      const show = size >= (def.minSize ?? 0);
      obj.visible = show;
      if (!show) continue;
      const scale = def.scale * ISLAND_SCALE * grow;
      obj.position.set(def.x * k, 0, def.z * k);
      obj.scale.setScalar(scale);
      const [sx, sy] = ISLAND_SIZE[def.model];
      Object.assign(shore, { x: def.x * k, z: def.z * k, rx: sx * 1.04 * scale, rz: sy * 1.06 * scale });
      islands.push(shore);
    }
    for (const { def, floater } of buoys) {
      const show = size >= (def.minSize ?? 0);
      floater.obj.visible = show;
      floater.x = def.x * k;
      floater.z = def.z * k;
    }
  }
  layout(10);
  return { islands, floaters, layout };
}
