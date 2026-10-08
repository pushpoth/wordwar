import { Group, type Camera, type Scene } from 'three/webgpu';
import { CELL, type Board } from '../render/board';
import { loadModel } from '../render/assets';
import { createExplosion } from '../render/fx/explosion';
import { createBoardLabels } from '../render/labels';
import type { HullFootprint, Hulls } from '../render/hulls';
import type { IslandShore } from '../render/ocean';
import { createWordSign } from '../render/word-sign';
import { createWreck } from '../render/wreck';
import { footprint, ride, type Floater } from './buoyancy';
import { addScenery } from './scenery';

type ShipSpec = { word: string; col: number; row: number; dir: 'h' | 'v'; revealed: string };

/** Phase 0 test layout: a fixed mid-battle board modelled on the reference image. */
const SHIPS: ShipSpec[] = [
  { word: 'GHOST', col: 4, row: 8, dir: 'h', revealed: 'GHO_T' },
  { word: 'KITE', col: 5, row: 1, dir: 'h', revealed: 'K___' },
  { word: 'NIXE', col: 8, row: 3, dir: 'v', revealed: '____' },
];
const SUNK: ShipSpec = { word: 'RAPID', col: 3, row: 5, dir: 'h', revealed: 'RAPID' };
const MISSES: [number, number][] = [
  [1, 3], [2, 3], [1, 4], [2, 4], [3, 4], [0, 5], [1, 5], [2, 5], [0, 6], [1, 6], [4, 3], [5, 4], [6, 6],
];
/** Destroyer model dimensions in cells (bow at +X), before per-ship scaling. */
export const DESTROYER = { halfLength: 2.1, halfBeam: 0.29 };
export const SUB = {
  halfLength: 1.25, halfBeam: 0.172, scale: 0.95, cruiseRadius: 1.1, cruiseRate: 0.22,
  /** Pivot point as a fraction of half length ahead of centre; drift angle into the turn. */
  pivot: 0.45, driftDeg: 11,
};

