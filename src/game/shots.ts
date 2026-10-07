import { LOOK } from '../config/look';
import type { Shot } from '../render/camera';

type P = { x: number; z: number };

/** Opening-shot settings (see `LOOK.shots.intro`; the tuner's "Camera shots" group edits them). */
type Numbers<T> = { -readonly [K in keyof T]: number };
export type IntroParams = Numbers<typeof LOOK.shots.intro>;
/** Kill-shot settings (see `LOOK.shots.kill`). */
export type KillParams = Numbers<typeof LOOK.shots.kill>;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const deg = (rad: number) => (rad * 180) / Math.PI;

/** How long the opening shot lasts before the camera is handed back. */
export const introSeconds = (p: IntroParams) => p.surface + p.hold + p.settle;

/**
 * Opening shot: a close, high view of the submarine as it surfaces, then a slow
 * settle back to the board's default framing. With the default tilt it never
 * shows the horizon.
 */
export function introShot(sub: P, home: { az: number; el: number; dist: number }, p: IntroParams = LOOK.shots.intro): Shot {
  const at = { x: sub.x, y: 0.3, z: sub.z };
  const end = introSeconds(p);
  return (t) => {
    if (t > end) return null;
    const az = home.az + p.heading + p.drift * t;
    if (t < 0.02) return { snap: true, target: at, az, el: p.tilt, dist: p.dist };
    // Hold close until the sub has broken the surface, then ease out.
    if (t < p.surface + p.hold) return { target: at, az, el: p.tilt, dist: p.dist - 0.2 * t, rate: 6 };
    return { az: home.az, el: home.el, dist: home.dist, rate: p.rate };
  };
}

/**
 * Kill shot, for the torpedo that sinks a ship: close behind the sub with the
 * ship ahead, then riding the torpedo in, then pulling back and circling the
 * wreck as it sinks. `length` is the ship's span in cells.
 */
export function killShot(sub: P, ship: P, length: number, p: KillParams = LOOK.shots.kill): Shot {
  const dx = sub.x - ship.x;
  const dz = sub.z - ship.z;
  const gap = Math.hypot(dx, dz) || 1;
  const behind = deg(Math.atan2(dx, dz)); // the camera sits on the sub's side, away from the ship
  const close = Math.min(18, Math.max(8, gap * 0.8 + 5)) * p.closeDist;
  const impact = p.lead + p.run;
  const at = (f: number) => ({ x: lerp(sub.x, ship.x, f), y: 0.3, z: lerp(sub.z, ship.z, f) });
  return (t) => {
    if (t < p.lead) return { target: at(p.aim), az: behind + p.closeHeading, el: p.closeTilt, dist: close, rate: p.closeRate };
    if (t < impact) {
      const f = clamp01((t - p.lead) / p.run);
      return { target: at(f), az: behind + p.closeHeading + p.followSwing * f, el: p.followTilt, dist: p.followDist, rate: p.followRate };
    }
    const u = t - impact;
    if (u > p.after) return null;
    return {
      target: at(1), az: behind + p.pullHeading + p.circle * u, el: p.pullTilt,
      dist: Math.max(13, length * 1.4 + 7) * p.pullDist, rate: p.pullRate,
    };
  };
}
