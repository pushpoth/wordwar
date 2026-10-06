import { describe, it, expect, vi } from 'vitest';
import { generateGrid } from './grid';
import { placeWords } from './placement';
import { createEmptyGrid } from './grid';
import { mulberry32 } from './rng';
import { pickWords } from './dictionary';
import type { Unit, WordPick } from './types';

// Helper to validate unit invariants
function validateUnitInvariants(unit: Unit) {
  expect(unit.coords.length).toBe(unit.word.length);
  expect(unit.coords[0]).toEqual(unit.origin);

  for (let i = 0; i < unit.coords.length; i++) {
    const coord = unit.coords[i];
    let expectedX = unit.origin.x;
    let expectedY = unit.origin.y;

    if (unit.orientation === 'H') {
      expectedX += i;
    } else if (unit.orientation === 'V') {
      expectedY += i;
    } else if (unit.orientation === 'DTR') {
      expectedX += i;
      expectedY -= i;
    } else if (unit.orientation === 'DBR') {
      expectedX += i;
      expectedY += i;
    }

    expect(coord.x).toBe(expectedX);
    expect(coord.y).toBe(expectedY);
  }
}

describe('Word Placement', () => {
  const MISSION_CONFIGS = [
    { id: 1, gridSize: 10, unitCount: 4, allowDiagonal: false, tierWeights: { 1: 1.0, 2: 0.0, 3: 0.0, 4: 0.0, 5: 0.0 } },
    { id: 2, gridSize: 12, unitCount: 5, allowDiagonal: false, tierWeights: { 1: 0.7, 2: 0.3, 3: 0.0, 4: 0.0, 5: 0.0 } },
    { id: 3, gridSize: 15, unitCount: 6, allowDiagonal: true, tierWeights: { 1: 0.4, 2: 0.4, 3: 0.2, 4: 0.0, 5: 0.0 } },
    { id: 4, gridSize: 18, unitCount: 7, allowDiagonal: true, tierWeights: { 1: 0.2, 2: 0.4, 3: 0.4, 4: 0.0, 5: 0.0 } },
    { id: 5, gridSize: 20, unitCount: 8, allowDiagonal: true, tierWeights: { 1: 0.0, 2: 0.3, 3: 0.4, 4: 0.3, 5: 0.0 } },
    { id: 6, gridSize: 22, unitCount: 8, allowDiagonal: true, tierWeights: { 1: 0.0, 2: 0.2, 3: 0.4, 4: 0.4, 5: 0.0 } },
    { id: 7, gridSize: 25, unitCount: 9, allowDiagonal: true, tierWeights: { 1: 0.0, 2: 0.0, 3: 0.4, 4: 0.4, 5: 0.2 } },
    { id: 8, gridSize: 27, unitCount: 9, allowDiagonal: true, tierWeights: { 1: 0.0, 2: 0.0, 3: 0.3, 4: 0.4, 5: 0.3 } },
    { id: 9, gridSize: 28, unitCount: 10, allowDiagonal: true, tierWeights: { 1: 0.0, 2: 0.0, 3: 0.2, 4: 0.4, 5: 0.4 } },
    { id: 10, gridSize: 30, unitCount: 10, allowDiagonal: true, tierWeights: { 1: 0.0, 2: 0.0, 3: 0.0, 4: 0.5, 5: 0.5 } }
  ];

  // 500-seed × 10-mission probabilistic check is CPU-heavy (~5s). Bump the per-test
  // timeout so it doesn't flake under vitest's default 5s budget when the runner is
  // contended by other parallel test files. Caught by R9 during drop-3/01.
  it('achieves >=95% full placement success rate across 500 seeds for each mission tier', { timeout: 30_000 }, () => {
    // Silence console.warn for the test execution to keep output clean
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    for (const config of MISSION_CONFIGS) {
      let fullPlacementSuccessCount = 0;

      for (let seed = 0; seed < 500; seed++) {
        const setupRng = mulberry32(seed ^ 0x9e3779b1);
        const words = pickWords({
          count: config.unitCount,
          tierWeights: config.tierWeights,
          recentlyUsedWords: new Set<string>()
        }, setupRng);

        const { grid, units } = generateGrid({
          size: config.gridSize,
          units: config.unitCount,
          allowDiagonal: config.allowDiagonal,
          words,
          rng: setupRng
        });

        // 1. Check if all words were placed
        if (units.length === config.unitCount) {
          fullPlacementSuccessCount++;
        }

        // 2. Validate grid structure and units
        expect(grid.size).toBe(config.gridSize);
        expect(grid.tiles.length).toBe(config.gridSize);

        const occupiedCoords = new Set<string>();

        for (const unit of units) {
          // Check unit invariants
          validateUnitInvariants(unit);

          // Verify no overlap and correct tile setting
          for (const coord of unit.coords) {
            const coordKey = `${coord.x},${coord.y}`;
            expect(occupiedCoords.has(coordKey)).toBe(false);
            occupiedCoords.add(coordKey);

            const tile = grid.tiles[coord.y][coord.x];
            expect(tile.unitId).toBe(unit.id);
          }

          // Check that tile characters match word characters
          for (let i = 0; i < unit.word.length; i++) {
            const coord = unit.coords[i];
            expect(grid.tiles[coord.y][coord.x].letter).toBe(unit.word[i]);
          }
        }

        // 3. Submarine tile remains untouched
        const subTile = grid.tiles[grid.subCoord.y][grid.subCoord.x];
        expect(subTile.isSubmarine).toBe(true);
        expect(subTile.unitId).toBeNull();
        expect(occupiedCoords.has(`${grid.subCoord.x},${grid.subCoord.y}`)).toBe(false);

        // 4. Diagonals constraint check
        if (!config.allowDiagonal || config.gridSize < 15) {
          for (const unit of units) {
            expect(unit.orientation).not.toBe('DTR');
            expect(unit.orientation).not.toBe('DBR');
          }
        }
      }

      const successRate = fullPlacementSuccessCount / 500;
      // We expect >= 95% success rate
      expect(successRate).toBeGreaterThanOrEqual(0.95);
    }

    warnSpy.mockRestore();
  });

  it('correctly handles partial placement when a grid is too crowded', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Create a tiny grid of size 5x5 (sub is at 2,2), which has only 24 open spots.
    // Try to place 10 words, each of length 4.
    // This will definitely result in some words failing to place.
    const rng = mulberry32(12345);
    const words: WordPick[] = Array.from({ length: 10 }, () => ({
      text: 'WORD',
      length: 4,
      difficultyTier: 1,
      repeatCount: 0
    }));

    const emptyGrid = createEmptyGrid(5, rng);
    const { grid, units } = placeWords(emptyGrid, words, { allowDiagonal: false }, rng);

    // Verify some words are placed but not all
    expect(units.length).toBeGreaterThan(0);
    expect(units.length).toBeLessThan(10);

    // Verify console.warn was called with a 'placement:partial' message
    expect(warnSpy).toHaveBeenCalled();
    const calls = warnSpy.mock.calls;
    const hasPartialWarning = calls.some(args => 
      args.some(arg => typeof arg === 'string' && arg.includes('placement:partial'))
    );
    expect(hasPartialWarning).toBe(true);

    // Verify grid invariants still hold
    const occupiedCoords = new Set<string>();
    for (const unit of units) {
      validateUnitInvariants(unit);
      for (const coord of unit.coords) {
        const coordKey = `${coord.x},${coord.y}`;
        expect(occupiedCoords.has(coordKey)).toBe(false);
        occupiedCoords.add(coordKey);

        const tile = grid.tiles[coord.y][coord.x];
        expect(tile.unitId).toBe(unit.id);
      }
    }

    // Submarine tile untouched
    const subTile = grid.tiles[grid.subCoord.y][grid.subCoord.x];
    expect(subTile.unitId).toBeNull();

    warnSpy.mockRestore();
  });
});
