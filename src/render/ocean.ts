import { Mesh, MeshStandardNodeMaterial, PlaneGeometry, Vector4, type Node as TslNode, type Vector3 } from 'three/webgpu';
import {
  cameraPosition, clamp, cos, dot, float, max, mix, mx_noise_float, mx_noise_vec3, normalize,
  positionGeometry, positionWorld, pow, sin, smoothstep, transformNormalToView, uniform,
  uniformArray, vec2, vec3,
} from 'three/tsl';
import type { Board } from './board';
import type { Hulls } from './hulls';
import { HULL_CALMING, SEA, WAVES } from './waves';
import { simTime as time } from './clock';

type Node = TslNode<'float'>;
type Node2 = TslNode<'vec2'>;
type Node3 = TslNode<'vec3'>;

export { waveOffset } from './waves';

export const MAX_ISLANDS = 8;

/** An island's waterline as an ellipse in world space (radii along its own X and Z). */
export type IslandShore = { x: number; z: number; rx: number; rz: number; yaw: number };

export const OCEAN = {
  deep: 0x0a3550,
  mid: 0x125d7d,
  shallow: 0x2a9c9e,
  foam: 0xf2f6f2,
  roughness: 0.11,
  ripple: 0.16,
};

/**
 * Sum of Gerstner waves at base position p: displacement plus surface tangents.
 * `calm` (0–1) flattens the short waves under ships; `sea` scales steepness.
 */
function gerstner(p: Node2, calm: Node, sea: Node) {
  let disp: Node3 = vec3(0, 0, 0);
  let tangent: Node3 = vec3(1, 0, 0);
  let binormal: Node3 = vec3(0, 0, 1);
  let height: Node = float(0);
  WAVES.forEach((w, i) => {
    const len = Math.hypot(w.dir[0], w.dir[1]);
    const dx = w.dir[0] / len;
    const dz = w.dir[1] / len;
    const k = (2 * Math.PI) / w.length;
    const st = sea.mul(w.steep).mul(float(1).sub(calm.mul(HULL_CALMING[i])));
    const a = st.div(k);
    const f = dot(p, vec2(dx, dz)).mul(k).sub(time.mul(w.speed * k));
    const s = sin(f);
    const c = cos(f);
    disp = disp.add(vec3(c.mul(a).mul(dx), s.mul(a), c.mul(a).mul(dz)));
    height = height.add(s.mul(a));
    tangent = tangent.add(vec3(s.mul(st).mul(-dx * dx), c.mul(st).mul(dx), s.mul(st).mul(-dx * dz)));
    binormal = binormal.add(vec3(s.mul(st).mul(-dx * dz), c.mul(st).mul(dz), s.mul(st).mul(-dz * dz)));
  });
  return { disp, height, normal: normalize(binormal.cross(tangent)) };
}


