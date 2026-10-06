import { Mesh, MeshStandardNodeMaterial, PlaneGeometry, Vector4, type Node as TslNode, type Vector3 } from 'three/webgpu';
import {
  cameraPosition, clamp, cos, dot, float, max, mix, mx_noise_float, mx_noise_vec3, normalize,
  positionGeometry, positionWorld, pow, sin, smoothstep, transformNormalToView, uniform,
  uniformArray, vec2, vec3,
} from 'three/tsl';
import type { Board } from './board';
import { WAVES } from './waves';
import { simTime as time } from './clock';

type Node = TslNode<'float'>;
type Node2 = TslNode<'vec2'>;
type Node3 = TslNode<'vec3'>;

export { waveOffset } from './waves';



export const MAX_ISLANDS = 8;

export const OCEAN = {
  deep: 0x0a3550,
  mid: 0x125d7d,
  shallow: 0x2a9c9e,
  foam: 0xf2f6f2,
  roughness: 0.11,
  ripple: 0.16,
};

/** Sum of Gerstner waves at base position p: displacement plus surface tangents. */
function gerstner(p: Node2) {
  let disp: Node3 = vec3(0, 0, 0);
  let tangent: Node3 = vec3(1, 0, 0);
  let binormal: Node3 = vec3(0, 0, 1);
  let height: Node = float(0);
  for (const w of WAVES) {
    const len = Math.hypot(w.dir[0], w.dir[1]);
    const dx = w.dir[0] / len;
    const dz = w.dir[1] / len;
    const k = (2 * Math.PI) / w.length;
    const a = w.steep / k;
    const f = dot(p, vec2(dx, dz)).mul(k).sub(time.mul(w.speed * k));
    const s = sin(f);
    const c = cos(f);
    disp = disp.add(vec3(c.mul(dx * a), s.mul(a), c.mul(dz * a)));
    height = height.add(s.mul(a));
    tangent = tangent.add(vec3(s.mul(-dx * dx * w.steep), c.mul(dx * w.steep), s.mul(-dx * dz * w.steep)));
    binormal = binormal.add(vec3(s.mul(-dx * dz * w.steep), c.mul(dz * w.steep), s.mul(-dz * dz * w.steep)));
  }
  return { disp, height, normal: normalize(binormal.cross(tangent)) };
}


export function createOcean(sunDir: Vector3, board?: Board, extent = 140, segments = 360) {
  const geo = new PlaneGeometry(extent, extent, segments, segments);
  geo.rotateX(-Math.PI / 2);

  const islands = uniformArray(Array.from({ length: MAX_ISLANDS }, () => new Vector4(0, 0, -1, 0)), 'vec4');
  const sun = uniform(sunDir.clone().normalize());
  const ripple = uniform(OCEAN.ripple);

  const m = new MeshStandardNodeMaterial({ roughness: OCEAN.roughness, metalness: 0 });

  // Vertex: displace.
  const base = positionGeometry.xz;
  m.positionNode = positionGeometry.add(gerstner(base).disp);

  // Fragment: analytic swell normal plus two scrolling octaves of ripple noise.
  const g = gerstner(base);
  const r1 = mx_noise_vec3(vec3(base.mul(2.6).add(vec2(time.mul(0.21), time.mul(0.13))), time.mul(0.25)));
  const r2 = mx_noise_vec3(vec3(base.mul(7.5).sub(vec2(time.mul(0.33), time.mul(-0.18))), time.mul(0.4)));
  const rip = r1.xz.mul(0.65).add(r2.xz.mul(0.35)).mul(ripple);
  const n = normalize(g.normal.add(vec3(rip.x, 0, rip.y)));
  m.normalNode = transformNormalToView(n);

  // Distance to the nearest island shoreline (islands are circles: x, z, radius).
  let shore: Node = float(99);
  for (let i = 0; i < MAX_ISLANDS; i++) {
    const isl = islands.element(i) as unknown as TslNode<'vec4'>;
    const d = base.sub(isl.xy).length().sub(isl.z);
    shore = mix(shore, shore.min(d), isl.z.greaterThan(0).select(float(1), float(0)));
  }

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
  const bands = sin(shore.mul(26).sub(time.mul(2.2))).mul(0.5).add(0.5);
  const edgeFoam = smoothstep(0.32, 0.0, shore).mul(foamNoise.mul(0.6).add(0.55));
  const bandFoam = smoothstep(0.42, 0.1, shore).mul(pow(bands, 8)).mul(smoothstep(0.45, 0.8, foamNoise)).mul(0.7);
  const crestFoam = smoothstep(0.09, 0.12, g.height).mul(smoothstep(0.8, 0.95, foamNoise)).mul(0.25);
  const foam = clamp(max(edgeFoam, max(bandFoam, crestFoam)), 0, 1);
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

  function setIslands(list: { x: number; z: number; r: number }[]) {
    const arr = islands.array as Vector4[];
    for (let i = 0; i < MAX_ISLANDS; i++) {
      const isl = list[i];
      arr[i].set(isl?.x ?? 0, isl?.z ?? 0, isl?.r ?? -1, 0);
    }
  }

  return { mesh, setIslands, uniforms: { sun, ripple } };
}

function color(hex: number): [number, number, number] {
  // sRGB hex → linear, so colours read the same as the art-direction swatches.
  const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return [toLin(((hex >> 16) & 255) / 255), toLin(((hex >> 8) & 255) / 255), toLin((hex & 255) / 255)];
}
