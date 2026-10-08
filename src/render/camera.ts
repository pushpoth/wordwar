import { MathUtils, PerspectiveCamera, Vector3 } from 'three/webgpu';
import { LOOK } from '../config/look';
import { tune } from '../config/tunables';

/** Named framings for review shots: `?view=close` frames the explosion. */
const VIEWS: Record<string, { distance: number; elevationDeg: number; azimuthDeg: number; target: [number, number, number] }> = {
  close: { distance: 9, elevationDeg: 30, azimuthDeg: -40, target: [0.6, 0.6, 0.6] },
  ship: { distance: 7, elevationDeg: 24, azimuthDeg: -20, target: [2.2, 0.5, 3.5] },
  sub: { distance: 7.5, elevationDeg: 34, azimuthDeg: -70, target: [-3.5, 0.2, 2.5] },
};

const SPIN_DEG_PER_S = 70;
const TILT_DEG_PER_S = 35;
const MAX_TILT = 82;
/** Zoom range as a fraction of the starting distance, and the factor for one zoom step. */
const ZOOM_MIN = 0.55;
const ZOOM_MAX = 1.35;
const ZOOM_STEP = 0.8;
/** Portrait phones may zoom in a quarter closer than the other layouts. */
const PORTRAIT_ZOOM_MIN = 0.75;
/** Portrait framing: cells of sea kept around the board, and the share of the half-width the board may fill (all of it). */
const FIT_MARGIN = 0;
const FIT_FILL = 1;
const ROTATE_STEP_DEG = 90;

/**
 * Diorama camera orbiting the board centre. Left/right arrows spin it around,
 * up/down tilt it; motion eases in and out. `?az=<deg>` and `?el=<deg>` set
 * the starting angle for review shots.
 */
/**
 * Where a cinematic shot wants the camera. Any field left out stays as it is.
 * `rate` is how quickly the camera closes on the pose, per second (about 1.5 is
 * languid, 6 is a tight follow); `snap` jumps straight there.
 */
export type Pose = {
  target?: { x: number; y?: number; z: number }; az?: number; el?: number; dist?: number; rate?: number; snap?: boolean;
  /** Where the camera stands; with `target`, sets the heading, tilt and distance that put it there. */
  eye?: { x: number; y: number; z: number };
  /** The picture's fade to black (0 clear, 1 black) and the letterbox (0 open, 1 closed). */
  fade?: number;
  bars?: number;
};

/** A shot's fade and letterbox, reported to whatever draws them (see `ui/cinema.ts`). */
export type Cinema = { fade: number; bars: number };

/** A shot: asked for the pose at `t` seconds in, returns null when it is over. */
export type Shot = (t: number) => Pose | null;

const wrap180 = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

