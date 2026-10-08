# Field log

Append-only. One entry per surprise. Append when:
- a documented command didn't behave as documented
- a generator or build script produced something broken
- you needed a fact that isn't written down anywhere
- you worked around something instead of fixing it

Format: `## date · short title` then **status** (open / fixed / wontfix), what
happened, and what to do about it.

## 2026-10-06 · Blender isn't installed on the dev machine
- **Status:** fixed (user installed 5.2.2 LTS with snap)
- Phase 0 needs Blender for headless asset builds (`blender --background --python`).
  Install it before starting the asset tasks, and pin the version in `status.md`.

## 2026-10-06 · npm install of several dev packages at once crashed
- **Status:** wontfix (worked around)
- `npm i -D vite typescript vitest @types/three @types/node@20` failed with
  `Cannot read properties of null (reading 'edgesOut')`. Installing the same
  packages one at a time worked.

## 2026-10-06 · Vercel previews can't be pushed without a CLI login
- **Status:** fixed (user ran `npx vercel login`; repo linked with `vercel link --project wordwar --scope pushpoth`)
- The Vercel connector can create projects but only deploys files sent inline,
  which can't carry a 1 MB bundle. The CLI (`vercel`, a dev dependency) needs
  `npx vercel login` once; `gh` auth is also invalid, so Git-based deploys are out too.

## 2026-10-06 · A headless screenshot run was killed (exit 137)
- **Status:** open
- The third of three back-to-back `npm run screenshot` runs died with SIGKILL.
  Single runs since have been fine. If it recurs, check memory and lower `--w/--h`.

## 2026-10-06 · The first Vercel deploy went to production, not preview
- **Status:** wontfix (Vercel behaviour)
- A project's first deployment is always assigned to production, so
  `npm run deploy:preview` published to https://wordwar-pi.vercel.app. Later
  runs create protected preview URLs (they need a Vercel login to view); the
  production alias stays public.

## 2026-10-06 · First explosion stalled to ~12 fps on Safari and Firefox
- **Status:** fixed
- The first kill loaded and parsed the wreck model, created new materials and
  compiled their shaders mid-frame. Fix: preload every mission model, keep one
  of each (and the explosions at a live age) in the scene below the sea for
  `renderer.compileAsync`, then remove them. Also never add or hide lights at
  runtime: the explosion flash lights stay in the scene at intensity 0, because
  changing the light count recompiles every lit shader.

## 2026-10-06 · Game tab used ~1.1 GB and ~30% CPU with fans running
- **Status:** fixed, needs re-measuring by the user
- Causes: rendering at full Retina pixel ratio (4× pixels in every post
  buffer); ~370 draw calls from one draw per material; ~1,200 idle explosion
  sprites drawn every frame; an ocean mesh twice the visible size; no frame cap
  on high-refresh screens. Fixes: resolution capped at 1.25× and adapted to
  frame rate (`?dpr=` pins it), models merged to one draw per node with a
  shared vertex-attribute material (343 → 117 draws in the demo scene), idle
  explosions hidden, ocean 140→90 cells and 360→256 segments, 60 fps cap (`?fps=`).

## 2026-10-08 · Headless captures restarted mid-run after an edit
- **Status:** worked around
- With `npm run dev` running, a capture started a few seconds after editing a source file sometimes reloaded part
  way through (Vite's full reload landing late). With the URL's `?level=` already used up, the reload showed the
  title, which looked like a boot bug. Wait for the reload before capturing, or capture against a build.
- Also: the chrome-devtools MCP can't start here (no Chrome at `/opt/google/chrome`); captures use the bundled
  `@sparticuz/chromium` as `npm run screenshot` does. In dev, `window.__ww.time` gives scene time and
  `window.__ww.hold(true|false)` freezes it, so a script can shoot a moment of a sequence exactly.
