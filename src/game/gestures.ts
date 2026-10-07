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
export function createGestures(apply: (d: Delta) => void, onTap: (x: number, y: number) => void = () => {}) {
  const pts = new Map<number, Pt>();
  let pinchDist = 0;
  // A tap is one finger down and up without wandering, and never part of a pinch.
  let tap: { id: number; x: number; y: number; ok: boolean } | null = null;

  const spread = () => {
    const [a, b] = [...pts.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  return {
    down(id: number, x: number, y: number) {
      pts.set(id, { x, y });
      if (pts.size === 1) tap = { id, x, y, ok: true };
      else if (tap) tap.ok = false;
      if (pts.size === 2) pinchDist = spread();
    },
    move(id: number, x: number, y: number) {
      const p = pts.get(id);
      if (!p) return;
      const dx = x - p.x;
      const dy = y - p.y;
      if (tap?.id === id && Math.hypot(x - tap.x, y - tap.y) > TAP_SLOP_PX) tap.ok = false;
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
      if (tap?.id === id && tap.ok && pts.size === 1) onTap(tap.x, tap.y);
      if (tap?.id === id) tap = null;
      pts.delete(id);
      // Lifting one finger of a pinch must not make the other one start orbiting from a jump.
      pinchDist = 0;
    },
    /** The system took the pointer away (a scroll, a call): that is never a tap. */
    cancel(id: number) {
      if (tap?.id === id) tap = null;
      pts.delete(id);
      pinchDist = 0;
    },
    get active() {
      return pts.size;
    },
  };
}

/** Wire pointer and wheel events on the canvas to the camera. Returns a remover. */
export function installGestures(canvas: HTMLElement, apply: (d: Delta) => void, onTap?: (x: number, y: number) => void) {
  const g = createGestures(apply, onTap);
  const down = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    g.down(e.pointerId, e.clientX, e.clientY);
  };
  const move = (e: PointerEvent) => g.move(e.pointerId, e.clientX, e.clientY);
  const up = (e: PointerEvent) => g.up(e.pointerId);
  const cancel = (e: PointerEvent) => g.cancel(e.pointerId);
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    apply({ dAz: 0, dEl: 0, zoom: Math.exp(e.deltaY * 0.001) });
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', cancel);
  canvas.addEventListener('wheel', wheel, { passive: false });
  return () => {
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointercancel', cancel);
    canvas.removeEventListener('wheel', wheel);
  };
}
