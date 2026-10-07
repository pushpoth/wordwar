import { BATTERY_MAX } from '../config/balance';
import type { MissionState, EngineEvent } from './types';

/**
 * Clones the MissionState to ensure pure functions and immutability.
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
 * Applies battery regeneration logic based on the elapsed mission time.
 * regenerates +1 battery every config.batteryRegenSeconds of elapsed mission time.
 * Capped at BATTERY_MAX.
 */
export function applyBatteryRegen(
  state: MissionState,
  dtMs: number
): { state: MissionState; events: EngineEvent[] } {
  if (state.outcome !== 'in_progress') {
    return { state, events: [] };
  }

  const nextState = cloneMissionState(state);
  nextState.elapsedMs += dtMs;

  const regenIntervalMs = nextState.config.batteryRegenSeconds * 1000;
  const events: EngineEvent[] = [];

  while (
    nextState.battery < BATTERY_MAX &&
    (nextState.elapsedMs - nextState.lastBatteryRegenMs) >= regenIntervalMs
  ) {
    nextState.battery += 1;
    nextState.lastBatteryRegenMs += regenIntervalMs;
    events.push({ type: 'battery:regen', battery: nextState.battery });
  }

  return { state: nextState, events };
}

