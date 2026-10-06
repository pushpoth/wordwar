import { Group, Vector3, type Object3D } from 'three/webgpu';

/** Small seeded PRNG so every wreck breaks up the same way for the same seed. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Debris = {
  obj: Object3D;
  p0: Vector3;
  v: Vector3;
  spin: Vector3;
  /** Time the piece hits the water, solved once from its arc. */
  land: number;
};

const GRAVITY = -3.4;
const FOLD_MAX = 0.42; // radians each half tips as the back breaks
const SINK_DEPTH = 1.1;

/**
 * A ship breaking up, built from a `*_wreck` model whose children are `bow`,
 * `stern` (both hinged at the keel on the break line) and `debris_*` pieces.
 * Only created when a ship is destroyed, so intact ships cost nothing extra.
 * Everything is a pure function of `age`, so pinned-time shots are exact.
 */
export function createWreck(model: Object3D, seed = 1) {
  const group = new Group();
  group.name = 'wreck';
  group.add(model);
  const rand = mulberry32(seed);
  const bow = model.getObjectByName('bow');
  const stern = model.getObjectByName('stern');
  const debris: Debris[] = [];
  // Loose pieces fly free of the hull's motion, so they live in their own group
  // that the caller places at the ship's spot without riding the swell.
  const loose = new Group();
  loose.name = 'wreck-debris';

  const pieces: Object3D[] = [];
  model.traverse((o) => { if (o.name.startsWith('debris_')) pieces.push(o); });
  for (const o of pieces) {
    loose.add(o);
    const p0 = o.position.clone();
    const side = p0.z === 0 ? (rand() < 0.5 ? -1 : 1) : Math.sign(p0.z);
    const v = new Vector3((rand() - 0.5) * 1.6, 1.4 + rand() * 1.8, side * (0.5 + rand() * 1.1));
    const spin = new Vector3((rand() - 0.5) * 9, (rand() - 0.5) * 6, (rand() - 0.5) * 9);
    // Solve p0.y + v.y·t + ½g·t² = 0 for the splashdown time.
    const land = (-v.y - Math.sqrt(v.y * v.y - 2 * GRAVITY * p0.y)) / GRAVITY;
    debris.push({ obj: o, p0, v, spin, land });
  }

  /** How far the hull has settled, 0 → 1 over the sinking. */
  const settle = (age: number) => {
    const u = Math.min(1, Math.max(0, (age - 0.8) / 9));
    return u * u * (3 - 2 * u);
  };

  function update(age: number) {
    group.visible = loose.visible = age >= 0;
    if (age < 0) return;
    const fold = FOLD_MAX * (1 - Math.exp(-age * 0.55));
    if (bow) bow.rotation.z = fold;
    if (stern) stern.rotation.z = -fold * 0.8;

    for (const d of debris) {
      const a = Math.min(age, d.land);
      d.obj.position.set(d.p0.x + d.v.x * a, d.p0.y + d.v.y * a + 0.5 * GRAVITY * a * a, d.p0.z + d.v.z * a);
      d.obj.rotation.set(d.spin.x * a, d.spin.y * a, d.spin.z * a);
      if (age > d.land) {
        // Afloat for a moment, then gone.
        const after = age - d.land;
        d.obj.position.y = -0.02 - Math.max(0, after - 1.2) * 0.12;
        d.obj.visible = after < 6;
      } else {
        d.obj.visible = true;
      }
    }
  }

  return {
    group,
    loose,
    update,
    /** Extra depth for the floater carrying the halves. */
    sinkDepth: (age: number) => settle(age) * SINK_DEPTH,
    /** Permanent list as the hull floods. */
    list: (age: number) => ({ roll: settle(age) * 0.22, pitch: -settle(age) * 0.06 }),
  };
}
