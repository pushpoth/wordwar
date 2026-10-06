import { Vector3, type Object3D } from 'three/webgpu';
import type { HullFootprint } from '../render/hulls';
import { waveOffset } from '../render/waves';

/**
 * Something that floats. Ships give a hull size, so their heave, pitch and
 * roll are fitted to the water under bow, stern and both sides; buoys and
 * other small things just follow the surface at one point. A sinking ship
 * adds settle depth and list on top of the ride.
 */
export type Floater = {
  obj: Object3D;
  x: number;
  z: number;
  yaw: number;
  /** Half length and half beam in cells; omit for a point floater. */
  hull?: { halfLength: number; halfBeam: number };
  /** Cells per second through the water, for the wake. */
  speed?: number;
  /** Extra height offset (negative settles lower). */
  lift?: number;
  /** Permanent list while sinking, radians. */
  list?: { roll: number; pitch: number };
};

const tmp = new Vector3();
const acc = new Vector3();

/** Average surface displacement at a set of points. */
function sample(points: [number, number][], t: number, calm: number) {
  acc.set(0, 0, 0);
  const ys: number[] = [];
  for (const [x, z] of points) {
    waveOffset(x, z, t, tmp, calm);
    acc.add(tmp);
    ys.push(tmp.y);
  }
  acc.multiplyScalar(1 / points.length);
  return ys;
}

/**
 * Pose a floater on the swell at time t. `dt` > 0 eases toward the target
 * pose (big hulls respond more slowly); `dt` = 0 snaps, so pinned-time
 * screenshots are exact.
 */
export function ride(f: Floater, t: number, dt: number) {
  const o = f.obj;
  let heave: number;
  let pitch = 0;
  let roll = 0;
  let dx = 0;
  let dz = 0;
  if (f.hull) {
    const fx = Math.cos(f.yaw);
    const fz = -Math.sin(f.yaw);
    const sx = Math.sin(f.yaw);
    const sz = Math.cos(f.yaw);
    const L = f.hull.halfLength * 0.8;
    const B = f.hull.halfBeam;
    const ys = sample([
      [f.x + fx * L, f.z + fz * L],
      [f.x - fx * L, f.z - fz * L],
      [f.x - sx * B, f.z - sz * B],
      [f.x + sx * B, f.z + sz * B],
      [f.x, f.z],
    ], t, 1);
    heave = acc.y;
    dx = acc.x;
    dz = acc.z;
    pitch = Math.atan2(ys[0] - ys[1], 2 * L);
    roll = Math.atan2(ys[2] - ys[3], 2 * B) * 0.85;
  } else {
    waveOffset(f.x, f.z, t, acc);
    heave = acc.y;
    dx = acc.x;
    dz = acc.z;
    const ex = waveOffset(f.x + 0.2, f.z, t, tmp).y - acc.y;
    const ez = waveOffset(f.x, f.z + 0.2, t, tmp).y - acc.y;
    pitch = Math.atan2(ex, 0.2);
    roll = -Math.atan2(ez, 0.2);
  }

  roll += f.list?.roll ?? 0;
  pitch += f.list?.pitch ?? 0;
  const targetY = heave + (f.lift ?? 0);

  // Ease toward the target pose; a 4.7-cell destroyer lags the water a little.
  const tau = f.hull ? 0.08 + f.hull.halfLength * 0.05 : 0.05;
  const k = dt > 0 ? 1 - Math.exp(-dt / tau) : 1;
  const u = o.userData as { roll?: number; pitch?: number };
  u.roll = (u.roll ?? roll) + (roll - (u.roll ?? roll)) * k;
  u.pitch = (u.pitch ?? pitch) + (pitch - (u.pitch ?? pitch)) * k;
  o.position.set(f.x + dx, o.position.y + (targetY - o.position.y) * k, f.z + dz);
  o.rotation.set(u.roll, f.yaw, u.pitch, 'YXZ');
}

/** The water footprint the ocean shader needs for calming and wakes. */
export function footprint(f: Floater): HullFootprint | null {
  if (!f.hull) return null;
  return { x: f.x, z: f.z, yaw: f.yaw, halfLength: f.hull.halfLength, halfBeam: f.hull.halfBeam, speed: f.speed ?? 0 };
}
