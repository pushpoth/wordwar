import { MathUtils, PerspectiveCamera, Vector3 } from 'three/webgpu';
import { LOOK } from '../config/look';

/** Fixed diorama camera looking down at the board centre. */
/** Named framings for review shots: `?view=close` frames the explosion. */
const VIEWS: Record<string, { distance: number; elevationDeg: number; azimuthDeg: number; target: [number, number, number] }> = {
  close: { distance: 9, elevationDeg: 30, azimuthDeg: -40, target: [0.6, 0.6, 0.6] },
  ship: { distance: 7, elevationDeg: 24, azimuthDeg: -20, target: [2.2, 0.5, 3.5] },
};

export function createCamera(aspect: number) {
  const view = VIEWS[new URLSearchParams(location.search).get('view') ?? ''];
  const c = view ? { ...LOOK.camera, ...view, targetOffset: view.target } : LOOK.camera;
  const camera = new PerspectiveCamera(c.fov, aspect, 0.5, 400);
  const target = new Vector3(...c.targetOffset);
  const el = MathUtils.degToRad(c.elevationDeg);
  const az = MathUtils.degToRad(c.azimuthDeg);
  camera.position.set(
    target.x + c.distance * Math.cos(el) * Math.sin(az),
    target.y + c.distance * Math.sin(el),
    target.z + c.distance * Math.cos(el) * Math.cos(az),
  );
  camera.lookAt(target);
  fitFov(camera, aspect);
  return { camera, target };
}

/** Keep the board in frame on narrow screens by widening the vertical FOV. */
export function fitFov(camera: PerspectiveCamera, aspect: number) {
  const base = LOOK.camera.fov;
  camera.aspect = aspect;
  camera.fov = aspect >= 1.4 ? base : base * Math.min(1.9, 1.4 / aspect);
  camera.updateProjectionMatrix();
}
