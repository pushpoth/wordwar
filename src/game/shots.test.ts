import { describe, expect, it } from 'vitest';
import { LOOK } from '../config/look';
import {
  bowOf, departSeconds, departShot, droneKillShot, hash01, introSeconds, introShot, killShot, path, pickDrone, planKill,
  revealHeading, titleFrame, titleHeading, titleSeconds, titleShot,
} from './shots';

const intro = LOOK.shots.intro;
const kill = LOOK.shots.kill;
const title = LOOK.shots.title;
const depart = LOOK.shots.depart;
const INTRO_SECONDS = introSeconds(intro);

const home = { target: { x: 0, y: 0, z: 0.6 }, az: -28, el: 52, dist: 25 };
const sub = { x: 2, z: -3, yaw: 0.6, half: 1.2 };
const lens = { fov: 30, aspect: 16 / 9 };

/** Where on screen (NDC, −1…1) a point lands for a camera at `eye` looking at `target`. */
function project(eye: { x: number; y: number; z: number }, target: { x: number; y: number; z: number }, p: { x: number; y: number; z: number }) {
  const f = norm(sub3(target, eye));
  const r = norm({ x: -f.z, y: 0, z: f.x }); // right = f × up
  const u = cross(r, f);
  const d = sub3(p, eye);
  const z = dot(d, f);
  const t = Math.tan((lens.fov * Math.PI) / 360);
  return { x: dot(d, r) / z / (t * lens.aspect), y: dot(d, u) / z / t };
}
type V = { x: number; y: number; z: number };
const sub3 = (a: V, b: V) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: V, b: V) => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = (a: V) => { const l = Math.hypot(a.x, a.y, a.z); return { x: a.x / l, y: a.y / l, z: a.z / l }; };
const cross = (a: V, b: V) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

describe('path', () => {
  const keys = [{ t: 0, v: [0] }, { t: 1, v: [10] }, { t: 3, v: [12] }];
  it('passes through every key and holds at the ends', () => {
    expect(path(keys, -1)[0]).toBe(0);
    expect(path(keys, 1)[0]).toBeCloseTo(10);
    expect(path(keys, 3)[0]).toBeCloseTo(12);
    expect(path(keys, 9)[0]).toBe(12);
  });
  it('keeps moving through a middle key (no stop), and starts and ends at rest', () => {
    const speed = (t: number) => (path(keys, t + 1e-4)[0] - path(keys, t - 1e-4)[0]) / 2e-4;
    expect(speed(1)).toBeGreaterThan(1);
    expect(Math.abs(speed(1e-3))).toBeLessThan(0.1);
    expect(Math.abs(speed(3 - 1e-3))).toBeLessThan(0.1);
  });
});

describe('titleShot', () => {
  const shot = titleShot(sub, lens);
  const end = titleSeconds(title);
  it('starts black and high, with the horizon in view', () => {
    const p = shot(0)!;
    expect(p.fade).toBe(1);
    expect(p.bars).toBe(1);
    expect(p.eye!.y).toBeCloseTo(title.height);
    expect(p.target!.y).toBeGreaterThan(0); // looking out, not down at the board
  });
  it('fades in', () => {
    expect(shot(title.fadeIn + 0.01)!.fade).toBe(0);
  });
  it('settles low over the water with the sub on the right and the horizon a third of the way down', () => {
    const p = shot(end)!;
    expect(p.eye!.y).toBeCloseTo(title.eyeHeight);
    const front = { x: sub.x + Math.cos(sub.yaw) * sub.half * 0.45, y: 0.25, z: sub.z - Math.sin(sub.yaw) * sub.half * 0.45 };
    const s = project(p.eye!, p.target as V, front);
    expect(s.x).toBeCloseTo(title.frameX, 1);
    // The horizon: a point far off at eye height in the view direction.
    const far = { x: p.eye!.x + (p.target!.x - p.eye!.x) * 1e4, y: p.eye!.y, z: p.eye!.z + (p.target!.z - p.eye!.z) * 1e4 };
    expect(project(p.eye!, p.target as V, far).y).toBeCloseTo(1 - 2 * title.horizon, 2);
  });
  it('holds after settling (it never ends by itself), opening the letterbox for the menu', () => {
    expect(shot(end + 60)).not.toBeNull();
    expect(shot(end + title.menuDelay + 2)!.bars).toBe(0);
  });
  it('turns the sub so the view looks across the light', () => {
    const yaw = titleHeading(186, title);
    const f = titleFrame({ ...sub, yaw }, lens, title);
    // The view's facing angle against straight down-sun (186 + 180).
    const off = ((((f.yaw * 180) / Math.PI - (186 + 180) + 540) % 360) + 360) % 360 - 180;
    expect(Math.abs(Math.abs(off) - title.sunAngle)).toBeLessThan(12);
  });
});

