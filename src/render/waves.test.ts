import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { HULL_CALMING, WAVES, waveOffset } from './waves';

describe('waveOffset', () => {
  it('is deterministic for a given place and time', () => {
    const a = waveOffset(1.3, -2.2, 4.5, new Vector3());
    const b = waveOffset(1.3, -2.2, 4.5, new Vector3());
    expect(a.equals(b)).toBe(true);
  });

  it('never lifts the surface above the sum of wave amplitudes', () => {
    const bound = WAVES.reduce((s, w) => s + w.steep / ((2 * Math.PI) / w.length), 0);
    const v = new Vector3();
    for (let i = 0; i < 500; i++) {
      waveOffset(Math.sin(i) * 9, Math.cos(i * 1.3) * 9, i * 0.17, v);
      expect(Math.abs(v.y)).toBeLessThanOrEqual(bound + 1e-9);
    }
  });
});

describe('hull calming', () => {
  it('leaves long swell alone and flattens short chop', () => {
    const long = WAVES.findIndex((w) => w.length >= 3.5);
    const short = WAVES.findIndex((w) => w.length <= 1.2);
    expect(HULL_CALMING[long]).toBe(0);
    expect(HULL_CALMING[short]).toBeGreaterThan(0.8);
  });

  it('removes most of the short-wave curvature under a hull', () => {
    // Second differences pick out the short chop that would poke through a hull.
    const curvature = (calm: number) => {
      const h = (x: number) => waveOffset(x, 1.7, 2, new Vector3(), calm).y;
      let sum = 0;
      for (let i = 0; i < 400; i++) {
        const x = i * 0.1;
        sum += Math.abs(h(x + 0.1) - 2 * h(x) + h(x - 0.1));
      }
      return sum;
    };
    expect(curvature(1)).toBeLessThan(curvature(0) * 0.5);
  });
});
