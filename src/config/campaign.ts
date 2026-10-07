import type { MissionConfig, MissionSummary } from '../engine/types';
import { BATTERY_REGEN_SECONDS } from './balance';

/** One mission on the ladder. Boards grow from 8×8 to 18×18 as the levels rise. */
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
  { id: 1, name: 'First contact', blurb: 'Two ships on a small board. Learn the radar.', gridSize: 8, unitCount: 2, torpedoBudget: 35, batteryRegenSeconds: BATTERY_REGEN_SECONDS, allowDiagonal: false, tierWeights: W(2, 6, 1, 0, 0), starUse: [0.55, 0.4] },
  { id: 2, name: 'Shallow water', blurb: 'A third ship, slightly longer words.', gridSize: 8, unitCount: 3, torpedoBudget: 40, batteryRegenSeconds: BATTERY_REGEN_SECONDS, allowDiagonal: false, tierWeights: W(1, 5, 3, 0, 0), starUse: [0.7, 0.52] },
  { id: 3, name: 'Patrol route', blurb: 'A bigger sea to sweep.', gridSize: 10, unitCount: 3, torpedoBudget: 40, batteryRegenSeconds: BATTERY_REGEN_SECONDS, allowDiagonal: false, tierWeights: W(1, 4, 4, 1, 0), starUse: [0.68, 0.5] },
  { id: 4, name: 'Crossing', blurb: 'Ships can lie on the diagonal.', gridSize: 10, unitCount: 4, torpedoBudget: 45, batteryRegenSeconds: BATTERY_REGEN_SECONDS, allowDiagonal: true, tierWeights: W(0, 3, 4, 2, 0), starUse: [0.75, 0.62] },
  { id: 5, name: 'Open water', blurb: 'Twelve by twelve: more sea, more ships.', gridSize: 12, unitCount: 4, torpedoBudget: 45, batteryRegenSeconds: 6, allowDiagonal: true, tierWeights: W(0, 2, 4, 3, 1), starUse: [0.78, 0.64] },
  { id: 6, name: 'Fog bank', blurb: 'A fifth ship in the haze.', gridSize: 12, unitCount: 5, torpedoBudget: 50, batteryRegenSeconds: 6, allowDiagonal: true, tierWeights: W(0, 2, 3, 4, 1), starUse: [0.85, 0.72] },
  { id: 7, name: 'Wide patrol', blurb: 'Fifteen cells across.', gridSize: 15, unitCount: 5, torpedoBudget: 50, batteryRegenSeconds: 6, allowDiagonal: true, tierWeights: W(0, 1, 3, 4, 2), starUse: [0.88, 0.74] },
  { id: 8, name: 'Hunters', blurb: 'Six ships, long words.', gridSize: 15, unitCount: 6, torpedoBudget: 60, batteryRegenSeconds: 6, allowDiagonal: true, tierWeights: W(0, 1, 3, 4, 3), starUse: [0.88, 0.76] },
  { id: 9, name: 'Deep sea', blurb: 'The widest board yet.', gridSize: 18, unitCount: 6, torpedoBudget: 60, batteryRegenSeconds: 6, allowDiagonal: true, tierWeights: W(0, 0, 3, 4, 3), starUse: [0.9, 0.78] },
  { id: 10, name: 'Flagship', blurb: 'Seven ships on the widest board.', gridSize: 18, unitCount: 7, torpedoBudget: 70, batteryRegenSeconds: 7, allowDiagonal: true, tierWeights: W(0, 0, 2, 4, 4), starUse: [0.9, 0.78] },
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
