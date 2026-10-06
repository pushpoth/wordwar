import { Group, Vector3, type Object3D, type Scene } from 'three/webgpu';
import { loadModel } from '../render/assets';
import { waveOffset } from '../render/ocean';

/** Something that bobs on the swell at a fixed spot. */
type Floater = { obj: Object3D; x: number; z: number; yaw: number; lift: number; bob: number };

/**
 * Phase 0 test layout: a fixed mid-battle board modelled on the reference
 * image. Board cells span x, z ∈ [-5, 5].
 */
export async function buildDiorama(scene: Scene) {
  const root = new Group();
  root.name = 'diorama';
  scene.add(root);
  const floaters: Floater[] = [];

  const buoySpots: [number, number][] = [
    [-6.2, 3.4], [6.4, -2.1], [3.1, 6.3], [-2.4, -6.5], [6.9, 4.8], [-6.8, -3.9],
  ];
  const buoy = await loadModel('buoy');
  buoySpots.forEach(([x, z], i) => {
    const b = i === 0 ? buoy : buoy.clone(true);
    b.scale.setScalar(1.1);
    root.add(b);
    floaters.push({ obj: b, x, z, yaw: i * 1.7, lift: 0, bob: 1 });
  });

  const tmp = new Vector3();
  function update(t: number) {
    for (const f of floaters) {
      waveOffset(f.x, f.z, t, tmp);
      f.obj.position.set(f.x + tmp.x * f.bob, f.lift + tmp.y * f.bob, f.z + tmp.z * f.bob);
      // Tilt with the local slope.
      const sx = waveOffset(f.x + 0.15, f.z, t, new Vector3()).y - tmp.y;
      const sz = waveOffset(f.x, f.z + 0.15, t, new Vector3()).y - tmp.y;
      f.obj.rotation.set(sz * 2.5 * f.bob, f.yaw, -sx * 2.5 * f.bob);
    }
  }

  return { root, update, islands: [] as { x: number; z: number; r: number }[] };
}
