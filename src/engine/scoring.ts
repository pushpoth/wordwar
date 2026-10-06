import type { GridCoord } from './types';
import { PERFECT_KILL_BONUS } from '../config/balance';

/**
 * Computes the score gained for a given set of torpedo hits.
 */
export function scoreForTorpedoHit(hits: GridCoord[]): number {
  return hits.length * 10;
}

/**
 * Computes the score gained when a unit is destroyed.
 */
export function scoreForUnitDestroy(word: string, perfect: boolean): number {
  return word.length * 10 + (perfect ? PERFECT_KILL_BONUS : 0);
}
