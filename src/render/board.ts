import { DataTexture, NearestFilter, RGBAFormat, UnsignedByteType, Vector2, Vector3, type Node as TslNode } from 'three/webgpu';
import { abs, clamp, exp, float, floor, fract, fwidth, max, min, mix, sin, smoothstep, texture, uniform, vec3 } from 'three/tsl';
import { simTime as time } from './clock';

export const CELL = { hidden: 0, miss: 1, hit: 2, target: 3, sunk: 4 } as const;
export type CellState = (typeof CELL)[keyof typeof CELL];

export const BOARD_COLORS = {
  line: vec3(0.55, 0.9, 1.0),
  miss: vec3(0.12, 0.55, 1.0),
  hit: vec3(1.0, 0.42, 0.12),
  target: vec3(1.0, 0.78, 0.18),
  sonar: vec3(0.35, 1.0, 0.45),
  blast: vec3(0.55, 0.85, 1.0),
};

/**
 * The tactical board, painted into the water shader so the grid rides the
 * swell: hologram grid lines, revealed-cell fills with X marks, the target's
 * cells, a sonar ring around the submarine and a blast shock ring.
 */
export function createBoard(size: number) {
  const data = new Uint8Array(size * size * 4);
  const stateTex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  stateTex.magFilter = stateTex.minFilter = NearestFilter;
  stateTex.needsUpdate = true;

  const u = {
    size: uniform(size),
    lineGlow: uniform(0.95),
    sonarCenter: uniform(new Vector2(0, 0)),
    sonarRadius: uniform(2.2),
    blastCenter: uniform(new Vector2(0, 0)),
    blastAge: uniform(99),
  };

  function setCell(col: number, row: number, state: CellState) {
    data[(row * size + col) * 4] = state;
    stateTex.needsUpdate = true;
  }

  /** Returns the overlay colour (to blend over the water) and its emissive glow. */
  function overlay(base: TslNode<'vec2'>) {
    const local = base.add(u.size.mul(0.5));
    const inside = smoothstep(-0.02, 0.0, min(local.x, local.y)).mul(smoothstep(-0.02, 0.0, u.size.sub(max(local.x, local.y))));
    const cell = floor(local);
    const f = fract(local);
    const aa = max(fwidth(local.x), fwidth(local.y));

    // Grid lines: thin inner lines, bright outer frame.
    const edge = min(min(f.x, f.y), min(float(1).sub(f.x), float(1).sub(f.y)));
    const line = smoothstep(aa.mul(1.2).add(0.006), float(0.002), edge);
    const outer = min(min(local.x, local.y), min(u.size.sub(local.x), u.size.sub(local.y)));
    const frame = smoothstep(aa.mul(1.5).add(0.03), float(0.0), abs(outer)).mul(1.2);

    const st = texture(stateTex, cell.add(0.5).div(u.size)).r.mul(255).add(0.5).floor();
    const isMiss = st.equal(1).select(float(1), float(0));
    const isHit = st.equal(2).select(float(1), float(0)).add(st.equal(4).select(float(1), float(0)));
    const isTarget = st.equal(3).select(float(1), float(0));

    // X mark inside revealed cells.
    const d = min(abs(f.x.sub(f.y)), abs(f.x.add(f.y).sub(1)));
    const box = smoothstep(0.24, 0.2, max(abs(f.x.sub(0.5)), abs(f.y.sub(0.5))));
    const xMark = smoothstep(aa.add(0.05), float(0.035), d).mul(box);
    const inset = smoothstep(0.02, 0.07, edge);

    const pulse = sin(time.mul(3.2)).mul(0.5).add(0.5);
    const fill = isMiss.mul(0.55).add(isHit.mul(0.5)).add(isTarget.mul(pulse.mul(0.25).add(0.2))).mul(inset).mul(inside);
    const fillColor = mix(mix(BOARD_COLORS.miss, BOARD_COLORS.hit, isHit), BOARD_COLORS.target, isTarget);

    // Sonar ring around the submarine and the blast shock ring.
    const sd = base.sub(u.sonarCenter).length();
    const sweep = fract(time.mul(0.35));
    const sonar = smoothstep(0.06, 0.0, abs(sd.sub(u.sonarRadius))).mul(0.9)
      .add(smoothstep(0.08, 0.0, abs(sd.sub(sweep.mul(u.sonarRadius)))).mul(float(1).sub(sweep)).mul(0.8))
      .add(smoothstep(u.sonarRadius, 0.0, sd).mul(0.08));
    const bd = base.sub(u.blastCenter).length();
    const blastR = u.blastAge.mul(2.6);
    const blast = smoothstep(0.18, 0.0, abs(bd.sub(blastR))).mul(exp(u.blastAge.mul(-2.2))).mul(2.0);

    const lines = line.mul(0.55).add(frame).mul(inside).mul(u.lineGlow);
    const emissive = BOARD_COLORS.line.mul(lines)
      .add(fillColor.mul(fill.mul(0.9)).mul(inside))
      .add(vec3(1, 1, 1).mul(xMark.mul(isMiss).mul(1.3)).mul(inside))
      .add(BOARD_COLORS.sonar.mul(sonar))
      .add(BOARD_COLORS.blast.mul(blast));
    const tint = clamp(fill.add(lines.mul(0.3)), 0, 0.85);
    return { tint, tintColor: fillColor, emissive };
  }

  /** World position of a cell centre (col → x, row → z). */
  function cellCenter(col: number, row: number, out = new Vector3()) {
    return out.set(col - size / 2 + 0.5, 0, row - size / 2 + 0.5);
  }

  return { overlay, setCell, cellCenter, uniforms: u, size };
}

export type Board = ReturnType<typeof createBoard>;
