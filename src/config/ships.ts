/**
 * Enemy ship classes, chosen by the length of the ship's word. Every class
 * reuses the destroyer model for now, scaled to the ship's length. To give a
 * class its own look, build the model and change that row's `model` (and
 * `wreck`); nothing else needs to change.
 */
export type ShipClass = {
  id: 'patrol' | 'destroyer' | 'cruiser' | 'battleship';
  name: string;
  /** Longest word this class carries. */
  maxLength: number;
  /** Model files in `public/models` (without `.glb`). */
  model: string;
  wreck: string;
};

export const SHIP_CLASSES: ShipClass[] = [
  { id: 'patrol', name: 'Patrol boat', maxLength: 4, model: 'destroyer', wreck: 'destroyer_wreck' },
  { id: 'destroyer', name: 'Destroyer', maxLength: 6, model: 'destroyer', wreck: 'destroyer_wreck' },
  { id: 'cruiser', name: 'Cruiser', maxLength: 8, model: 'destroyer', wreck: 'destroyer_wreck' },
  { id: 'battleship', name: 'Battleship', maxLength: Infinity, model: 'destroyer', wreck: 'destroyer_wreck' },
];

export function shipClassFor(wordLength: number): ShipClass {
  return SHIP_CLASSES.find((c) => wordLength <= c.maxLength) ?? SHIP_CLASSES[SHIP_CLASSES.length - 1];
}

/** Every model file the classes can show, for preloading. */
export function shipModels(): string[] {
  return [...new Set(SHIP_CLASSES.flatMap((c) => [c.model, c.wreck]))];
}