export function createOcean(sunDir: Vector3, opts: { board?: Board; hulls?: Hulls } = {}, extent = 140, segments = 360) {
  const { board, hulls } = opts;
  const geo = new PlaneGeometry(extent, extent, segments, segments);
  geo.rotateX(-Math.PI / 2);

  // Islands as ellipses: (x, z, radius x, radius z) plus heading (cos, sin).
  const islands = uniformArray(Array.from({ length: MAX_ISLANDS }, () => new Vector4(0, 0, -1, -1)), 'vec4');
  const islandYaw = uniformArray(Array.from({ length: MAX_ISLANDS }, () => new Vector4(1, 0, 0, 0)), 'vec4');
  const sun = uniform(sunDir.clone().normalize());
  const ripple = uniform(OCEAN.ripple);
  const sea = uniform(SEA.state);

  const m = new MeshStandardNodeMaterial({ roughness: OCEAN.roughness, metalness: 0 });

  const base = positionGeometry.xz;

  // Distance to the nearest shoreline: each island is an ellipse, its edge
  // warped by noise so the surf line isn't a perfect oval.
  const shoreAt = (p: Node2) => {
    let d: Node = float(99);
    for (let i = 0; i < MAX_ISLANDS; i++) {
      const isl = islands.element(i) as unknown as TslNode<'vec4'>;
      const rot = islandYaw.element(i) as unknown as TslNode<'vec4'>;
      const o = p.sub(isl.xy);
      const lx = o.dot(vec2(rot.x, rot.y.negate()));
      const lz = o.dot(vec2(rot.y, rot.x));
      const e = vec2(lx.div(isl.z), lz.div(isl.w)).length().sub(1).mul(isl.z.min(isl.w));
      d = mix(d, d.min(e), isl.z.greaterThan(0).select(float(1), float(0)));
    }
    return d.add(mx_noise_float(vec3(p.mul(1.6), 3.1)).mul(0.22));
  };
  const shore = shoreAt(base);

  // Swash: every few seconds the water surges up the beach and drains back.
  const swashAt = (d: Node) => {
    const surge = sin(time.mul(0.85).sub(d.mul(3.0))).mul(0.5).add(0.5);
    return pow(surge, 2).mul(smoothstep(0.55, -0.15, d)).mul(0.075);
  };

  // Vertex: displace, plus the swash running up the beaches.
  const calmV: Node = hulls ? hulls.calm(base) : float(0);
  m.positionNode = positionGeometry.add(gerstner(base, calmV, sea).disp).add(vec3(0, swashAt(shoreAt(base)), 0));

  // Fragment: analytic swell normal plus two scrolling octaves of ripple noise.
  const calm: Node = hulls ? hulls.calm(base) : float(0);
  const g = gerstner(base, calm, sea);
  const r1 = mx_noise_vec3(vec3(base.mul(2.6).add(vec2(time.mul(0.21), time.mul(0.13))), time.mul(0.25)));
  const r2 = mx_noise_vec3(vec3(base.mul(7.5).sub(vec2(time.mul(0.33), time.mul(-0.18))), time.mul(0.4)));
  const rip = r1.xz.mul(0.65).add(r2.xz.mul(0.35)).mul(ripple).mul(float(1).sub(calm.mul(0.5)));
  const n = normalize(g.normal.add(vec3(rip.x, 0, rip.y)));
  m.normalNode = transformNormalToView(n);

  // Colour: deep → mid by swell height, → shallow near shore.
  const deep = vec3(...color(OCEAN.deep));
  const mid = vec3(...color(OCEAN.mid));
  const shallow = vec3(...color(OCEAN.shallow));
  const crest = smoothstep(-0.06, 0.08, g.height);
  let water = mix(deep, mid, crest.mul(0.55).add(0.25));
  const shallowAmt = smoothstep(0.9, 0.0, shore.add(mx_noise_float(vec3(base.mul(1.3), 0)).mul(0.35))).mul(0.8);
  water = mix(water, shallow, shallowAmt);

  // Shoreline foam: animated bands broken up by noise.
  const foamNoise = mx_noise_float(vec3(base.mul(5.0), time.mul(0.3))).mul(0.5).add(0.5);
  // Breakers roll in toward the shore (phase moves to smaller distances).
  const bands = sin(shore.mul(22).add(time.mul(2.4))).mul(0.5).add(0.5);
  const surge = sin(time.mul(0.85).sub(shore.mul(3.0))).mul(0.5).add(0.5);
  const edgeFoam = smoothstep(0.22, -0.05, shore).mul(foamNoise.mul(0.6).add(0.5)).mul(surge.mul(0.5).add(0.6));
  const bandFoam = smoothstep(0.6, 0.05, shore).mul(pow(bands, 6)).mul(smoothstep(0.4, 0.75, foamNoise)).mul(0.75);
  const crestFoam = smoothstep(0.09, 0.12, g.height).mul(smoothstep(0.8, 0.95, foamNoise)).mul(0.25);
  const shipFoam: Node = hulls ? hulls.foam(base) : float(0);
  const foam = clamp(max(max(edgeFoam, shipFoam), max(bandFoam, crestFoam)), 0, 1);
  const surface = mix(water, vec3(...color(OCEAN.foam)), foam);
  const ov = board?.overlay(base);
  m.colorNode = ov ? mix(surface, ov.tintColor, ov.tint) : surface;
  m.roughnessNode = mix(float(OCEAN.roughness), float(0.65), foam);

  // Fake subsurface glow where waves face away from the sun toward the camera.
  const view = normalize(cameraPosition.sub(positionWorld));
  const back = pow(clamp(dot(view, sun.negate().mul(vec3(1, 0, 1)).normalize()), 0, 1), 3);
  const glow = shallow.mul(back.mul(crest).mul(0.12));
  m.emissiveNode = ov ? glow.add(ov.emissive) : glow;

  const mesh = new Mesh(geo, m);
  mesh.receiveShadow = true;
  mesh.name = 'ocean';

  function setIslands(list: IslandShore[]) {
    const arr = islands.array as Vector4[];
    const yaw = islandYaw.array as Vector4[];
    for (let i = 0; i < MAX_ISLANDS; i++) {
      const isl = list[i];
      arr[i].set(isl?.x ?? 0, isl?.z ?? 0, isl?.rx ?? -1, isl?.rz ?? -1);
      yaw[i].set(Math.cos(isl?.yaw ?? 0), Math.sin(isl?.yaw ?? 0), 0, 0);
    }
  }

  /** Keep the shader's sea state in step with `SEA.state`. */
  function update() {
    sea.value = SEA.state;
  }

  return { mesh, setIslands, update, uniforms: { sun, ripple, sea } };
}

function color(hex: number): [number, number, number] {
  // sRGB hex → linear, so colours read the same as the art-direction swatches.
  const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return [toLin(((hex >> 16) & 255) / 255), toLin(((hex >> 8) & 255) / 255), toLin((hex & 255) / 255)];
}
