import { Vector4, type Node as TslNode } from 'three/webgpu';
import { abs, exp, float, max, sin, smoothstep, texture, uniformArray, vec2 } from 'three/tsl';
import { noiseTexture } from './util/noise-texture';
import { simTime as time } from './clock';

import { MAX_HULLS } from '../config/limits';
export { MAX_HULLS };

/** A ship's footprint on the water: centre, heading (radians, 0 = +X), size and speed. */
export type HullFootprint = { x: number; z: number; yaw: number; halfLength: number; halfBeam: number; speed: number };

type N1 = TslNode<'float'>;
type N2 = TslNode<'vec2'>;

/**
 * Where ships meet the water, in the ocean shader: a calming mask that flattens
 * short waves under each hull, foam where the hull meets the water, and a
 * bow wave, Kelvin wake arms and churned stern trail for ships under way.
 */
export function createHulls() {
  const pose = uniformArray(Array.from({ length: MAX_HULLS }, () => new Vector4()), 'vec4');
  const size = uniformArray(Array.from({ length: MAX_HULLS }, () => new Vector4()), 'vec4');

  function set(list: HullFootprint[]) {
    const p = pose.array as Vector4[];
    const s = size.array as Vector4[];
    for (let i = 0; i < MAX_HULLS; i++) {
      const h = list[i];
      if (!h) { s[i].set(0, 0, 0, 0); continue; }
      // Heading convention matches the models: bow at +X, yaw about +Y.
      p[i].set(h.x, h.z, Math.cos(h.yaw), -Math.sin(h.yaw));
      s[i].set(h.halfLength, h.halfBeam, h.speed, 1);
    }
  }

  /** Signed distance to each hull (capsule) in its own frame, plus local coords. */
  function frame(base: N2, i: number) {
    const p = pose.element(i) as unknown as TslNode<'vec4'>;
    const s = size.element(i) as unknown as TslNode<'vec4'>;
    const d = base.sub(p.xy);
    const u = d.dot(p.zw);
    const v = d.dot(vec2(p.w.negate(), p.z));
    const core = max(s.x.sub(s.y), 0);
    const sdf = vec2(max(abs(u).sub(core), 0), v).length().sub(s.y);
    return { u, v, sdf, halfLength: s.x, halfBeam: s.y, speed: s.z, active: s.w };
  }

  /** 1 under a hull, fading to 0 about half a cell away. */
  function calm(base: N2) {
    let c: N1 = float(0);
    for (let i = 0; i < MAX_HULLS; i++) {
      const h = frame(base, i);
      c = max(c, smoothstep(0.55, -0.05, h.sdf).mul(h.active));
    }
    return c;
  }

  /** Foam from hull contact and wakes, 0–1. */
  function foam(base: N2) {
    const churn = texture(noiseTexture(), base.mul(0.26).add(vec2(time.mul(0.036), 0))).b;
    const fine = texture(noiseTexture(), base.mul(0.55).sub(vec2(0, time.mul(0.06)))).r;
    let f: N1 = float(0);
    for (let i = 0; i < MAX_HULLS; i++) {
      const h = frame(base, i);
      const moving = smoothstep(0.0, 0.4, h.speed);
      // Water slapping the hull: a ragged ring that breathes with the swell.
      const slap = sin(time.mul(2.3).add(h.u.mul(5.5)).add(float(i * 1.9))).mul(0.25).add(0.75);
      const contact = smoothstep(0.09, 0.0, abs(h.sdf.sub(0.025))).mul(smoothstep(0.35, 0.75, churn)).mul(slap).mul(0.8);
      // Bow wave: piled-up foam around the forward third when under way.
      const bow = smoothstep(0.2, 0.0, h.sdf).mul(smoothstep(h.halfLength.mul(0.3), h.halfLength, h.u))
        .mul(moving).mul(fine.mul(0.5).add(0.6));
      // Behind the stern: Kelvin arms at ~19.5° and a churned centre trail.
      const behind = h.u.negate().sub(h.halfLength);
      // A short wake: the sub turns constantly, so long straight arms would lie.
      const aft = smoothstep(-0.1, 0.15, behind).mul(smoothstep(h.halfLength.mul(2.2), h.halfLength.mul(1.2), behind));
      const armDist = abs(abs(h.v).sub(behind.mul(0.36)).sub(h.halfBeam.mul(0.55)));
      const arms = smoothstep(behind.mul(0.03).add(0.05), 0.0, armDist).mul(exp(behind.mul(-0.85)))
        .mul(churn.mul(0.7).add(0.3));
      const trail = smoothstep(h.halfBeam.mul(behind.mul(0.12).add(1.1)), 0.0, abs(h.v))
        .mul(exp(behind.mul(-0.45))).mul(fine.mul(0.6).add(0.4));
      const wake = arms.mul(0.9).add(trail.mul(1.1)).mul(aft).mul(smoothstep(0.0, 0.25, h.speed).mul(0.7).add(h.speed.min(1)));
      f = max(f, max(contact, max(bow, wake)).mul(h.active));
    }
    return f.min(1);
  }

  return { set, calm, foam };
}

export type Hulls = ReturnType<typeof createHulls>;
