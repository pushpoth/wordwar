# Status

## Where things stand

Phase 0 is mostly built on branch `phase-0-visual-scene`: a static mid-battle
diorama renders end to end on `WebGPURenderer` (sky, Gerstner ocean with the
board painted into it, six Blender-built models, word billboard, looping
explosion, depth of field, bloom, grade, SMAA). Run `npm run dev` (port 5190),
`npm run models` to rebuild assets, `npm run screenshot` for review shots
(`--t` pins time, `--query view=close|ship` changes framing).

Open in phase 0:
- **Renderer comparison and the 60 fps check on a real GPU** haven't been done.
  Headless screenshots use software WebGL, so they prove nothing about speed.
  Open the page on the dev machine, read the fps overlay with and without
  `?backend=webgl`, and record the result in `decisions.md`.
- **Vercel previews** need the CLI logged in (`npx vercel login`), then
  `npm run deploy:preview`. The `wordwar` project exists in the `pushpoth` team.
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
