# Status

## Where things stand

Phase 1 slices 1 and 2 are on `phase-1-gameplay`. Slice 2 added: save and
restore (seed plus action log in local storage, replayed on load), a pause
menu (Space, the ❚❚ button, or leaving the tab) built on a reusable menu card,
a loading progress bar, the dev tuner (`?tune`), a phone quality tier
(`?quality=phone|desktop`), steadier adaptive resolution and a texture-based
water shader. Slice 1: a 10×10 mission on the
ported engine (`src/engine/`, 63 tests) driven by `src/game/` (controller,
fleet, HUD). `?seed=` repeats a board; `?demo` shows the fixed phase 0 diorama.
Phase 0, on PR #1: a static mid-battle
diorama renders end to end on `WebGPURenderer` (sky, Gerstner ocean with the
board painted into it, six Blender-built models, word billboard, looping
explosion, depth of field, bloom, grade, SMAA). Run `npm run dev` (port 5190),
`npm run models` to rebuild assets, `npm run screenshot` for review shots
(`--t` pins time; `--query` takes `view=close|ship`, `az=<deg>`, `el=<deg>`).
In the browser, the arrow keys orbit and tilt the camera.

Open from phase 0 (scheduled as phase 2, visual tuning):
- **Frame rate:** WebGPU holds about 56 fps on the dev machine (target 60);
  see `decisions.md`. Cut draw calls before adding more scenery.
- **User review notes (2026-10-06)** are addressed, waiting on the next review:
  buoyancy fitted to bow, stern and beam samples with short waves calmed under
  hulls (`src/scene/buoyancy.ts`, `src/render/hulls.ts`), sea state via
  `LOOK.seaState` or `?sea=`; contact foam and a short Kelvin wake; procedural
  weathering (`src/render/weathering.ts`); islands 20% bigger with strata and
  patchy grass; elliptical shorelines with inward surf and beach run-up; a
  denser blast; crisp billboard glyphs.
- **Performance (2026-10-06):** see the field log. One shared model material,
  adaptive resolution, 60 fps cap and a shader warm-up before the first frame.
  The user's last numbers before these fixes: Mac Safari 60 fps, K12 Firefox
  ~40 fps, ~1.1 GB and ~30% CPU. Re-measure.
- **Frame-rate risk (older):** this round added particles (about 600 sprites), island
  triangles (about 44k across three models) and per-pixel hull and island
  loops in the water shader. Re-measure on the dev machine before adding more.
- **Round 3 review (2026-10-06)** addressed: distant water tiling broken up
  with macro colour noise and distance-faded ripples; camera tilt floor raised
  to 36°; destroyed ships swap to `destroyer_wreck` (bow and stern fold into a
  V and sink, fittings fly clear) only at the moment of the kill; billboard
  letters are matte paint with only the rim glowing; the sub turns about a
  forward pivot with drift.
- **Known gaps:** the sun glare at low camera angles blows out to white; the
  sub's wake is straight while its path curves; weathering reads as dots up close;
  the wreck stops burning once the explosion's fire is gone.
- **Repo:** https://github.com/pushpoth/wordwar (private). The Vercel project
  builds every pushed branch; PR #1 holds phase 0. Work continues on `phase-1-gameplay`.
- **Deploys:** pushing a branch to GitHub builds a Vercel preview (team
  `pushpoth`, project `wordwar`); `main` is production at
  https://wordwar-pi.vercel.app. `npm run deploy:preview` still works for
  local-only builds. Preview URLs need a Vercel login.
- **Art gaps against the reference:** the islands still read as low-poly toys,
  ships lack weathering and wakes, and the smoke plume is light grey and faceted.

## Active plan

[Phase 1 · playable mission](plans/phase-1-playable-mission.md): the phase 0
diorama becomes a playable 10×10 mission on the engine ported from Typemariner.
Slices 1 and 2 are built; slice 3 (full HUD, touch input) is next. Phase 0's
plan is archived; its open items are listed above.

## Roadmap

Phase 1 is planned in detail. Refine each later phase against the current
state of the repo when it starts.

| Phase | Goal | Done when |
|---|---|---|
| 0 · Visual test scene ✅ | Prove the look; pick the renderer | Screenshots hold up next to the reference at 60 fps |
| 1 · Playable mission | Engine port, a 10×10 mission playable by keyboard (slices 1–2 ✅), then the full HUD and touch input (slice 3) | A mission can be won or lost on desktop and phone; engine tests pass |
| 2 · Visual tuning | Close the phase 0 open items (sun glare, ship and sub wakes and animation, weathering, wreck fire, art gaps against the reference) | Screenshots hold up next to the reference at 60 fps on the dev machine |
| 3 · Feel | Sonar-ping and torpedo-run effects, plus the remaining combat effects | Screenshots of every game event |
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
