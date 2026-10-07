/** Camera change from one pointer event: degrees of azimuth and elevation, and a distance factor. */
export type Delta = { dAz: number; dEl: number; zoom: number };

type Pt = { x: number; y: number };

const AZ_DEG_PER_PX = 0.3;
const EL_DEG_PER_PX = 0.2;
/** A press that moves less than this is a tap, not a drag. */
export const TAP_SLOP_PX = 8;

/**
 * Turns pointer positions into camera moves. One pointer drags (orbit and tilt);
 * two pointers pinch (zoom) and ignore their drift. Pure, so it needs no DOM.
 */
export function createGestures(apply: (d: Delta) => void) {
  const pts = new Map<number, Pt>();
  let pinchDist = 0;

  const spread = () => {
    const [a, b] = [...pts.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  return {
    down(id: number, x: number, y: number) {
      pts.set(id, { x, y });
      if (pts.size === 2) pinchDist = spread();
    },
    move(id: number, x: number, y: number) {
      const p = pts.get(id);
      if (!p) return;
      const dx = x - p.x;
      const dy = y - p.y;
      p.x = x;
      p.y = y;
      if (pts.size === 1) {
        // Dragging right turns the board right (the camera goes the other way);
        // dragging down lifts the camera.
        apply({ dAz: -dx * AZ_DEG_PER_PX, dEl: dy * EL_DEG_PER_PX, zoom: 1 });
      } else if (pts.size === 2) {
        const now = spread();
        if (pinchDist > 0 && now > 0) apply({ dAz: 0, dEl: 0, zoom: pinchDist / now });
        pinchDist = now;
      }
    },
    up(id: number) {
      pts.delete(id);
      // Lifting one finger of a pinch must not make the other one start orbiting from a jump.
      pinchDist = 0;
    },
    get active() {
      return pts.size;
    },
  };
}

/** Wire pointer and wheel events on the canvas to the camera. Returns a remover. */
export function installGestures(canvas: HTMLElement, apply: (d: Delta) => void) {
  const g = createGestures(apply);
  const down = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    g.down(e.pointerId, e.clientX, e.clientY);
  };
  const move = (e: PointerEvent) => g.move(e.pointerId, e.clientX, e.clientY);
  const up = (e: PointerEvent) => g.up(e.pointerId);
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    apply({ dAz: 0, dEl: 0, zoom: Math.exp(e.deltaY * 0.001) });
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', wheel, { passive: false });
  return () => {
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointercancel', up);
    canvas.removeEventListener('wheel', wheel);
  };
}
