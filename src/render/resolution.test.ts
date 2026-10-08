import { describe, expect, it } from 'vitest';
import { createResolution } from './resolution';

/** Drive the controller with a fake clock: `seconds` of frames, each `ms` long. */
function harness(min = 0.6, max = 1.5) {
  let now = 0;
  const res = createResolution({ min: () => min, max: () => max }, () => now);
  const changes: number[] = [];
  const run = (seconds: number, ms: number, hitchEvery = 0) => {
    const end = now + seconds * 1000;
    let i = 0;
    while (now < end) {
      now += hitchEvery && ++i % hitchEvery === 0 ? 400 : ms;
      const r = res.sample(60);
      if (r !== null) changes.push(r);
    }
  };
  return { res, run, changes, skip: (ms: number) => { now += ms; } };
}

describe('adaptive resolution', () => {
  it('starts at the top and holds it while the frame rate holds', () => {
    const h = harness();
    h.run(30, 16.7);
    expect(h.res.current).toBe(1.5);
    expect(h.changes).toEqual([]);
  });

  it('ignores slow frames during the grace period after loading', () => {
    const h = harness();
    h.run(3.5, 40);
    expect(h.res.current).toBe(1.5);
  });

  it('steps down when frames run slow', () => {
    const h = harness();
    h.run(4, 16.7);
    h.run(4.1, 25);
    expect(h.res.current).toBeLessThan(1.5);
  });

  it('does not count one long frame as a slow window', () => {
    const h = harness();
    h.run(30, 16.7, 150); // a 400 ms hitch every ~2.5 s
    expect(h.res.current).toBe(1.5);
  });

  it('does not drop while paused (no samples) or after a long gap', () => {
    const h = harness();
    h.run(5, 16.7);
    h.skip(30000); // the loop was stopped
    h.run(10, 16.7);
    expect(h.res.current).toBe(1.5);
  });

  it('climbs back quickly once there is headroom, but not straight back to a level that just failed', () => {
    const h = harness();
    h.run(4, 16.7);
    h.run(4.1, 25); // two slow windows: 1.5 → 1.3, ceiling at 1.4
    const low = h.res.current;
    expect(low).toBeCloseTo(1.3);
    h.run(20, 16.7);
    expect(h.res.current).toBeCloseTo(1.3); // 1.4 failed under a minute ago
    h.run(60, 16.7);
    expect(h.res.current).toBeGreaterThan(low); // later it tries again
  });

  it('stays within the limits', () => {
    const h = harness(0.6, 1);
    h.run(4, 16.7);
    h.run(60, 40);
    expect(h.res.current).toBe(0.6);
  });
});
