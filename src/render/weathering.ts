import type { Node as TslNode } from 'three/webgpu';
import { float, mix, mx_fractal_noise_float, mx_noise_float, positionGeometry, smoothstep, vec3 } from 'three/tsl';

/**
 * Procedural wear for model surfaces, in object space so it travels with the
 * ship: blotchy grime, rust streaks running down from fittings, and a stained
 * band at the waterline. How much of each a surface gets comes from its
 * material name in the Blender scripts, carried per vertex (see assets.ts).
 */
export type Wear = [grime: number, rust: number, waterline: number];

const WEAR: Record<string, Wear> = {
  hull: [0.3, 0.55, 1],
  boot_top: [0.2, 0.3, 1],
  antifouling: [0.25, 0.15, 0.6],
  superstructure: [0.24, 0.4, 0],
  deck: [0.35, 0.2, 0],
  sub_hull: [0.28, 0.12, 1],
  sub_casing: [0.3, 0.1, 0],
  buoy_red: [0.3, 0.35, 1],
  buoy_white: [0.35, 0.4, 1],
  paint_white: [0.3, 0.2, 0],
  paint_red: [0.25, 0.1, 0],
};

export function wearFor(materialName: string): Wear {
  return WEAR[materialName] ?? [0, 0, 0];
}

const RUST = vec3(0.2, 0.075, 0.03);
const ALGAE = vec3(0.05, 0.07, 0.04);

/** Weathered colour and roughness from a base colour, roughness and wear (grime, rust, waterline). */
export function weathered(base: TslNode<'vec3'>, roughness: TslNode<'float'>, wear: TslNode<'vec3'>) {
  const p = positionGeometry;
  // Large soft blotches of dirt and fading.
  const grime = mx_fractal_noise_float(p.mul(3.2), 3, 2, 0.5).mul(0.5).add(0.5);
  let c = base.mul(mix(float(1).sub(wear.x), float(1.04), smoothstep(0.2, 0.8, grime)));
  // Rust streaks: noise stretched vertically.
  const streak = mx_noise_float(vec3(p.x.mul(34), p.y.mul(1.8), p.z.mul(34))).mul(0.5).add(0.5);
  const bleed = mx_noise_float(p.mul(9)).mul(0.5).add(0.5);
  const streaks = smoothstep(0.6, 0.86, streak).mul(smoothstep(0.35, 0.7, bleed));
  c = mix(c, RUST, streaks.mul(wear.y));
  // Waterline: a dark, slightly green tide band around y = 0.
  const band = smoothstep(0.07, 0.0, p.y.sub(0.015).abs());
  c = mix(c, ALGAE, band.mul(wear.z.mul(0.55)));
  const worn = wear.x.add(wear.y).greaterThan(0).select(float(1), float(0));
  const rough = roughness.add(grime.mul(0.18).add(streaks.mul(0.2)).mul(worn)).min(1);
  return { color: c, roughness: rough };
}
