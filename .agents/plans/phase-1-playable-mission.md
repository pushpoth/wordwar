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

**Slice 3 (goals only; refine against Typemariner's HUD and input before building):**
the full HUD from the reference image (target intel, word-progress keyboard,
sonar log, camera controls) and touch input (on-screen keyboard or native
input, tap to radar a cell and to pick a target, pinch and drag camera). Both
must hold the phone quality tier's frame rate.

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
8. Slice 3: refine, then build the full HUD and touch input.

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

Before slice 3, check it against the repo and Typemariner's HUD and input code,
and amend this plan in place (`# Amended: <date> <reason>`).
