import { describe, expect, it } from 'vitest';
import { createGestures, type Delta } from './gestures';

function setup() {
  const out: Delta[] = [];
  return { out, g: createGestures((d) => out.push(d)) };
}

describe('gestures', () => {
  it('one finger orbits: right turns az down, down lifts the camera', () => {
    const { g, out } = setup();
    g.down(1, 100, 100);
    g.move(1, 150, 120);
    expect(out[0].dAz).toBeLessThan(0);
    expect(out[0].dEl).toBeGreaterThan(0);
    expect(out[0].zoom).toBe(1);
  });
  it('two fingers pinch: spreading zooms in (factor below 1) and never orbits', () => {
    const { g, out } = setup();
    g.down(1, 100, 100);
    g.down(2, 200, 100);
    g.move(2, 300, 100);
    expect(out).toHaveLength(1);
    expect(out[0].zoom).toBeCloseTo(0.5);
    expect(out[0].dAz).toBe(0);
    expect(out[0].dEl).toBe(0);
  });
  it('lifting a finger ends the pinch without a jump', () => {
    const { g, out } = setup();
    g.down(1, 0, 0);
    g.down(2, 100, 0);
    g.up(2);
    g.move(1, 10, 0);
    expect(out).toHaveLength(1);
    expect(out[0].zoom).toBe(1);
  });
  it('ignores moves from pointers that never went down', () => {
    const { g, out } = setup();
    g.move(9, 5, 5);
    expect(out).toHaveLength(0);
  });

  it('reports a still press as a tap, but not a drag, a pinch or a cancel', () => {
    const taps: number[][] = [];
    const g = createGestures(() => {}, (x, y) => taps.push([x, y]));
    g.down(1, 50, 60);
    g.move(1, 53, 62);
    g.up(1);
    expect(taps).toEqual([[50, 60]]);
    g.down(1, 0, 0);
    g.move(1, 40, 0);
    g.up(1);
    g.down(1, 0, 0);
    g.down(2, 100, 0);
    g.up(2);
    g.up(1);
    g.down(1, 5, 5);
    g.cancel(1);
    g.up(1);
    expect(taps).toHaveLength(1);
  });
});
