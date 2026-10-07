# Decisions ledger

Append-only. Close an entry by changing its status; never delete one.

## 2026-10-06 · Rebrand to Word War with realistic, dramatic visuals
- **Status:** active
- **Decision:** Word War fully reimagines the visuals toward
  `references/visual-target.png`: realistic water, warm cinematic light, a
  miniature-diorama look, and heavy combat effects. Every Typemariner art
  direction (toon shading, "dark world, bright objects", floating toys) is discarded.
- **Why:** The visual overhaul and the rebrand are the main reasons for the redo.

## 2026-10-06 · Keep the floating word billboard
- **Status:** active
- **Decision:** Words appear on a camera-facing billboard above the target
  ship, not painted on ship decks as the reference image shows.
- **Why:** In Typemariner the billboard read better than deck lettering.

## 2026-10-06 · Build every 3D asset from scratch, split by tool
- **Status:** active
- **Decision:** No bought asset packs, model store, swappable-model system or
  in-app model editor. Every asset is authored in this repo:
  - **Blender (Python scripts, headless) → `.glb`** for authored objects:
    ships, the submarine, islands, the lighthouse, buoys and harbour props.
  - **Three.js at runtime** for everything procedural or animated: the ocean,
    sky and lighting, the board grid, word billboards, particle effects, and
    scattering scenery by map size.
- **Why:** Bought packs didn't match each other in Typemariner. Shapes built in
  code (CSG primitives) topped out well below the target quality. Blender gives
  bevels, modifiers, UV unwrapping, baked normal and AO maps, and LODs, all
  scriptable so the agent can build and rebuild assets reproducibly.

## 2026-10-06 · Renderer choice deferred to the phase 0 test scene
- **Status:** closed by the next entry
- **Decision:** Build the phase 0 scene on three.js `WebGPURenderer` (TSL
  shaders), which also runs on a WebGL2 backend. Compare both backends on
  quality, frame rate and headless screenshots, then record the winner here.

## 2026-10-06 · Port the engine, rebuild the rendering
- **Status:** active
- **Decision:** Port Typemariner's pure game logic and its tests. Rebuild the
  render layer, effects, HUD and asset pipeline from scratch.
- **Why:** The engine is deterministic, tested and independent of graphics. The
  rendering is the part being reimagined.

## 2026-10-06 · WebGPU is the renderer; WebGL 2 stays as the fallback
- **Status:** active
- **Decision:** Ship on `WebGPURenderer` with its WebGPU backend; keep the
  WebGL 2 backend only for browsers without WebGPU and for headless screenshots.
- **Why:** Measured by the user on the dev machine (AMD Hawk Point iGPU), same
  scene (343 draws, 381k triangles): WebGPU held about 56 fps; WebGL 2
  averaged about 25 fps, peaking near 50. The look was the same; models
  jittered slightly. 56 fps is still under the 60 fps target, so draw calls
  (many multi-material meshes) are the first optimisation to make.

## 2026-10-06 · Radar-revealed letters are hints; only torpedo hits count
- **Status:** active
- **Decision:** Keep Typemariner's rule that a ship sinks only when every
  letter has been torpedoed. Letters the radar uncovered show as amber stencil
  hints on the billboard, the board and the HUD, apart from painted, confirmed hits.
- **Why:** Showing radar letters like hits made a word look complete while the
  ship stayed afloat (seen on seed 4242, OFFSHORE). Changing the rule would
  rebalance every mission; changing the display costs nothing.

## 2026-10-06 · Models render through one shared material
- **Status:** active
- **Decision:** At load, each model node's parts merge into one mesh; colour,
  roughness, metalness, glow and wear become vertex attributes read by one
  `MeshStandardNodeMaterial`. Blender scripts keep using named flat materials.
- **Why:** Draw calls (one per material, doubled by shadows) were the main CPU
  cost. It rules out per-material textures; if a model ever needs a texture,
  give that node its own material instead of the shared one.

## 2026-10-06 · Space pauses; letters stay game input
- **Status:** active
- **Decision:** Pause is Space, the ❚❚ HUD button, or the tab hiding. Typemariner-style
  single-letter shortcuts are out: every letter is a radar or torpedo key.
- **Why:** A letter shortcut would fire a ping or a torpedo by accident.

## 2026-10-06 · Saves are a seed plus an action log
- **Status:** active
- **Decision:** Progress is saved as the seed, mission config and the list of
  player actions stamped with the mission clock; load replays them through the
  engine. Cheats (refills) aren't logged, so a cheated mission may restore differently.
- **Why:** The engine is deterministic, so this is tiny and exact, and it needs
  no serialisation of engine state that could drift as the engine changes.

## 2026-10-07 · Roadmap renumbered: phase 1 is the playable mission, phase 2 is visual tuning
- **Status:** active
- **Decision:** Old phases 1 (engine port) and 2 (playable) are merged into phase 1,
  which also takes the full HUD and touch input (slice 3). Phase 2 is now visual
  tuning (the phase 0 open items). Sonar-ping and torpedo-run effects move to
  phase 3 (Feel). Phases 3–6 keep their numbers so existing references hold.
- **Why:** The roadmap table had drifted from the plan actually being worked, and the
  user wants gameplay finished before visual polish.
