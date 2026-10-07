import type { MissionState, TorpedoResult, UnitId, EngineEvent, GridCoord, MissionSummary } from './types';
import { scoreForTorpedoHit, scoreForUnitDestroy } from './scoring';
import { eventBus } from './events';


/**
 * Deep clones the MissionState to ensure the functions are pure and state is immutable.
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

/**
 * Reconstructs a MissionSummary based on the current state.
 */
function createMissionSummary(state: MissionState): MissionSummary {
  const unitsDestroyed = state.units.filter(u => u.destroyed).length;
  const unitsTotal = state.units.length;
  const hitRateTorpedo = state.shotsFiredTorpedo === 0 ? 0 : state.shotsHitTorpedo / state.shotsFiredTorpedo;

  return {
    outcome: state.outcome === 'success' ? 'success' : 'failure',
    score: state.score,
    elapsedMs: state.elapsedMs,
    units: state.units.map(u => ({
      word: u.word,
      destroyed: u.destroyed,
      perfect: u.destroyed && u.torpedoMisses === 0,
      torpedoMisses: u.torpedoMisses
    })),
    shotsFiredRadar: state.shotsFiredRadar,
    shotsFiredTorpedo: state.shotsFiredTorpedo,
    hitRateTorpedo,
    unitsDestroyed,
    unitsTotal
  };
}

export function fireTorpedo(state: MissionState, letter: string): TorpedoResult {
  const events: EngineEvent[] = [];

  // 1. Check preconditions
  if (state.mode !== 'TORPEDO' || !state.activeUnitId || state.outcome !== 'in_progress') {
    console.warn(`fireTorpedo: invalid preconditions. mode=${state.mode}, activeUnitId=${state.activeUnitId}, outcome=${state.outcome}`);
    eventBus.emitMany(events);
    return {
      state,
      hits: [],
      miss: false,
      unitDestroyed: false,
      perfect: false,
      events
    };
  }

  const targetUnitId = state.activeUnitId!;
  const activeUnitState = state.units.find(u => u.id === targetUnitId);
  if (activeUnitState) {
    const targetLetter = letter.toUpperCase();
    if (activeUnitState.triedLetters.has(targetLetter)) {
      events.push({
        type: 'torpedo:denied',
        reason: 'already_tried',
        targetUnitId
      });
      eventBus.emitMany(events);
      return {
        state,
        hits: [],
        miss: false,
        unitDestroyed: false,
        perfect: false,
        events
      };
    }
  }

  // 2. Check torpedo budget
  if (state.torpedoes <= 0) {
    const nextState = cloneMissionState(state);
    nextState.outcome = 'failure';
    events.push({
      type: 'mission:ended',
      outcome: 'failure',
      summary: createMissionSummary(nextState)
    });
    eventBus.emitMany(events);
    return {
      state: nextState,
      hits: [],
      miss: false,
      unitDestroyed: false,
      perfect: false,
      events
    };
  }

  // 3. Clone state and deduct torpedo
  const nextState = cloneMissionState(state);
  nextState.torpedoes -= 1;
  nextState.shotsFiredTorpedo += 1;

  events.push({
    type: 'torpedo:fired',
    letter,
    torpedoes: nextState.torpedoes,
    targetUnitId
  });

  const activeUnit = nextState.units.find(u => u.id === targetUnitId);
  if (!activeUnit) {
    console.warn(`fireTorpedo: active unit ${targetUnitId} not found in state`);
    eventBus.emitMany([]);
    return {
      state,
      hits: [],
      miss: false,
      unitDestroyed: false,
      perfect: false,
      events: []
    };
  }

  const targetLetter = letter.toUpperCase();
  activeUnit.triedLetters.add(targetLetter);
  const word = activeUnit.word.toUpperCase();

  // Find all indices for the letter in the word
  const indicesInWord: number[] = [];
  for (let i = 0; i < word.length; i++) {
    if (word[i] === targetLetter) {
      indicesInWord.push(i);
    }
  }

  // Defensive check: is the letter already fully resolved for this target?
  if (indicesInWord.length > 0 && indicesInWord.every(idx => activeUnit.revealedLetters.has(idx))) {
    // Re-pressing a fully resolved letter is a defensive no-op
    eventBus.emitMany([]);
    return {
      state,
      hits: [],
      miss: false,
      unitDestroyed: false,
      perfect: false,
      events: []
    };
  }

  // Find unrevealed matching indices
  const matchingIndices = indicesInWord.filter(idx => !activeUnit.revealedLetters.has(idx));

  let miss = false;
  const hits: GridCoord[] = [];
  let unitDestroyed = false;
  let perfect = false;

  if (matchingIndices.length === 0) {
    // Miss case
    miss = true;
    activeUnit.torpedoMisses += 1;

    events.push({
      type: 'torpedo:resolved',
      letter,
      hits: [],
      missed: true,
      targetUnitId
    });

    if (nextState.torpedoes === 0) {
      nextState.outcome = 'failure';
      events.push({
        type: 'mission:ended',
        outcome: 'failure',
        summary: createMissionSummary(nextState)
      });
    }
  } else {
    // Hit case
    for (const index of matchingIndices) {
      activeUnit.revealedLetters.add(index);
      const coord = activeUnit.coords[index];
      const tile = nextState.grid.tiles[coord.y][coord.x];
      tile.revealed = true;
      tile.revealedBy = 'torpedo';
      nextState.shotsHitTorpedo += 1;
      hits.push(coord);
    }
    nextState.score += scoreForTorpedoHit(hits);

    events.push({
      type: 'score:changed',
      score: nextState.score
    });

    events.push({
      type: 'torpedo:resolved',
      letter,
      hits,
      missed: false,
      targetUnitId
    });

    // Check if unit is destroyed
    if (activeUnit.revealedLetters.size === activeUnit.word.length) {
      unitDestroyed = true;
      activeUnit.destroyed = true;

      // Update grid tiles to have revealedBy = 'destroyed'
      for (const coord of activeUnit.coords) {
        const tile = nextState.grid.tiles[coord.y][coord.x];
        tile.revealedBy = 'destroyed';
      }

      perfect = activeUnit.torpedoMisses === 0;
      nextState.score += scoreForUnitDestroy(activeUnit.word, perfect);

      events.push({
        type: 'score:changed',
        score: nextState.score
      });

      events.push({
        type: 'unit:destroyed',
        unitId: targetUnitId,
        perfect,
        score: nextState.score
      });

      // Remove from discovered units queue
      nextState.discoveredUnitsQueue = nextState.discoveredUnitsQueue.filter(id => id !== targetUnitId);

      // Check if all units are destroyed
      const allDestroyed = nextState.units.every(u => u.destroyed);
      if (allDestroyed) {
        nextState.outcome = 'success';
        events.push({
          type: 'mission:ended',
          outcome: 'success',
          summary: createMissionSummary(nextState)
        });
      } else {
        // Transition target
        if (nextState.discoveredUnitsQueue.length > 0) {
          nextState.activeUnitId = nextState.discoveredUnitsQueue[0];
          events.push({
            type: 'mode:changed',
            mode: 'TORPEDO',
            activeUnitId: nextState.activeUnitId
          });
        } else {
          nextState.mode = 'RADAR';
          nextState.activeUnitId = null;
          events.push({
            type: 'mode:changed',
            mode: 'RADAR'
          });
        }

        // Check if out of torpedoes
        if (nextState.torpedoes === 0) {
          nextState.outcome = 'failure';
          events.push({
            type: 'mission:ended',
            outcome: 'failure',
            summary: createMissionSummary(nextState)
          });
        }
      }
    } else {
      // Check if out of torpedoes
      if (nextState.torpedoes === 0) {
        nextState.outcome = 'failure';
        events.push({
          type: 'mission:ended',
          outcome: 'failure',
          summary: createMissionSummary(nextState)
        });
      }
    }
  }

  eventBus.emitMany(events);
  return {
    state: nextState,
    hits,
    miss,
    unitDestroyed,
    perfect,
    events
  };
}

