import { describe, expect, it } from 'vitest';
import { WORDS } from './words';
import { createMission } from '../engine/mission';
import type { MissionSummary } from '../engine/types';
import { configFor, LEVELS, levelById, starsFor } from './campaign';
import { shipClassFor, SHIP_CLASSES } from './ships';

describe('campaign levels', () => {
  it('have unique, consecutive ids starting at 1', () => {
    expect(LEVELS.map((l) => l.id)).toEqual(LEVELS.map((_, i) => i + 1));
    expect(levelById(3)?.name).toBe('Patrol route');
  });

  it.each(LEVELS)('level $id builds a full fleet for many seeds', (level) => {
    for (let seed = 1; seed <= 40; seed++) {
      const state = createMission(configFor(level), seed, WORDS);
      expect(state.units).toHaveLength(level.unitCount);
      expect(state.grid.tiles.length).toBe(level.gridSize);
    }
  });

  it('never shrink the fleet, and keep star targets inside the budget', () => {
    for (let i = 1; i < LEVELS.length; i++) expect(LEVELS[i].unitCount).toBeGreaterThanOrEqual(LEVELS[i - 1].unitCount);
    for (const l of LEVELS) expect(l.starUse[1]).toBeLessThan(l.starUse[0]);
  });
});

describe('stars', () => {
  const base: MissionSummary = { outcome: 'success', score: 0, elapsedMs: 0, units: [], shotsFiredRadar: 0, shotsFiredTorpedo: 0, hitRateTorpedo: 1, unitsDestroyed: 2, unitsTotal: 2 };
  const fired = (share: number) => ({ ...base, shotsFiredTorpedo: Math.floor(level.torpedoBudget * share) });
  const level = LEVELS[0];
  it('gives none for a loss and more for a win with torpedoes to spare', () => {
    expect(starsFor(level, { ...base, outcome: 'failure' })).toBe(0);
    expect(starsFor(level, fired(0.95))).toBe(1);
    expect(starsFor(level, fired(level.starUse[0]))).toBe(2);
    expect(starsFor(level, fired(level.starUse[1]))).toBe(3);
  });
});

describe('ship classes', () => {
  it('cover every word length, shortest first', () => {
    expect(shipClassFor(3).id).toBe('patrol');
    expect(shipClassFor(5).id).toBe('destroyer');
    expect(shipClassFor(8).id).toBe('cruiser');
    expect(shipClassFor(10).id).toBe('battleship');
    const caps = SHIP_CLASSES.map((c) => c.maxLength);
    expect([...caps].sort((a, b) => a - b)).toEqual(caps);
  });
});
