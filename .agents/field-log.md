# Field log

Append-only. One entry per surprise. Append when:
- a documented command didn't behave as documented
- a generator or build script produced something broken
- you needed a fact that isn't written down anywhere
- you worked around something instead of fixing it

Format: `## date · short title` then **status** (open / fixed / wontfix), what
happened, and what to do about it.

## 2026-10-06 · Blender isn't installed on the dev machine
- **Status:** open
- Phase 0 needs Blender for headless asset builds (`blender --background --python`).
  Install it before starting the asset tasks, and pin the version in `status.md`.
