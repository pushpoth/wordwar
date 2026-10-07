import { describe, expect, it } from 'vitest';
import { currentLevel, emptyProgress, isUnlocked, record } from './progress';
import { LEVELS } from '../config/campaign';

describe('progress', () => {
  it('opens level 1 only, then each level after a win', () => {
    let p = emptyProgress();
    expect(isUnlocked(p, 1)).toBe(true);
    expect(isUnlocked(p, 2)).toBe(false);
    p = record(p, 1, 0, 50); // a loss opens nothing
    expect(isUnlocked(p, 2)).toBe(false);
    p = record(p, 1, 1, 300);
    expect(isUnlocked(p, 2)).toBe(true);
    expect(isUnlocked(p, 3)).toBe(false);
  });

  it('keeps the best stars and score, and counts plays', () => {
    let p = record(emptyProgress(), 2, 3, 900);
    p = record(p, 2, 1, 400);
    expect(p.levels[2]).toEqual({ stars: 3, bestScore: 900, plays: 2 });
  });

  it('does not change the progress it was given', () => {
    const p = emptyProgress();
    record(p, 1, 3, 100);
    expect(p.levels).toEqual({});
  });

  it('points at the first unwon level, and the last once all are won', () => {
    let p = emptyProgress();
    expect(currentLevel(p)).toBe(1);
    p = record(p, 1, 2, 1);
    expect(currentLevel(p)).toBe(2);
    for (const l of LEVELS) p = record(p, l.id, 1, 1);
    expect(currentLevel(p)).toBe(LEVELS[LEVELS.length - 1].id);
  });
});
