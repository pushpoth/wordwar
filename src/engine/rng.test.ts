import { describe, it, expect } from 'vitest';
import { mulberry32, deriveRngs } from './rng';

describe('RNG', () => {
  it('mulberry32 generates deterministic sequences', () => {
    const rng1 = mulberry32(123);
    const rng2 = mulberry32(123);

    expect(rng1.next()).toBe(rng2.next());
    expect(rng1.int(0, 10)).toBe(rng2.int(0, 10));
    expect(rng1.sample([1, 2, 3, 4], 2)).toEqual(rng2.sample([1, 2, 3, 4], 2));
  });

  it('can save and restore state', () => {
    const rng1 = mulberry32(123);
    rng1.next();
    rng1.next();
    
    const savedState = rng1.state;
    const valueAfterSave = rng1.next();
    
    const rng2 = mulberry32(999);
    rng2.setState(savedState);
    const valueAfterRestore = rng2.next();
    
    expect(valueAfterRestore).toBe(valueAfterSave);
  });

  it('deriveRngs produces stable rngs from a mission seed', () => {
    const rngs1 = deriveRngs(42);
    const rngs2 = deriveRngs(42);
    
    expect(rngs1.setupRng.next()).toBe(rngs2.setupRng.next());
    expect(rngs1.playRng.next()).toBe(rngs2.playRng.next());
  });
});
