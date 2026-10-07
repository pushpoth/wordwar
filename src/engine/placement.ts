import type { Grid, GridCoord, Orientation, Unit, WordPick } from './types';
import type { Rng } from './rng';

const MAX_PLACEMENT_ATTEMPTS = 200;

export function placeWords(
  emptyGrid: Grid,
  words: WordPick[],
  opts: { allowDiagonal: boolean },
  rng: Rng
): { grid: Grid; units: Unit[] } {
  // Deep clone emptyGrid
  const grid: Grid = {
    size: emptyGrid.size,
    subCoord: { ...emptyGrid.subCoord },
    tiles: emptyGrid.tiles.map(row =>
      row.map(tile => ({
        ...tile,
        coord: { ...tile.coord }
      }))
    )
  };

  const useDiagonals = opts.allowDiagonal && grid.size >= 15;
  const allowedOrientations: Orientation[] = useDiagonals
    ? ['H', 'V', 'DTR', 'DBR']
    : ['H', 'V'];

  const placedUnits: Unit[] = [];

  for (const wordPick of words) {
    const wordText = wordPick.text.toUpperCase();
    const length = wordText.length;

    if (length > grid.size) {
      console.warn(`placement:partial: word "${wordText}" is longer than grid size ${grid.size}`);
      continue;
    }

    let placed = false;

    for (let attempt = 0; attempt < MAX_PLACEMENT_ATTEMPTS; attempt++) {
      const orientation = allowedOrientations[rng.int(0, allowedOrientations.length)];
      const originX = rng.int(0, grid.size);
      const originY = rng.int(0, grid.size);
      const origin = { x: originX, y: originY };

      let valid = true;
      const coords: GridCoord[] = [];

      for (let i = 0; i < length; i++) {
        let x = origin.x;
        let y = origin.y;

        if (orientation === 'H') {
          x += i;
        } else if (orientation === 'V') {
          y += i;
        } else if (orientation === 'DTR') {
          x += i;
          y -= i;
        } else if (orientation === 'DBR') {
          x += i;
          y += i;
        }

        // 1. Coordinates must be within bounds: 0 <= x < size and 0 <= y < size
        if (x < 0 || x >= grid.size || y < 0 || y >= grid.size) {
          valid = false;
          break;
        }

        // 2. Coordinate must not collide with submarine center (isSubmarine: true)
        if (x === grid.subCoord.x && y === grid.subCoord.y) {
          valid = false;
          break;
        }

        // 3. Coordinate must not collide with any tile that already has unitId !== null
        if (grid.tiles[y][x].unitId !== null) {
          valid = false;
          break;
        }

        coords.push({ x, y });
      }

      if (valid && coords.length === length) {
        // Place the word
        const unitId = `unit-${placedUnits.length}`;

        for (let i = 0; i < length; i++) {
          const { x, y } = coords[i];
          grid.tiles[y][x].letter = wordText[i];
          grid.tiles[y][x].unitId = unitId;
        }

        const unit: Unit = {
          id: unitId,
          word: wordText,
          length: length,
          difficultyTier: wordPick.difficultyTier,
          orientation,
          origin,
          coords,
          destroyed: false,
          torpedoMisses: 0,
          revealedLetters: new Set<number>(),
          triedLetters: new Set<string>()
        };

        placedUnits.push(unit);
        placed = true;
        break;
      }
    }

    if (!placed) {
      console.warn(`placement:partial: failed to place word "${wordText}" after ${MAX_PLACEMENT_ATTEMPTS} attempts`);
    }
  }

  return { grid, units: placedUnits };
}
