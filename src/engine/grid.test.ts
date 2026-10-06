import { describe, it, expect } from 'vitest';
import { createEmptyGrid } from './grid';
import { mulberry32 } from './rng';
import { LETTER_FREQ } from '../config/balance';

describe('Grid Generator', () => {
  it('should produce identical grids for the same seed', () => {
    const seed = 12345;
    const rng1 = mulberry32(seed);
    const grid1 = createEmptyGrid(10, rng1);
    
    const rng2 = mulberry32(seed);
    const grid2 = createEmptyGrid(10, rng2);
    
    expect(grid1).toEqual(grid2);
  });

  it('should flag the submarine tile at the center', () => {
    const rng = mulberry32(1);
    const size = 15;
    const grid = createEmptyGrid(size, rng);
    
    const subX = Math.floor(size / 2);
    const subY = Math.floor(size / 2);
    
    expect(grid.subCoord).toEqual({ x: subX, y: subY });
    expect(grid.tiles[subY][subX].isSubmarine).toBe(true);
    
    // Ensure no other tile is submarine
    let subCount = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (grid.tiles[y][x].isSubmarine) {
          subCount++;
        }
      }
    }
    expect(subCount).toBe(1);
  });

  it('should only contain valid A-Z letters and be unrevealed', () => {
    const rng = mulberry32(2);
    const grid = createEmptyGrid(10, rng);
    
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const tile = grid.tiles[y][x];
        expect(tile.letter).toMatch(/^[A-Z]$/);
        expect(tile.revealed).toBe(false);
        expect(tile.unitId).toBeNull();
      }
    }
  });

  it('should respect letter frequency within a tolerance over a 30x30 grid', () => {
    const rng = mulberry32(3);
    const size = 30;
    const grid = createEmptyGrid(size, rng);
    
    const counts: Record<string, number> = {};
    for (const row of grid.tiles) {
      for (const tile of row) {
        counts[tile.letter] = (counts[tile.letter] || 0) + 1;
      }
    }
    
    const totalTiles = size * size;
    let totalFreqWeight = 0;
    for (const f of Object.values(LETTER_FREQ)) {
      totalFreqWeight += f;
    }
    
    for (const [letter, freq] of Object.entries(LETTER_FREQ)) {
      const expectedPercentage = (freq / totalFreqWeight) * 100;
      const actualPercentage = ((counts[letter] || 0) / totalTiles) * 100;
      
      // Widened tolerance as requested in Risks: "Letter frequencies for very small grids won't match analytic tightly; widen tolerance for those."
      // For 30x30 (900 tiles), a ±5% absolute difference or generous relative difference is fine.
      // Let's use ±5% absolute bounds as specified in the plan.
      expect(Math.abs(actualPercentage - expectedPercentage)).toBeLessThanOrEqual(5);
    }
  });
  
  it('grid should round-trip through JSON.stringify cleanly', () => {
    const rng = mulberry32(4);
    const grid = createEmptyGrid(5, rng);
    
    const serialized = JSON.stringify(grid);
    const deserialized = JSON.parse(serialized);
    
    expect(deserialized).toEqual(grid);
  });
});
