/**
 * Adaptive render resolution, as a multiple of CSS pixels, kept apart from
 * the renderer so it can be tested with a fake clock.
 *
 * It watches frame times in 2 s windows and settles on the highest level that
 * holds the frame cap:
 * - a slow window steps down 0.1 and remembers that level as a ceiling;
 * - three good windows in a row step up 0.1, but not back to a ceiling that
 *   failed in the last minute, so it doesn't bounce between two levels (every
 *   change reallocates every screen-sized buffer);
 * - one long frame (a shader compile, a garbage collection) doesn't count as a
 *   slow window, and nothing is sampled while paused (the paused loop draws a
 *   few frames a second on purpose) or for a grace period after a transition.
 */
export type ResolutionLimits = { min: () => number; max: () => number };

const WINDOW_MS = 2000;
const GRACE_MS = 4000;
const STEP = 0.1;
const GOOD_WINDOWS = 3;
const CEILING_MS = 60000;

/** `start`: where to begin (the level this device settled on last time), else the top of the range. */
export function createResolution(limits: ResolutionLimits, clock: () => number = () => performance.now(), start?: number) {
  const clamp = (v: number) => Math.round(Math.min(limits.max(), Math.max(limits.min(), v)) * 20) / 20;
  let current = start ? clamp(start) : limits.max();
  let frames = 0;
  let longest = 0;
  let since = clock();
  let last = since;
  let graceUntil = since + GRACE_MS;
  let lastDrop = -1e12;
  let good = 0;
  /** The lowest level that recently failed, and when. */
  let ceiling: { level: number; at: number } | null = null;

  const restartWindow = (now: number) => {
    frames = 0;
    longest = 0;
    since = last = now;
  };

  return {
    get current() { return current; },
    /** Back to the top of the range (the tuner changed it). */
    reset() {
      current = limits.max();
      ceiling = null;
      good = 0;
      restartWindow(clock());
      return current;
    },
    /** Don't judge the next few seconds (a load, a mission start, a resume). */
    settle() {
      graceUntil = clock() + GRACE_MS;
      good = 0;
      restartWindow(clock());
    },
    /**
     * Call once per drawn frame (not while paused) with the frame cap; returns
     * the new ratio when it should change.
     */
    sample(fpsCap: number): number | null {
      const now = clock();
      // A gap of a second or more means the loop was stopped (a hidden tab, a pause): start over.
      if (now - last > 1000) restartWindow(now);
      longest = Math.max(longest, now - last);
      last = now;
      frames++;
      if (now - since < WINDOW_MS) return null;
      const elapsed = now - since;
      // Leave out the longest frame, so one hitch doesn't read as a slow window.
      const fps = frames > 2 ? ((frames - 1) * 1000) / Math.max(1, elapsed - longest) : (frames * 1000) / elapsed;
      restartWindow(now);
      if (now < graceUntil) return null;

      let next = current;
      if (fps < fpsCap * 0.85) {
        next = clamp(current - STEP);
        if (!ceiling || current <= ceiling.level || now - ceiling.at > CEILING_MS) ceiling = { level: current, at: now };
        lastDrop = now;
        good = 0;
      } else if (fps > fpsCap * 0.95) {
        good++;
        if (good >= GOOD_WINDOWS && now - lastDrop > WINDOW_MS * GOOD_WINDOWS) {
          good = 0;
          const up = clamp(current + STEP);
          const blocked = ceiling && up >= ceiling.level - 1e-6 && now - ceiling.at < CEILING_MS;
          if (!blocked) next = up;
        }
      } else {
        good = 0;
      }
      if (Math.abs(next - current) < 0.01) return null;
      current = next;
      return current;
    },
  };
}
