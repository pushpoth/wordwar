import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { WAVES, waveOffset } from './waves';

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
