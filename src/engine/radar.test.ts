import { describe, it, expect } from 'vitest';
import { fireRadar } from './radar';
import { mulberry32 } from './rng';
import type { MissionState, Unit, Tile, EngineEvent } from './types';

function createMockState(override: Partial<MissionState> = {}): MissionState {
  const size = 10;
  const tiles: Tile[][] = [];
  for (let y = 0; y < size; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < size; x++) {
      row.push({
        coord: { x, y },
        letter: 'A',
        unitId: null,
        isSubmarine: x === 5 && y === 5,
        revealed: false
      });
    }
    tiles.push(row);
  }

  return {
    config: {
      id: 1,
      gridSize: size,
      unitCount: 0,
      torpedoBudget: 50,
      allowDiagonal: false,
      tierWeights: { 1: 1, 2: 0, 3: 0, 4: 0, 5: 0 },
      batteryRegenSeconds: 60
    },
    grid: {
      size,
      tiles,
      subCoord: { x: 5, y: 5 }
    },
    units: [],
    mode: 'RADAR',
    activeUnitId: null,
    discoveredUnitsQueue: [],
    battery: 5,
    lastBatteryRegenMs: 0,
    torpedoes: 50,
    score: 100,
    shotsFiredRadar: 0,
    shotsFiredTorpedo: 0,
    shotsHitTorpedo: 0,
    startedAtMs: 0,
    elapsedMs: 0,
    outcome: 'in_progress',
    seed: 12345,
    playRngState: 12345,
    ...override
  };
}

