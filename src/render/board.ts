import {
  CanvasTexture, DataTexture, LinearFilter, LinearMipmapLinearFilter, NearestFilter, RGBAFormat, UnsignedByteType,
  Vector2, Vector3, type Node as TslNode,
} from 'three/webgpu';
import {
  abs, clamp, exp, float, floor, fract, fwidth, max, min, mix, sin, smoothstep, texture, uniform, vec2, vec3,
} from 'three/tsl';
import { simTime as time } from './clock';
import { tune } from '../config/tunables';

/** Base state of a cell (data texture red channel). */
export const CELL = { hidden: 0, miss: 1, hit: 2, sunk: 4 } as const;
export type CellState = (typeof CELL)[keyof typeof CELL];

export const BOARD_COLORS = {
  line: vec3(0.55, 0.9, 1.0),
  miss: vec3(0.12, 0.55, 1.0),
  hit: vec3(1.0, 0.42, 0.12),
  target: vec3(1.0, 0.78, 0.18),
  sonar: vec3(0.35, 1.0, 0.45),
  blast: vec3(0.55, 0.85, 1.0),
  torpedo: vec3(1.0, 0.85, 0.55),
};

const ATLAS_COLS = 8;
const ATLAS_ROWS = 4;

/** A–Z in an 8×4 atlas, white on transparent, for letters painted on cells. */
function glyphAtlas() {
  const cell = 128;
  const c = document.createElement('canvas');
  c.width = cell * ATLAS_COLS;
  c.height = cell * ATLAS_ROWS;
  const g = c.getContext('2d')!;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `800 ${cell * 0.72}px "Helvetica Neue", Arial, sans-serif`;
  g.fillStyle = '#fff';
  for (let i = 0; i < 26; i++) {
    const x = (i % ATLAS_COLS) * cell + cell / 2;
    const y = Math.floor(i / ATLAS_COLS) * cell + cell / 2 + cell * 0.04;
    g.fillText(String.fromCharCode(65 + i), x, y);
  }
  const tex = new CanvasTexture(c);
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.anisotropy = 8;
  return tex;
}

/**
 * The tactical board, painted into the water shader so the grid rides the
 * swell: hologram grid lines, revealed cells (X for empty water, the letter for
 * a ship tile), the target's cells, the submarine's sonar ring, a radar ping
 * sweeping out from the sub, a torpedo run and a blast shock ring.
 */
/** The largest board the state texture can hold; smaller boards use its top-left corner. */
export const MAX_BOARD = 20;

