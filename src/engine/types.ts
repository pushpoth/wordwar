export type GridCoord = { x: number; y: number };
export type UnitId = string;

export type Tile = {
  coord: GridCoord;
  letter: string; // 'A'..'Z'
  unitId: UnitId | null; // null when not part of a word
  isSubmarine: boolean;
  revealed: boolean; // mission-state; set false at generation
  revealedBy?: 'radar' | 'torpedo' | 'destroyed'; // set when revealed; used by bridge to synthesize the right repaint kind on load
};

export type Orientation = 'H' | 'V' | 'DTR' | 'DBR'; // diagonals: top-right, bottom-right

export type Unit = {
  id: UnitId;
  word: string;
  length: number;
  difficultyTier: 1 | 2 | 3 | 4 | 5;
  orientation: Orientation;
  origin: GridCoord; // first letter of word
  coords: GridCoord[]; // all tile coords occupied
  destroyed: boolean;
  torpedoMisses: number;
  revealedLetters: Set<number>; // indices into `word` revealed in torpedo mode
  triedLetters: Set<string>; // letters tried in torpedo mode (both hits and misses)
};

export type Grid = {
  size: number;
  tiles: Tile[][];
  subCoord: GridCoord;
};

export type WordEntry = {
  text: string;
  length: number;
  difficultyTier: 1 | 2 | 3 | 4 | 5;
};

export type WordPick = WordEntry & { repeatCount: number };

export type MissionWordCriteria = {
  count: number;
  tierWeights: Record<1 | 2 | 3 | 4 | 5, number>;
  recentlyUsedWords: Set<string>;
  minLength?: number;
  maxLength?: number;
};

export type MissionConfig = {
  id: number;
  gridSize: number;
  unitCount: number;
  torpedoBudget: number;
  allowDiagonal: boolean;
  tierWeights: Record<1 | 2 | 3 | 4 | 5, number>;
  batteryRegenSeconds: number;
};

export type MissionState = {
  config: MissionConfig;
  grid: Grid;
  units: Unit[];
  mode: 'RADAR' | 'TORPEDO';
  activeUnitId: UnitId | null;
  discoveredUnitsQueue: UnitId[];
  battery: number;
  lastBatteryRegenMs: number;
  torpedoes: number;
  score: number;
  shotsFiredRadar: number;
  shotsFiredTorpedo: number;
  shotsHitTorpedo: number;
  startedAtMs: number;
  elapsedMs: number;
  outcome: 'in_progress' | 'success' | 'failure';
  seed: number;
  playRngState: number;
};

export type MissionSummary = {
  outcome: 'success' | 'failure';
  score: number;
  elapsedMs: number;
  units: Array<{ word: string; destroyed: boolean; perfect: boolean; torpedoMisses: number }>;
  shotsFiredRadar: number;
  shotsFiredTorpedo: number;
  hitRateTorpedo: number; // hits / fires
  unitsDestroyed: number;
  unitsTotal: number;
};

export type EngineEvent =
  | { type: 'mission:started'; mission: MissionConfig; state: MissionState }
  | { type: 'mode:changed'; mode: 'RADAR' | 'TORPEDO'; activeUnitId?: UnitId }
  | { type: 'radar:fired'; letter: string; battery: number }
  | { type: 'radar:denied'; reason: 'battery_empty' | 'mission_ended' }
  | { type: 'radar:resolved'; letter: string; tilesRevealed: GridCoord[]; unitsDiscovered: UnitId[] }
  | { type: 'torpedo:fired'; letter: string; torpedoes: number; targetUnitId: UnitId }
  | { type: 'torpedo:denied'; reason: 'torpedoes_empty' | 'mission_ended' | 'already_tried'; targetUnitId: UnitId }
  | { type: 'torpedo:resolved'; letter: string; hits: GridCoord[]; missed: boolean; targetUnitId: UnitId }
  | { type: 'unit:destroyed'; unitId: UnitId; perfect: boolean; score: number }
  | { type: 'battery:regen'; battery: number }
  | { type: 'score:changed'; score: number }
  | { type: 'mission:ended'; outcome: 'success' | 'failure'; summary: MissionSummary };

export type { Rng } from './rng';

export type RadarResult = {
  state: MissionState;
  tilesRevealed: GridCoord[];
  unitsDiscovered: UnitId[];
  events: EngineEvent[];
};

export type TorpedoResult = {
  state: MissionState;
  hits: GridCoord[];
  miss: boolean;
  unitDestroyed: boolean;
  perfect: boolean;
  events: EngineEvent[];
};


