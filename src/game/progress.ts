import { LEVELS } from '../config/campaign';

export type LevelRecord = { stars: number; bestScore: number; plays: number };
export type Progress = { v: 1; levels: Record<number, LevelRecord> };

const KEY = 'wordwar.progress.v1';

export const emptyProgress = (): Progress => ({ v: 1, levels: {} });

/** Level 1 is always open; each later level opens when the one before it has been won. */
export function isUnlocked(p: Progress, id: number): boolean {
  return id <= 1 || (p.levels[id - 1]?.stars ?? 0) > 0;
}

/** The first level not yet won (or the last level once all are). */
export function currentLevel(p: Progress): number {
  const open = LEVELS.find((l) => (p.levels[l.id]?.stars ?? 0) === 0);
  return open?.id ?? LEVELS[LEVELS.length - 1].id;
}

/** A new progress with a finished mission recorded; best stars and score only ever go up. */
export function record(p: Progress, id: number, stars: number, score: number): Progress {
  const old = p.levels[id] ?? { stars: 0, bestScore: 0, plays: 0 };
  return {
    v: 1,
    levels: {
      ...p.levels,
      [id]: { stars: Math.max(old.stars, stars), bestScore: Math.max(old.bestScore, score), plays: old.plays + 1 },
    },
  };
}

export function loadProgress(): Progress {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Progress | null;
    return p && p.v === 1 && typeof p.levels === 'object' && p.levels ? p : emptyProgress();
  } catch {
    return emptyProgress();
  }
}

export function writeProgress(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage full or blocked: stars just won't survive a reload */
  }
}
