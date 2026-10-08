# Status

## Where things stand

Phase 1 slices 1 and 2 are on `phase-1-gameplay`; slice 3 (full HUD and touch)
is built bar your device check. Slice 3 added: one input layer (`src/game/input.ts`), a
tappable on-screen keyboard, zoom/rotate/menu buttons (`[ ] + -` keys too),
drag-orbit and pinch gestures (`gestures.ts`), a sonar
dial, and a phone layout. HUD trim (2026-10-07): no intel card (word progress and "N letters" sit
in the keyboard card), Menu button over a camera-and-sonar card at top right, mode card top centre
(above the keyboard in portrait), fps readout dev-only beside the mission card, seed hidden. Landscape
phones get a split keyboard (half the keys in each bottom corner, word progress in a pill at the bottom
centre); phones hide the sonar, the log and its LOG button for now. Tapping a discovered ship aims at it
(from radar mode too, via the new engine `aimAt`). The Word War logo heads the mission card and menus. Kill banners sit under the mode card (top right
under Menu in portrait); desktop keys and word readout are 30% bigger. The tuner shows on a deployed
build only with `?tune` in the URL. Slice 2 added: save and
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

Device review (2026-10-07, Mac and iPhone): both hold 60 fps. iPhone runs at 0.7× resolution (68 draws);
Mac swings between 0.7× and 0.95× (87 draws). Default quality looks below par; lowering resolution and
turning bloom off helped. Initial load is slow (see the loading note below). That feeds phase 2.

Loading: the slow part is on the device (shader compile, first frame), which headless runs can't time. Run any
build with `?tune` to see "load Ns: gpu … models … world … shaders … 1st …" in the dev readout, then report it.
Background tabs pause animation frames, and WebGL shader compile polls on them, so loading stalls until the
tab is visible (the loader now says so); the game also pauses when the tab hides, by design.

Touch and the phone layout were played end to end on an iPhone without reported problems. Still open: touch has no
explicit way back to radar (Esc is keyboard-only; tapping a ship switches target).

Open from phase 0 (scheduled as phase 2, visual and performance pass):
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
- **Phase 2 visual fixes (2026-10-08, awaiting review):** sun glare rolls off softly on the water (`sea.glare`, 0.7);
  wreck debris rides the swell and goes under as it lands; the sub churns a short stern wash while it turns; a hit
  makes a ship heel and shudder (it used to drop 0.08 cells at once).
- **Phone portrait pass (2026-10-09, awaiting device check):** main menu logo 5vh from the top, buttons 10vh from the bottom;
  the camera frames the board's midpoint and fits its corners across the width (`fitDistance` in `src/render/camera.ts`,
  re-fit when the docked keyboard changes the field of view), zooming in 25% closer than before; landscape and desktop
  framing unchanged. The keyboard is one standard QWERTY block everywhere except landscape phones, where it splits (B on
  the right, word row above the right half). Word row 20% bigger; keys spaced the same all round (`--kg`).
- **Round 2 portrait and camera pass (2026-10-09, awaiting device check):** portrait fills the width with the board
  (`FIT_MARGIN` 0) and shifts the picture down 5vh while playing; the dock inset and shift ease in (`stepInset` in the
  controller) so the mission-start hand-off no longer jumps. The camera now moves on critically damped springs that keep
  their velocity (`spring`, `turn` in `src/render/camera.ts`): a new goal continues the current turn instead of reversing.
  Targeting a ship pans to a point between hull and billboard. Billboards fade out for kill shots and mission start/end.
  Board letters: confirmed ones black on yellow, radar returns a 20% cell with a 30% letter, each turned to read along
  its ship on screen (left to right or top to bottom, free angle). The title's horizon view has no blur (`blurScale`).
- **Known gaps:** weathering reads as dots up close; the wreck stops burning once the explosion's fire is gone; the
  sub (about 2.4 cells long) overlaps a ship in the next cell when it turns to aim; the diorama sub's wake is straight
  while its path curves.
