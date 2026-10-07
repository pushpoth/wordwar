# Word War — agent router

Word War is a browser-based naval word game: sweep a grid with radar to find
hidden enemy ships, then type each ship's word to torpedo it. It is a full
reimagining of the earlier Typemariner project (`../typemariner`), rebranded,
with realistic, dramatic 3D graphics as the headline objective.

## Read in this order

| Doc | Owns | Read when |
|---|---|---|
| [`.agents/status.md`](.agents/status.md) | What's built, what's open, what's next, gotchas | Every session, first |
| [`.agents/plans/`](.agents/plans/) | The one active plan | You're working through it |
| [`.agents/decisions.md`](.agents/decisions.md) | Judgment calls and why (append-only ledger) | Before re-arguing a choice |
| [`.agents/field-log.md`](.agents/field-log.md) | Tooling surprises and workarounds (append-only ledger) | Grep it when a command misbehaves |
| [`.agents/references/visual-target.png`](.agents/references/visual-target.png) | The art-direction target image | Any visual work |

## Relationship to Typemariner

- **Port, don't copy blindly:** the pure game logic (`../typemariner/src/engine/`)
  and its tests come across. Read it there; don't read its `.agents/` docs.
- **Its visual direction is void.** Ignore Typemariner's visual aids, toon
  pillars, model editor, model store, and visual tuner. Word War's look is
  defined only by the reference image and `decisions.md`.
- **The floating word billboard stays** as the way words appear above ships.
  Enemy ships don't carry words on their decks, even though the reference image shows that.

## Conventions

- TypeScript strict, vanilla TS (no UI framework), Three.js, Vite, Vitest.
- `src/engine/` is pure logic: no DOM, no Three.js, deterministic from a seed.
- All randomness goes through the seeded RNG; all tuning numbers live in `src/config/`.
- Tunable values are declared once in `src/config/tunables.ts` (`KNOBS`), with
  a phone-tier default where it differs. Read them with `tune.get`, react with
  `tune.on`. The user tunes in the browser with `?tune` (always on in `npm run
  dev`) and pastes "Copy changes" output into chat; make those the new defaults
  in `KNOBS`, not as one-off overrides elsewhere.
- 3D assets are built from scratch by scripts in this repo (see `decisions.md`).
  Never hand-edit a generated `.glb`; change its script and rebuild.

## Finishing a session

Push the work branch (never `main`) after each change so Vercel builds a preview.

Update `status.md` if anything changed. Append to `field-log.md` when a
command or tool misbehaved, or you worked around something. Append to
`decisions.md` for any judgment someone could have made differently. Advance
or archive the active plan (finished plans move to `.agents/_archive/`).
