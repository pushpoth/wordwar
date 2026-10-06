import { uniform } from 'three/tsl';

/**
 * Scene time in seconds, shared by every shader. Driven by the frame loop, or
 * pinned with `?t=<seconds>` so screenshots are deterministic.
 */
export const simTime = uniform(0);

const pinned = new URLSearchParams(location.search).get('t');
export const pinnedTime = pinned === null ? null : Number(pinned);

let last = performance.now();
export function tickClock(): number {
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  simTime.value = pinnedTime ?? simTime.value + dt;
  return pinnedTime === null ? dt : 0;
}