- **Frame rate (2026-10-08, needs measuring on the Mac and the iPhone):** the adaptive resolution (`src/render/resolution.ts`,
  tested) no longer drops while paused (the paused loop's 4 fps read as slow, so every menu pushed it to the floor),
  ignores single hitches and load, climbs back in seconds rather than minutes, and won't bounce back to a level that
  failed in the last minute. The settled level is remembered per device (`wordwar.resolution` in local storage). The
  phone tier may now go up to 1.5× (was 1.0×) and uses FXAA instead of SMAA, with bloom off. Ask the user for the
  `?tune` readout (resolution, fps, draws) on both devices; if the iPhone settles below 1.0×, the ocean shader is the
  next thing to cut (it covers the screen and loops over 8 hulls and 8 islands per pixel).
- **Repo:** https://github.com/pushpoth/wordwar (private). The Vercel project
  builds every pushed branch; PR #1 holds phase 0. Work continues on `phase-1-gameplay`.
- **Deploys:** pushing a branch to GitHub builds a Vercel preview (team
  `pushpoth`, project `wordwar`); `main` is production at
  https://wordwar-pi.vercel.app. `npm run deploy:preview` still works for
  local-only builds. Preview URLs need a Vercel login.
- **Art gaps against the reference:** the islands still read as low-poly toys,
  ships lack weathering and wakes, and the smoke plume is light grey and faceted.

Cinematics (2026-10-08, pulled forward from phase 3; awaiting the user's review). A page load plays a title sequence
(fade in high over the sea, descend to the sub surfacing, settle low beside its bow, letterbox opens) and shows the main
menu top left (the logo at 66 px with the buttons centred under it; Continue when a mission is saved, New mission: mission 1 directly while it's the only one open, else
the now-opaque mission list). Every mission start goes through a departure (letterbox, pull back, sub dives, fade to
black) and a mission-start shot (in from high over the rising sub, on round to the default framing in one motion).
Any key or tap skips the title or the mission start. New ships are scanned in by the ping ring (green scan band) and
the camera turns broadside to the new target, sun behind when it isn't the long way round. Kill shots: the close one
(behind the sub, soft zoom along the run, then circling the wreck) or, about one kill in five when the ship is 6+
cells off, the drone shot (dip to black, bow close-up of the launch with a 3D torpedo, cut to a rising high view from
behind the sub). Shots live in `src/game/shots.ts` (pure, tested) and play through `view.play`; the controller runs
the phases (title, menu, depart, start, play). `?cine=0`, the tuner knob and reduced motion turn them off;
`?seed=`/`?level=` go straight to a mission and are then removed from the URL; `?shot` skips them. The tuner's
"Camera shots" group has every time, distance and angle, with ▶ buttons for each sequence. Bloom is at 15% (0.07)
on desktop and off on phones. The sea now reaches the horizon (see `decisions.md`).

Branches: `main` was merged from `phase-1-gameplay` on 2026-10-08 (the user asked, as a checkpoint; Vercel production
builds from `main`). Day-to-day work still goes to `phase-1-gameplay`.

## Active plan

[Campaign build](plans/campaign-build.md): phases 4–6 as one plan, in slices. Slice 1 is built
(2026-10-07): the ladder (`src/config/campaign.ts`), stars from torpedoes used, unlocks and best scores
saved in local storage (`wordwar.progress.v1`), a mission-select card (first load, pause menu, end card), ship
classes by word length that all reuse the destroyer model (`src/config/ships.ts`), and a balance bot
(`npm run balance`). `?level=N` opens a level directly. Slice 2 (2026-10-08): ten levels on 8×8, 10×10, 12×12, 15×15 and 18×18 boards; the board, labels,
scenery, shadows and camera resize per mission (`resizeBoard` in the controller). The `?tune` readout shows board
size and 10 s average and minimum fps: per-size frame rates are the user's to measure. The quick game's map size is
a tuner knob. Next: difficulty modifiers and polish (slices 3–4), tuned from the user's play notes. Phase 1's plan is archived (the game plays end to end on a Mac and
an iPhone at 60 fps).

## Roadmap

Refine each later phase against the current state of the repo when it starts.

| Phase | Goal | Done when |
|---|---|---|
| 0 · Visual test scene ✅ | Prove the look; pick the renderer | Screenshots hold up next to the reference at 60 fps |
| 1 · Playable mission ✅ | Engine port, full HUD, touch input | Missions won and lost on desktop and phone (done 2026-10-07) |
| 2 · Visual and performance pass | Retune quality defaults (resolution, bloom, depth of field), then the phase 0 open items: sun glare, wakes and animation, weathering, wreck fire, art gaps against the reference; load time | Defaults look good on a Mac and an iPhone at 60 fps; screenshots hold up next to the reference |
| 3 · Feel | Sonar-ping and torpedo-run effects, plus the remaining combat effects | Screenshots of every game event |
| 4 · Map sizes ✅ built | 8 / 10 / 12 / 15 / 18 grids; scenery and ship classes scale with size | Each size holds 60 fps (to be measured on devices) |
| 5 · Difficulty | Level ladder and modifiers, balanced by a simulation bot | Win rates match the target curve |
| 6 · Progression | Mission select and saved progress | Progress survives a browser restart |

Phases 4–6 are built together as the campaign plan; phases 2 and 3 wait until the campaign can be played end to end.

## Gotchas

- Blender 5.2.2 LTS (installed with snap). Node 20.20.2, pinned in `.node-version`.
- TypeScript 7's TSL typings miss some node methods; the code casts through
  `TslNode<'…'>` in a few places (`post.ts`, `ocean.ts`, `explosion.ts`).
- Ambient occlusion is baked into each model's vertex colours and applied as
  the material's `aoNode` in `src/render/assets.ts`, not as albedo.
- The dev machine's GPU is an AMD Hawk Point integrated GPU. That's the
  frame-rate baseline: if it holds 60 fps here, mid-range laptops are covered.
