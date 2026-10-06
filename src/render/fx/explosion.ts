import {
  AdditiveBlending, BoxGeometry, Group, InstancedBufferAttribute, InstancedMesh, MeshStandardNodeMaterial,
  NormalBlending, PointLight, Sprite, SpriteNodeMaterial, Vector3, type Node as TslNode,
} from 'three/webgpu';
import {
  clamp, float, instancedBufferAttribute, max, mix, mx_noise_float, positionLocal, rotate, smoothstep,
  uniform, uv, vec2, vec3, vec4,
} from 'three/tsl';

type N1 = TslNode<'float'>;
type N3 = TslNode<'vec3'>;
type N4 = TslNode<'vec4'>;

/** Small seeded PRNG so every explosion layout is repeatable. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Emitter = {
  count: number;
  /** Returns launch velocity, and params: delay, life, size, seed. */
  spawn: (r: () => number) => { v: [number, number, number]; delay: number; life: number; size: number };
};

function attributes(e: Emitter, rand: () => number) {
  const vel = new Float32Array(e.count * 3);
  const par = new Float32Array(e.count * 4);
  for (let i = 0; i < e.count; i++) {
    const s = e.spawn(rand);
    vel.set(s.v, i * 3);
    par.set([s.delay, s.life, s.size, rand()], i * 4);
  }
  return {
    vel: instancedBufferAttribute(new InstancedBufferAttribute(vel, 3)) as unknown as N3,
    par: instancedBufferAttribute(new InstancedBufferAttribute(par, 4)) as unknown as N4,
  };
}

const unitDir = (r: () => number, upBias = 0) => {
  const u = r() * 2 - 1;
  const th = r() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  const v = [s * Math.cos(th), Math.abs(u) * (1 - upBias) + upBias, s * Math.sin(th)];
  return v as [number, number, number];
};

/**
 * Ship-kill explosion: fireball, ember sparks, a white water column, spinning
 * debris, a long smoke plume and an orange light flash. All motion is analytic
 * in `age`, evaluated on the GPU.
 */
