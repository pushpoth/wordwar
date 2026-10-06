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
const ISLANDS = [
  { model: 'island_lighthouse', x: -8.9, z: -1.2, yaw: 0.35, scale: 1.0 },
  { model: 'island_wooded', x: 8.7, z: -4.8, yaw: 2.1, scale: 0.95 },
  { model: 'island_rock', x: 7.6, z: 1.6, yaw: 0.8, scale: 1.0 },
  { model: 'island_wooded', x: 8.3, z: 7.9, yaw: -0.6, scale: 1.25 },
  { model: 'island_rock', x: -7.2, z: 7.4, yaw: 2.6, scale: 0.85 },
  { model: 'island_rock', x: -4.0, z: -8.4, yaw: 1.2, scale: 0.7 },
];
/** Island kit footprint (sx, sy) per model, and a global size boost. */
const ISLAND_SIZE: Record<string, [number, number]> = {
  island_lighthouse: [1.75, 1.3], island_wooded: [1.3, 1.05], island_rock: [0.8, 0.65],
};
const ISLAND_SCALE = 1.2;
const BUOYS: [number, number][] = [[-6.0, 4.6], [6.1, -1.4], [3.2, 6.1], [-2.6, -6.2], [5.9, 4.2], [-6.1, -4.1], [1.5, -6.0]];

/** Destroyer model dimensions in cells (bow at +X), before per-ship scaling. */
const DESTROYER = { halfLength: 2.1, halfBeam: 0.29 };
const SUB = {
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

  // Islands (static). Waterline radii come from the island kit's sx/sy (Blender
  // Y becomes three.js -Z, which an ellipse doesn't care about).
  for (const isl of ISLANDS) {
    const m = await loadModel(isl.model);
    const scale = isl.scale * ISLAND_SCALE;
    m.position.set(isl.x, 0, isl.z);
    m.rotation.y = isl.yaw;
    m.scale.setScalar(scale);
    root.add(m);
    const [sx, sy] = ISLAND_SIZE[isl.model];
    islands.push({ x: isl.x, z: isl.z, rx: sx * 1.04 * scale, rz: sy * 1.06 * scale, yaw: isl.yaw });
  }

  for (const [i, [x, z]] of BUOYS.entries()) {
    const b = await loadModel('buoy');
    b.scale.setScalar(1.15);
    root.add(b);
    floaters.push({ obj: b, x, z, yaw: i * 1.7 });
  }

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
  for (const cell of target.cells) {
    board.setCell(cell.x + board.size / 2 - 0.5, cell.z + board.size / 2 - 0.5, CELL.target);
  }

  const sign = createWordSign(SHIPS[0].word);
  sign.place(target.cells, 1.25);
  sign.setRevealed([...SHIPS[0].revealed].map((ch) => ch !== '_'));
  root.add(sign.group);

  // The ship being sunk: the explosion, then the hull breaks in two and goes down.
  const sunk = await placeShip(SUNK);
  const wreck = createWreck(await loadModel('destroyer_wreck'), 5);
  sunk.carrier.add(wreck.group);
  wreck.loose.position.set(sunk.mid.x, 0, sunk.mid.z);
  wreck.loose.rotation.y = sunk.floater.yaw;
  wreck.loose.scale.setScalar(sunk.scale);
  root.add(wreck.loose);
  for (const cell of sunk.cells) board.setCell(cell.x + board.size / 2 - 0.5, cell.z + board.size / 2 - 0.5, CELL.sunk);
  const boom = createExplosion(7);
  boom.group.position.set(sunk.mid.x + 0.3, 0.15, sunk.mid.z);
  root.add(boom.group);
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
  function update(t: number, dt: number, camera: Camera) {
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
    wreck.update(wreckAge);
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
