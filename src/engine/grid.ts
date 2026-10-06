import type { Grid, Tile, Unit, WordPick } from './types';
import type { Rng } from './rng';
import { LETTER_FREQ } from '../config/balance';
import { placeWords } from './placement';

const LETTERS: string[] = [];
const WEIGHTS: number[] = [];
let totalWeight = 0;

for (const [letter, freq] of Object.entries(LETTER_FREQ)) {
  LETTERS.push(letter);
  totalWeight += freq;
  WEIGHTS.push(totalWeight);
}

function getRandomLetter(rng: Rng): string {
  const r = rng.next() * totalWeight;
  for (let i = 0; i < WEIGHTS.length; i++) {
    if (r <= WEIGHTS[i]) {
      return LETTERS[i];
    }
  }
  return LETTERS[LETTERS.length - 1];
}

export function createEmptyGrid(size: number, rng: Rng): Grid {
  const subCoord = { x: Math.floor(size / 2), y: Math.floor(size / 2) };
  const tiles: Tile[][] = [];
  
  for (let y = 0; y < size; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < size; x++) {
      const isSubmarine = x === subCoord.x && y === subCoord.y;
      row.push({
        coord: { x, y },
        letter: getRandomLetter(rng),
        unitId: null,
        isSubmarine,
        revealed: false
      });
    }
    tiles.push(row);
  }
  
  return {
    size,
    tiles,
    subCoord
  };
}

export function generateGrid(opts: {
  size: number;
  units: number;
  allowDiagonal: boolean;
  words: WordPick[];
  rng: Rng;
}): { grid: Grid; units: Unit[] } {
  const emptyGrid = createEmptyGrid(opts.size, opts.rng);
  const wordsToPlace = opts.words.slice(0, Math.min(opts.units, opts.words.length));
  return placeWords(emptyGrid, wordsToPlace, { allowDiagonal: opts.allowDiagonal }, opts.rng);
}