describe('Radar Engine Logic', () => {
  it('should deduct battery and increment shotsFiredRadar on every successful fire', () => {
    const state = createMockState({ battery: 5, shotsFiredRadar: 0 });
    const rng = mulberry32(1);
    
    // Set some letters in the grid
    state.grid.tiles[0][0].letter = 'B';

    const result = fireRadar(state, 'B', rng);

    expect(result.state.battery).toBe(4);
    expect(result.state.shotsFiredRadar).toBe(1);
    expect(result.events).toContainEqual({
      type: 'radar:fired',
      letter: 'B',
      battery: 4
    });
    
    // Outcome stays in_progress
    expect(result.state.outcome).toBe('in_progress');
  });

  it('should deny radar fire and return state unchanged if battery is 0', () => {
    const state = createMockState({ battery: 0 });
    const rng = mulberry32(1);
    
    const result = fireRadar(state, 'A', rng);
    
    expect(result.state).toBe(state);
    expect(result.tilesRevealed).toEqual([]);
    expect(result.unitsDiscovered).toEqual([]);
    expect(result.events).toEqual([
      { type: 'radar:denied', reason: 'battery_empty' }
    ]);
  });

  it('should deny radar fire and return state unchanged if mission is ended', () => {
    const state = createMockState({ battery: 5, outcome: 'success' });
    const rng = mulberry32(1);
    
    const result = fireRadar(state, 'A', rng);
    
    expect(result.state).toBe(state);
    expect(result.tilesRevealed).toEqual([]);
    expect(result.unitsDiscovered).toEqual([]);
    expect(result.events).toEqual([
      { type: 'radar:denied', reason: 'mission_ended' }
    ]);
  });

  it('should reveal matching letters up to the maxReveal configuration', () => {
    const state = createMockState({ battery: 5 });
    // For size 10, maxReveal is 4
    // Fill 6 tiles with 'X'
    const xCoords = [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: 2 },
      { x: 0, y: 3 },
      { x: 0, y: 4 },
      { x: 0, y: 5 }
    ];
    for (const c of xCoords) {
      state.grid.tiles[c.y][c.x].letter = 'X';
    }

    const rng = mulberry32(1);
    const result = fireRadar(state, 'X', rng);

    expect(result.tilesRevealed.length).toBe(4);
    for (const coord of result.tilesRevealed) {
      const tile = result.state.grid.tiles[coord.y][coord.x];
      expect(tile.revealed).toBe(true);
      expect(tile.revealedBy).toBe('radar');
    }
  });

  it('should reveal fewer tiles if remaining candidates is less than maxReveal', () => {
    const state = createMockState({ battery: 5 });
    // Fill only 2 tiles with 'Y'
    state.grid.tiles[0][0].letter = 'Y';
    state.grid.tiles[0][1].letter = 'Y';

    const rng = mulberry32(1);
    const result = fireRadar(state, 'Y', rng);

    expect(result.tilesRevealed.length).toBe(2);
    expect(result.state.grid.tiles[0][0].revealed).toBe(true);
    expect(result.state.grid.tiles[0][1].revealed).toBe(true);
  });

  it('should discover new units and add them to discoveredUnitsQueue', () => {
    const state = createMockState({ battery: 5 });
    
    // Create a unit
    const unit1: Unit = {
      id: 'unit-1',
      word: 'CAT',
      length: 3,
      difficultyTier: 1,
      orientation: 'H',
      origin: { x: 0, y: 0 },
      coords: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
      destroyed: false,
      torpedoMisses: 0,
      revealedLetters: new Set(),
      triedLetters: new Set()
    };
    state.units.push(unit1);
    
    state.grid.tiles[0][0].letter = 'C';
    state.grid.tiles[0][0].unitId = 'unit-1';

    const rng = mulberry32(1);
    const result = fireRadar(state, 'C', rng);

    expect(result.unitsDiscovered).toEqual(['unit-1']);
    expect(result.state.discoveredUnitsQueue).toEqual(['unit-1']);
  });

  it('should sort the discovery queue by Euclidean distance to submarine and maintain stability', () => {
    // Submarine at (5,5)
    const state = createMockState({ battery: 5 });

    // Unit 1: center at (1,1) -> distance to (5,5) = sqrt(16 + 16) = sqrt(32) = ~5.66
    const unit1: Unit = {
      id: 'unit-1',
      word: 'ONE',
      length: 3,
      difficultyTier: 1,
      orientation: 'H',
      origin: { x: 0, y: 1 },
      coords: [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }], // bounding box center: (1, 1)
      destroyed: false,
      torpedoMisses: 0,
      revealedLetters: new Set(),
      triedLetters: new Set()
    };

    // Unit 2: center at (4,4) -> distance to (5,5) = sqrt(1 + 1) = sqrt(2) = ~1.41
    const unit2: Unit = {
      id: 'unit-2',
      word: 'TWO',
      length: 3,
      difficultyTier: 1,
      orientation: 'H',
      origin: { x: 3, y: 4 },
      coords: [{ x: 3, y: 4 }, { x: 4, y: 4 }, { x: 5, y: 4 }], // bounding box center: (4, 4)
      destroyed: false,
      torpedoMisses: 0,
      revealedLetters: new Set(),
      triedLetters: new Set()
    };

    // Unit 3: center at (8,8) -> distance to (5,5) = sqrt(9 + 9) = sqrt(18) = ~4.24
    const unit3: Unit = {
      id: 'unit-3',
      word: 'THR',
      length: 3,
      difficultyTier: 1,
      orientation: 'H',
      origin: { x: 7, y: 8 },
      coords: [{ x: 7, y: 8 }, { x: 8, y: 8 }, { x: 9, y: 8 }], // bounding box center: (8, 8)
      destroyed: false,
      torpedoMisses: 0,
      revealedLetters: new Set(),
      triedLetters: new Set()
    };

    state.units.push(unit1, unit2, unit3);

    // Let's populate the grid with unit associations and letters
    state.grid.tiles[1][0].letter = 'Z';
    state.grid.tiles[1][0].unitId = 'unit-1';

    state.grid.tiles[4][3].letter = 'Z';
    state.grid.tiles[4][3].unitId = 'unit-2';

    state.grid.tiles[8][7].letter = 'Z';
    state.grid.tiles[8][7].unitId = 'unit-3';

    // Discovered in the order: unit-1, unit-3, unit-2
    // If they all reveal at once:
    // Let's fire radar for 'Z'
    const rng = mulberry32(1);
    const result = fireRadar(state, 'Z', rng);

    // The order should be sorted by distance: unit-2 (~1.41), unit-3 (~4.24), unit-1 (~5.66)
    expect(result.state.discoveredUnitsQueue).toEqual(['unit-2', 'unit-3', 'unit-1']);
  });

  it('should maintain stable sort for units with identical distance', () => {
    // Submarine at (5,5)
    const state = createMockState({ battery: 5 });

    // Unit A: center at (4,5) -> distance to (5,5) = 1
    const unitA: Unit = {
      id: 'unit-a',
      word: 'AAA',
      length: 1,
      difficultyTier: 1,
      orientation: 'H',
      origin: { x: 4, y: 5 },
      coords: [{ x: 4, y: 5 }],
      destroyed: false,
      torpedoMisses: 0,
      revealedLetters: new Set(),
      triedLetters: new Set()
    };

    // Unit B: center at (5,4) -> distance to (5,5) = 1
    const unitB: Unit = {
      id: 'unit-b',
      word: 'BBB',
      length: 1,
      difficultyTier: 1,
      orientation: 'H',
      origin: { x: 5, y: 4 },
      coords: [{ x: 5, y: 4 }],
      destroyed: false,
      torpedoMisses: 0,
      revealedLetters: new Set(),
      triedLetters: new Set()
    };

    state.units.push(unitA, unitB);

    // Let's discover unit-b first, then unit-a
    state.discoveredUnitsQueue = ['unit-b', 'unit-a'];

    // Fire radar on something unrelated to re-trigger a sort
    state.grid.tiles[0][0].letter = 'Q';
    const rng = mulberry32(1);
    const result = fireRadar(state, 'Q', rng);

    // Because they have equal distances, the stable sort must preserve the original order: ['unit-b', 'unit-a']
    expect(result.state.discoveredUnitsQueue).toEqual(['unit-b', 'unit-a']);
  });

  it('should auto-switch mode from RADAR to TORPEDO when discoveries occur', () => {
    const state = createMockState({ battery: 5, mode: 'RADAR', activeUnitId: null });

    const unit: Unit = {
      id: 'unit-1',
      word: 'CAT',
      length: 3,
      difficultyTier: 1,
      orientation: 'H',
      origin: { x: 0, y: 0 },
      coords: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
      destroyed: false,
      torpedoMisses: 0,
      revealedLetters: new Set(),
      triedLetters: new Set()
    };
    state.units.push(unit);
    state.grid.tiles[0][0].letter = 'C';
    state.grid.tiles[0][0].unitId = 'unit-1';

    const rng = mulberry32(1);
    const result = fireRadar(state, 'C', rng);

    expect(result.state.mode).toBe('TORPEDO');
    expect(result.state.activeUnitId).toBe('unit-1');
    expect(result.events).toContainEqual({
      type: 'mode:changed',
      mode: 'TORPEDO',
      activeUnitId: 'unit-1'
    });
  });

  it('should not emit mode:changed if mode was already TORPEDO', () => {
    // Create state where we are already in TORPEDO mode with an active unit
    const state = createMockState({
      battery: 5,
      mode: 'TORPEDO',
      activeUnitId: 'unit-1',
      discoveredUnitsQueue: ['unit-1']
    });

    const unit1: Unit = {
      id: 'unit-1',
      word: 'CAT',
      length: 3,
      difficultyTier: 1,
      orientation: 'H',
      origin: { x: 0, y: 0 },
      coords: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
      destroyed: false,
      torpedoMisses: 0,
      revealedLetters: new Set(),
      triedLetters: new Set()
    };
    const unit2: Unit = {
      id: 'unit-2',
      word: 'DOG',
      length: 3,
      difficultyTier: 1,
      orientation: 'H',
      origin: { x: 0, y: 1 },
      coords: [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
      destroyed: false,
      torpedoMisses: 0,
      revealedLetters: new Set(),
      triedLetters: new Set()
    };
    state.units.push(unit1, unit2);
    state.grid.tiles[1][0].letter = 'D';
    state.grid.tiles[1][0].unitId = 'unit-2';

    const rng = mulberry32(1);
    const result = fireRadar(state, 'D', rng);

    expect(result.state.mode).toBe('TORPEDO');
    expect(result.state.activeUnitId).toBe('unit-1'); // active unit remains unit-1 because distance of unit-2 is further or because unit-1 is still active
    
    // No mode changed event should be emitted since mode is still TORPEDO and activeUnitId is still unit-1
    const modeChangedEvents = result.events.filter((e: EngineEvent) => e.type === 'mode:changed');
    expect(modeChangedEvents).toEqual([]);
  });

  it('should incidentally destroy completed units without score increment', () => {
    const state = createMockState({ battery: 5, score: 100 });

    // Unit of length 1 (easy to destroy)
    const unit: Unit = {
      id: 'unit-1',
      word: 'X',
      length: 1,
      difficultyTier: 1,
      orientation: 'H',
      origin: { x: 0, y: 0 },
      coords: [{ x: 0, y: 0 }],
      destroyed: false,
      torpedoMisses: 0,
      revealedLetters: new Set(),
      triedLetters: new Set()
    };
    state.units.push(unit);
    state.grid.tiles[0][0].letter = 'X';
    state.grid.tiles[0][0].unitId = 'unit-1';

    const rng = mulberry32(1);
    const result = fireRadar(state, 'X', rng);

    expect(result.state.units[0].destroyed).toBe(true);
    expect(result.state.score).toBe(100); // Score unchanged
    expect(result.state.discoveredUnitsQueue).not.toContain('unit-1');
    expect(result.events).toContainEqual({
      type: 'unit:destroyed',
      unitId: 'unit-1',
      perfect: false,
      score: 100
    });
  });

  // Regression revert (2026-06-02): radar no longer "skips" a fully-discovered
  // letter. It fires normally (spends battery, resolves as a miss with no new
  // tiles) — the task-10 silent no-op was reverted because it left the keyboard
  // key enabled while doing nothing.
  it('should still fire (spend battery, reveal nothing new) on a fully-discovered letter', () => {
    const state = createMockState({ battery: 5, score: 100 });

    const unit: Unit = {
      id: 'unit-1',
      word: 'CAT',
      length: 3,
      difficultyTier: 1,
      orientation: 'H',
      origin: { x: 0, y: 0 },
      coords: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
      destroyed: false,
      torpedoMisses: 0,
      revealedLetters: new Set(),
      triedLetters: new Set()
    };
    state.units.push(unit);

    state.grid.tiles[0][0].letter = 'C';
    state.grid.tiles[0][0].revealed = true;
    state.grid.tiles[0][0].unitId = 'unit-1';

    const rng = mulberry32(1);
    const result = fireRadar(state, 'C', rng);

    // Fires: battery spent, no new tiles revealed (the only 'C' was already up).
    expect(result.state).not.toBe(state);
    expect(result.state.battery).toBe(4);
    expect(result.tilesRevealed).toEqual([]);
    expect(result.events.some(e => e.type === 'radar:fired')).toBe(true);
  });
});