describe('departShot', () => {
  const from = { target: { x: 1, y: 0.3, z: 1 }, az: 10, el: 6, dist: 4 };
  const shot = departShot(from, depart);
  it('starts where the camera is, closes the letterbox, pulls back and fades to black', () => {
    expect(shot(0)).toMatchObject({ az: 10, el: 6, dist: 4, bars: 0, fade: 0 });
    const p = shot(departSeconds(depart))!;
    expect(p.bars).toBe(1);
    expect(p.fade).toBe(1);
    expect(p.dist!).toBeCloseTo(4 * depart.pull);
    expect(p.el!).toBeGreaterThan(6);
  });
  it('holds on black until replaced', () => {
    expect(shot(departSeconds(depart) + 10)!.fade).toBe(1);
  });
});

describe('introShot (mission start)', () => {
  const shot = introShot({ x: 2, z: -3 }, home);
  it('starts black and high over the sub', () => {
    const p = shot(0)!;
    expect(p.fade).toBe(1);
    expect(p.target).toMatchObject({ x: 2, z: -3 });
    expect(p.el!).toBeCloseTo(intro.highTilt);
    expect(p.dist!).toBeCloseTo(intro.highDist);
  });
  it('moves in close as the sub surfaces, still moving', () => {
    const t = intro.surface + intro.hold;
    const p = shot(t)!;
    expect(p.dist!).toBeCloseTo(intro.dist);
    expect(shot(t + 0.1)!.dist!).toBeGreaterThan(p.dist!);
  });
  it('arrives at the default framing with the letterbox open, and ends', () => {
    const p = shot(INTRO_SECONDS)!;
    expect(p.target).toMatchObject(home.target);
    expect(p.el!).toBeCloseTo(home.el);
    expect(p.dist!).toBeCloseTo(home.dist);
    expect(p.bars).toBe(0);
    expect(shot(INTRO_SECONDS + 0.1)).toBeNull();
  });
  it('lengthens when its times grow', () => {
    const slow = { ...intro, hold: intro.hold + 2 };
    expect(introShot({ x: 0, z: 0 }, home, slow)(INTRO_SECONDS + 0.1)).not.toBeNull();
    expect(introShot({ x: 0, z: 0 }, home, slow)(introSeconds(slow) + 0.1)).toBeNull();
  });
});

describe('killShot', () => {
  const s = { x: 0, z: 0 };
  const ship = { x: 6, z: 0 };
  const shot = killShot(s, ship, 5);
  const impact = kill.lead + kill.run;
  it('starts near the sub with the ship in view', () => {
    const p = shot(0.1)!;
    expect(p.target!.x).toBeGreaterThan(0);
    expect(p.target!.x).toBeLessThan(ship.x);
  });
  it('follows the torpedo in to the ship', () => {
    const early = shot(kill.lead + 0.1)!.target!.x;
    const late = shot(impact - 0.05)!.target!.x;
    expect(late).toBeGreaterThan(early);
    expect(late).toBeCloseTo(ship.x, 0);
  });
  it('circles the ship after impact, the same way it swung during the run, then ends', () => {
    const a = shot(impact + 1)!;
    const b = shot(impact + 3)!;
    expect(a.target).toMatchObject({ x: ship.x, z: ship.z });
    expect(Math.sign(b.az! - a.az!)).toBe(Math.sign(kill.followSwing));
    expect(shot(impact + kill.after + 0.1)).toBeNull();
  });
  it('moves the camera farther when its distances grow', () => {
    const near = killShot(s, ship, 5, kill)(0.1)!;
    const far = killShot(s, ship, 5, { ...kill, closeDist: 2 })(0.1)!;
    expect(far.dist!).toBeCloseTo(near.dist! * 2);
  });
});

