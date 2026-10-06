import { BATTERY_REGEN_SECONDS, TORPEDO_BUDGET_DEFAULT } from '../config/balance';
import { WORDS } from '../config/words';
import { eventBus } from '../engine/events';
import { createMission, summary, tick } from '../engine/mission';
import { fireRadar } from '../engine/radar';
import { mulberry32 } from '../engine/rng';
import { fireTorpedo, returnToRadar, switchTarget } from '../engine/torpedo';
import type { EngineEvent, MissionConfig, MissionState, Unit } from '../engine/types';

export const DEFAULT_MISSION: MissionConfig = {
  id: 1,
  gridSize: 10,
  unitCount: 4,
  torpedoBudget: TORPEDO_BUDGET_DEFAULT,
  allowDiagonal: false,
  tierWeights: { 1: 4, 2: 3, 3: 2, 4: 1, 5: 1 },
  batteryRegenSeconds: BATTERY_REGEN_SECONDS,
};

/**
 * Owns the mutable mission state and exposes the player's actions. The engine
 * stays pure; every action returns the events it produced, in order.
 */
export function createGame(config: MissionConfig, seed: number) {
  // The engine also broadcasts on a global bus; it warns when nobody listens.
  const stopListening = eventBus.onAny(() => {});
  let state: MissionState = createMission(config, seed, WORDS);
  const playRng = mulberry32(state.playRngState);

  const run = (fn: () => { state: MissionState; events: EngineEvent[] }) => {
    const r = fn();
    state = r.state;
    return r.events;
  };

  return {
    get state() {
      return state;
    },
    seed,
    radar: (letter: string) => run(() => fireRadar(state, letter, playRng)),
    torpedo: (letter: string) => run(() => fireTorpedo(state, letter)),
    nextTarget: () => {
      state = switchTarget(state);
    },
    toRadar: () => {
      state = returnToRadar(state);
    },
    tick: (dtMs: number) => {
      state = tick(state, dtMs);
    },
    summary: () => summary(state),
    unit: (id: string | null): Unit | undefined => (id ? state.units.find((u) => u.id === id) : undefined),
    dispose: stopListening,
  };
}

export type Game = ReturnType<typeof createGame>;
