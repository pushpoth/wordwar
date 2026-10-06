import { MathUtils, PerspectiveCamera, Vector3 } from 'three/webgpu';
import { LOOK } from '../config/look';

/** Named framings for review shots: `?view=close` frames the explosion. */
const VIEWS: Record<string, { distance: number; elevationDeg: number; azimuthDeg: number; target: [number, number, number] }> = {
  close: { distance: 9, elevationDeg: 30, azimuthDeg: -40, target: [0.6, 0.6, 0.6] },
  ship: { distance: 7, elevationDeg: 24, azimuthDeg: -20, target: [2.2, 0.5, 3.5] },
  sub: { distance: 7.5, elevationDeg: 34, azimuthDeg: -70, target: [-3.5, 0.2, 2.5] },
};

const SPIN_DEG_PER_S = 70;
const TILT_DEG_PER_S = 35;
// Low angles reveal the horizon and the empty sea beyond the scenery; keep above it.
const ELEVATION_LIMITS = [36, 82] as const;

/**
 * Diorama camera orbiting the board centre. Left/right arrows spin it around,
 * up/down tilt it; motion eases in and out. `?az=<deg>` and `?el=<deg>` set
 * the starting angle for review shots.
 */
export function createCamera(aspect: number) {
  const params = new URLSearchParams(location.search);
  const view = VIEWS[params.get('view') ?? ''];
  const c = view ? { ...LOOK.camera, ...view, targetOffset: view.target } : LOOK.camera;
  const camera = new PerspectiveCamera(c.fov, aspect, 0.5, 400);
  const target = new Vector3(...c.targetOffset);

  const orbit = {
    az: Number(params.get('az') ?? c.azimuthDeg),
    el: Number(params.get('el') ?? c.elevationDeg),
    vAz: 0,
    vEl: 0,
  };
  const held = new Set<string>();
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
  window.addEventListener('keydown', (e) => {
    if (!keys.includes(e.key)) return;
    held.add(e.key);
    e.preventDefault();
  });
  window.addEventListener('keyup', (e) => held.delete(e.key));
  window.addEventListener('blur', () => held.clear());

  function place() {
    const el = MathUtils.degToRad(orbit.el);
    const az = MathUtils.degToRad(orbit.az);
    camera.position.set(
      target.x + c.distance * Math.cos(el) * Math.sin(az),
      target.y + c.distance * Math.sin(el),
      target.z + c.distance * Math.cos(el) * Math.cos(az),
    );
    camera.lookAt(target);
  }

  function update(dt: number) {
    const wantAz = (held.has('ArrowLeft') ? -1 : 0) + (held.has('ArrowRight') ? 1 : 0);
    const wantEl = (held.has('ArrowDown') ? -1 : 0) + (held.has('ArrowUp') ? 1 : 0);
    const ease = 1 - Math.exp(-dt * 8);
    orbit.vAz += (wantAz * SPIN_DEG_PER_S - orbit.vAz) * ease;
    orbit.vEl += (wantEl * TILT_DEG_PER_S - orbit.vEl) * ease;
    if (Math.abs(orbit.vAz) < 0.01 && Math.abs(orbit.vEl) < 0.01) return;
    orbit.az = (orbit.az + orbit.vAz * dt) % 360;
    orbit.el = MathUtils.clamp(orbit.el + orbit.vEl * dt, ...ELEVATION_LIMITS);
    place();
  }

  place();
  fitFov(camera, aspect);
  return { camera, target, update };
}

/** Keep the board in frame on narrow screens by widening the vertical FOV. */
export function fitFov(camera: PerspectiveCamera, aspect: number) {
  const base = LOOK.camera.fov;
  camera.aspect = aspect;
  camera.fov = aspect >= 1.4 ? base : base * Math.min(1.9, 1.4 / aspect);
  camera.updateProjectionMatrix();
}
