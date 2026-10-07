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
const ROTATE_STEP_DEG = 90;

/**
 * Diorama camera orbiting the board centre. Left/right arrows spin it around,
 * up/down tilt it; motion eases in and out. `?az=<deg>` and `?el=<deg>` set
 * the starting angle for review shots.
 */
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
  const camera = new PerspectiveCamera(c.fov, aspect, 0.5, 400);
  const target = new Vector3(...c.targetOffset);
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
  const held = new Set<string>();
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
  /** Where a button press or a gesture is easing the camera to; null when it isn't. */
  const goal: { az: number | null; dist: number | null } = { az: null, dist: null };
  let baseDistance = distance;
  const clampDist = (d: number) => MathUtils.clamp(d, baseDistance * ZOOM_MIN, baseDistance * ZOOM_MAX);
  const controls = {
    /** Re-fit the view (after the HUD's docked area changes size). */
    refit: () => fitFov(camera, camera.aspect),
    /** Turn the board by a quarter turn (negative: the other way). */
    rotate: (dir: 1 | -1 = 1) => { goal.az = (goal.az ?? orbit.az) + dir * ROTATE_STEP_DEG; },
    /** Zoom in (factor < 1) or out (> 1); successive presses compound. */
    zoom: (factor: number) => { goal.dist = clampDist((goal.dist ?? distance) * factor); },
    zoomIn: () => controls.zoom(ZOOM_STEP),
    zoomOut: () => controls.zoom(1 / ZOOM_STEP),
    /** A drag or pinch: move straight there, no easing. */
    nudge: (dAz: number, dEl: number, zoomFactor = 1) => {
      goal.az = null;
      goal.dist = null;
      orbit.vAz = orbit.vEl = 0;
      orbit.az = (orbit.az + dAz) % 360;
      orbit.el = MathUtils.clamp(orbit.el + dEl, minTilt(), MAX_TILT);
      distance = clampDist(distance * zoomFactor);
      place();
    },
  };
  window.addEventListener('keydown', (e) => {
    if (!e.repeat) {
      if (e.key === '[') controls.rotate(-1);
      else if (e.key === ']') controls.rotate(1);
      else if (e.key === '+' || e.key === '=') controls.zoomIn();
      else if (e.key === '-') controls.zoomOut();
    }
    if (!keys.includes(e.key)) return;
    held.add(e.key);
    goal.az = null;
    e.preventDefault();
  });
  window.addEventListener('keyup', (e) => held.delete(e.key));
  window.addEventListener('blur', () => held.clear());

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
      distance = baseDistance = tune.get('camera.distance');
      goal.dist = null;
      target.set(0, tune.get('camera.targetY'), tune.get('camera.targetZ'));
      place();
    });
    tune.on('camera.elevation', (v) => { orbit.el = v as number; place(); });
    tune.on('camera.azimuth', (v) => { orbit.az = v as number; place(); });
    tune.on('camera.fov', () => fitFov(camera, camera.aspect));
  }

  function update(dt: number) {
    const wantAz = (held.has('ArrowLeft') ? -1 : 0) + (held.has('ArrowRight') ? 1 : 0);
    const wantEl = (held.has('ArrowDown') ? -1 : 0) + (held.has('ArrowUp') ? 1 : 0);
    const ease = 1 - Math.exp(-dt * 8);
    orbit.vAz += (wantAz * SPIN_DEG_PER_S - orbit.vAz) * ease;
    orbit.vEl += (wantEl * TILT_DEG_PER_S - orbit.vEl) * ease;
    let moved = false;
    if (Math.abs(orbit.vAz) >= 0.01 || Math.abs(orbit.vEl) >= 0.01) {
      orbit.az = (orbit.az + orbit.vAz * dt) % 360;
      orbit.el = MathUtils.clamp(orbit.el + orbit.vEl * dt, minTilt(), MAX_TILT);
      moved = true;
    }
    const goalEase = 1 - Math.exp(-dt * 6);
    if (goal.az !== null) {
      orbit.az += (goal.az - orbit.az) * goalEase;
      if (Math.abs(goal.az - orbit.az) < 0.05) { orbit.az = goal.az % 360; goal.az = null; }
      moved = true;
    }
    if (goal.dist !== null) {
      distance += (goal.dist - distance) * goalEase;
      if (Math.abs(goal.dist - distance) < 0.01) { distance = goal.dist; goal.dist = null; }
      moved = true;
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
  };
}

export type CameraControls = ReturnType<typeof createCamera>['controls'];

/** Screen pixels at the bottom taken by a docked HUD (the phone keyboard); the board is framed above them. */
export const viewInset = { bottom: 0 };

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
  if (viewInset.bottom > 0) camera.setViewOffset(window.innerWidth, h, 0, viewInset.bottom / 2, window.innerWidth, h);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
