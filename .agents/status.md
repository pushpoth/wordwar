# Status

## Where things stand

Phase 0 is mostly built on branch `phase-0-visual-scene`: a static mid-battle
diorama renders end to end on `WebGPURenderer` (sky, Gerstner ocean with the
board painted into it, six Blender-built models, word billboard, looping
explosion, depth of field, bloom, grade, SMAA). Run `npm run dev` (port 5190),
`npm run models` to rebuild assets, `npm run screenshot` for review shots
(`--t` pins time; `--query` takes `view=close|ship`, `az=<deg>`, `el=<deg>`).
In the browser, the arrow keys orbit and tilt the camera.

Open in phase 0:
- **Frame rate:** WebGPU holds about 56 fps on the dev machine (target 60);
  see `decisions.md`. Cut draw calls before adding more scenery.
- **User review notes (2026-10-06)** are addressed, waiting on the next review:
  buoyancy fitted to bow, stern and beam samples with short waves calmed under
  hulls (`src/scene/buoyancy.ts`, `src/render/hulls.ts`), sea state via
  `LOOK.seaState` or `?sea=`; contact foam and a short Kelvin wake; procedural
  weathering (`src/render/weathering.ts`); islands 20% bigger with strata and
  patchy grass; elliptical shorelines with inward surf and beach run-up; a
  denser blast; crisp billboard glyphs.
- **Frame-rate risk:** this round added particles (about 600 sprites), island
  triangles (about 44k across three models) and per-pixel hull and island
  loops in the water shader. Re-measure on the dev machine before adding more.
- **Known gaps:** the sun glare at low camera angles blows out to white; the
  sub's wake is straight while its path curves; weathering reads as dots up close.
- **Deploys:** `npm run deploy:preview` builds locally and uploads a preview
  to the `wordwar` Vercel project (team `pushpoth`). Preview URLs need a
  Vercel login; the public production alias is https://wordwar-pi.vercel.app.
- **Art gaps against the reference:** the islands still read as low-poly toys,
  ships lack weathering and wakes, and the smoke plume is light grey and faceted.

## Active plan

[Phase 0 · visual test scene](plans/phase-0-visual-test-scene.md): one static
diorama scene to prove the Word War look and choose the renderer.

## Roadmap

Only phase 0 is planned in detail. Refine each later phase against the current
state of the repo when it starts.

| Phase | Goal | Done when |
|---|---|---|
| 0 · Visual test scene | Prove the look; pick the renderer | Screenshots hold up next to the reference at 60 fps |
| 1 · Engine port | Typemariner's game logic and tests running here; difficulty and map-size presets added to the mission config | Engine tests pass |
| 2 · Playable | Board, word billboard, keyboard input, camera | A mission can be won or lost |
| 3 · Feel | Full combat effects and the HUD | Screenshots of every game event |
| 4 · Map sizes | 8 / 10 / 12 / 15 / 18 grids; scenery and ship classes scale with size | Each size holds 60 fps |
| 5 · Difficulty | Level ladder and modifiers, balanced by a simulation bot | Win rates match the target curve |
| 6 · Progression | Mission select and saved progress | Progress survives a browser restart |

## Gotchas

- Blender 5.2.2 LTS (installed with snap). Node 20.20.2, pinned in `.node-version`.
- TypeScript 7's TSL typings miss some node methods; the code casts through
  `TslNode<'…'>` in a few places (`post.ts`, `ocean.ts`, `explosion.ts`).
- Ambient occlusion is baked into each model's vertex colours and applied as
  the material's `aoNode` in `src/render/assets.ts`, not as albedo.
- The dev machine's GPU is an AMD Hawk Point integrated GPU. That's the
  frame-rate baseline: if it holds 60 fps here, mid-range laptops are covered.
