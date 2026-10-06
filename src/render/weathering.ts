import type { MeshStandardNodeMaterial } from 'three/webgpu';
import { float, mix, mx_fractal_noise_float, mx_noise_float, positionGeometry, smoothstep, vec3 } from 'three/tsl';

/**
 * Procedural wear for model materials, in object space so it travels with the
 * ship: blotchy grime, rust streaks running down from fittings, and a stained
 * band at the waterline. Which treatment a material gets comes from its name
 * in the Blender scripts.
 */
type Wear = { grime: number; rust: number; waterline: number };

const WEAR: Record<string, Wear> = {
  hull: { grime: 0.3, rust: 0.55, waterline: 1 },
  boot_top: { grime: 0.2, rust: 0.3, waterline: 1 },
  antifouling: { grime: 0.25, rust: 0.15, waterline: 0.6 },
  superstructure: { grime: 0.24, rust: 0.4, waterline: 0 },
  deck: { grime: 0.35, rust: 0.2, waterline: 0 },
  sub_hull: { grime: 0.28, rust: 0.12, waterline: 1 },
  sub_casing: { grime: 0.3, rust: 0.1, waterline: 0 },
  buoy_red: { grime: 0.3, rust: 0.35, waterline: 1 },
  buoy_white: { grime: 0.35, rust: 0.4, waterline: 1 },
  paint_white: { grime: 0.3, rust: 0.2, waterline: 0 },
  paint_red: { grime: 0.25, rust: 0.1, waterline: 0 },
};

const RUST = vec3(0.2, 0.075, 0.03);
const ALGAE = vec3(0.05, 0.07, 0.04);

export function weather(m: MeshStandardNodeMaterial) {
  const w = WEAR[m.name];
  if (!w) return;
  const p = positionGeometry;
  const base = vec3(m.color.r, m.color.g, m.color.b);

  // Large soft blotches of dirt and fading.
  const grime = mx_fractal_noise_float(p.mul(3.2), 3, 2, 0.5).mul(0.5).add(0.5);
  let c = base.mul(mix(float(1 - w.grime), float(1.04), smoothstep(0.2, 0.8, grime)));

  // Rust streaks: noise stretched vertically, strongest just below deck level.
  const streak = mx_noise_float(vec3(p.x.mul(34), p.y.mul(1.8), p.z.mul(34))).mul(0.5).add(0.5);
  const bleed = mx_noise_float(p.mul(9)).mul(0.5).add(0.5);
  const streaks = smoothstep(0.6, 0.86, streak).mul(smoothstep(0.35, 0.7, bleed));
  c = mix(c, RUST, streaks.mul(w.rust));

  // Waterline: a dark, slightly green tide band around y = 0.
  if (w.waterline > 0) {
    const band = smoothstep(0.07, 0.0, p.y.sub(0.015).abs());
    c = mix(c, ALGAE, band.mul(0.55 * w.waterline));
  }

  m.colorNode = c;
  m.roughnessNode = float(m.roughness).add(grime.mul(0.18)).add(streaks.mul(0.2)).min(1);
}
