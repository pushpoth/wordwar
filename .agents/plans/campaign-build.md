# Campaign build · phases 4–6

## Intent

Turn the single 10×10 mission into a campaign the player can progress through:
a ladder of levels that grows in map size, fleet and pressure, with stars,
unlocks and saved progress, balanced by a simulation bot and held to a
frame-rate budget per map size. Goal: the whole game can be played and judged
end to end before visuals and effects are tuned (phases 2 and 3).

## Scope

**Slice 1 · Ladder and progress (prescriptive):**
1. **Level catalog** `src/config/campaign.ts`: ordered levels (id, name, grid
   size, unit count, torpedo budget, battery regen, diagonals, word tier
   weights, star targets). Slice 1 holds only 10×10 levels; each later slice
   appends. Pure data, tested: every level builds a mission for many seeds.
2. **Ship classes** `src/config/ships.ts`: word length → class (patrol, destroyer,
   cruiser, battleship) with a model key. All classes use the `destroyer` model
   scaled to the ship's length for now; remodelling later means changing one
   table row and building the model, nothing else.
3. **Progress** `src/game/progress.ts`: per level best stars and score, plays;
   level n+1 unlocks when n is won; local storage, versioned, tested.
4. **Mission select** on the menu card (a grid of levels with stars and locks),
   opened from the pause menu, the end card ("Next mission", "Retry",
   "Missions") and first load when nothing is saved. "Quick game" keeps the
   old random 10×10 with the tuner's Gameplay knobs.
5. **Saves** carry the level id, so finishing a restored mission still records stars.
6. **Balance bot** `src/tools/bot.ts` plus `npm run balance`: plays every level
   headless with a letter-frequency strategy and prints win rate and torpedoes
   used; a test pins each level's win rate inside a band.

**Slice 2 · Map sizes (goals only):** boards of 8, 12, 15 and 18 cells; the
board, labels, scenery layout and camera rebuild per mission; ship counts and
classes scale; a frame-rate budget per size, measured on the Mac and iPhone
(dev readout shows average fps and draws).

**Slice 3 · Difficulty (goals only):** modifiers beyond counts (fewer radar
reveals, slower battery, diagonals, decoy-heavy tiers), a level ladder of about
20 levels across sizes, tuned with the bot until win rates follow the curve.

**Slice 4 · Progression polish (goals only):** star rules refined from play,
unlockable rewards or modes, mission-select presentation.

**Out:** visual and effects work (phases 2, 3), audio, accounts or cloud saves.

## Reuse vs new

- **Reuse:** engine (`MissionConfig` already carries every knob), `createGame`,
  `restoreGame`, the menu card, local-storage save pattern.
- **New:** catalog, ship table, progress store, mission-select view, bot.

## Build order (slice 1)

1. Level catalog and its test.
2. Ship class table; fleet reads it.
3. Progress store and its test.
4. Controller starts levels from the catalog; saves carry the level; end card records stars.
5. Mission-select menu and the flows into it.
6. Balance bot, `npm run balance`, win-rate test; tune the ladder with it.
7. Push a preview; the user plays the ladder.

## Done when (slice 1)

- `npm test` passes, including catalog, progress and balance tests.
- The ladder can be played from level 1 up, stars and unlocks survive a reload,
  and a restored mission still records its result.
- `npm run balance` shows every level winnable and difficulty rising level to level.
- The user has played several levels on preview.

## Refinement gate

Before slices 2–4, refine each against the repo and the user's play notes and
amend this plan in place (`# Amended: <date> <reason>`).
