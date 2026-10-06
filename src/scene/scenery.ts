import type { Group } from 'three/webgpu';
import { loadModel } from '../render/assets';
import type { IslandShore } from '../render/ocean';
import type { Floater } from './buoyancy';

/** Islands framing a 10×10 board (cells span x, z ∈ [-5, 5]). */
const ISLANDS = [
  { model: 'island_lighthouse', x: -8.9, z: -1.2, yaw: 0.35, scale: 1.0 },
  { model: 'island_wooded', x: 8.7, z: -4.8, yaw: 2.1, scale: 0.95 },
  { model: 'island_rock', x: 7.6, z: 1.6, yaw: 0.8, scale: 1.0 },
  { model: 'island_wooded', x: 8.3, z: 7.9, yaw: -0.6, scale: 1.25 },
  { model: 'island_rock', x: -7.2, z: 7.4, yaw: 2.6, scale: 0.85 },
  { model: 'island_rock', x: -4.0, z: -8.4, yaw: 1.2, scale: 0.7 },
];
/** Island kit footprint (sx, sy) per model, and a global size boost. */
const ISLAND_SIZE: Record<string, [number, number]> = {
  island_lighthouse: [1.75, 1.3], island_wooded: [1.3, 1.05], island_rock: [0.8, 0.65],
};
const ISLAND_SCALE = 1.2;
const BUOYS: [number, number][] = [[-6.0, 4.6], [6.1, -1.4], [3.2, 6.1], [-2.6, -6.2], [5.9, 4.2], [-6.1, -4.1], [1.5, -6.0]];

/**
 * Static scenery around the board: islands (whose waterlines feed the ocean's
 * surf) and buoys (which float).
 */
export async function addScenery(root: Group) {
  const islands: IslandShore[] = [];
  const floaters: Floater[] = [];
  // Waterline radii come from the island kit's sx/sy (Blender Y becomes
  // three.js -Z, which an ellipse doesn't care about).
  for (const isl of ISLANDS) {
    const m = await loadModel(isl.model);
    const scale = isl.scale * ISLAND_SCALE;
    m.position.set(isl.x, 0, isl.z);
    m.rotation.y = isl.yaw;
    m.scale.setScalar(scale);
    root.add(m);
    const [sx, sy] = ISLAND_SIZE[isl.model];
    islands.push({ x: isl.x, z: isl.z, rx: sx * 1.04 * scale, rz: sy * 1.06 * scale, yaw: isl.yaw });
  }
  for (const [i, [x, z]] of BUOYS.entries()) {
    const b = await loadModel('buoy');
    b.scale.setScalar(1.15);
    root.add(b);
    floaters.push({ obj: b, x, z, yaw: i * 1.7 });
  }
  return { islands, floaters };
}
