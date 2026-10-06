import { describe, it, expect } from 'vitest';
import { fireTorpedo, switchTarget, returnToRadar } from './torpedo';
import type { MissionState, Unit, Tile } from './types';

function createMockState(override: Partial<MissionState> = {}): MissionState {
  const size = 10;
  const tiles: Tile[][] = [];
  for (let y = 0; y < size; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < size; x++) {
      row.push({
        coord: { x, y },
        letter: ' ',
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
    mode: 'TORPEDO',
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

describe('Torpedo Engine Logic', () => {
  it('should reject fire if mode is not TORPEDO or activeUnitId is null', () => {
    const stateRadar = createMockState({ mode: 'RADAR', activeUnitId: 'unit-1' });
    const resultRadar = fireTorpedo(stateRadar, 'A');
    expect(resultRadar.state).toBe(stateRadar);
    expect(resultRadar.events).toEqual([]);

    const stateNoActive = createMockState({ mode: 'TORPEDO', activeUnitId: null });
    const resultNoActive = fireTorpedo(stateNoActive, 'A');
    expect(resultNoActive.state).toBe(stateNoActive);
    expect(resultNoActive.events).toEqual([]);
  });

  it('should reject fire if outcome is not in_progress', () => {
    const stateFinished = createMockState({
      mode: 'TORPEDO',
      activeUnitId: 'unit-1',
      outcome: 'success'
    });
    const resultFinished = fireTorpedo(stateFinished, 'A');
    expect(resultFinished.state).toBe(stateFinished);
    expect(resultFinished.events).toEqual([]);
  });

  it('should immediately fail if torpedo budget is 0 or less when trying to fire', () => {
    const stateNoTorps = createMockState({
      mode: 'TORPEDO',
      activeUnitId: 'unit-1',
      torpedoes: 0
    });
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
    stateNoTorps.units.push(unit);

    const result = fireTorpedo(stateNoTorps, 'C');
    expect(result.state.outcome).toBe('failure');
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      type: 'mission:ended',
      outcome: 'failure'
    });
  });

  it('should deduct a torpedo and record a hit for matching letters', () => {
    const state = createMockState({
      activeUnitId: 'unit-1',
      torpedoes: 50,
      score: 100,
      shotsFiredTorpedo: 0,
      shotsHitTorpedo: 0
    });

    const unit: Unit = {
      id: 'unit-1',
      word: 'APPLE',
      length: 5,
      difficultyTier: 1,
      orientation: 'H',
      origin: { x: 0, y: 0 },
      coords: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 3, y: 0 },
        { x: 4, y: 0 }
      ],
      destroyed: false,
      torpedoMisses: 0,
      revealedLetters: new Set(),
      triedLetters: new Set()
    };
    state.units.push(unit);

    // Set tiles
    for (let i = 0; i < unit.coords.length; i++) {
      const c = unit.coords[i];
      state.grid.tiles[c.y][c.x].letter = unit.word[i];
      state.grid.tiles[c.y][c.x].unitId = 'unit-1';
    }

    // Fire 'P' (occurs twice at index 1 and 2)
    const result = fireTorpedo(state, 'P');

    expect(result.state.torpedoes).toBe(49);
    expect(result.state.shotsFiredTorpedo).toBe(1);
    expect(result.state.shotsHitTorpedo).toBe(2);
    expect(result.state.score).toBe(120); // 100 + 20 (2 hits)
    expect(result.hits).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 }
    ]);
    expect(result.miss).toBe(false);

    const activeUnitInState = result.state.units.find(u => u.id === 'unit-1')!;
    expect(activeUnitInState.revealedLetters).toContain(1);
    expect(activeUnitInState.revealedLetters).toContain(2);

    expect(result.state.grid.tiles[0][1].revealed).toBe(true);
    expect(result.state.grid.tiles[0][1].revealedBy).toBe('torpedo');
    expect(result.state.grid.tiles[0][2].revealed).toBe(true);
    expect(result.state.grid.tiles[0][2].revealedBy).toBe('torpedo');

    // Events check
    expect(result.events).toEqual([
      { type: 'torpedo:fired', letter: 'P', torpedoes: 49, targetUnitId: 'unit-1' },
      { type: 'score:changed', score: 120 },
      { type: 'torpedo:resolved', letter: 'P', hits: [{ x: 1, y: 0 }, { x: 2, y: 0 }], missed: false, targetUnitId: 'unit-1' }
    ]);
  });

  it('should deny torpedo fire if the letter has already been tried (already_tried)', () => {
    const state = createMockState({
      activeUnitId: 'unit-1',
      torpedoes: 50
    });

    const unit: Unit = {
      id: 'unit-1',
      word: 'APPLE',
      length: 5,
      difficultyTier: 1,
      orientation: 'H',
      origin: { x: 0, y: 0 },
      coords: [
        { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }
      ],
      destroyed: false,
      torpedoMisses: 0,
      revealedLetters: new Set([1, 2]), // 'P' is at indices 1 and 2
      triedLetters: new Set(['P', 'Z'])
    };
    state.units.push(unit);

    // Fire 'P' again
    const result = fireTorpedo(state, 'P');

    expect(result.state).toBe(state);
    expect(result.events).toEqual([
      { type: 'torpedo:denied', reason: 'already_tried', targetUnitId: 'unit-1' }
    ]);
    expect(result.hits).toEqual([]);
    expect(result.miss).toBe(false);
  });

  it('should deduct a torpedo and record a miss for non-matching letters', () => {
    const state = createMockState({
      activeUnitId: 'unit-1',
      torpedoes: 50,
      shotsFiredTorpedo: 0,
      shotsHitTorpedo: 0
    });

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

    // Fire 'Z' (miss)
    const result = fireTorpedo(state, 'Z');

    expect(result.state.torpedoes).toBe(49);
    expect(result.state.shotsFiredTorpedo).toBe(1);
    expect(result.state.shotsHitTorpedo).toBe(0);
    expect(result.miss).toBe(true);

    const activeUnitInState = result.state.units.find(u => u.id === 'unit-1')!;
    expect(activeUnitInState.torpedoMisses).toBe(1);
    expect(result.events).toEqual([
      { type: 'torpedo:fired', letter: 'Z', torpedoes: 49, targetUnitId: 'unit-1' },
      { type: 'torpedo:resolved', letter: 'Z', hits: [], missed: true, targetUnitId: 'unit-1' }
    ]);
  });

  it('should handle perfect unit destruction and outcome success when all units destroyed', () => {
    const state = createMockState({
      activeUnitId: 'unit-1',
      torpedoes: 10,
      score: 100,
      discoveredUnitsQueue: ['unit-1']
    });

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
      revealedLetters: new Set([0, 1]), // C, A already revealed
      triedLetters: new Set(['C', 'A'])
    };
    state.units.push(unit);

    // Set tiles
    for (let i = 0; i < unit.coords.length; i++) {
      const c = unit.coords[i];
      state.grid.tiles[c.y][c.x].letter = unit.word[i];
      state.grid.tiles[c.y][c.x].unitId = 'unit-1';
    }

    // Fire 'T'
    const result = fireTorpedo(state, 'T');

    expect(result.state.units[0].destroyed).toBe(true);
    expect(result.unitDestroyed).toBe(true);
    expect(result.perfect).toBe(true); // 0 misses

    // Score: 100 + 10 (tile hit) + 30 (destruction score CAT) + 50 (perfect kill bonus) = 190
    expect(result.state.score).toBe(190);
    expect(result.state.outcome).toBe('success');
    expect(result.state.discoveredUnitsQueue).toEqual([]);

    expect(result.state.grid.tiles[0][0].revealedBy).toBe('destroyed');
    expect(result.state.grid.tiles[0][1].revealedBy).toBe('destroyed');
    expect(result.state.grid.tiles[0][2].revealedBy).toBe('destroyed');

    expect(result.events).toContainEqual({
      type: 'unit:destroyed',
      unitId: 'unit-1',
      perfect: true,
      score: 190
    });

    expect(result.events).toContainEqual({
      type: 'mission:ended',
      outcome: 'success',
      summary: expect.any(Object)
    });
  });

  it('should handle non-perfect unit destruction and target switching if other units remain', () => {
    const state = createMockState({
      activeUnitId: 'unit-1',
      torpedoes: 10,
      score: 100,
      discoveredUnitsQueue: ['unit-1', 'unit-2']
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
      torpedoMisses: 1, // Already missed once
      revealedLetters: new Set([0, 1]),
      triedLetters: new Set(['C', 'A', 'Z'])
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

    // Set tiles
    for (let i = 0; i < unit1.coords.length; i++) {
      const c = unit1.coords[i];
      state.grid.tiles[c.y][c.x].letter = unit1.word[i];
      state.grid.tiles[c.y][c.x].unitId = 'unit-1';
    }

    // Fire 'T' to destroy unit-1
    const result = fireTorpedo(state, 'T');

    expect(result.state.units[0].destroyed).toBe(true);
    expect(result.unitDestroyed).toBe(true);
    expect(result.perfect).toBe(false); // torpedoMisses is 1

    // Score: 100 + 10 (tile hit) + 30 (destruction score CAT) = 140 (no perfect kill bonus)
    expect(result.state.score).toBe(140);
    expect(result.state.outcome).toBe('in_progress'); // unit-2 still undestroyed
    expect(result.state.discoveredUnitsQueue).toEqual(['unit-2']);
    expect(result.state.activeUnitId).toBe('unit-2'); // transitioned target
    expect(result.state.mode).toBe('TORPEDO');

    expect(result.events).toContainEqual({
      type: 'unit:destroyed',
      unitId: 'unit-1',
      perfect: false,
      score: 140
    });

    expect(result.events).toContainEqual({
      type: 'mode:changed',
      mode: 'TORPEDO',
      activeUnitId: 'unit-2'
    });
  });

  it('should transition mode to RADAR if unit is destroyed and queue is empty but not all units are destroyed', () => {
    const state = createMockState({
      activeUnitId: 'unit-1',
      torpedoes: 10,
      score: 100,
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
      revealedLetters: new Set([0, 1]),
      triedLetters: new Set(['C', 'A'])
    };
    const unit2: Unit = {
      id: 'unit-2',
      word: 'DOG',
      length: 3,
      difficultyTier: 1,
      orientation: 'H',
      origin: { x: 0, y: 1 },
      coords: [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
      destroyed: false, // not discovered yet, so not in queue
      torpedoMisses: 0,
      revealedLetters: new Set(),
      triedLetters: new Set()
    };
    state.units.push(unit1, unit2);

    for (let i = 0; i < unit1.coords.length; i++) {
      const c = unit1.coords[i];
      state.grid.tiles[c.y][c.x].letter = unit1.word[i];
      state.grid.tiles[c.y][c.x].unitId = 'unit-1';
    }

    const result = fireTorpedo(state, 'T');

    expect(result.state.units[0].destroyed).toBe(true);
    expect(result.state.outcome).toBe('in_progress');
    expect(result.state.discoveredUnitsQueue).toEqual([]);
    expect(result.state.activeUnitId).toBeNull();
    expect(result.state.mode).toBe('RADAR');

    expect(result.events).toContainEqual({
      type: 'mode:changed',
      mode: 'RADAR'
    });
  });

  it('should end mission in failure if torpedoes reach 0 and units remain undestroyed', () => {
    const state = createMockState({
      activeUnitId: 'unit-1',
      torpedoes: 1, // Only 1 torpedo left
      discoveredUnitsQueue: ['unit-1']
    });

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

    // Fire a miss
    const result = fireTorpedo(state, 'Z');

    expect(result.state.torpedoes).toBe(0);
    expect(result.state.outcome).toBe('failure');
    expect(result.events).toContainEqual({
      type: 'mission:ended',
      outcome: 'failure',
      summary: expect.any(Object)
    });
  });

  it('should switch active unit target when switchTarget is called', () => {
    const state = createMockState({
      mode: 'TORPEDO',
      discoveredUnitsQueue: ['unit-1', 'unit-2', 'unit-3'],
      activeUnitId: 'unit-1'
    });

    // 1. Switch to specific target
    const state2 = switchTarget(state, 'unit-3');
    expect(state2.activeUnitId).toBe('unit-3');

    // 2. Cycle switch target (no args)
    const state3 = switchTarget(state2); // from unit-3 should cycle back to unit-1
    expect(state3.activeUnitId).toBe('unit-1');

    const state4 = switchTarget(state3); // from unit-1 to unit-2
    expect(state4.activeUnitId).toBe('unit-2');

    // 3. Preconditions reject switch if mode is not TORPEDO
    const stateRadar = createMockState({
      mode: 'RADAR',
      discoveredUnitsQueue: ['unit-1', 'unit-2'],
      activeUnitId: null
    });
    const stateRadarResult = switchTarget(stateRadar, 'unit-1');
    expect(stateRadarResult).toBe(stateRadar);
  });

  it('should return to radar mode when returnToRadar is called', () => {
    const state = createMockState({
      mode: 'TORPEDO',
      activeUnitId: 'unit-1',
      discoveredUnitsQueue: ['unit-1']
    });

    const result = returnToRadar(state);

    expect(result.mode).toBe('RADAR');
    expect(result.activeUnitId).toBeNull();
    // Queue should remain untouched
    expect(result.discoveredUnitsQueue).toEqual(['unit-1']);
  });
});