export function createCamera(aspect: number) {
  const params = new URLSearchParams(location.search);
  const view = VIEWS[params.get('view') ?? ''];
  // Review views are fixed framings; the game camera follows the tuner.
  const c = view
    ? { ...LOOK.camera, ...view, targetOffset: view.target }
    : {
        fov: tune.get('camera.fov'), distance: tune.get('camera.distance'),
        elevationDeg: tune.get('camera.elevation'), azimuthDeg: tune.get('camera.azimuth'),
        targetOffset: [0, tune.get('camera.targetY'), tune.get('camera.targetZ')] as [number, number, number],
      };
  // Far enough for the open sea out to the horizon (see the ocean's far field).
  const camera = new PerspectiveCamera(c.fov, aspect, 0.5, 1000);
  const target = new Vector3(...c.targetOffset);
  /** Where the camera looks when nothing is in focus: the board's middle. */
  const center = target.clone();
  let distance = c.distance;
  // Low angles reveal the horizon and the empty sea beyond the scenery; keep above it.
  const minTilt = () => tune.get('camera.minTilt');
  const onMove = new Set<(distance: number) => void>();

  const orbit = {
    az: Number(params.get('az') ?? c.azimuthDeg),
    el: Number(params.get('el') ?? c.elevationDeg),
    vAz: 0,
    vEl: 0,
  };
  // The default framing, which cinematics settle back to.
  let homeAz = orbit.az;
  let homeEl = orbit.el;
  /** A point (a revealed ship) the camera pans to and orbits around; null for the board's middle. */
  let focus: { x: number; z: number; y?: number } | null = null;
  let script: { fn: Shot; t: number; restore: { az: number; el: number; dist: number } } | null = null;
  /** The player can't move the camera while a cinematic owns it. */
  let locked = false;
  const cine: Cinema = { fade: 0, bars: 0 };
  const onCinema = new Set<(c: Cinema) => void>();
  const setCinema = (fade: number, bars: number) => {
    if (fade === cine.fade && bars === cine.bars) return;
    cine.fade = fade;
    cine.bars = bars;
    for (const fn of onCinema) fn(cine);
  };
  const held = new Set<string>();
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
  /** Where a button press or a gesture is easing the camera to; null when it isn't. */
  const goal: { az: number | null; el: number | null; dist: number | null; rate: number } = { az: null, el: null, dist: null, rate: 6 };
  // The framing is tuned for a 10×10 board; other sizes scale the distance (and the look-at point) to match.
  let sizeScale = 1;
  let baseDistance = distance;
  let boardN = 10;
  /** Portrait screens frame the whole board across the width, centred on its midpoint. */
  const portrait = () => !view && camera.aspect < 1;
  const probe = new PerspectiveCamera();
  /** The distance at which the board's corners (and a margin for its labels) just fit the screen's width, at the home heading and tilt. */
  function fitDistance(): number {
    probe.fov = camera.fov;
    probe.aspect = camera.aspect;
    probe.updateProjectionMatrix();
    const half = boardN / 2 + FIT_MARGIN;
    const az = MathUtils.degToRad(homeAz);
    const el = MathUtils.degToRad(homeEl);
    const look = new Vector3(0, tune.get<number>('camera.targetY'), 0);
    const corner = new Vector3();
    let d = 25;
    for (let i = 0; i < 5; i++) {
      probe.position.set(
        look.x + d * Math.cos(el) * Math.sin(az), look.y + d * Math.sin(el), look.z + d * Math.cos(el) * Math.cos(az),
      );
      probe.lookAt(look);
      probe.updateMatrixWorld();
      let wide = 0;
      for (const [x, z] of [[-half, -half], [-half, half], [half, -half], [half, half]]) {
        wide = Math.max(wide, Math.abs(corner.set(x, 0, z).project(probe).x));
      }
      d *= wide / FIT_FILL;
    }
    return d;
  }
  /** The framing's distance and look-at depth for the current board size and screen. */
  function framing() {
    const tuned = tune.get<number>('camera.distance') * sizeScale;
    return portrait()
      ? { dist: fitDistance(), z: 0, closest: tuned * ZOOM_MIN * PORTRAIT_ZOOM_MIN }
      : { dist: tuned, z: tune.get<number>('camera.targetZ') * sizeScale, closest: tuned * ZOOM_MIN };
  }
  let closest = baseDistance * ZOOM_MIN;
  const clampDist = (d: number) => MathUtils.clamp(d, closest, baseDistance * ZOOM_MAX);
  const controls = {
    /**
     * Frame an n × n board: smaller boards come closer so the cells are bigger,
     * larger ones pull back (a little less than in proportion, so the board
     * may crop slightly rather than shrink to a toy).
     */
    setBoardSize: (n: number, instant = false) => {
      sizeScale = n <= 10 ? n / 10 : 1 + (n / 10 - 1) * 0.93;
      boardN = n;
      const f = framing();
      baseDistance = f.dist;
      closest = f.closest;
      center.set(0, tune.get<number>('camera.targetY'), f.z);
      focus = null;
      target.copy(center);
      if (instant) { distance = baseDistance; goal.dist = null; place(); resync(); }
      else { goal.rate = 3; goal.dist = baseDistance; place(); }
    },
    /** Pan to a point (and orbit around it from now on), or back to the board's middle with null. */
    focusOn: (p: { x: number; z: number; y?: number } | null) => { focus = p ? { x: p.x, z: p.z, y: p.y } : null; },
    /**
     * Play a shot: the camera eases along the poses it returns, then settles
     * back to `restore` (the framing before the shot unless given). Any camera
     * control from the player ends the shot early, softly.
     */
    play: (shot: Shot, restore?: { az: number; el: number; dist: number }) => {
      script = { fn: shot, t: 0, restore: restore ?? { az: orbit.az, el: orbit.el, dist: distance } };
      goal.az = goal.el = goal.dist = null;
      orbit.vAz = orbit.vEl = 0;
    },
    /** The default framing for this board, for shots that end there. */
    home: () => ({ target: { x: center.x, y: center.y, z: center.z }, az: homeAz, el: homeEl, dist: baseDistance }),
    /** Where the camera is now. */
    pose: () => ({ target: { x: target.x, y: target.y, z: target.z }, az: orbit.az, el: orbit.el, dist: distance }),
    get playing() { return script !== null; },
    /** Jump a running shot to `t` seconds in. */
    seek: (t: number) => { if (script) script.t = t; },
    /** End a running shot now, easing back to its settling framing. */
    stop: () => endShot(),
    /** Ignore the player's camera controls (during cinematics). */
    lock: (on: boolean) => { locked = on; if (on) { held.clear(); orbit.vAz = orbit.vEl = 0; } },
    /** Turn to a heading (degrees), the short way round, at `rate`. */
    turnTo: (az: number, rate: number) => { goal.rate = rate; goal.az = orbit.az + turn(az, orbit.az, vel.az); },
    /** The vertical field of view and aspect, for shots composed by screen position. */
    lens: () => ({ fov: camera.fov, aspect: camera.aspect }),
    /** Re-fit the view (after the HUD's docked area changes size). */
    refit: () => {
      fitFov(camera, window.innerWidth / window.innerHeight);
      if (!portrait()) return;
      // The fit follows the field of view, which the docked keyboard changes; keep the player's zoom in proportion.
      const f = framing();
      const k = f.dist / baseDistance;
      baseDistance = f.dist;
      closest = f.closest;
      if (script) script.restore.dist *= k;
      else { distance *= k; last.dist *= k; }
      vel.dist *= k;
      if (goal.dist !== null) goal.dist *= k;
      place();
    },
    /** Turn the board by a quarter turn (negative: the other way). */
    rotate: (dir: 1 | -1 = 1) => { if (locked) return; endShot(); goal.rate = 6; goal.az = (goal.az ?? orbit.az) + dir * ROTATE_STEP_DEG; },
    /** Zoom in (factor < 1) or out (> 1); successive presses compound. */
    zoom: (factor: number) => { if (locked) return; endShot(); goal.rate = 6; goal.dist = clampDist((goal.dist ?? distance) * factor); },
    zoomIn: () => controls.zoom(ZOOM_STEP),
    zoomOut: () => controls.zoom(1 / ZOOM_STEP),
    /** A drag or pinch: move straight there, no easing. */
    nudge: (dAz: number, dEl: number, zoomFactor = 1) => {
      if (locked || endShot()) return; // the first touch just hands control back
      goal.az = null;
      goal.el = null;
      goal.dist = null;
      orbit.vAz = orbit.vEl = 0;
      orbit.az = (orbit.az + dAz) % 360;
      orbit.el = MathUtils.clamp(orbit.el + dEl, minTilt(), MAX_TILT);
      distance = clampDist(distance * zoomFactor);
      place();
    },
  };
  window.addEventListener('keydown', (e) => {
    if (locked) return;
    if (!e.repeat) {
      if (e.key === '[') controls.rotate(-1);
      else if (e.key === ']') controls.rotate(1);
      else if (e.key === '+' || e.key === '=') controls.zoomIn();
      else if (e.key === '-') controls.zoomOut();
    }
    if (!keys.includes(e.key)) return;
    endShot();
    held.add(e.key);
    goal.az = null;
    e.preventDefault();
  });
  window.addEventListener('keyup', (e) => held.delete(e.key));
  window.addEventListener('blur', () => held.clear());

  /** End a running shot and ease back to where it will settle. Returns whether there was one. */
  function endShot(): boolean {
    if (!script) return false;
    const { restore } = script;
    script = null;
    goal.rate = tune.get<number>('shot.returnRate');
    goal.az = orbit.az + turn(restore.az, orbit.az, vel.az);
    goal.el = restore.el;
    goal.dist = restore.dist;
    return true;
  }

  function place() {
    const el = MathUtils.degToRad(orbit.el);
    const az = MathUtils.degToRad(orbit.az);
    camera.position.set(
      target.x + distance * Math.cos(el) * Math.sin(az),
      target.y + distance * Math.sin(el),
      target.z + distance * Math.cos(el) * Math.cos(az),
    );
    camera.lookAt(target);
    for (const fn of onMove) fn(distance);
  }

  if (!view) {
    tune.onAny(['camera.distance', 'camera.targetY', 'camera.targetZ'], () => {
      const f = framing();
      distance = baseDistance = f.dist;
      closest = f.closest;
      goal.dist = null;
      center.set(0, tune.get('camera.targetY'), f.z);
      if (!focus && !script) target.copy(center);
      place();
      resync();
    });
    tune.on('camera.elevation', (v) => { orbit.el = homeEl = v as number; place(); });
    tune.on('camera.azimuth', (v) => { orbit.az = homeAz = v as number; place(); });
    tune.on('camera.fov', () => fitFov(camera, camera.aspect));
  }

  // Motion is velocity-continuous: whatever moves the camera (a shot, a pan, a button), the next thing
  // to move it picks up from the speed it was going, so it never stops dead or doubles back.
  type Axis = 'az' | 'el' | 'dist' | 'x' | 'y' | 'z';
  const vel: Record<Axis, number> = { az: 0, el: 0, dist: 0, x: 0, y: 0, z: 0 };
  const last: Record<Axis, number> = { az: orbit.az, el: orbit.el, dist: distance, x: target.x, y: target.y, z: target.z };
  const sprung = new Set<Axis>();
  /** How much faster a critically damped spring is than the plain ease it replaces, for the same `rate`. */
  const SPRING = 1.6;
  /** One critically damped spring step toward `goal`; keeps the axis's velocity. */
  function spring(axis: Axis, cur: number, goal: number, rate: number, dt: number) {
    const w = rate * SPRING;
    const v = (vel[axis] + dt * w * w * (goal - cur)) / (1 + 2 * w * dt + w * w * dt * dt);
    vel[axis] = v;
    sprung.add(axis);
    return cur + dt * v;
  }
  /**
   * The signed turn from heading `from` to `to`: the short way, unless the camera is already turning the
   * other way at speed, in which case it carries on round rather than stop and reverse.
   */
  function turn(to: number, from: number, speed: number) {
    const d = wrap180(to - from);
    if (Math.abs(speed) > 10 && Math.sign(speed) !== Math.sign(d) && Math.abs(d) > 25) return d + 360 * Math.sign(speed);
    return d;
  }
  /** Forget the last frame (after the camera was moved by hand), so no speed is read from the jump. */
  const resync = (zero = true) => {
    Object.assign(last, { az: orbit.az, el: orbit.el, dist: distance, x: target.x, y: target.y, z: target.z });
    if (zero) for (const k of Object.keys(vel) as Axis[]) vel[k] = 0;
  };

  function update(dt: number) {
    const wantAz = (held.has('ArrowLeft') ? -1 : 0) + (held.has('ArrowRight') ? 1 : 0);
    const wantEl = (held.has('ArrowDown') ? -1 : 0) + (held.has('ArrowUp') ? 1 : 0);
    const ease = 1 - Math.exp(-dt * 8);
    orbit.vAz += (wantAz * SPIN_DEG_PER_S - orbit.vAz) * ease;
    orbit.vEl += (wantEl * TILT_DEG_PER_S - orbit.vEl) * ease;
    let moved = false;
    sprung.clear();
    if (Math.abs(orbit.vAz) >= 0.01 || Math.abs(orbit.vEl) >= 0.01) {
      orbit.az = (orbit.az + orbit.vAz * dt) % 360;
      orbit.el = MathUtils.clamp(orbit.el + orbit.vEl * dt, minTilt(), MAX_TILT);
      moved = true;
    }
    // A shot, or else the pan toward whatever is in focus.
    let steered = false; // the shot is steering the look-at point
    if (script) {
      script.t += dt;
      const p = script.fn(script.t);
      if (!p) endShot();
      else {
        const rate = p.rate ?? 4;
        steered = !!p.target;
        if (p.target && p.eye) {
          // Standing at an eye point: the orbit that puts the camera there.
          const ty = p.target.y ?? center.y;
          const dx = p.eye.x - p.target.x;
          const dy = p.eye.y - ty;
          const dz = p.eye.z - p.target.z;
          const d = Math.max(0.01, Math.hypot(dx, dy, dz));
          p.dist = d;
          p.el = MathUtils.radToDeg(Math.asin(dy / d));
          p.az = MathUtils.radToDeg(Math.atan2(dx, dz));
        }
        if (p.target) {
          const ty = p.target.y ?? center.y;
          if (p.snap) target.set(p.target.x, ty, p.target.z);
          else {
            target.x = spring('x', target.x, p.target.x, rate, dt);
            target.y = spring('y', target.y, ty, rate, dt);
            target.z = spring('z', target.z, p.target.z, rate, dt);
          }
        }
        if (p.az !== undefined) {
          if (p.snap) orbit.az += wrap180(p.az - orbit.az);
          else orbit.az = spring('az', orbit.az, orbit.az + turn(p.az, orbit.az, vel.az), rate, dt);
        }
        if (p.el !== undefined) orbit.el = p.snap ? p.el : spring('el', orbit.el, p.el, rate, dt);
        if (p.dist !== undefined) distance = p.snap ? p.dist : spring('dist', distance, p.dist, rate, dt);
        orbit.el = MathUtils.clamp(orbit.el, -60, 89);
        setCinema(p.fade ?? cine.fade, p.bars ?? cine.bars);
        moved = true;
      }
    }
    // With no shot running, any leftover fade or letterbox clears.
    if (!script && (cine.fade > 0 || cine.bars > 0)) {
      setCinema(Math.max(0, cine.fade - dt * 2.5), Math.max(0, cine.bars - dt * 1.5));
    }
    if (!steered) {
      const want = focus ? { x: focus.x, y: focus.y ?? center.y, z: focus.z } : center;
      const rate = tune.get<number>('shot.focusRate');
      const off = Math.abs(want.x - target.x) + Math.abs(want.y - target.y) + Math.abs(want.z - target.z);
      const speed = Math.abs(vel.x) + Math.abs(vel.y) + Math.abs(vel.z);
      if (off > 0.002 || speed > 0.01) {
        target.x = spring('x', target.x, want.x, rate, dt);
        target.y = spring('y', target.y, want.y, rate, dt);
        target.z = spring('z', target.z, want.z, rate, dt);
        moved = true;
      }
    }
    if (goal.el !== null) {
      orbit.el = spring('el', orbit.el, goal.el, goal.rate, dt);
      if (Math.abs(goal.el - orbit.el) < 0.05 && Math.abs(vel.el) < 0.5) { orbit.el = goal.el; goal.el = null; vel.el = 0; }
      moved = true;
    }
    if (goal.az !== null) {
      orbit.az = spring('az', orbit.az, goal.az, goal.rate, dt);
      if (Math.abs(goal.az - orbit.az) < 0.05 && Math.abs(vel.az) < 0.5) { orbit.az = goal.az % 360; goal.az = null; vel.az = 0; resync(false); }
      moved = true;
    }
    if (goal.dist !== null) {
      distance = spring('dist', distance, goal.dist, goal.rate, dt);
      if (Math.abs(goal.dist - distance) < 0.01 && Math.abs(vel.dist) < 0.05) { distance = goal.dist; goal.dist = null; vel.dist = 0; }
      moved = true;
    }
    // Whatever moved by other means (a snapped shot, the arrow keys, a drag) sets the speed the next move starts from.
    if (dt > 1e-4) {
      const now: Record<Axis, number> = { az: orbit.az, el: orbit.el, dist: distance, x: target.x, y: target.y, z: target.z };
      for (const k of Object.keys(now) as Axis[]) {
        if (sprung.has(k)) { last[k] = now[k]; continue; }
        const d = k === 'az' ? wrap180(now[k] - last[k]) : now[k] - last[k];
        vel[k] += (d / dt - vel[k]) * 0.6;
        last[k] = now[k];
      }
    }
    if (moved) place();
  }

  place();
  fitFov(camera, aspect);
  return {
    camera, target, update, controls,
    azimuth: () => orbit.az,
    /** Called with the camera distance whenever the camera moves. */
    onMove: (fn: (distance: number) => void) => onMove.add(fn),
    /** Called whenever a shot changes the fade or the letterbox. */
    onCinema: (fn: (c: Cinema) => void) => onCinema.add(fn),
  };
}

