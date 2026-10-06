import { Group, Vector3, type Camera, type Object3D, type Scene } from 'three/webgpu';
import { CELL, type Board } from '../render/board';
import { loadModel } from '../render/assets';
import { createExplosion } from '../render/fx/explosion';
import { createBoardLabels } from '../render/labels';
import { waveOffset } from '../render/ocean';
import { createWordSign } from '../render/word-sign';

/** Something that rides the swell at a fixed spot. */
type Floater = { obj: Object3D; x: number; z: number; yaw: number; lift: number; bob: number; roll?: number; pitch?: number };

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
  { model: 'island_lighthouse', x: -8.4, z: -1.2, yaw: 0.35, scale: 1.0 },
  { model: 'island_wooded', x: 8.3, z: -4.6, yaw: 2.1, scale: 0.95 },
  { model: 'island_rock', x: 7.6, z: 1.6, yaw: 0.8, scale: 1.0 },
  { model: 'island_wooded', x: 7.9, z: 7.6, yaw: -0.6, scale: 1.25 },
  { model: 'island_rock', x: -7.2, z: 7.4, yaw: 2.6, scale: 0.85 },
  { model: 'island_rock', x: -4.0, z: -8.4, yaw: 1.2, scale: 0.7 },
];
const BUOYS: [number, number][] = [[-6.0, 4.6], [6.1, -1.4], [3.2, 6.1], [-2.6, -6.2], [5.9, 4.2], [-6.1, -4.1], [1.5, -6.0]];

export async function buildDiorama(scene: Scene, board: Board) {
  const root = new Group();
  root.name = 'diorama';
  scene.add(root);
  const floaters: Floater[] = [];
  const islands: { x: number; z: number; r: number }[] = [];

  // Islands (static, ground the foam rings).
  const radius: Record<string, number> = { island_lighthouse: 1.65, island_wooded: 1.25, island_rock: 0.78 };
  for (const isl of ISLANDS) {
    const m = await loadModel(isl.model);
    m.position.set(isl.x, 0, isl.z);
    m.rotation.y = isl.yaw;
    m.scale.setScalar(isl.scale);
    root.add(m);
    islands.push({ x: isl.x, z: isl.z, r: radius[isl.model] * isl.scale });
  }

  for (const [i, [x, z]] of BUOYS.entries()) {
    const b = await loadModel('buoy');
    b.scale.setScalar(1.15);
    root.add(b);
    floaters.push({ obj: b, x, z, yaw: i * 1.7, lift: 0, bob: 1 });
  }

  // Cell states.
  for (const [c, r] of MISSES) board.setCell(c, r, CELL.miss);

  const cellsOf = (s: ShipSpec) =>
    [...s.word].map((_, i) => board.cellCenter(s.dir === 'h' ? s.col + i : s.col, s.dir === 'h' ? s.row : s.row + i));

  async function placeShip(s: ShipSpec, sunk = false) {
    const ship = await loadModel('destroyer');
    const cells = cellsOf(s);
    const mid = cells[0].clone().add(cells[cells.length - 1]).multiplyScalar(0.5);
    ship.scale.setScalar((s.word.length * 0.95) / 4.2);
    root.add(ship);
    floaters.push({
      obj: ship, x: mid.x, z: mid.z, yaw: s.dir === 'h' ? 0 : -Math.PI / 2, lift: sunk ? -0.1 : 0, bob: 0.45,
      roll: sunk ? 0.16 : 0, pitch: sunk ? -0.05 : 0,
    });
    return { ship, cells, mid };
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

  // The ship being sunk, with the explosion on it.
  const sunk = await placeShip(SUNK, true);
  for (const cell of sunk.cells) board.setCell(cell.x + board.size / 2 - 0.5, cell.z + board.size / 2 - 0.5, CELL.sunk);
  const boom = createExplosion(7);
  boom.group.position.set(sunk.mid.x + 0.3, 0.15, sunk.mid.z);
  root.add(boom.group);
  board.uniforms.blastCenter.value.set(boom.group.position.x, boom.group.position.z);

  // Player submarine, bottom-left of the board, with its sonar ring.
  const sub = await loadModel('submarine');
  sub.scale.setScalar(0.95);
  root.add(sub);
  const subPos = board.cellCenter(1, 8);
  floaters.push({ obj: sub, x: subPos.x, z: subPos.z + 0.2, yaw: 0.55, lift: -0.02, bob: 0.35 });
  board.uniforms.sonarCenter.value.set(subPos.x, subPos.z + 0.2);
  board.uniforms.sonarRadius.value = 2.1;

  const labels = createBoardLabels(board.size);
  root.add(labels.group);

  const BLAST_PERIOD = 4.5;
  const tmp = new Vector3();
  const probe = new Vector3();
  function update(t: number, camera: Camera) {
    for (const f of floaters) {
      waveOffset(f.x, f.z, t, tmp);
      f.obj.position.set(f.x + tmp.x * f.bob, f.lift + tmp.y * f.bob, f.z + tmp.z * f.bob);
      const sx = waveOffset(f.x + 0.3, f.z, t, probe).y - tmp.y;
      const sz = waveOffset(f.x, f.z + 0.3, t, probe).y - tmp.y;
      f.obj.rotation.set((f.roll ?? 0) + sz * 1.6 * f.bob, f.yaw, (f.pitch ?? 0) - sx * 1.6 * f.bob, 'YXZ');
    }
    sign.update(camera, t);
    labels.update(camera);
    const age = t % BLAST_PERIOD;
    boom.age.value = age;
    boom.update();
    board.uniforms.blastAge.value = age;
  }

  return { root, update, islands };
}
