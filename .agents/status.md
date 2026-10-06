# Status

## Where things stand

The repo is empty apart from these docs. There's no code yet.

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

- Blender isn't installed yet (see `field-log.md`).
- Node is v20.20.2 and isn't pinned yet; add `.node-version` when scaffolding.
- The dev machine's GPU is an AMD Hawk Point integrated GPU. That's the
  frame-rate baseline: if it holds 60 fps here, mid-range laptops are covered.
