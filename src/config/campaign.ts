import type { MissionConfig, MissionSummary } from '../engine/types';
import { BATTERY_REGEN_SECONDS } from './balance';

/** One mission on the ladder. Later slices append bigger maps and harder modifiers. */
export type Level = {
  id: number;
  name: string;
  blurb: string;
  gridSize: number;
  unitCount: number;
  torpedoBudget: number;
  batteryRegenSeconds: number;
  allowDiagonal: boolean;
  tierWeights: MissionConfig['tierWeights'];
  /** Share of the torpedo budget a win may spend to earn the second and third star (fitted with `npm run balance -- --fit`). */
  starUse: [number, number];
};

const W = (a: number, b: number, c: number, d: number, e: number): MissionConfig['tierWeights'] => ({ 1: a, 2: b, 3: c, 4: d, 5: e });

export const LEVELS: Level[] = [
  { id: 1, name: 'First contact', blurb: 'Two short-range targets. Learn the radar.', gridSize: 10, unitCount: 2, torpedoBudget: 30, batteryRegenSeconds: BATTERY_REGEN_SECONDS, allowDiagonal: false, tierWeights: W(6, 3, 0, 0, 0), starUse: [0.6, 0.45] },
  { id: 2, name: 'Shallow water', blurb: 'A third ship, slightly longer words.', gridSize: 10, unitCount: 3, torpedoBudget: 40, batteryRegenSeconds: BATTERY_REGEN_SECONDS, allowDiagonal: false, tierWeights: W(4, 4, 2, 0, 0), starUse: [0.65, 0.5] },
  { id: 3, name: 'Patrol route', blurb: 'Longer words and fewer torpedoes.', gridSize: 10, unitCount: 3, torpedoBudget: 40, batteryRegenSeconds: BATTERY_REGEN_SECONDS, allowDiagonal: false, tierWeights: W(2, 4, 3, 1, 0), starUse: [0.65, 0.52] },
  { id: 4, name: 'Crossing', blurb: 'Ships can lie on the diagonal.', gridSize: 10, unitCount: 4, torpedoBudget: 45, batteryRegenSeconds: BATTERY_REGEN_SECONDS, allowDiagonal: true, tierWeights: W(2, 3, 3, 2, 0), starUse: [0.75, 0.62] },
  { id: 5, name: 'Fog bank', blurb: 'Slower radar recharge.', gridSize: 10, unitCount: 4, torpedoBudget: 45, batteryRegenSeconds: 6, allowDiagonal: true, tierWeights: W(0, 3, 3, 3, 1), starUse: [0.78, 0.65] },
  { id: 6, name: 'Hunters', blurb: 'Five ships, long words.', gridSize: 10, unitCount: 5, torpedoBudget: 50, batteryRegenSeconds: 6, allowDiagonal: true, tierWeights: W(0, 2, 3, 3, 2), starUse: [0.85, 0.72] },
  { id: 7, name: 'Deep patrol', blurb: 'Big ships, a tight torpedo budget.', gridSize: 10, unitCount: 5, torpedoBudget: 50, batteryRegenSeconds: 6, allowDiagonal: true, tierWeights: W(0, 0, 3, 4, 3), starUse: [0.88, 0.76] },
  { id: 8, name: 'Flagship', blurb: 'Six ships: the biggest fleet yet.', gridSize: 10, unitCount: 6, torpedoBudget: 55, batteryRegenSeconds: 7, allowDiagonal: true, tierWeights: W(0, 2, 3, 4, 0), starUse: [0.9, 0.8] },
];

export const levelById = (id: number) => LEVELS.find((l) => l.id === id);

/** The engine config for a level. */
export function configFor(level: Level): MissionConfig {
  return {
    id: level.id,
    gridSize: level.gridSize,
    unitCount: level.unitCount,
    torpedoBudget: level.torpedoBudget,
    allowDiagonal: level.allowDiagonal,
    tierWeights: level.tierWeights,
    batteryRegenSeconds: level.batteryRegenSeconds,
  };
}

/** Stars earned by a finished mission: 0 on a loss, 1 for a win, 2 and 3 for winning with torpedoes to spare. */
export function starsFor(level: Level, s: MissionSummary): 0 | 1 | 2 | 3 {
  if (s.outcome !== 'success') return 0;
  const used = s.shotsFiredTorpedo / level.torpedoBudget;
  if (used <= level.starUse[1]) return 3;
  if (used <= level.starUse[0]) return 2;
  return 1;
}
