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
});
