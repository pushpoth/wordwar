import type { MissionConfig } from '../engine/types';

/** One player action, stamped with the mission clock so replay matches battery regen. */
export type Action = { k: 'radar' | 'torpedo' | 'next' | 'radar-mode'; l?: string; at: number };

export type Save = {
  v: 1;
  seed: number;
  config: MissionConfig;
  actions: Action[];
  elapsedMs: number;
};

const KEY = 'wordwar.save.v1';

/**
 * Progress survives reloads (and phones discarding the tab) as the seed plus
 * the list of actions: the engine is deterministic, so replaying them rebuilds
 * the exact mission. Kept in this browser's local storage; a few hundred bytes.
 */
export function loadSave(): Save | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Save | null;
    return s && s.v === 1 && Array.isArray(s.actions) ? s : null;
  } catch {
    return null;
  }
}

export function writeSave(save: Save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* storage full or blocked: progress just won't survive a reload */
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
