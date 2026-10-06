import type { MissionConfig, MissionState, MissionSummary, WordEntry, MissionWordCriteria } from './types';
import { deriveRngs } from './rng';
import { pickWords } from './dictionary';
import { generateGrid } from './grid';
import { BATTERY_MAX } from '../config/balance';
import { applyBatteryRegen } from './battery';
import { eventBus } from './events';

/**
 * Deep clones the MissionState to ensure pure functions and immutability.
 */
export function cloneMissionState(state: MissionState): MissionState {
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
 * Generates initial mission state deterministically from configuration and seed.
 */
export function createMission(cfg: MissionConfig, seed: number, dict: WordEntry[]): MissionState {
  const { setupRng, playRng } = deriveRngs(seed);

  const criteria: MissionWordCriteria = {
    count: cfg.unitCount,
    tierWeights: cfg.tierWeights,
    recentlyUsedWords: new Set<string>()
  };

  const pickedWords = pickWords(criteria, setupRng, dict);

  const { grid, units } = generateGrid({
    size: cfg.gridSize,
    units: cfg.unitCount,
    allowDiagonal: cfg.allowDiagonal,
    words: pickedWords,
    rng: setupRng
  });

  const state: MissionState = {
    config: cfg,
    grid,
    units,
    mode: 'RADAR',
    activeUnitId: null,
    discoveredUnitsQueue: [],
    battery: BATTERY_MAX,
    lastBatteryRegenMs: 0,
    torpedoes: cfg.torpedoBudget,
    score: 0,
    shotsFiredRadar: 0,
    shotsFiredTorpedo: 0,
    shotsHitTorpedo: 0,
    startedAtMs: 0,
    elapsedMs: 0,
    outcome: 'in_progress',
    seed,
    playRngState: playRng.state
  };

  eventBus.emit({ type: 'mission:started', mission: cfg, state });

  return state;
}

/**
 * Advances game clock and triggers passive state changes (e.g. battery regeneration).
 */
export function tick(state: MissionState, dtMs: number): MissionState {
  const result = applyBatteryRegen(state, dtMs);
  eventBus.emitMany(result.events);
  return result.state;
}

/**
 * Compiles a snapshot of the mission state into a summary report.
 */
export function summary(state: MissionState): MissionSummary {
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
