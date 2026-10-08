import { LOOK } from '../config/look';
import type { Pose, Shot } from '../render/camera';

type P = { x: number; z: number };
type V3 = { x: number; y: number; z: number };
/** The player's sub: where it is, its heading (radians, bow at +X turning toward −Z) and half its length in cells. */
export type SubPose = P & { yaw: number; half: number };
/** The camera's lens, for shots composed by screen position. */
export type Lens = { fov: number; aspect: number };
/** Where the camera is, as the camera reports it (`view.pose()`); angles in degrees. */
export type CameraPose = { target: V3; az: number; el: number; dist: number };

type Numbers<T> = { -readonly [K in keyof T]: T[K] extends boolean ? boolean : number };
/** Title-sequence settings (see `LOOK.shots.title`). */
export type TitleParams = Numbers<typeof LOOK.shots.title>;
/** Departure settings (see `LOOK.shots.depart`). */
export type DepartParams = Numbers<typeof LOOK.shots.depart>;
/** Mission-start settings (see `LOOK.shots.intro`; the tuner's "Camera shots" group edits them). */
export type IntroParams = Numbers<typeof LOOK.shots.intro>;
/** Kill-shot settings (see `LOOK.shots.kill`). */
export type KillParams = Numbers<typeof LOOK.shots.kill>;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (t: number) => { const x = clamp01(t); return x * x * (3 - 2 * x); };
const deg = (r: number) => (r * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;
const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
/** The same angle as `a`, within half a turn of `ref`. */
const near = (a: number, ref: number) => ref + wrap180(a - ref);

/**
 * A smooth path through keyframes: it eases out of the first key and into the
 * last, and passes through the ones between without stopping (cubic Hermite,
 * with each middle key's velocity set by its neighbours).
 */
export function path(keys: { t: number; v: number[] }[], t: number): number[] {
  const last = keys.length - 1;
  if (t <= keys[0].t) return keys[0].v.slice();
  if (t >= keys[last].t) return keys[last].v.slice();
  let i = 0;
  while (t > keys[i + 1].t) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const vel = (j: number) =>
    keys[j].v.map((_, k) => (j === 0 || j === last ? 0 : (keys[j + 1].v[k] - keys[j - 1].v[k]) / (keys[j + 1].t - keys[j - 1].t)));
  const va = vel(i);
  const vb = vel(i + 1);
  const h = b.t - a.t;
  const s = (t - a.t) / h;
  const s2 = s * s;
  const s3 = s2 * s;
  return a.v.map((_, k) =>
    (2 * s3 - 3 * s2 + 1) * a.v[k] + (s3 - 2 * s2 + s) * h * va[k] + (-2 * s3 + 3 * s2) * b.v[k] + (s3 - s2) * h * vb[k]);
}

/** Unit vector for a facing angle: 0 looks along +Z, 90° along +X (the camera's azimuth convention). */
const facing = (phi: number) => ({ x: Math.sin(phi), z: Math.cos(phi) });
/** The sub's bow direction. */
const bowDir = (yaw: number) => ({ x: Math.cos(yaw), z: -Math.sin(yaw) });

// ---- Title sequence ----------------------------------------------------------

export const titleSeconds = (p: TitleParams) => p.high + p.descend;

/**
 * The sub's heading for the title, so the menu view looks across the light:
 * `sunAngle` degrees off straight down-sun (0 would put the sun right behind
 * the camera; 180 into the lens). `sunAz` is the sun's azimuth in degrees.
 */
export function titleHeading(sunAz: number, p: TitleParams = LOOK.shots.title) {
  // The view looks roughly back along the eye's bearing from the bow.
  const look = rad(sunAz + 180 + p.sunAngle);
  const bow = look + Math.PI - rad(p.bearing);
  const f = facing(bow);
  return Math.atan2(-f.z, f.x);
}

/**
 * The menu view: low over the water, beside the sub's bow, with the sub's
 * front half on the right of the screen and the horizon a third of the way down.
 */
export function titleFrame(sub: SubPose, lens: Lens, p: TitleParams = LOOK.shots.title) {
  const f = bowDir(sub.yaw);
  const front = { x: sub.x + f.x * sub.half * 0.45, y: 0.25, z: sub.z + f.z * sub.half * 0.45 };
  const bearing = Math.atan2(f.x, f.z) + rad(p.bearing);
  const eye = { x: front.x + Math.sin(bearing) * p.dist, y: p.eyeHeight, z: front.z + Math.cos(bearing) * p.dist };
  const tanHalf = Math.tan(rad(lens.fov / 2));
  // Turning the view left (a larger facing angle) moves the sub to the right of the screen.
  const yaw = Math.atan2(front.x - eye.x, front.z - eye.z) + Math.atan(p.frameX * tanHalf * lens.aspect);
  const pitch = -Math.atan((1 - 2 * p.horizon) * tanHalf);
  return { eye, yaw, pitch, focus: Math.hypot(front.x - eye.x, front.y - eye.y, front.z - eye.z) };
}

/**
 * Title sequence: fades in from black high over the sea looking at the
 * horizon, glides down to look at the sub's spot as it surfaces, then settles
 * into the menu view, opens the letterbox and holds there (with a slow bob)
 * until replaced.
 */
export function titleShot(sub: SubPose, lens: Lens, p: TitleParams = LOOK.shots.title): Shot {
  const end = titleFrame(sub, lens, p);
  const d = facing(end.yaw);
  const at = (back: number, y: number) => [sub.x - d.x * back, y, sub.z - d.z * back];
  const keys = [
    { t: 0, v: [...at(p.back, p.height), end.yaw, -rad(p.highPitch), 70] },
    { t: p.high, v: [...at(p.back - 4, p.height - 1.2), end.yaw, -rad(p.highPitch + 2.5), 55] },
    { t: p.high + p.descend * 0.5, v: [...at(p.lowBack, p.lowHeight), end.yaw, -Math.atan2(p.lowHeight - 0.2, p.lowBack), Math.hypot(p.lowBack, p.lowHeight)] },
    { t: titleSeconds(p), v: [end.eye.x, end.eye.y, end.eye.z, end.yaw, end.pitch, end.focus] },
  ];
  const settled = titleSeconds(p);
  return (t) => {
    const [ex, ey, ez, yaw, pitch, focus] = path(keys, t);
    const u = Math.max(0, t - settled);
    const bob = p.sway * Math.sin(u * 0.55) * smooth(u / 3);
    const eye = { x: ex, y: ey + bob, z: ez };
    const look = facing(yaw);
    const target = {
      x: ex + look.x * Math.cos(pitch) * focus,
      y: ey + bob * 0.6 + Math.sin(pitch) * focus,
      z: ez + look.z * Math.cos(pitch) * focus,
    };
    // The letterbox opens as the menu comes up.
    const bars = 1 - smooth((t - settled - p.menuDelay) / 0.9);
    return { eye, target, snap: true, fade: 1 - smooth(t / p.fadeIn), bars };
  };
}

// ---- Departure -----------------------------------------------------------------

export const departSeconds = (p: DepartParams) => Math.max(p.seconds, p.fadeAt + p.fadeOut);

/**
 * Leaving for a mission: the letterbox closes in, the camera pulls back and
 * up from wherever it is, and the picture fades to black. It holds on black
 * until the mission start replaces it.
 */
export function departShot(from: CameraPose, p: DepartParams = LOOK.shots.depart): Shot {
  return (t) => {
    const u = smooth(t / p.seconds);
    return {
      target: from.target,
      az: from.az + p.swing * u,
      el: Math.min(80, from.el + p.rise * u),
      dist: from.dist * lerp(1, p.pull, u),
      snap: true,
      bars: smooth(t / p.bars),
      fade: smooth((t - p.fadeAt) / p.fadeOut),
    };
  };
}

// ---- Mission start -------------------------------------------------------------

/** How long the mission-start shot lasts before the camera is handed back. */
export const introSeconds = (p: IntroParams) => p.surface + p.hold + p.settle;

/**
 * Mission start: fades in from black high above the sub as it rises, moves in
 * close, and carries on in one motion round to the board's default framing.
 * The letterbox opens as it arrives.
 */
export function introShot(sub: P, home: CameraPose, p: IntroParams = LOOK.shots.intro): Shot {
  const close = p.surface + p.hold;
  const end = introSeconds(p);
  const azA = home.az + p.heading;
  const azB = azA + p.drift * close;
  const keys = [
    { t: 0, v: [sub.x, 0.3, sub.z, azA, p.highTilt, p.highDist] },
    { t: close, v: [sub.x, 0.3, sub.z, azB, p.tilt, p.dist] },
    { t: end, v: [home.target.x, home.target.y, home.target.z, near(home.az, azB), home.el, home.dist] },
  ];
  return (t) => {
    if (t > end) return null;
    const [x, y, z, az, el, dist] = path(keys, t);
    return {
      target: { x, y, z }, az, el, dist, snap: true,
      fade: 1 - smooth(t / p.fadeIn),
      bars: 1 - smooth((t - (end - p.barsOut)) / p.barsOut),
    };
  };
}

// ---- Kill shots ----------------------------------------------------------------

/** A planned kill shot: the shot, and when the torpedo leaves and how long it runs. */
export type KillPlan = { shot: Shot; lead: number; run: number; drone: boolean };

/** Where the torpedo leaves the sub. */
export const bowOf = (sub: SubPose) => {
  const f = bowDir(sub.yaw);
  return { x: sub.x + f.x * sub.half, z: sub.z + f.z * sub.half };
};

/** A number in [0, 1) from integers, the same every time (presentation only: it never touches the game's RNG). */
export function hash01(a: number, b: number) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** The drone kill plays about one kill in five, and only when the ship is far enough off. */
export function pickDrone(gap: number, roll: number, p: KillParams = LOOK.shots.kill) {
  return gap >= p.droneMinGap && roll < p.droneChance;
}

/** Plan the shot for the torpedo that sinks a ship. `length` is the ship's span in cells. */
export function planKill(sub: SubPose, ship: P, length: number, drone: boolean, p: KillParams = LOOK.shots.kill): KillPlan {
  return drone
    ? { shot: droneKillShot(sub, ship, length, p), lead: p.dip + p.droneLead, run: p.droneRun, drone }
    : { shot: killShot(sub, ship, length, p), lead: p.lead, run: p.run, drone };
}

/** Circling the wreck after impact, carrying on from heading `az0`. */
function circleWreck(ship: P, length: number, az0: number, p: KillParams) {
  const dist = Math.max(13, length * 1.4 + 7) * p.pullDist;
  return (u: number): Pose => ({ target: { x: ship.x, y: 0.3, z: ship.z }, az: az0 + p.circle * u, el: p.pullTilt, dist, rate: p.pullRate });
}

/**
 * The usual kill shot: a soft pan to behind the sub with the ship ahead, a
 * soft zoom onto the torpedo as it runs in, then on round the ship as it
 * blows up and sinks, in one direction throughout.
 */
export function killShot(sub: P, ship: P, length: number, p: KillParams = LOOK.shots.kill): Shot {
  const dx = sub.x - ship.x;
  const dz = sub.z - ship.z;
  const gap = Math.hypot(dx, dz) || 1;
  const behind = deg(Math.atan2(dx, dz)); // the camera sits on the sub's side, away from the ship
  const close = Math.min(18, Math.max(8, gap * 0.8 + 5)) * p.closeDist;
  const impact = p.lead + p.run;
  const at = (f: number) => ({ x: lerp(sub.x, ship.x, f), y: 0.3, z: lerp(sub.z, ship.z, f) });
  const az0 = behind + p.closeHeading;
  const after = circleWreck(ship, length, az0 + p.followSwing, p);
  return (t) => {
    if (t < p.lead) return { target: at(p.aim), az: az0, el: p.closeTilt, dist: close, rate: p.closeRate };
    if (t < impact) {
      const f = clamp01((t - p.lead) / p.run);
      return { target: at(lerp(p.aim, 1, smooth(f))), az: az0 + p.followSwing * f, el: p.followTilt, dist: p.followDist, rate: p.followRate };
    }
    const u = t - impact;
    return u > p.after ? null : after(u);
  };
}

/**
 * The drone kill: a dip to black, then a close-up of the sub's bow tracking
 * the torpedo out of the tube; a cut to a high view from behind the sub that
 * rises slowly as the torpedo runs in; then round the ship as it blows up.
 */
export function droneKillShot(sub: SubPose, ship: P, length: number, p: KillParams = LOOK.shots.kill): Shot {
  const bow = bowOf(sub);
  const gap = Math.hypot(ship.x - bow.x, ship.z - bow.z) || 1;
  const u = { x: (ship.x - bow.x) / gap, z: (ship.z - bow.z) / gap };
  const launch = p.dip + p.droneLead;
  const cut = launch + p.droneCut;
  const impact = launch + p.droneRun;
  const torp = (t: number) => {
    const f = clamp01((t - launch) / p.droneRun);
    return { x: lerp(bow.x, ship.x, f), y: 0.12, z: lerp(bow.z, ship.z, f) };
  };
  // Beside the bow, a little behind it: the torpedo runs away across the frame.
  const b = Math.atan2(u.x, u.z) + rad(p.bowBearing);
  const side = facing(b);
  const behind = deg(Math.atan2(-u.x, -u.z));
  const after = circleWreck(ship, length, behind, p);
  return (t) => {
    if (t < p.dip) return { fade: smooth(t / p.dip) };
    if (t < cut) {
      const k = (t - p.dip) / (cut - p.dip);
      const d = p.bowDist * lerp(1, p.bowZoom, smooth(k));
      return {
        eye: { x: bow.x + side.x * d, y: p.bowHeight, z: bow.z + side.z * d },
        target: torp(t),
        snap: t - p.dip < 0.05, rate: 9,
        fade: 1 - smooth((t - p.dip) / (p.dip * 1.6)),
      };
    }
    if (t < impact) {
      const rise = p.droneRise * (t - cut);
      return {
        eye: { x: sub.x - u.x * p.droneBack, y: p.droneHeight + rise, z: sub.z - u.z * p.droneBack },
        target: { x: lerp(bow.x, ship.x, 0.7), y: 0, z: lerp(bow.z, ship.z, 0.7) },
        snap: true, fade: 0,
      };
    }
    const v = t - impact;
    return v > p.after ? null : after(v);
  };
}

// ---- Ship reveal ---------------------------------------------------------------

/**
 * The heading to turn to when a ship is found: broadside on, so its word reads
 * across the screen, from the side with the sun behind the camera, unless that
 * means turning more than `maxTurn` degrees (then the nearer side). `axis` is
 * the ship's direction on the water; angles in degrees.
 */
export function revealHeading(currentAz: number, axis: P, sunAz: number, maxTurn = 120) {
  const broad = deg(Math.atan2(axis.x, axis.z)) + 90;
  const [a, b] = [broad, broad + 180].map((h) => near(h, currentAz));
  const sunny = Math.abs(wrap180(a - sunAz)) <= Math.abs(wrap180(b - sunAz)) ? a : b;
  const nearer = Math.abs(a - currentAz) <= Math.abs(b - currentAz) ? a : b;
  return Math.abs(sunny - currentAz) <= maxTurn ? sunny : nearer;
}
