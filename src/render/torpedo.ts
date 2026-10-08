import { CapsuleGeometry, Group, Mesh, MeshBasicNodeMaterial, MeshStandardNodeMaterial, SphereGeometry, Vector3 } from 'three/webgpu';
import { waveOffset } from './waves';

const tmp = new Vector3();

/**
 * The torpedo itself, running awash from the sub's bow to its target (the
 * water shader paints its wake). It waits out of sight below the sea between
 * runs, so its shaders are compiled with everything else.
 */
export function createTorpedo() {
  const group = new Group();
  group.name = 'torpedo';
  const body = new Mesh(
    new CapsuleGeometry(0.045, 0.36, 4, 12),
    new MeshStandardNodeMaterial({ color: 0x2b3236, metalness: 0.7, roughness: 0.35 }),
  );
  body.rotation.z = Math.PI / 2; // along +X, like the ships
  const glow = new Mesh(new SphereGeometry(0.04, 10, 8), new MeshBasicNodeMaterial({ color: 0xffc070 }));
  glow.position.x = -0.24;
  group.add(body, glow);
  group.position.y = -40;

  /** Pose the torpedo `f` (0–1) of the way from `from` to `to` at time t; null puts it away. */
  function set(from: { x: number; z: number }, to: { x: number; z: number }, f: number | null, t: number) {
    if (f === null) {
      group.position.y = -40;
      return;
    }
    const x = from.x + (to.x - from.x) * f;
    const z = from.z + (to.z - from.z) * f;
    waveOffset(x, z, t, tmp);
    // It leaves the tube just under the surface and runs awash.
    group.position.set(x + tmp.x, tmp.y - 0.03 - 0.06 * Math.max(0, 1 - f * 8), z + tmp.z);
    group.rotation.set(0, Math.atan2(-(to.z - from.z), to.x - from.x), 0);
  }

  return { group, set };
}
