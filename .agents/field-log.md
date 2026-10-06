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
- **Status:** open
- The Vercel connector can create projects but only deploys files sent inline,
  which can't carry a 1 MB bundle. The CLI (`vercel`, a dev dependency) needs
  `npx vercel login` once; `gh` auth is also invalid, so Git-based deploys are out too.

## 2026-10-06 · A headless screenshot run was killed (exit 137)
- **Status:** open
- The third of three back-to-back `npm run screenshot` runs died with SIGKILL.
  Single runs since have been fine. If it recurs, check memory and lower `--w/--h`.
