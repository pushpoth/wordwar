import type { Vector3 } from 'three';

/** Miniature-scale swell: wavelengths of a few cells, amplitudes of a few hundredths. */
export const WAVES = [
  { dir: [1.0, 0.35], length: 6.0, steep: 0.07, speed: 0.55 },
  { dir: [0.6, 1.0], length: 3.8, steep: 0.07, speed: 0.48 },
  { dir: [-0.4, 1.0], length: 2.6, steep: 0.06, speed: 0.40 },
  { dir: [1.0, -0.7], length: 1.7, steep: 0.05, speed: 0.34 },
  { dir: [-1.0, -0.25], length: 1.15, steep: 0.045, speed: 0.29 },
  { dir: [0.2, -1.0], length: 0.8, steep: 0.035, speed: 0.24 },
];

/** Same displacement in TypeScript, for floating objects on the waves. */
export function waveOffset(x: number, z: number, t: number, out: Vector3) {
  out.set(0, 0, 0);
  for (const w of WAVES) {
    const len = Math.hypot(w.dir[0], w.dir[1]);
    const dx = w.dir[0] / len;
    const dz = w.dir[1] / len;
    const k = (2 * Math.PI) / w.length;
    const a = w.steep / k;
    const f = (x * dx + z * dz) * k - t * w.speed * k;
    out.x += Math.cos(f) * dx * a;
    out.y += Math.sin(f) * a;
    out.z += Math.cos(f) * dz * a;
  }
  return out;
}
