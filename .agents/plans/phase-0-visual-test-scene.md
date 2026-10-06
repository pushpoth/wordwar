# Phase 0 · Visual test scene

## Intent

Prove that Word War's look is achievable before any gameplay exists. Build one
static, non-interactive diorama of a mid-battle board that matches
`references/visual-target.png` in mood and quality, and use it to choose the
renderer.

## Scope

**In:**
- Project scaffold: Vite, strict TypeScript, three.js, Vitest, `.node-version`.
- The Blender asset pipeline: Python scripts in `assets-src/blender/`, built
  headless into `public/models/*.glb` with one command (`npm run models`).
- Four authored assets: one enemy warship, the submarine, one island with a
  lighthouse and dock, and a buoy.
- Runtime visuals:
  - **ocean:** waves, depth colour, shoreline foam, sun glint, reflections
  - **lighting:** a sunset sky that also lights the scene, and soft shadows
  - **board:** a glowing hologram grid with revealed X tiles and a sonar ring
  - **word billboard:** one billboard, new code inspired by Typemariner's `unit-word-sign.ts`
  - **explosion:** one looping effect with fireball, smoke, debris and a water column
- Post-processing: tilt-shift depth of field, bloom, colour grading, anti-aliasing.
- A headless screenshot script, adapted from Typemariner's `scripts/screenshot.mjs`.

**Out:** game logic, input, HUD panels, multiple map sizes, audio.

## Reuse vs new

- **Reuse:** Typemariner's screenshot harness (adapt it), and the idea behind
  the word billboard (rewrite it).
- **New:** everything else. Don't port any Typemariner render code.

## Build order

1. Scaffold the project and pin Node. Install Blender and pin its version in `status.md`.
2. Blender pipeline: build the buoy first, end to end, including bevels, UVs,
   baked AO and normal maps, PBR materials and GLB export. It's the smallest
   asset that still exercises every step.
3. Scene shell on `WebGPURenderer`: camera framing like the reference, sky and
   lighting, post-processing.
4. Ocean.
5. Island, lighthouse and submarine assets.
6. Enemy warship asset.
7. Board grid, X tiles and sonar ring.
8. Word billboard.
9. Explosion effect.
10. Renderer comparison: run the scene on both the WebGPU and the WebGL2
    backend, then record the winner in `decisions.md`.

## Done when

- `npm run models` rebuilds every `.glb` from scratch without errors.
- `npm run screenshot` writes four fixed-seed shots: the board at rest, a sonar
  ping, an explosion, and a close-up on a ship.
- A side-by-side sheet places each shot next to the reference image, and the
  user approves it.
- The scene holds 60 fps at 1080p on the dev machine's AMD Hawk Point integrated GPU.
- `decisions.md` records the renderer choice with the numbers behind it.

## Refinement gate

Before step 1, check this plan against the state of the repo and amend it in
place (`# Amended: <date> <reason>`).
