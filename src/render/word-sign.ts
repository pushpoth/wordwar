import {
  CanvasTexture, Group, Mesh, MeshStandardNodeMaterial, PlaneGeometry, SRGBColorSpace,
  Vector3, type Camera,
} from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { max, mix, smoothstep, texture, uniform, uv, vec3, vec4 } from 'three/tsl';

const glyphCache = new Map<string, CanvasTexture>();

/** Crisp white glyph on transparent, used as a paint stencil. */
function glyph(ch: string) {
  let tex = glyphCache.get(ch);
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `900 ${ch === '_' ? 340 : 356}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
  g.fillStyle = '#fff';
  g.fillText(ch, 256, ch === '_' ? 220 : 280);
  tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  glyphCache.set(ch, tex);
  return tex;
}

const TILE = 0.78;
const slabGeo = new RoundedBoxGeometry(TILE, TILE, 0.16, 3, 0.07);
const faceGeo = new PlaneGeometry(TILE * 0.86, TILE * 0.86);

const slabMat = new MeshStandardNodeMaterial({ color: 0x1b2025, roughness: 0.35, metalness: 0.75 });
// Amber rim: glows along the slab edges, brightest on the bevel.
const rimUV = uv().sub(0.5).abs();
slabMat.emissiveNode = vec3(1.0, 0.62, 0.12).mul(smoothstep(0.38, 0.5, max(rimUV.x, rimUV.y)).mul(1.4));

/**
 * The floating target word: one slab per letter above each of the ship's cells,
 * every slab facing the camera. Unrevealed letters show a dim underscore.
 */
export function createWordSign(word: string) {
  const group = new Group();
  group.name = `word:${word}`;
  const revealedU: ReturnType<typeof uniform>[] = [];
  const tiles: Group[] = [];

  [...word.toUpperCase()].forEach((ch) => {
    const tile = new Group();
    const slab = new Mesh(slabGeo, slabMat);
    slab.castShadow = true;
    tile.add(slab);

    const rev = uniform(0);
    revealedU.push(rev);
    const letterTex = texture(glyph(ch));
    const blankTex = texture(glyph('_'));
    // Painted letters, lit by the scene like the slab they sit on: only the
    // rim glows. Hidden letters show a faded amber stencil underscore.
    const face = new MeshStandardNodeMaterial({ roughness: 0.62, metalness: 0, alphaTest: 0.5 });
    const paint = vec3(0.86, 0.82, 0.72);
    const stencil = vec3(0.55, 0.32, 0.06);
    face.colorNode = vec4(mix(stencil, paint, rev), 1);
    face.opacityNode = mix(blankTex.a.mul(0.9), letterTex.a, rev);
    const faceMesh = new Mesh(faceGeo, face);
    faceMesh.position.z = 0.082;
    faceMesh.renderOrder = 4;
    tile.add(faceMesh);

    group.add(tile);
    tiles.push(tile);
  });

  let slots: Vector3[] = [];
  let baseY = 1.15;
  let reversed = false;

  /** Place one letter above each ship cell, at `height` over the water. */
  function place(cells: Vector3[], height = 1.15) {
    slots = cells.map((c) => c.clone());
    baseY = height;
    layout();
  }

  function layout() {
    const n = tiles.length;
    tiles.forEach((t, i) => {
      const c = slots[Math.min(reversed ? n - 1 - i : i, slots.length - 1)];
      t.position.x = c.x;
      t.position.z = c.z;
    });
  }

  /** The word must read left to right on screen from any orbit angle. */
  const pa = new Vector3();
  const pb = new Vector3();
  function readingDirection(camera: Camera) {
    if (slots.length < 2) return;
    pa.copy(slots[0]).project(camera);
    pb.copy(slots[slots.length - 1]).project(camera);
    const dx = pb.x - pa.x;
    // Hysteresis so a ship seen end-on doesn't flicker between orders.
    if (reversed ? dx > 0.02 : dx < -0.02) {
      reversed = !reversed;
      layout();
    }
  }

  function setRevealed(mask: boolean[]) {
    mask.forEach((r, i) => { if (revealedU[i]) revealedU[i].value = r ? 1 : 0; });
  }

  function update(camera: Camera, t: number) {
    readingDirection(camera);
    tiles.forEach((tile, i) => {
      tile.quaternion.copy(camera.quaternion);
      tile.position.y = baseY + Math.sin(t * 1.7 + i * 0.6) * 0.035;
    });
  }

  return { group, place, setRevealed, update };
}