describe('droneKillShot', () => {
  const s = { x: 0, z: 0, yaw: 0, half: 1.2 }; // bow toward +X
  const ship = { x: 12, z: 0 };
  const shot = droneKillShot(s, ship, 4);
  const launch = kill.dip + kill.droneLead;
  const cut = launch + kill.droneCut;
  const impact = launch + kill.droneRun;
  it('dips to black, then cuts to a close, low view of the bow', () => {
    expect(shot(kill.dip * 0.5)!.fade!).toBeGreaterThan(0.2);
    const p = shot(kill.dip + 0.01)!;
    expect(p.snap).toBe(true);
    expect(p.eye!.y).toBeCloseTo(kill.bowHeight);
    expect(p.target!.x).toBeCloseTo(bowOf(s).x);
  });
  it('tracks the torpedo out of the tube', () => {
    expect(shot(cut - 0.05)!.target!.x).toBeGreaterThan(bowOf(s).x + 0.5);
  });
  it('cuts to a high view behind the sub that rises while the torpedo runs', () => {
    const a = shot(cut + 0.01)!;
    const b = shot(impact - 0.01)!;
    expect(a.snap).toBe(true);
    expect(a.eye!.x).toBeLessThan(s.x);
    expect(a.eye!.y).toBeGreaterThan(3);
    expect(b.eye!.y).toBeGreaterThan(a.eye!.y);
    expect(a.target!.x).toBeGreaterThan(s.x);
  });
  it('then circles the ship and ends', () => {
    expect(shot(impact + 1)!.target).toMatchObject({ x: ship.x, z: ship.z });
    expect(shot(impact + kill.after + 0.1)).toBeNull();
  });
  it('is planned with its own torpedo timing', () => {
    const plan = planKill(s, ship, 4, true, kill);
    expect(plan.lead).toBeCloseTo(launch);
    expect(plan.run).toBe(kill.droneRun);
    expect(planKill(s, ship, 4, false, kill).lead).toBe(kill.lead);
  });
});

describe('pickDrone', () => {
  it('needs distance', () => {
    expect(pickDrone(kill.droneMinGap - 1, 0, kill)).toBe(false);
    expect(pickDrone(kill.droneMinGap + 1, 0, kill)).toBe(true);
  });
  it('plays about one kill in five', () => {
    let n = 0;
    for (let i = 0; i < 2000; i++) if (pickDrone(99, hash01(i * 7 + 1, i % 9), kill)) n++;
    expect(n / 2000).toBeGreaterThan(0.15);
    expect(n / 2000).toBeLessThan(0.25);
  });
});

describe('revealHeading', () => {
  it('turns broadside to the ship', () => {
    const az = revealHeading(0, { x: 1, z: 0 }, 0, 180); // ship along X: broadside views look along Z
    expect(Math.abs(((az % 180) + 180) % 180)).toBeCloseTo(0);
  });
  it('picks the side with the sun behind the camera', () => {
    expect(revealHeading(80, { x: 1, z: 0 }, 180, 180)).toBeCloseTo(180);
    expect(revealHeading(80, { x: 1, z: 0 }, 0, 180)).toBeCloseTo(0);
  });
  it('takes the nearer side when the sunny one is the long way round', () => {
    expect(revealHeading(10, { x: 1, z: 0 }, 180, 120)).toBeCloseTo(0);
  });
});