export async function buildDiorama(scene: Scene, board: Board, hulls: Hulls) {
  const root = new Group();
  root.name = 'diorama';
  scene.add(root);
  const floaters: Floater[] = [];
  const islands: IslandShore[] = [];

  const scenery = await addScenery(root);
  islands.push(...scenery.islands);
  floaters.push(...scenery.floaters);

  // Cell states.
  for (const [c, r] of MISSES) board.setCell(c, r, CELL.miss);

  const cellsOf = (s: ShipSpec) =>
    [...s.word].map((_, i) => board.cellCenter(s.dir === 'h' ? s.col + i : s.col, s.dir === 'h' ? s.row : s.row + i));

  async function placeShip(s: ShipSpec) {
    const ship = await loadModel('destroyer');
    const cells = cellsOf(s);
    const mid = cells[0].clone().add(cells[cells.length - 1]).multiplyScalar(0.5);
    const scale = (s.word.length * 0.95) / (DESTROYER.halfLength * 2);
    // The floater carries a container so a wreck can replace the hull in place.
    const carrier = new Group();
    carrier.add(ship);
    carrier.scale.setScalar(scale);
    root.add(carrier);
    const floater: Floater = {
      obj: carrier, x: mid.x, z: mid.z, yaw: s.dir === 'h' ? 0 : -Math.PI / 2,
      hull: { halfLength: DESTROYER.halfLength * scale, halfBeam: DESTROYER.halfBeam * scale },
    };
    floaters.push(floater);
    return { ship, carrier, floater, cells, mid, scale };
  }

  // Discovered enemies; the first is the current torpedo target.
  const target = await placeShip(SHIPS[0]);
  for (const s of SHIPS.slice(1)) await placeShip(s);
  target.cells.forEach((cell, i) => {
    const ch = SHIPS[0].revealed[i];
    board.setCell(cell.x + board.size / 2 - 0.5, cell.z + board.size / 2 - 0.5, ch === '_' ? CELL.hidden : CELL.hit, ch === '_' ? '' : ch, true, true);
  });

  const sign = createWordSign(SHIPS[0].word);
  sign.place(target.cells, 1.25);
  sign.setRevealed([...SHIPS[0].revealed].map((ch) => (ch === '_' ? 0 : 1)));
  root.add(sign.group);

  // The ship being sunk: the explosion, then the hull breaks in two and goes down.
  const sunk = await placeShip(SUNK);
  const wreck = createWreck(await loadModel('destroyer_wreck'), 5);
  sunk.carrier.add(wreck.group);
  wreck.loose.position.set(sunk.mid.x, 0, sunk.mid.z);
  wreck.loose.rotation.y = sunk.floater.yaw;
  wreck.loose.scale.setScalar(sunk.scale);
  root.add(wreck.loose);
  sunk.cells.forEach((cell, i) => board.setCell(cell.x + board.size / 2 - 0.5, cell.z + board.size / 2 - 0.5, CELL.sunk, SUNK.word[i], false, true));
  const boom = createExplosion(7);
  boom.group.position.set(sunk.mid.x + 0.3, 0.15, sunk.mid.z);
  root.add(boom.group, boom.flash);
  board.uniforms.blastCenter.value.set(boom.group.position.x, boom.group.position.z);

  // Player submarine cruising a slow circle at the bottom-left, sonar ring in tow.
  const sub = await loadModel('submarine');
  sub.scale.setScalar(SUB.scale);
  root.add(sub);
  const subHome = board.cellCenter(1, 7);
  const subFloat: Floater = {
    obj: sub, x: subHome.x, z: subHome.z, yaw: 0, speed: SUB.cruiseRadius * SUB.cruiseRate,
    hull: { halfLength: SUB.halfLength * SUB.scale, halfBeam: SUB.halfBeam * SUB.scale },
  };
  floaters.push(subFloat);
  board.uniforms.sonarRadius.value = 2.1;

  const labels = createBoardLabels(board.size);
  root.add(labels.group);

  /** Demo loop: blast at 0 s, wreck sinks, the ship resets at the end. */
  const BLAST_PERIOD = 10;
  const BREAK_AT = 0.1;
  function update(t: number, dt: number, camera: Camera, azimuthDeg = 0) {
    board.faceCamera(azimuthDeg);
    // A hull turns about a pivot point near its bow: the bow tracks the path
    // and points slightly into the turn while the stern skids outward.
    const th = t * SUB.cruiseRate + 2.2;
    const px = subHome.x + Math.cos(th) * SUB.cruiseRadius;
    const pz = subHome.z + Math.sin(th) * SUB.cruiseRadius;
    const drift = Math.tan(SUB.driftDeg * Math.PI / 180);
    let fx = -Math.sin(th) - Math.cos(th) * drift;
    let fz = Math.cos(th) - Math.sin(th) * drift;
    const fl = Math.hypot(fx, fz);
    fx /= fl;
    fz /= fl;
    const pivot = SUB.halfLength * SUB.scale * SUB.pivot;
    subFloat.x = px - fx * pivot;
    subFloat.z = pz - fz * pivot;
    subFloat.yaw = Math.atan2(-fz, fx);
    board.uniforms.sonarCenter.value.set(px, pz);

    const age = t % BLAST_PERIOD;
    const wreckAge = age - BREAK_AT;
    sunk.ship.visible = wreckAge < 0;
    wreck.update(wreckAge, t);
    sunk.floater.lift = wreckAge < 0 ? 0 : -wreck.sinkDepth(wreckAge);
    sunk.floater.list = wreckAge < 0 ? undefined : wreck.list(wreckAge);

    const prints: HullFootprint[] = [];
    for (const f of floaters) {
      ride(f, t, dt);
      const p = footprint(f);
      if (p) prints.push(p);
    }
    hulls.set(prints);

    sign.update(camera, t);
    labels.update(camera);
    boom.age.value = age;
    boom.update();
    board.uniforms.blastAge.value = age;
  }

  return { root, update, islands };
}
