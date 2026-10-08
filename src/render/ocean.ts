import { Mesh, MeshStandardNodeMaterial, PlaneGeometry, Vector4, type Node as TslNode, type Texture, type Vector3 } from 'three/webgpu';
import {
  cameraPosition, clamp, cos, dot, float, max, mix, normalize, output, pmremTexture,
  positionGeometry, positionWorld, pow, sin, smoothstep, texture, transformNormalToView, uniform,
  uniformArray, vec2, vec3, vec4, vertexStage,
} from 'three/tsl';
import { noiseTexture } from './util/noise-texture';
import { tune } from '../config/tunables';
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


/** The detailed sea's half-width, and how far the open sea beyond it reaches (cells). */
const NEAR_SEA = 40;
const FAR_SEA = 700;

/**
 * The sea's grid: the middle 86% of the vertices cover the detailed sea at an
 * even spacing; the rest stretch, ever wider, out to the far field so the
 * water meets the sky at the horizon from any height.
 */
function seaGrid(segments: number) {
  const geo = new PlaneGeometry(2, 2, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const k = 0.86;
  const warp = (v: number) => {
    const a = Math.abs(v);
    const r = a <= k ? (a / k) * NEAR_SEA : NEAR_SEA + ((a - k) / (1 - k)) ** 2.6 * (FAR_SEA - NEAR_SEA);
    return Math.sign(v) * r;
  };
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, warp(pos.getX(i)), 0, warp(pos.getZ(i)));
  geo.computeBoundingSphere();
  return geo;
}

export function createOcean(sunDir: Vector3, opts: { board?: Board; hulls?: Hulls; env?: Texture } = {}, segments = tune.get('quality.oceanSegments')) {
  const { board, hulls, env } = opts;
  const geo = seaGrid(segments);

  // Islands as ellipses: (x, z, radius x, radius z) plus heading (cos, sin).
  const islands = uniformArray(Array.from({ length: MAX_ISLANDS }, () => new Vector4(0, 0, -1, -1)), 'vec4');
  const islandYaw = uniformArray(Array.from({ length: MAX_ISLANDS }, () => new Vector4(1, 0, 0, 0)), 'vec4');
  const sun = uniform(sunDir.clone().normalize());
  const ripple = uniform(tune.get('sea.ripple'));
  const sea = uniform(SEA.state);

  const m = new MeshStandardNodeMaterial({ roughness: OCEAN.roughness, metalness: 0 });

  const base = positionGeometry.xz;
  // One tiling noise texture replaces per-pixel procedural noise (see noise-texture.ts).
  const noise = noiseTexture();
  const tex = (uv: Node2) => texture(noise, uv);

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
    return d.add(tex(p.mul(0.045)).a.sub(0.5).mul(0.44));
  };

  // Swash: every few seconds the water surges up the beach and drains back.
  const swashAt = (d: Node) => {
    const surge = sin(time.mul(0.85).sub(d.mul(3.0))).mul(0.5).add(0.5);
    return pow(surge, 2).mul(smoothstep(0.55, -0.15, d)).mul(0.075);
  };

  // Vertex: displace, plus the swash running up the beaches. Shore distance and
  // hull calming are smooth over a vertex spacing, so they're computed per
  // vertex and interpolated rather than per pixel.
  const calmV: Node = hulls ? hulls.calm(base) : float(0);
  const shoreV = shoreAt(base);
  // Out past the detailed sea the vertices are too far apart to carry waves: the swell fades flat.
  const swell = smoothstep(NEAR_SEA - 2, NEAR_SEA * 0.7, base.length());
  m.positionNode = positionGeometry.add(gerstner(base, calmV, sea).disp.mul(swell)).add(vec3(0, swashAt(shoreV), 0));
  const calm = vertexStage(calmV) as unknown as Node;
  const shore = vertexStage(shoreV) as unknown as Node;

  // Fragment: analytic swell normal plus two scrolling layers of ripple from the noise texture.
  const g = gerstner(base, calm, sea);
  const r1 = tex(base.mul(0.11).add(vec2(time.mul(0.009), time.mul(0.006)))).rg.sub(0.5).mul(2);
  const r2 = tex(base.mul(0.29).sub(vec2(time.mul(0.013), time.mul(-0.008)))).gr.sub(0.5).mul(2);
  // Fade fine ripples with distance so they don't alias into a visible grid.
  const camDist = cameraPosition.sub(positionWorld).length();
  const near = smoothstep(55, 18, camDist);
  const rip = r1.mul(0.65).add(r2.mul(near.mul(0.35))).mul(ripple).mul(float(1).sub(calm.mul(0.5)));
  const n = normalize(mix(vec3(0, 1, 0), g.normal, smoothstep(NEAR_SEA * 2.5, NEAR_SEA, base.length())).add(vec3(rip.x, 0, rip.y)));
  m.normalNode = transformNormalToView(n);

  // Colour: deep → mid by swell height, → shallow near shore.
  const deep = vec3(...color(OCEAN.deep));
  const mid = vec3(...color(OCEAN.mid));
  const shallow = vec3(...color(OCEAN.shallow));
  const crest = smoothstep(-0.06, 0.08, g.height);
  // Large, slow colour variation (wind patches, depth changes) breaks up the
  // repeating interference pattern of the six swell trains.
  const macro = tex(base.mul(0.011).add(time.mul(0.0006))).a;
  const patch = tex(base.mul(0.03).add(vec2(0.37, time.mul(0.001)))).a;
  const crestMix = crest.mul(mix(float(0.25), float(0.6), patch)).add(macro.mul(0.3).add(0.1));
  let water = mix(deep, mid, crestMix);
  const shallowAmt = smoothstep(0.9, 0.0, shore.add(tex(base.mul(0.05).add(0.5)).b.sub(0.5).mul(0.7))).mul(0.8);
  water = mix(water, shallow, shallowAmt);

  // Shoreline foam: animated bands broken up by noise.
  const foamNoise = tex(base.mul(0.2).add(vec2(time.mul(0.012), 0))).b;
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

  // Far off, the water takes on the sky just above the horizon behind it (from the sky's
  // reflection map), so the open sea meets the sky without a seam from any height.
  const haze = env ? pmremTexture(env, normalize(positionWorld.sub(cameraPosition).mul(vec3(1, 0, 1)).add(vec3(0, 0.03, 0))), float(0)) : null;
  if (haze) {
    const far = smoothstep(70, 640, positionWorld.sub(cameraPosition).xz.length());
    m.outputNode = vec4(mix(output.rgb, haze.rgb, far), output.a);
  }

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

  tune.on('sea.ripple', (v) => (ripple.value = v as number));

  /** The sky's reflection map was re-rendered (the sun moved). */
  function setEnv(tex: Texture) {
    if (haze) (haze as unknown as { value: Texture }).value = tex;
  }

  return { mesh, setIslands, update, setEnv, uniforms: { sun, ripple, sea } };
}

function color(hex: number): [number, number, number] {
  // sRGB hex → linear, so colours read the same as the art-direction swatches.
  const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return [toLin(((hex >> 16) & 255) / 255), toLin(((hex >> 8) & 255) / 255), toLin((hex & 255) / 255)];
}
