import { describe, it, expect } from 'vitest';
import { createMission, tick, summary } from './mission';
import { fireRadar } from './radar';
import { fireTorpedo } from './torpedo';
import type { MissionConfig, WordEntry } from './types';
import { mulberry32 } from './rng';

const mockDict: WordEntry[] = [
  { text: 'CAT', length: 3, difficultyTier: 1 },
  { text: 'DOG', length: 3, difficultyTier: 1 },
  { text: 'FOX', length: 3, difficultyTier: 1 },
  { text: 'PIG', length: 3, difficultyTier: 1 }
];

const mockConfig: MissionConfig = {
  id: 1,
  gridSize: 10,
  unitCount: 2,
  torpedoBudget: 10,
  allowDiagonal: false,
  tierWeights: { 1: 1, 2: 0, 3: 0, 4: 0, 5: 0 },
  batteryRegenSeconds: 60
};

describe('Mission Engine Logic', () => {
  it('should be deterministic: same seed and config produce deep-equal states', () => {
    const state1 = createMission(mockConfig, 42, mockDict);
    const state2 = createMission(mockConfig, 42, mockDict);

    expect(state1).toEqual(state2);

    const state3 = createMission(mockConfig, 43, mockDict);
    expect(state1).not.toEqual(state3);
  });

  it('should advance elapsedMs on tick when outcome is in_progress, but not when finished', () => {
    let state = createMission(mockConfig, 42, mockDict);
    expect(state.elapsedMs).toBe(0);

    state = tick(state, 100);
    expect(state.elapsedMs).toBe(100);

    state.outcome = 'success';
    state = tick(state, 100);
    expect(state.elapsedMs).toBe(100); // Should not change when outcome is not in_progress
  });

  it('should perform a scripted play run verifying scores, mode changes, and summary details', () => {
    // 1. Create a mission
    let state = createMission(mockConfig, 101, mockDict);
    expect(state.mode).toBe('RADAR');
    expect(state.outcome).toBe('in_progress');
    expect(state.score).toBe(0);

    // Let's identify the units placed on the grid
    expect(state.units.length).toBe(2);
    const unitA = state.units[0];
    const unitB = state.units[1];

    // Check we have the words
    expect(['CAT', 'DOG', 'FOX', 'PIG']).toContain(unitA.word);
    expect(['CAT', 'DOG', 'FOX', 'PIG']).toContain(unitB.word);

    // Let's find a tile for the first letter of unitA
    const letterA1 = unitA.word[0];
    
    // Clean the grid of any random occurrences of unitA's first letter
    for (let y = 0; y < state.grid.size; y++) {
      for (let x = 0; x < state.grid.size; x++) {
        const tile = state.grid.tiles[y][x];
        if (tile.letter === letterA1 && tile.unitId !== unitA.id) {
          tile.letter = 'Z';
        }
      }
    }

    // 2. Fire radar to discover unitA
    // Initialize playRng using playRngState
    const playRng = mulberry32(state.playRngState);
    const radarRes = fireRadar(state, letterA1, playRng);
    state = radarRes.state;

    // The radar reveal should have found unitA
    expect(state.discoveredUnitsQueue).toContain(unitA.id);
    expect(state.mode).toBe('TORPEDO');
    expect(state.activeUnitId).toBe(unitA.id);

    // Score remains 0 for radar reveals/discoveries
    expect(state.score).toBe(0);

    // 3. Fire a torpedo that hits unitA (e.g. second letter of unitA)
    const letterA2 = unitA.word[1];
    let torpRes = fireTorpedo(state, letterA2);
    state = torpRes.state;

    // Check hit scoring
    expect(torpRes.hits.length).toBeGreaterThan(0);
    expect(state.score).toBe(torpRes.hits.length * 10);
    const baseHitScore = state.score;

    // 4. Fire a torpedo that misses unitA (e.g. 'Z')
    torpRes = fireTorpedo(state, 'Z');
    state = torpRes.state;
    expect(torpRes.miss).toBe(true);
    expect(state.score).toBe(baseHitScore); // No score change on miss
    expect(state.units.find(u => u.id === unitA.id)?.torpedoMisses).toBe(1);

    // 5. Fire torpedoes to finish unitA (non-perfect kill due to the miss)
    const remainingLettersA = unitA.word.split('').filter(l => l !== letterA2);
    for (const letter of remainingLettersA) {
      // Fire torpedo (could be hit or no-op if already revealed)
      torpRes = fireTorpedo(state, letter);
      state = torpRes.state;
    }

    // Now unitA should be destroyed
    const updatedUnitA = state.units.find(u => u.id === unitA.id)!;
    expect(updatedUnitA.destroyed).toBe(true);

    // Non-perfect destroy score:
    // Hits: each letter of the word revealed in torpedo mode gives +10 (for letters not revealed by radar)
    // Destroy: word.length * 10 (no perfect bonus)
    // Let's verify total score calculation:
    // We had: hits score + destroy score (30 for length 3)
    // Since we know the exact hits from the test logs / states, we can check the score is correct.
    // Perfect bonus should be false
    expect(updatedUnitA.torpedoMisses).toBe(1);

    // Since unitA is destroyed, mode should auto-transition or activeUnitId change
    // If unitB is not yet discovered, mode should transition back to RADAR
    expect(state.mode).toBe('RADAR');
    expect(state.activeUnitId).toBeNull();

    // 6. Discover unitB by firing radar on its first letter
    const letterB1 = unitB.word[0];
    for (let y = 0; y < state.grid.size; y++) {
      for (let x = 0; x < state.grid.size; x++) {
        const tile = state.grid.tiles[y][x];
        if (tile.letter === letterB1 && tile.unitId !== unitB.id) {
          tile.letter = 'Z';
        }
      }
    }
    const playRng2 = mulberry32(state.playRngState);
    const radarRes2 = fireRadar(state, letterB1, playRng2);
    state = radarRes2.state;

    expect(state.mode).toBe('TORPEDO');
    expect(state.activeUnitId).toBe(unitB.id);


    // 7. Perfect-destroy unitB (no misses)
    // Let's fire torpedoes for all letters in unitB
    for (const letter of unitB.word) {
      torpRes = fireTorpedo(state, letter);
      state = torpRes.state;
    }

    const updatedUnitB = state.units.find(u => u.id === unitB.id)!;
    expect(updatedUnitB.destroyed).toBe(true);
    expect(updatedUnitB.torpedoMisses).toBe(0);

    // Unit B is destroyed with 0 misses, so it should be a perfect kill.
    // Score increase should include hits + destroy + perfect bonus (50)
    // Let's check outcome
    expect(state.outcome).toBe('success');

    // 8. Test summary
    const sum = summary(state);
    expect(sum.outcome).toBe('success');
    expect(sum.score).toBe(state.score);
    expect(sum.unitsDestroyed).toBe(2);
    expect(sum.unitsTotal).toBe(2);
    expect(sum.units[0].word).toBe(unitA.word);
    expect(sum.units[0].destroyed).toBe(true);
    expect(sum.units[0].perfect).toBe(false);
    expect(sum.units[1].word).toBe(unitB.word);
    expect(sum.units[1].destroyed).toBe(true);
    expect(sum.units[1].perfect).toBe(true);
  });
});
