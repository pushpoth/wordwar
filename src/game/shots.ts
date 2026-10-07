import type { Shot } from '../render/camera';

type P = { x: number; z: number };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const deg = (rad: number) => (rad * 180) / Math.PI;

/** How long the submarine takes to rise to the surface in the opening shot, in seconds. */
export const SURFACE_SECONDS = 2.4;
/** How long the opening shot lasts before the camera is handed back. */
export const INTRO_SECONDS = 6.8;
/** The kill shot: the camera swings in behind the sub, the torpedo then runs, then the camera pulls back. */
export const KILL_LEAD = 1.1;
export const KILL_RUN = 1.8;
export const KILL_AFTER = 7.5;

/**
 * Opening shot: a close, high view of the submarine as it surfaces, then a slow
 * settle back to the board's default framing. Never shows the horizon.
 */
export function introShot(sub: P, home: { az: number; el: number; dist: number }): Shot {
  const at = { x: sub.x, y: 0.3, z: sub.z };
  return (t) => {
    if (t > INTRO_SECONDS) return null;
    const az = home.az + 35 + 3 * t;
    if (t < 0.02) return { snap: true, target: at, az, el: 54, dist: 6.5 };
    // Hold close until the sub has broken the surface, then ease out.
    if (t < SURFACE_SECONDS + 0.5) return { target: at, az, el: 54, dist: 6.5 - 0.2 * t, rate: 6 };
    return { az: home.az, el: home.el, dist: home.dist, rate: 1.5 };
  };
}

/**
 * Kill shot, for the torpedo that sinks a ship: close behind the sub with the
 * ship ahead, then riding the torpedo in, then pulling back and circling the
 * wreck as it sinks. `length` is the ship's span in cells.
 */
export function killShot(sub: P, ship: P, length: number): Shot {
  const dx = sub.x - ship.x;
  const dz = sub.z - ship.z;
  const gap = Math.hypot(dx, dz) || 1;
  const behind = deg(Math.atan2(dx, dz)); // the camera sits on the sub's side, away from the ship
  const close = Math.min(18, Math.max(8, gap * 0.8 + 5));
  const impact = KILL_LEAD + KILL_RUN;
  const at = (p: number) => ({ x: lerp(sub.x, ship.x, p), y: 0.3, z: lerp(sub.z, ship.z, p) });
  return (t) => {
    if (t < KILL_LEAD) return { target: at(0.35), az: behind + 18, el: 32, dist: close, rate: 2.2 };
    if (t < impact) {
      const p = clamp01((t - KILL_LEAD) / KILL_RUN);
      return { target: at(p), az: behind + 18 - 30 * p, el: 28, dist: 5.2, rate: 6 };
    }
    const u = t - impact;
    if (u > KILL_AFTER) return null;
    return { target: at(1), az: behind - 12 + 9 * u, el: 36, dist: Math.max(13, length * 1.4 + 7), rate: 1.6 };
  };
}
