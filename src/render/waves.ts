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

/**
 * Sea state scales every wave's steepness: 1 is a moderate swell, 0.4 calm,
 * 1.8 rough. Ships ride the waves, so rougher seas move them harder.
 * `?sea=<n>` overrides it.
 */
export const SEA = { state: 1 };

/**
 * How much a hull calms each wave. Waves much shorter than a ship can't lift
 * it as a whole and would only poke through the hull, so they are flattened
 * under and around ships; long swell passes through untouched.
 */
export const HULL_CALMING = WAVES.map((w) => {
  const t = Math.min(1, Math.max(0, (3.5 - w.length) / (3.5 - 1.2)));
  return 0.92 * t * t * (3 - 2 * t);
});

/**
 * The ocean surface displacement in TypeScript, matching the shader, for
 * floating objects. `calm` (0–1) is how strongly a hull damps the short waves
 * at this point: 1 under a ship, 0 in open water.
 */
export function waveOffset(x: number, z: number, t: number, out: Vector3, calm = 0) {
  out.set(0, 0, 0);
  WAVES.forEach((w, i) => {
    const len = Math.hypot(w.dir[0], w.dir[1]);
    const dx = w.dir[0] / len;
    const dz = w.dir[1] / len;
    const k = (2 * Math.PI) / w.length;
    const a = ((w.steep * SEA.state) / k) * (1 - calm * HULL_CALMING[i]);
    const f = (x * dx + z * dz) * k - t * w.speed * k;
    out.x += Math.cos(f) * dx * a;
    out.y += Math.sin(f) * a;
    out.z += Math.cos(f) * dz * a;
  });
  return out;
}
