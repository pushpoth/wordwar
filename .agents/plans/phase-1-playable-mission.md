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

**Later slices (goals only):** sonar-ping and torpedo-run effects; the full HUD
from the reference image (target intel, word-progress keyboard, sonar log,
camera controls); touch input.

**Out:** difficulty levels and map sizes (phases 4 and 5), progression, audio.

## Reuse vs new

- **Port:** `../typemariner/src/engine/*` and tests, `config/balance.ts`,
  `config/words.ts`. Only changes: `import type` for the stricter compiler.
- **Reuse here:** board overlay, hulls, buoyancy, word sign, explosion, wreck.
- **New:** `src/game/` (controller, input, HUD); a letter atlas in the board shader.

## Build order

1. Refine this plan against the repo.
2. Port the engine and tests; `npm test` green.
3. Board letters: a glyph atlas sampled by the water shader, cell letter and
   state in the board data texture.
4. Game controller: mission from seed, ships spawned on discovery, cell states
   from engine events, target billboard from `activeUnitId`.
5. Keyboard input and the minimal HUD.
6. Hit, miss and kill feedback; mission-end card.
7. Push a preview; the user plays it and reports frame rate.

## Done when

- `npm test` passes, including the ported engine tests.
- A mission can be won and lost in the preview with the keyboard alone.
- The same `?seed=` gives the same board every time.
- The user has reported frame rate while playing.

## Refinement gate

Before step 2, check this plan against the repo and amend it in place
(`# Amended: <date> <reason>`).
