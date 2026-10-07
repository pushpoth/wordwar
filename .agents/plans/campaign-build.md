# Campaign build · phases 4–6

## Intent

Turn the single 10×10 mission into a campaign the player can progress through:
a ladder of levels that grows in map size, fleet and pressure, with stars,
unlocks and saved progress, balanced by a simulation bot and held to a
frame-rate budget per map size. Goal: the whole game can be played and judged
end to end before visuals and effects are tuned (phases 2 and 3).

## Scope

**Slice 1 · Ladder and progress ✅ built:**
1. **Level catalog** `src/config/campaign.ts`: ordered levels (id, name, grid
   size, unit count, torpedo budget, battery regen, diagonals, word tier
   weights, star targets as shares of the torpedo budget). Slice 1 holds only 10×10 levels; each later slice
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
5. **Saves** need no new field: the mission config's id is the level id (0 is the quick game), so finishing a restored mission still records stars.
6. **Balance bot** `src/tools/bot.ts` plus `npm run balance`: plays every level
   headless with a letter-frequency strategy and prints win rate and torpedoes
   used; a test pins each level's win rate inside a band.

**Slice 2 · Map sizes ✅ built 2026-10-07 (waiting on the user's play):** the ladder
now climbs from 8×8 (levels 1–2) through 10×10, 12×12 and 15×15 to 18×18 (levels
9–10), ten levels with two to seven ships. The board resizes per mission: one
20×20 state texture reused at every size, labels rebuilt, scenery stretched
with the board (two more islands and three more buoys from 13×13 up), the
shadow frustum and camera distance scaled (smaller boards come closer so cells
get bigger), the radar ring's speed scaled. Radar reveals per ping come from
`RADAR_REVEALS_BY_GRID` (8×8 added: 3). The dev readout shows the board size and
average and minimum fps over 10 s, for the per-size frame-rate budget: the user
measures each size on the Mac and iPhone and reports.

**Slice 3 · Difficulty (goals only):** modifiers beyond counts (fewer radar
reveals, slower battery, diagonals, decoy-heavy tiers), a level ladder of about
20 levels across sizes, tuned with the bot until win rates follow the curve.

**Slice 4 · Progression polish (goals only):** star rules refined from play,
unlockable rewards or modes, mission-select presentation.

**Out:** visual and effects work (phases 2, 3), audio, accounts or cloud saves.

## Reuse vs new

- **Reuse:** engine (`MissionConfig` already carries every knob), `createGame`,
  `restoreGame`, the menu card, local-storage save pattern.
- **New:** catalog, ship table, progress store, mission-select view, bot; resizable board, labels and scenery.

## Build order (slice 1)

1. ✅ Level catalog and its test.
2. ✅ Ship class table; fleet reads it.
3. ✅ Progress store and its test.
4. ✅ Controller starts levels from the catalog; end card records stars.
5. ✅ Mission-select menu and the flows into it.
6. ✅ Balance bot, `npm run balance` (`-- --fit` suggests budgets), win-rate test.
7. Push a preview; the user plays the ladder and reports how hard each level feels.

## Done when (slice 1)

- `npm test` passes, including catalog, progress and balance tests.
- The ladder can be played from level 1 up, stars and unlocks survive a reload,
  and a restored mission still records its result.
- `npm run balance` shows every level winnable and difficulty rising level to level.
- The user has played several levels on preview.

# Amended: 2026-10-08 slice 2 built; ladder regraded to ten levels across five board sizes (the user's point: two ships on a big board are hard to find, so levels 1–2 are 8×8 with slightly longer words); bot budgets refitted.
# Amended: 2026-10-07 stars come from torpedoes used (accuracy can top 100% because one torpedo can hit several tiles); level 8 drops tier-5 words (they don't always fit six ships on 10×10).

## Refinement gate

Before slices 2–4, refine each against the repo and the user's play notes and
amend this plan in place (`# Amended: <date> <reason>`).
