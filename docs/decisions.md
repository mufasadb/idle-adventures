# Decision History

Repo-local decision log. Mirrors the Obsidian vault `Project Ideas/idle adventures/Decisions & Open Questions` and extends it with the POC-contract decisions made on 2026-06-30. Purpose: stop re-deriving *why* from prose.

## Pre-POC (2026-06-29, from the vault)

| # | Decision | Why |
|---|----------|-----|
| D1 | All-TypeScript (engine, web, server) | One rulebook shared by client + server + tests; no two-language drift |
| D2 | Pure engine `reduce(state, action, seed)` | Programmatic testing, LLM-driven play, cross-platform, anti-cheat from one codebase |
| D3 | Programmatic / LLM-playable is a first-class goal | Test changes without driving the UI |
| D4 | Thin, optional server | Don't block the core loop on a round-trip |
| D5 | PWA-first | Build something cool first |
| D6 | Rendering is a decoupled thin layer (Canvas2D default) | Renderer swap is low-stakes because the engine is pure |
| D7 | Simulation owns time, React owns chrome | React's batching model is wrong for real-time |

## POC contract (2026-06-30)

| # | Decision | Why / note |
|---|----------|-----------|
| D8 | POC = stripped vertical slice answering one question (is the loop fun) | Validate fun in days, not months; everything non-essential deferred not cancelled |
| D9 | Crafting is the **only** source of gear (no shop, no found loot) | Materials make the haul *legible* — you care about specific drops; gold launders that away |
| D10 | Crafting is direct & instant; no skills / processing chains / craft-time in POC | Those only matter once idle/skill systems exist (cut for POC) |
| D11 | Combat is **deterministic** (no minigame): `resolveCombat(loadout, monster, seed)` | Resolves vault Q1 *for the POC* (option a). Prep, not twitch, decides outcomes. Two tiers: visible dmg×armour matrix + hidden affinities. Spyglass = packable information |
| D12 | Per-piece armour (helmet/chest/legs/boots/gloves); tools are a collection | Player defense = `Σ piece.defense × matrix[dmgType][piece.armourType]` → mixed armour is a real trade-off. Pick & spyglass are tools |
| D13 | Items are `defId` references to a code-side catalog; no per-instance state in POC | Tiny replayable state; one-line balance changes. Coatings = distinct defIds. Maps are the future exception |
| D14 | `GameState` holds only the present; `reduce → {state, events}`; action list lives in the driver; seed lives in state | Pure reducer; events are a render byproduct; seed+actions reconstruct everything (replay/tests/AI) |
| D15 | Action cost is an **output** of reduction, not uniform; two budgets: energy (move/gather) + HP (combat) | "How far can I get" falls out of packed energy vs cost the map extracts given gear |
| D16 | Map entry: town offers 3 seeded candidate maps w/ rough previews (hints, hidden layout); pick → pack → embark; full grid on arrival (no fog v1) | Gives the read-forecast → pack-to-match → commit decision loop cheaply |
| D17 | Tech: all-TS, single flat-but-disciplined package (folders mirror future `packages/`), engine purity enforced by lint; Vite + Vitest; HTML/CSS grid; both drivers over one `reduce` | Boundaries (not package splits) are what help longevity + LLM traversal; monorepo tax doesn't pay off yet |
| D18 | Every tunable is a named, documented lever in `src/data/`; no magic numbers | Feel-pass values now, principled tuning later. See `balance-levers.md` |
| D19 | Work tracked as beads in-repo; plan/spec/decisions in `docs/` | Future Claude boots with `bd ready` + these docs |
| D20 | Tooling: **bun** (package manager + runtime) + **`bun test`** (native runner); **ESLint flat config** for the engine-purity boundary | pnpm absent on the machine, bun already installed + fast. Native `bun test` gives jest-compatible snapshots with zero extra deps. Supersedes the spec's "Vitest"/`pnpm` wording for the POC; the boundary discipline (D17) is unchanged. M0 plan: `docs/superpowers/plans/2026-06-30-m0-skeleton-guardrails.md` |

## Still open

- ~~**Q4 (vault):** salvage vs rebuild the old prototype — blocked on locating the source (not on this machine).~~ **Resolved 2026-07-02 (clean rebuild):** source located at `github.com/mufasadb/idle-adventures` (HTML/frontend+backend prototype, town-screen mockups, design docs). Decided to rebuild fresh, salvaging nothing. That repo is now reused as the POC's remote: all old branches, tags, and history were deleted and `main` reset to the POC skeleton. The old prototype code and design docs are **not retained** — the design intent lives on in `spec`, `decisions.md`, and the vault. Old commit SHAs may be briefly recoverable via GitHub's API/reflog until GC, but treat the prototype as gone.
- **Art direction / renderer upgrade path** (vault Q2/Q3): POC uses a rudimentary HTML grid; full art direction unpinned.
- **Real-time / minigame combat layer:** D11 settles combat *for the POC* as deterministic; a real-time minigame remains a possible optional later layer feeding the same resolution function.