export function createExplosion(seed = 1) {
  const group = new Group();
  group.name = 'explosion';
  const age = uniform(99);
  const rand = mulberry32(seed);
  const gravity = vec3(0, -3.2, 0);

  /** Per-particle local age, normalised life and visibility. */
  const life = (par: N4) => {
    const a = age.sub(par.x);
    const t = clamp(a.div(par.y), 0, 1);
    const alive = a.greaterThan(0).select(float(1), float(0)).mul(t.lessThan(1).select(float(1), float(0)));
    return { a, t, alive };
  };
  const gauss = () => uv().sub(0.5).length().mul(2).mul(-2.2).mul(uv().sub(0.5).length().mul(2)).exp().sub(0.11).max(0).div(0.89);
  const softDisc = (seedNode: N1, sharp = 1) => {
    const d = uv().sub(0.5).length().mul(2);
    const n = mx_noise_float(vec3(uv().mul(3.2), seedNode.mul(17))).mul(0.35);
    return smoothstep(1, float(0.35).div(sharp), d.add(n));
  };

  function sprites(e: Emitter, blend: 'add' | 'normal', build: (p: { a: N1; t: N1; alive: N1; vel: N3; par: N4 }) => {
    pos: N3; size: N1; color: N3; alpha: N1;
  }) {
    const { vel, par } = attributes(e, rand);
    const m = new SpriteNodeMaterial({ transparent: true, depthWrite: false });
    m.blending = blend === 'add' ? AdditiveBlending : NormalBlending;
    const l = life(par);
    const out = build({ ...l, vel, par });
    m.positionNode = out.pos;
    m.scaleNode = vec2(out.size.mul(l.alive));
    m.colorNode = vec4(out.color, 1);
    m.opacityNode = out.alpha.mul(l.alive);
    const s = new Sprite(m);
    s.count = e.count;
    s.frustumCulled = false;
    s.renderOrder = blend === 'add' ? 3 : 2;
    group.add(s);
    return s;
  }

  // Smoke plume: slow, rising, expanding, dark grey lit orange early on.
  sprites({
    count: 64,
    spawn: (r) => {
      const d = unitDir(r, 0.55);
      const sp = 0.3 + r() * 0.65;
      return { v: [d[0] * sp, 0.55 + r() * 0.75, d[2] * sp], delay: 0.1 + r() * 1.1, life: 2.8 + r() * 1.6, size: 0.5 + r() * 0.45 };
    },
  }, 'normal', ({ a, t, vel, par }) => {
    const drag = float(1).sub(a.mul(-0.6).exp()).div(0.6);
    // Starts above the deck so puffs never slice through the water plane.
    const pos = vel.mul(drag).add(vec3(0.25, 0.35, 0.1).mul(vec3(a.mul(a).mul(0.12), 1, a.mul(a).mul(0.12))));
    const size = par.z.mul(t.mul(1.6).add(0.55));
    const lit = smoothstep(0.35, 0.0, t);
    const color = mix(mix(vec3(0.06, 0.06, 0.065), vec3(0.16, 0.17, 0.19), t), vec3(0.7, 0.28, 0.08), lit.mul(0.7));
    // Thin out as each puff spreads, so the plume stays translucent.
    const alpha = smoothstep(0.0, 0.08, t).mul(smoothstep(1.0, 0.4, t)).mul(float(0.95).sub(t.mul(0.45)))
      .mul(softDisc(par.w)).mul(gauss().mul(0.6).add(0.4));
    return { pos, size, color, alpha };
  });

  // Water column: white spray thrown up and falling back.
  sprites({
    count: 140,
    spawn: (r) => {
      const d = unitDir(r, 0.9);
      const sp = 1.8 + r() * 2.4;
      return { v: [d[0] * sp * 0.25, d[1] * sp, d[2] * sp * 0.25], delay: 0.04 + r() * 0.14, life: 0.9 + r() * 0.6, size: 0.03 + r() * 0.06 };
    },
  }, 'normal', ({ a, t, vel, par }) => {
    const pos = vel.mul(a).add(gravity.mul(a.mul(a).mul(0.5)));
    const size = par.z.mul(t.mul(1.5).add(0.7));
    const color = vec3(0.86, 0.93, 0.97);
    const alpha = smoothstep(1.0, 0.5, t).mul(0.8).mul(gauss()).mul(pos.y.greaterThan(-0.05).select(float(1), float(0)));
    return { pos, size, color, alpha };
  });

  // Fireball: noisy heat ramp per puff — yellow-white core, orange body,
  // deep red rim and sooty edges. Normal blending keeps the colour saturated.
  sprites({
    count: 96,
    spawn: (r) => {
      const d = unitDir(r, 0.35);
      const second = r() < 0.3;
      const sp = (0.55 + r() * 1.5) * (second ? 0.7 : 1);
      return {
        v: [d[0] * sp, d[1] * sp * 0.9 + 0.4, d[2] * sp],
        delay: second ? 0.18 + r() * 0.25 : r() * 0.1, life: 0.8 + r() * 0.8, size: 0.3 + r() * 0.42,
      };
    },
  }, 'normal', ({ a, t, vel, par }) => {
    const drag = float(1).sub(a.mul(-2.4).exp()).div(2.4);
    const pos = vel.mul(drag).add(vec3(0, a.mul(a).mul(0.25), 0));
    const size = par.z.mul(smoothstep(0, 0.2, t).mul(1.4).add(0.45));
    const d = uv().sub(0.5).length().mul(2);
    const n = mx_noise_float(vec3(uv().mul(4.5), par.w.mul(31).add(a.mul(1.5))));
    const heat = clamp(float(1).sub(d.mul(1.15)).add(n.mul(0.55)).sub(t.mul(1.05)), 0, 1);
    const color = mix(
      mix(vec3(0.05, 0.035, 0.03), vec3(0.9, 0.12, 0.02), smoothstep(0.0, 0.25, heat)),
      mix(vec3(2.4, 0.75, 0.12), vec3(3.4, 2.6, 1.3), smoothstep(0.6, 0.95, heat)),
      smoothstep(0.2, 0.55, heat),
    );
    const alpha = smoothstep(0.02, 0.16, heat.add(float(0.12).mul(float(1).sub(t)))).mul(smoothstep(1.0, 0.7, t)).mul(smoothstep(1.0, 0.75, d));
    return { pos, size, color, alpha };
  });

  // Embers: fast, falling, tiny additive sparks.
  sprites({
    count: 150,
    spawn: (r) => {
      const d = unitDir(r, 0.3);
      const sp = 2.0 + r() * 3.8;
      return { v: [d[0] * sp, d[1] * sp, d[2] * sp], delay: r() * 0.1, life: 0.8 + r() * 0.9, size: 0.035 + r() * 0.04 };
    },
  }, 'add', ({ a, t, vel, par }) => {
    const drag = float(1).sub(a.mul(-1.2).exp()).div(1.2);
    const pos = vel.mul(drag).add(gravity.mul(a.mul(a).mul(0.35)));
    const color = mix(vec3(3.2, 2.2, 0.9), vec3(1.8, 0.45, 0.08), t);
    const alpha = smoothstep(1, 0.6, t).mul(softDisc(par.w, 2.5));
    return { pos, size: par.z, color, alpha };
  });

  // Debris: dark tumbling hull chunks on ballistic arcs.
  {
    const e: Emitter = {
      count: 34,
      spawn: (r) => {
        const d = unitDir(r, 0.45);
        const sp = 1.6 + r() * 2.4;
        return { v: [d[0] * sp, d[1] * sp, d[2] * sp], delay: r() * 0.05, life: 1.6 + r() * 0.8, size: 0.025 + r() * 0.05 };
      },
    };
    const { vel, par } = attributes(e, rand);
    const l = life(par);
    const m = new MeshStandardNodeMaterial({ color: 0x23272b, roughness: 0.8, metalness: 0.4 });
    const pos = vel.mul(l.a).add(gravity.mul(l.a.mul(l.a).mul(0.5)));
    const spin = vec3(par.w.mul(9), par.w.mul(13).add(2), par.w.mul(5)).mul(l.a);
    const local = rotate(positionLocal.mul(par.z.mul(l.alive)).mul(vec3(1, 0.6, 1.6)), spin);
    m.positionNode = local.add(pos).add(vec3(0, max(float(-0.3).sub(pos.y), 0), 0));
    m.emissiveNode = vec3(2.2, 0.6, 0.1).mul(smoothstep(0.35, 0, l.t));
    const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), m, e.count);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    group.add(mesh);
  }

  // The flash light lives outside the group and is never hidden: changing the
  // number of lights in the scene would recompile every lit shader mid-game.
  const flash = new PointLight(0xff8a3a, 0, 9, 1.6);
  flash.position.set(0, 0.6, 0);

  function update() {
    const a = age.value;
    // Idle explosions draw nothing: about 600 sprites saved per explosion.
    group.visible = a >= 0 && a < 7;
    flash.position.set(group.position.x, group.position.y + 0.6, group.position.z);
    flash.intensity = a < 0 ? 0 : 22 * Math.exp(-a * 3.2) + 4 * Math.exp(-a * 0.6) * (0.8 + 0.2 * Math.sin(a * 31));
  }

  return { group, flash, age, update, origin: new Vector3() };
}