export function switchTarget(state: MissionState, unitId?: UnitId): MissionState {
  if (state.mode !== 'TORPEDO' || state.outcome !== 'in_progress') {
    console.warn(`switchTarget: invalid mode/outcome. mode=${state.mode}, outcome=${state.outcome}`);
    return state;
  }

  const nextState = cloneMissionState(state);

  if (unitId !== undefined) {
    if (!nextState.discoveredUnitsQueue.includes(unitId)) {
      console.warn(`switchTarget: unitId ${unitId} is not in discovered queue`);
      return state;
    }
    nextState.activeUnitId = unitId;
  } else {
    const queue = nextState.discoveredUnitsQueue;
    if (queue.length === 0) {
      nextState.activeUnitId = null;
    } else {
      const currentIndex = queue.indexOf(nextState.activeUnitId || '');
      const nextIndex = (currentIndex + 1) % queue.length;
      nextState.activeUnitId = queue[nextIndex];
    }
  }

  if (nextState.mode !== state.mode || nextState.activeUnitId !== state.activeUnitId) {
    const event: EngineEvent = {
      type: 'mode:changed',
      mode: nextState.mode
    };
    if (nextState.activeUnitId !== null) {
      event.activeUnitId = nextState.activeUnitId;
    }
    eventBus.emit(event);
  }

  return nextState;
}

/**
 * Aim at a discovered unit from either mode: in TORPEDO mode it behaves like
 * `switchTarget(state, unitId)`; from RADAR it also enters TORPEDO mode.
 * (Word War: a tap on a visible enemy ship.)
 */
export function aimAt(state: MissionState, unitId: UnitId): MissionState {
  if (state.mode === 'TORPEDO') return switchTarget(state, unitId);
  if (state.outcome !== 'in_progress' || !state.discoveredUnitsQueue.includes(unitId)) return state;
  const nextState = cloneMissionState(state);
  nextState.mode = 'TORPEDO';
  nextState.activeUnitId = unitId;
  eventBus.emit({ type: 'mode:changed', mode: 'TORPEDO', activeUnitId: unitId });
  return nextState;
}

export function returnToRadar(state: MissionState): MissionState {
  if (state.outcome !== 'in_progress') {
    console.warn(`returnToRadar: invalid outcome. outcome=${state.outcome}`);
    return state;
  }

  const nextState = cloneMissionState(state);
  nextState.mode = 'RADAR';
  nextState.activeUnitId = null;

  if (nextState.mode !== state.mode || nextState.activeUnitId !== state.activeUnitId) {
    eventBus.emit({
      type: 'mode:changed',
      mode: nextState.mode
    });
  }

  return nextState;
}