export function createBoard(initialSize: number) {
  let size = initialSize;
  const data = new Uint8Array(MAX_BOARD * MAX_BOARD * 4);
  const stateTex = new DataTexture(data, MAX_BOARD, MAX_BOARD, RGBAFormat, UnsignedByteType);
  stateTex.magFilter = stateTex.minFilter = NearestFilter;
  stateTex.needsUpdate = true;
  const atlas = glyphAtlas();

  const u = {
    size: uniform(size),
    /** How fast the radar ring travels, in cells per second (scaled with the board). */
    pingSpeed: uniform(9),
    lineGlow: uniform(0.95),
    sonarCenter: uniform(new Vector2(0, 0)),
    sonarRadius: uniform(2.2),
    blastCenter: uniform(new Vector2(0, 0)),
    blastAge: uniform(99),
    pingCenter: uniform(new Vector2(0, 0)),
    pingAge: uniform(99),
    torpFrom: uniform(new Vector2(0, 0)),
    torpTo: uniform(new Vector2(0, 0)),
    torpT: uniform(-1),
    /** The camera's right and forward (away from it) directions on the water, and the sine of its tilt: they turn each ship's letters to read along its length. */
    camRight: uniform(new Vector2(1, 0)),
    camFwd: uniform(new Vector2(0, -1)),
    sinTilt: uniform(0.8),
  };

  /**
   * Set a cell's state, its letter (A–Z or '' for none), whether it belongs to the current
   * target, whether its letter is confirmed by a torpedo (else it is only a radar return)
   * and the direction its ship's word runs across the grid (one step: -1, 0 or 1 each way).
   */
  function setCell(col: number, row: number, state: CellState, letter = '', target = false, confirmed = false, dir: [number, number] = [1, 0]) {
    const i = (row * MAX_BOARD + col) * 4;
    data[i] = state;
    data[i + 1] = letter ? letter.toUpperCase().charCodeAt(0) - 64 : 0;
    data[i + 2] = (target ? 1 : 0) | (confirmed ? 2 : 0);
    data[i + 3] = (dir[0] + 1) * 3 + (dir[1] + 1) + 1;
    stateTex.needsUpdate = true;
  }

  function clear() {
    data.fill(0);
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

    const px = texture(stateTex, cell.add(0.5).div(MAX_BOARD));
    const st = px.r.mul(255).add(0.5).floor();
    const letter = px.g.mul(255).add(0.5).floor();
    const isMiss = st.equal(1).select(float(1), float(0));
    const isHit = st.equal(2).select(float(1), float(0)).add(st.equal(4).select(float(1), float(0)));
    const flags = px.b.mul(255).add(0.5).floor();
    const isTarget = flags.mod(2).greaterThan(0.5).select(float(1), float(0));
    const confirmed = flags.div(2).floor().mod(2).greaterThan(0.5).select(float(1), float(0));
    const hidden = st.equal(0).select(float(1), float(0));

    // X mark inside revealed empty-water cells.
    const d = min(abs(f.x.sub(f.y)), abs(f.x.add(f.y).sub(1)));
    const box = smoothstep(0.24, 0.2, max(abs(f.x.sub(0.5)), abs(f.y.sub(0.5))));
    const xMark = smoothstep(aa.add(0.05), float(0.035), d).mul(box).mul(isMiss);

    // The cell's letter, from the atlas. It is turned to read along its ship's length as seen on
    // screen, left to right or top to bottom, never upside down; the angle is free, not a quarter turn.
    const code = px.a.mul(255).add(0.5).floor().sub(1);
    const axis = vec2(floor(code.div(3)).sub(1), code.mod(3).sub(1)).normalize();
    const onScreen = (g: TslNode<'vec2'>) => vec2(g.dot(u.camRight), g.dot(u.camFwd).mul(u.sinTilt));
    const flip = onScreen(axis).y.sub(onScreen(axis).x).greaterThanEqual(0).select(float(-1), float(1));
    const base2 = axis.mul(flip);
    const screenBase = onScreen(base2);
    const screenUp = vec2(screenBase.y.negate(), screenBase.x);
    const side = vec2(base2.y.negate(), base2.x);
    const upGround = side.mul(onScreen(side).dot(screenUp).greaterThan(0).select(float(1), float(-1)));
    const at = vec2(f.x.sub(0.5), f.y.sub(0.5));
    const gu = at.dot(base2);
    const gv = at.dot(upGround);
    const r = vec2(gu, gv).add(0.5);
    const slot = letter.sub(1);
    const sx = slot.mod(ATLAS_COLS);
    const sy = floor(slot.div(ATLAS_COLS));
    const auv = vec2(sx.add(r.x).div(ATLAS_COLS), float(1).sub(sy.add(float(1).sub(r.y)).div(ATLAS_ROWS)));
    const inGlyph = smoothstep(0.5, 0.46, max(abs(gu), abs(gv)));
    const glyph = texture(atlas, auv).a.mul(letter.greaterThan(0.5).select(float(1), float(0))).mul(isHit.add(isTarget).min(1)).mul(inside).mul(inGlyph);
    // Confirmed letters are black on yellow; radar returns are faint: a dim cell and a letter at 30%.
    const glyphSure = glyph.mul(confirmed);
    const glyphRadar = glyph.mul(float(1).sub(confirmed));

    const inset = smoothstep(0.02, 0.07, edge);
    const pulse = sin(time.mul(3.2)).mul(0.5).add(0.5);
    const targetFill = isTarget.mul(hidden).mul(pulse.mul(0.25).add(0.3));
    const radarCell = isMiss.add(isHit).min(1).mul(float(1).sub(confirmed));
    const fill = radarCell.mul(0.2).add(isHit.mul(confirmed).mul(0.92)).add(targetFill).mul(inset).mul(inside);
    const fillColor = mix(mix(BOARD_COLORS.miss, BOARD_COLORS.hit, isHit), BOARD_COLORS.target, max(isTarget, confirmed));

    // Sonar ring around the submarine and the blast shock ring.
    const sd = base.sub(u.sonarCenter).length();
    const sweep = fract(time.mul(0.35));
    const sonar = smoothstep(0.06, 0.0, abs(sd.sub(u.sonarRadius))).mul(0.9)
      .add(smoothstep(0.08, 0.0, abs(sd.sub(sweep.mul(u.sonarRadius)))).mul(float(1).sub(sweep)).mul(0.8))
      .add(smoothstep(u.sonarRadius, 0.0, sd).mul(0.08));
    const bd = base.sub(u.blastCenter).length();
    const blastR = u.blastAge.mul(2.6);
    const blast = smoothstep(0.18, 0.0, abs(bd.sub(blastR))).mul(exp(u.blastAge.mul(-2.2))).mul(2.0);

    // Radar ping: a bright ring sweeping out across the board from the sub.
    const pd = base.sub(u.pingCenter).length();
    const pingR = u.pingAge.mul(u.pingSpeed);
    const ping = smoothstep(0.35, 0.0, abs(pd.sub(pingR))).mul(smoothstep(0.0, 0.1, pd.sub(pingR).negate().add(0.35)))
      .mul(exp(u.pingAge.mul(-1.6))).mul(inside.mul(0.7).add(0.3)).mul(1.6);

    // Torpedo run: a hot head with a fading wake from the sub to the target.
    const seg = u.torpTo.sub(u.torpFrom);
    const segLen = seg.length().max(0.001);
    const dir = seg.div(segLen);
    const rel = base.sub(u.torpFrom);
    const along = rel.dot(dir);
    const across = abs(rel.dot(vec2(dir.y.negate(), dir.x)));
    const head = u.torpT.mul(segLen);
    const behind = head.sub(along);
    const running = u.torpT.greaterThanEqual(0).select(float(1), float(0));
    const torp = smoothstep(0.07, 0.0, across).mul(smoothstep(-0.05, 0.05, behind)).mul(exp(behind.mul(-1.4)))
      .mul(smoothstep(-0.1, 0.0, along)).mul(running).mul(2.2);

    const lines = line.mul(0.55).add(frame).mul(inside).mul(u.lineGlow);
    const emissive = BOARD_COLORS.line.mul(lines)
      .add(fillColor.mul(fill.mul(0.9)).mul(inside))
      .add(vec3(1, 1, 1).mul(xMark.mul(0.39)).mul(inside))
      .add(vec3(1.0, 0.97, 0.9).mul(glyphRadar.mul(0.45)).mul(inside))
      .add(BOARD_COLORS.sonar.mul(sonar))
      .add(BOARD_COLORS.sonar.mul(ping))
      .add(BOARD_COLORS.torpedo.mul(torp))
      .add(BOARD_COLORS.blast.mul(blast));
    const dark = emissive.mul(float(1).sub(glyphSure));
    const tint = clamp(fill.add(lines.mul(0.3)).add(glyphRadar.mul(0.18)).add(glyphSure.mul(0.95)), 0, 0.95);
    return { tint, tintColor: mix(mix(fillColor, vec3(1, 1, 1), glyphRadar), vec3(0.02, 0.02, 0.02), glyphSure), emissive: dark };
  }

  /** World position of a cell centre (col → x, row → z). */
  function cellCenter(col: number, row: number, out = new Vector3()) {
    return out.set(col - size / 2 + 0.5, 0, row - size / 2 + 0.5);
  }

  /** Tell the letters which way the camera looks (azimuth and tilt in degrees), so they can turn to read along their ships. */
  function faceCamera(azimuthDeg: number, tiltDeg = 52) {
    const az = (azimuthDeg * Math.PI) / 180;
    u.camRight.value.set(Math.cos(az), -Math.sin(az));
    u.camFwd.value.set(-Math.sin(az), -Math.cos(az));
    u.sinTilt.value = Math.max(0.2, Math.sin((tiltDeg * Math.PI) / 180));
  }

  /** Switch to an n × n board (the cells are cleared). */
  function setSize(n: number) {
    size = n;
    u.size.value = n;
    u.pingSpeed.value = (tune.get<number>('fx.pingSpeed') * n) / 10;
    clear();
  }
  tune.on('fx.pingSpeed', (v) => (u.pingSpeed.value = ((v as number) * size) / 10));

  return { overlay, setCell, clear, cellCenter, faceCamera, setSize, uniforms: u, get size() { return size; } };
}

export type Board = ReturnType<typeof createBoard>;
