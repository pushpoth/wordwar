import { BATTERY_MAX, BATTERY_REGEN_SECONDS, TORPEDO_BUDGET_DEFAULT } from '../config/balance';
import { WORDS } from '../config/words';
import { eventBus } from '../engine/events';
import { createMission, summary, tick } from '../engine/mission';
import { fireRadar } from '../engine/radar';
import { mulberry32 } from '../engine/rng';
import { aimAt, fireTorpedo, returnToRadar, switchTarget } from '../engine/torpedo';
import type { EngineEvent, MissionConfig, MissionState, Unit } from '../engine/types';
import type { Action, Save } from './save';

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
  const actions: Action[] = [];
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
    radar: (letter: string) => {
      actions.push({ k: 'radar', l: letter, at: state.elapsedMs });
      return run(() => fireRadar(state, letter, playRng));
    },
    torpedo: (letter: string) => {
      actions.push({ k: 'torpedo', l: letter, at: state.elapsedMs });
      return run(() => fireTorpedo(state, letter));
    },
    nextTarget: () => {
      actions.push({ k: 'next', at: state.elapsedMs });
      state = switchTarget(state);
    },
    /** Aim at a specific discovered ship (a tap on it), from either mode. */
    selectTarget: (id: string) => {
      actions.push({ k: 'select', id, at: state.elapsedMs });
      state = aimAt(state, id);
    },
    toRadar: () => {
      actions.push({ k: 'radar-mode', at: state.elapsedMs });
      state = returnToRadar(state);
    },
    /** Cheats: top up torpedoes and/or battery. */
    refill: (torpedoes: boolean, battery: boolean) => {
      if (torpedoes) state.torpedoes = config.torpedoBudget;
      if (battery) state.battery = BATTERY_MAX;
    },
    config,
    /** Everything needed to rebuild this mission exactly. */
    save: (): Save => ({ v: 1, seed, config, actions: [...actions], elapsedMs: state.elapsedMs }),
    tick: (dtMs: number) => {
      state = tick(state, dtMs);
    },
    summary: () => summary(state),
    unit: (id: string | null): Unit | undefined => (id ? state.units.find((u) => u.id === id) : undefined),
    dispose: stopListening,
  };
}

export type Game = ReturnType<typeof createGame>;

/** Rebuild a saved mission by replaying its actions against the same seed. */
export function restoreGame(save: Save): Game {
  const game = createGame(save.config, save.seed);
  for (const a of save.actions) {
    if (a.at > game.state.elapsedMs) game.tick(a.at - game.state.elapsedMs);
    if (a.k === 'radar' && a.l) game.radar(a.l);
    else if (a.k === 'torpedo' && a.l) game.torpedo(a.l);
    else if (a.k === 'next') game.nextTarget();
    else if (a.k === 'select' && a.id) game.selectTarget(a.id);
    else if (a.k === 'radar-mode') game.toRadar();
  }
  if (save.elapsedMs > game.state.elapsedMs) game.tick(save.elapsedMs - game.state.elapsedMs);
  return game;
}
