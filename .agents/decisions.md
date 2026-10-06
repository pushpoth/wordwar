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
- **Status:** open
- **Decision:** Build the phase 0 scene on three.js `WebGPURenderer` (TSL
  shaders), which also runs on a WebGL2 backend. Compare both backends on
  quality, frame rate and headless screenshots, then record the winner here.

## 2026-10-06 · Port the engine, rebuild the rendering
- **Status:** active
- **Decision:** Port Typemariner's pure game logic and its tests. Rebuild the
  render layer, effects, HUD and asset pipeline from scratch.
- **Why:** The engine is deterministic, tested and independent of graphics. The
  rendering is the part being reimagined.
