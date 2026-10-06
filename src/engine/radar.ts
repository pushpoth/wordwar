import type { MissionState, RadarResult, Rng, GridCoord, Tile, Unit, UnitId, EngineEvent, Grid } from './types';
import { RADAR_REVEALS_BY_GRID } from '../config/balance';
import { eventBus } from './events';

/**
 * Computes the Euclidean distance from the submarine coordinate to the unit's bounding-box center.
 */
function getUnitDistance(unit: Unit, subCoord: GridCoord): number {
  if (unit.coords.length === 0) {
    return 0;
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const coord of unit.coords) {
    if (coord.x < minX) minX = coord.x;
    if (coord.x > maxX) maxX = coord.x;
    if (coord.y < minY) minY = coord.y;
    if (coord.y > maxY) maxY = coord.y;
  }
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const dx = centerX - subCoord.x;
  const dy = centerY - subCoord.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Checks if all coordinates of a unit are revealed on the grid.
 */
function isUnitCompleted(unit: Unit, grid: Grid): boolean {
  return unit.coords.every(c => grid.tiles[c.y][c.x].revealed);
}

/**
 * Deep clones the MissionState to ensure the function is pure and state is immutable.
 */
function cloneMissionState(state: MissionState): MissionState {
  return {
    ...state,
    config: {
      ...state.config,
      tierWeights: { ...state.config.tierWeights }
    },
    grid: {
      size: state.grid.size,
      subCoord: { ...state.grid.subCoord },
      tiles: state.grid.tiles.map(row =>
        row.map(tile => ({
          ...tile,
          coord: { ...tile.coord }
        }))
      )
    },
    units: state.units.map(unit => ({
      ...unit,
      origin: { ...unit.origin },
      coords: unit.coords.map(c => ({ ...c })),
      revealedLetters: new Set(unit.revealedLetters),
      triedLetters: new Set(unit.triedLetters)
    })),
    discoveredUnitsQueue: [...state.discoveredUnitsQueue]
  };
}

export function fireRadar(state: MissionState, letter: string, rng: Rng): RadarResult {
  const events: EngineEvent[] = [];

  // 1. Check if outcome is not 'in_progress' or battery <= 0
  if (state.outcome !== 'in_progress') {
    events.push({ type: 'radar:denied', reason: 'mission_ended' });
    eventBus.emitMany(events);
    return {
      state,
      tilesRevealed: [],
      unitsDiscovered: [],
      events
    };
  }

  if (state.battery <= 0) {
    events.push({ type: 'radar:denied', reason: 'battery_empty' });
    eventBus.emitMany(events);
    return {
      state,
      tilesRevealed: [],
      unitsDiscovered: [],
      events
    };
  }

  const queryLetter = letter.toUpperCase();
  const unitsWithLetter = state.units.filter(u => u.word.toUpperCase().includes(queryLetter));
  const isFullyDiscoveredOnUnits = unitsWithLetter.length > 0 && unitsWithLetter.every(unit => {
    const word = unit.word.toUpperCase();
    for (let i = 0; i < word.length; i++) {
      if (word[i] === queryLetter) {
        const coord = unit.coords[i];
        if (!state.grid.tiles[coord.y][coord.x].revealed) {
          return false;
        }
      }
    }
    return true;
  });

  let unrevealedTilesCount = 0;
  for (let y = 0; y < state.grid.size; y++) {
    for (let x = 0; x < state.grid.size; x++) {
      const tile = state.grid.tiles[y][x];
      if (tile.letter === queryLetter && !tile.revealed) {
        unrevealedTilesCount++;
      }
    }
  }

  // REGRESSION FIX (2026-06-02): reverted the task-10 "skip already-discovered
  // letters" early-return. It silently no-op'd a radar press (no battery, no
  // events) for fully-discovered letters while the keyboard stayed enabled —
  // reading as a dead key. Radar now always fires; a letter with no new tiles
  // simply resolves as a miss ("no contact"), as it did originally.
  void isFullyDiscoveredOnUnits;
  void unrevealedTilesCount;

  // 2. Deep clone state for immutable update
  const nextState = cloneMissionState(state);

  // Deduct battery and increment stats
  nextState.battery -= 1;
  nextState.shotsFiredRadar += 1;

  // Emit radar:fired
  events.push({
    type: 'radar:fired',
    letter,
    battery: nextState.battery
  });

  const originalMode = state.mode;
  const originalActiveUnitId = state.activeUnitId;

  // 3. Find candidates (unrevealed matching letter tiles)
  const candidates: Tile[] = [];
  for (let y = 0; y < nextState.grid.size; y++) {
    for (let x = 0; x < nextState.grid.size; x++) {
      const tile = nextState.grid.tiles[y][x];
      if (tile.letter === queryLetter && !tile.revealed) {
        candidates.push(tile);
      }
    }
  }

  // 4. Sample and reveal tiles
  const maxReveal = RADAR_REVEALS_BY_GRID[nextState.grid.size] || 0;
  const sampled = rng.sample(candidates, Math.min(maxReveal, candidates.length));

  const tilesRevealed: GridCoord[] = [];
  for (const tile of sampled) {
    tile.revealed = true;
    tile.revealedBy = 'radar';
    tilesRevealed.push(tile.coord);
  }

  // 5. Discover units associated with the revealed tiles
  const unitsDiscovered: UnitId[] = [];
  for (const tile of sampled) {
    const uId = tile.unitId;
    if (uId) {
      const unit = nextState.units.find(u => u.id === uId);
      if (unit && !unit.destroyed && !nextState.discoveredUnitsQueue.includes(uId) && !unitsDiscovered.includes(uId)) {
        unitsDiscovered.push(uId);
      }
    }
  }

  // Append new discoveries to queue
  nextState.discoveredUnitsQueue.push(...unitsDiscovered);

  // 6. Sort queue by Euclidean distance (stable sort using original index as tiebreaker)
  const queueWithDistance = nextState.discoveredUnitsQueue.map((unitId, index) => {
    const unit = nextState.units.find(u => u.id === unitId)!;
    const distance = getUnitDistance(unit, nextState.grid.subCoord);
    return { unitId, index, distance };
  });

  queueWithDistance.sort((a, b) => {
    if (Math.abs(a.distance - b.distance) > 1e-9) {
      return a.distance - b.distance;
    }
    return a.index - b.index;
  });

  nextState.discoveredUnitsQueue = queueWithDistance.map(item => item.unitId);

  // 7. Check for completed units
  const destroyedEvents: EngineEvent[] = [];
  for (const unit of nextState.units) {
    if (!unit.destroyed && isUnitCompleted(unit, nextState.grid)) {
      unit.destroyed = true;

      // Remove from queue
      nextState.discoveredUnitsQueue = nextState.discoveredUnitsQueue.filter(id => id !== unit.id);

      // Handle active unit replacement if it was destroyed
      if (nextState.activeUnitId === unit.id) {
        nextState.activeUnitId = nextState.discoveredUnitsQueue.length > 0 ? nextState.discoveredUnitsQueue[0] : null;
        if (nextState.activeUnitId === null) {
          nextState.mode = 'RADAR';
        }
      }

      destroyedEvents.push({
        type: 'unit:destroyed',
        unitId: unit.id,
        perfect: false,
        score: nextState.score
      });
    }
  }

  events.push(...destroyedEvents);

  // Emit radar:resolved
  events.push({
    type: 'radar:resolved',
    letter,
    tilesRevealed,
    unitsDiscovered
  });

  // 8. Auto-switch mode: if queue is non-empty and current mode is 'RADAR'
  if (nextState.discoveredUnitsQueue.length > 0 && nextState.mode === 'RADAR') {
    nextState.mode = 'TORPEDO';
    nextState.activeUnitId = nextState.discoveredUnitsQueue[0];
  }

  // 9. Emit mode:changed if mode or activeUnitId transitioned
  if (nextState.mode !== originalMode || nextState.activeUnitId !== originalActiveUnitId) {
    const modeChangedEvent: EngineEvent = {
      type: 'mode:changed',
      mode: nextState.mode
    };
    if (nextState.activeUnitId !== null) {
      modeChangedEvent.activeUnitId = nextState.activeUnitId;
    }
    events.push(modeChangedEvent);
  }

  // Save the modified RNG state back into the game state
  nextState.playRngState = rng.state;

  eventBus.emitMany(events);
  return {
    state: nextState,
    tilesRevealed,
    unitsDiscovered,
    events
  };
}
