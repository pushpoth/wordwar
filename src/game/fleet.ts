import { Group, type Object3D, type Vector3 } from 'three/webgpu';
import type { Unit } from '../engine/types';
import { loadModel } from '../render/assets';
import type { Board } from '../render/board';
import { createExplosion } from '../render/fx/explosion';
import type { HullFootprint } from '../render/hulls';
import { createWreck } from '../render/wreck';
import { footprint, ride, type Floater } from '../scene/buoyancy';
import { DESTROYER } from '../scene/diorama';
import { shipClassFor } from '../config/ships';

const RISE_SECONDS = 1.1;
const SINK_SECONDS = 12;
const BREAK_AFTER = 0.1;

type Ship = {
  unit: Unit;
  carrier: Group;
  model: Object3D;
  floater: Floater;
  cells: Vector3[];
  mid: Vector3;
  scale: number;
  spawnedAt: number;
  killedAt?: number;
  wreck?: ReturnType<typeof createWreck>;
  boom?: ReturnType<typeof createExplosion>;
};

/**
 * Enemy ships on the water: spawned when the radar first finds them (they rise
 * out of the deep), ridden on the swell, and broken up and sunk when killed.
 * Explosions come from a small pre-built pool so the first kill doesn't stall
 * on shader compilation.
 */
export function createFleet(root: Group, board: Board) {
  const ships = new Map<string, Ship>();
  const pool = [createExplosion(7), createExplosion(13)];
  for (const b of pool) {
    b.age.value = 99;
    root.add(b.group, b.flash);
  }
  const busy = new Set<ReturnType<typeof createExplosion>>();

  function cellsOf(unit: Unit) {
    return unit.coords.map((c) => board.cellCenter(c.x, c.y));
  }

  async function spawn(unit: Unit, t: number) {
    if (ships.has(unit.id)) return;
    const cells = cellsOf(unit);
    const first = cells[0];
    const last = cells[cells.length - 1];
    const mid = first.clone().add(last).multiplyScalar(0.5);
    const span = first.distanceTo(last) + 0.95;
    const scale = span / (DESTROYER.halfLength * 2);
    ships.set(unit.id, { unit } as Ship); // reserve the id while the model loads
    const cls = shipClassFor(unit.length);
    const model = await loadModel(cls.model);
    // The floater carries a container so the wreck can replace the hull in place.
    const carrier = new Group();
    carrier.add(model);
    carrier.scale.setScalar(scale);
    root.add(carrier);
    const floater: Floater = {
      obj: carrier, x: mid.x, z: mid.z, yaw: Math.atan2(-(last.z - first.z), last.x - first.x),
      hull: { halfLength: DESTROYER.halfLength * scale, halfBeam: DESTROYER.halfBeam * scale },
      lift: -0.6,
    };
    ships.set(unit.id, { unit, carrier, model, floater, cells, mid, scale, spawnedAt: t });
  }

  async function kill(unitId: string, t: number) {
    const ship = ships.get(unitId);
    if (!ship?.carrier || ship.killedAt !== undefined) return;
    ship.killedAt = t;
    const boom = pool.find((b) => !busy.has(b)) ?? pool[0];
    busy.add(boom);
    boom.group.position.set(ship.mid.x, 0.15, ship.mid.z);
    ship.boom = boom;
    board.uniforms.blastCenter.value.set(ship.mid.x, ship.mid.z);
    board.uniforms.blastAge.value = 0;
    const wreck = createWreck(await loadModel(shipClassFor(ship.unit.length).wreck), unitId.length * 7 + Math.floor(t));
    wreck.update(-1);
    ship.carrier.add(wreck.group);
    wreck.loose.position.set(ship.mid.x, 0, ship.mid.z);
    wreck.loose.rotation.y = ship.floater.yaw;
    wreck.loose.scale.setScalar(ship.scale);
    root.add(wreck.loose);
    ship.wreck = wreck;
  }

  /** Pose every ship for time t; returns the hull footprints for the water. */
  function update(t: number, dt: number) {
    const prints: HullFootprint[] = [];
    for (const [id, s] of ships) {
      if (!s.carrier) continue;
      const rise = Math.min(1, (t - s.spawnedAt) / RISE_SECONDS);
      let lift = -0.6 * (1 - rise * rise * (3 - 2 * rise));
      if (s.killedAt !== undefined) {
        const age = t - s.killedAt;
        if (s.boom) s.boom.age.value = age;
        if (s.boom && age > 6) {
          s.boom.age.value = 99;
          busy.delete(s.boom);
          s.boom = undefined;
        }
        const wreckAge = age - BREAK_AFTER;
        s.model.visible = wreckAge < 0;
        if (s.wreck) {
          s.wreck.update(wreckAge);
          lift = wreckAge < 0 ? lift : -s.wreck.sinkDepth(wreckAge);
          s.floater.list = wreckAge < 0 ? undefined : s.wreck.list(wreckAge);
        }
        if (age > SINK_SECONDS) {
          root.remove(s.carrier);
          if (s.wreck) root.remove(s.wreck.loose);
          ships.delete(id);
          continue;
        }
      }
      s.floater.lift = lift;
      ride(s.floater, t, dt);
      const p = footprint(s.floater);
      if (p && (s.killedAt === undefined || t - s.killedAt < 8)) prints.push(p);
    }
    for (const b of pool) b.update();
    const ages = pool.map((b) => b.age.value).filter((a) => a < 99);
    if (ages.length) board.uniforms.blastAge.value = Math.min(...ages);
    return prints;
  }

  function clear() {
    for (const s of ships.values()) {
      if (s.carrier) root.remove(s.carrier);
      if (s.wreck) root.remove(s.wreck.loose);
    }
    ships.clear();
    for (const b of pool) b.age.value = 99;
    busy.clear();
  }

  /**
   * The live ship under a point on the water (world x, z), if any. The hull
   * box is padded so a fingertip can hit a ship; the nearest centre wins.
   */
  function pick(x: number, z: number, pad = 0.55): string | null {
    let best: string | null = null;
    let bestD = Infinity;
    for (const [id, ship] of ships) {
      const f = ship.floater;
      if (!f?.hull || ship.killedAt !== undefined) continue;
      const dx = x - f.x;
      const dz = z - f.z;
      const along = dx * Math.cos(f.yaw) - dz * Math.sin(f.yaw);
      const across = dx * Math.sin(f.yaw) + dz * Math.cos(f.yaw);
      if (Math.abs(along) > f.hull.halfLength + pad || Math.abs(across) > f.hull.halfBeam + pad) continue;
      const d = Math.hypot(dx, dz);
      if (d < bestD) { bestD = d; best = id; }
    }
    return best;
  }

  return {
    spawn, kill, update, clear, pick,
    /** Make the pooled explosions visible (at a live age) for shader warm-up. */
    warmUp: () => {
      for (const b of pool) {
        b.age.value = 0.5;
        b.update();
        b.group.position.y = -40;
      }
      return () => {
        for (const b of pool) {
          b.age.value = 99;
          b.update();
        }
      };
    },
    has: (id: string) => ships.has(id),
    cells: (id: string) => ships.get(id)?.cells,
    mid: (id: string) => ships.get(id)?.mid,
    /** Shake a ship on a torpedo hit. */
    jolt: (id: string, amount = 0.08) => {
      const s = ships.get(id);
      if (s?.floater) s.carrier.position.y -= amount;
    },
  };
}

export type Fleet = ReturnType<typeof createFleet>;