export type CameraControls = ReturnType<typeof createCamera>['controls'];

/** Screen pixels at the bottom taken by a docked HUD (the phone keyboard); the board is framed above them. */
export const viewInset = { bottom: 0, /** 0 to 1: how far the picture has moved down by `PORTRAIT_SHIFT` (portrait play only). */ shift: 0 };
/** Portrait play moves the picture down this share of the screen's height, so the board sits mid-screen under the HUD cards. */
const PORTRAIT_SHIFT = 0.05;

/**
 * Keep the board in frame on narrow screens by widening the vertical FOV. A
 * bottom inset shrinks the free area: the view widens to fit it and shifts up.
 */
export function fitFov(camera: PerspectiveCamera, aspect: number) {
  const base = new URLSearchParams(location.search).has('view') ? LOOK.camera.fov : tune.get('camera.fov');
  const h = window.innerHeight;
  // The board never fills the screen's height, so widen by less than the full inset.
  const free = MathUtils.clamp((h - viewInset.bottom) / h, 0.4, 1) ** 0.7;
  camera.aspect = aspect;
  camera.fov = aspect >= 1.4 ? base : base * Math.min(1.9, 1.4 / aspect);
  // Widen so the same scene fits the shorter free area.
  camera.fov = MathUtils.radToDeg(2 * Math.atan(Math.tan(MathUtils.degToRad(camera.fov / 2)) / free));
  const down = aspect < 1 ? viewInset.shift * PORTRAIT_SHIFT * h : 0;
  if (viewInset.bottom > 0 || down > 0) camera.setViewOffset(window.innerWidth, h, 0, viewInset.bottom / 2 - down, window.innerWidth, h);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
