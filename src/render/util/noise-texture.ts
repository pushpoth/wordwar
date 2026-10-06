import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, RepeatWrapping, UnsignedByteType } from 'three/webgpu';

/** Periodic gradient noise on a `period`-cell lattice, so the result tiles. */
function periodicNoise(size: number, period: number, seed: number) {
  let s = seed;
  const rand = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gx = new Float32Array(period * period);
  const gy = new Float32Array(period * period);
  for (let i = 0; i < period * period; i++) {
    const a = rand() * Math.PI * 2;
    gx[i] = Math.cos(a);
    gy[i] = Math.sin(a);
  }
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * period;
      const fy = (y / size) * period;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const dot = (ix: number, iy: number, dx: number, dy: number) => {
        const i = ((iy % period) * period + (ix % period)) | 0;
        return gx[i] * dx + gy[i] * dy;
      };
      const n00 = dot(x0, y0, tx, ty);
      const n10 = dot(x0 + 1, y0, tx - 1, ty);
      const n01 = dot(x0, y0 + 1, tx, ty - 1);
      const n11 = dot(x0 + 1, y0 + 1, tx - 1, ty - 1);
      const u = fade(tx);
      const v = fade(ty);
      out[y * size + x] = (n00 * (1 - u) + n10 * u) * (1 - v) + (n01 * (1 - u) + n11 * u) * v;
    }
  }
  return out;
}

/** Fractal sum of periodic octaves, scaled to 0–1. */
function fbm(size: number, base: number, octaves: number, seed: number) {
  const acc = new Float32Array(size * size);
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const layer = periodicNoise(size, base << o, seed + o * 101);
    for (let i = 0; i < acc.length; i++) acc[i] += layer[i] * amp;
    norm += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < acc.length; i++) acc[i] = Math.min(1, Math.max(0, acc[i] / norm * 1.4 + 0.5));
  return acc;
}

let shared: DataTexture | null = null;

/**
 * A tileable 256² noise texture with four independent channels, sampled by
 * the water and wake shaders instead of computing procedural noise per pixel
 * (one texture read replaces several expensive noise evaluations).
 * R, G: fractal noise used as ripple normals · B: fractal for foam and patches ·
 * A: smooth single-octave noise for large shapes.
 */
export function noiseTexture() {
  if (shared) return shared;
  const size = 256;
  const r = fbm(size, 4, 4, 11);
  const g = fbm(size, 4, 4, 29);
  const b = fbm(size, 8, 3, 47);
  const a = fbm(size, 2, 2, 83);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = r[i] * 255;
    data[i * 4 + 1] = g[i] * 255;
    data[i * 4 + 2] = b[i] * 255;
    data[i * 4 + 3] = a[i] * 255;
  }
  shared = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  shared.wrapS = shared.wrapT = RepeatWrapping;
  shared.magFilter = LinearFilter;
  shared.minFilter = LinearMipmapLinearFilter;
  shared.generateMipmaps = true;
  shared.needsUpdate = true;
  return shared;
}
