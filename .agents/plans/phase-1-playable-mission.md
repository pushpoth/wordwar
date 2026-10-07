# Phase 1 · Playable mission

## Intent

Turn the phase 0 diorama into a playable 10×10 mission on the new graphics, so
gameplay and frame rate can be judged together. Typemariner's rules carry over
unchanged: radar a letter to reveal up to N tiles with that letter; revealing a
ship tile discovers the ship; type the target's word letter by letter to
torpedo it; misses cost torpedoes; sink every ship to win.

## Scope

**In (slice 1, prescriptive):** engine port with its tests; a game controller
that turns engine events into scene changes; letters on revealed board cells;
ships appearing when discovered (H, V and diagonal); the target billboard driven
by the engine; physical keyboard input (letters, Tab to cycle targets, Esc back
to radar); hit, miss and kill feedback using the existing explosion and wreck;
a minimal HUD (mode, battery, torpedoes, score, target word) and a mission-end
card; `?seed=` for repeatable missions.

**Slice 2 (prescriptive, agreed 2026-10-06) ✅ built, waiting on the user's device check:** save and restore progress
(seed plus action log, replayed on load); a reusable menu panel used for
pause, mission end and later UIs; pause when the tab hides; a loading progress
bar; a dev tuner panel (`?tune`, Tweakpane, like Typemariner's) whose changes
can be copied back into chat, with knobs for phone quality, depth of field and
edge blur, camera, sun, sea and gameplay cheats; a phone quality tier; steadier
adaptive resolution; a cheaper water shader (noise texture, per-vertex shore and
hull distances).

**Slice 3 (prescriptive, refined 2026-10-07): full HUD and touch input.**
Refinement found most of the reference HUD already exists in `src/game/hud.ts`
(mission and meters, target intel, word progress, sonar log, kill banner, pause).
What the reference has and we lack: an interactive on-screen keyboard, camera
controls (rotate, tilt, zoom), a sonar dial, and any touch handling. The
reference's END TURN button has no meaning in this real-time game; it is dropped.
Radar is letter-driven, not cell-driven, so there is no "tap a cell" gesture:
touch is the on-screen keyboard plus target and camera controls.

Tasks, in order; each is one session and ends with `npm test`, build, typecheck
and a screenshot at desktop and phone size:

1. ✅ **Input layer.** Pull key handling out of `controller.ts` into `src/game/input.ts`
   with one intent API (`letter`, `nextTarget`, `selectTarget(id)`, `toRadar`,
   `pause`) that keyboard, on-screen keys and taps all call. Engine
   `switchTarget` already takes a unit id. Tested with stubs.
2. **On-screen keyboard.** Replace the static key grid in the word panel with
   buttons (port the layout from `../typemariner/src/ui/virtual-keyboard.ts`,
   minus its engine event bus: colour keys from `HudView.tried`). Pointer-down
   fires, pulse on physical presses too, ⌫ omitted (no editing in this game).
   Use our own keys, never the native keyboard, which would cover the board.
3. **Camera controls.** Extend `render/camera.ts` with zoom (distance, clamped) and
   discrete rotate and tilt steps; add a Zoom −/+, Rotate, Menu panel as in the
   reference (Menu opens pause). Keyboard extras: `[` `]` rotate, `+` `-` zoom
   (never letters, which are game input).
4. **Touch gestures.** Canvas pointer handling: one-finger drag orbits and tilts
   with the same easing as the arrow keys, two-finger pinch zooms; a tap that
   moves under ~8 px does nothing. `touch-action: none` on the canvas. Tap an
   intel row to select that target. Typemariner's one-shot 90° drag-rotate is
   not ported (continuous orbit matches our camera).
5. **Sonar dial.** A decorative SVG dial with a rotating sweep (port
   `ui/sonar-log.ts`' `SonarPanel`), pulsing on a radar ping. Range readout
   shows the radar's reveal count for this grid (`RADAR_REVEALS_BY_GRID`), not a slider.
6. **Phone layout.** Today the intel panel and log are hidden under 760 px. Design
   a landscape-first phone layout: keyboard docked at the bottom, intel as a
   collapsible strip, sonar and log folded behind a toggle; respect safe-area
   insets; 44 px minimum touch targets; no page scroll or pinch-zoom of the
   page (`viewport` meta). Portrait: show a "rotate your device" hint only if
   the board can't be framed.
7. **Review pass.** Screenshots of every HUD state at 1536×1024 and a phone
   size; check on a real phone; amend the plan with what the user reports.

Exit tests: a mission can be won start to finish with touch only on a phone-size
viewport; physical keyboard still works unchanged; the HUD never covers more than
~40% of a phone-landscape screen; frame rate with the HUD shown is within 2 fps of
without it.

**Out:** sonar-ping and torpedo-run effects (phase 3), visual tuning (phase 2),
difficulty levels and map sizes (phases 4 and 5), progression (phase 6), audio.

## Reuse vs new

- **Port:** `../typemariner/src/engine/*` and tests, `config/balance.ts`,
  `config/words.ts`. Only changes: `import type` for the stricter compiler.
- **Reuse here:** board overlay, hulls, buoyancy, word sign, explosion, wreck.
- **New:** `src/game/` (controller, input, HUD); a letter atlas in the board shader.

## Build order

1. ✅ Refine this plan against the repo.
2. ✅ Port the engine and tests; `npm test` green.
3. ✅ Board letters: a glyph atlas sampled by the water shader, cell letter and
   state in the board data texture.
4. ✅ Game controller: mission from seed, ships spawned on discovery, cell states
   from engine events, target billboard from `activeUnitId`.
5. ✅ Keyboard input and the minimal HUD.
6. ✅ Hit, miss and kill feedback; mission-end card.
7. Push a preview; the user plays it and reports frame rate (in progress,
   2026-10-07; runs alongside slice 3).
8. ✅ Slice 3 refined (2026-10-07). Build its tasks 1–7 (above).

# Amended: 2026-10-07 slice 3 refined into seven tasks after reading Typemariner and the current HUD (no cell-tap; END TURN dropped).
# Amended: 2026-10-07 slice 3 (full HUD, touch input) added to phase 1; sonar and torpedo effects moved to phase 3; roadmap in status.md renumbered to match.
# Amended: 2026-10-06 radar-revealed letters display as hints that still need a torpedo (see decisions.md); `?demo` keeps the phase 0 diorama.

## Done when

- `npm test` passes, including the ported engine tests.
- A mission can be won and lost in the preview with the keyboard alone, and
  on a phone by touch (slice 3).
- The HUD shows everything in the reference image's HUD.
- The same `?seed=` gives the same board every time.
- The user has reported frame rate while playing.

## Refinement gate

Slice 3's gate is passed. Later phases refine against the repo when they start.
