# Project Instructions for AI Agents

## This project — Idle Adventure (POC)

A turn-based exploration RPG built as a "logistics puzzle on a grid": pack a loadout, drop onto a procedural 35×35 map (D84: square, entry at the centre), make routing/gather/fight calls to **extract as much value as you can before fatigue forces you home** (return is free — the tension is depth-vs-haul under an **energy + HP budget**, not turn-back timing; see D62), craft upgrades, go again. The POC validates exactly one thing — **is that loop fun?**

**Read first (in `docs/`):**
- `superpowers/specs/2026-06-30-idle-adventure-poc-core-loop-design.md` — the design (what + why), including the engine contract.
- `superpowers/plans/2026-06-30-poc-core-loop-plan.md` — milestone plan M0→M7 (finished plans/playtests: `archive/`).
- `superpowers/specs/2026-07-31-breadth-charter-biomes-verticals.md` — **the current roadmap**: biomes × verticals ordered into buildable sets (epic `si7.6`).
- `decisions.md` — decision history (with rationale — check the highest D-number before adding one).
- `balance-levers.md` — every tunable is a named lever; tuning happens here.
- Full vision/notes: the user's Obsidian vault, `Project Ideas/idle adventures/`.

**Non-negotiables:**
- Engine is pure: `reduce(state, action) → {state, events}`, seed in state, no DOM / `Math.random` / `Date.now`, no imports from `render`/`sim`/`web` (lint-enforced).
- Items are `{defId, qty}` referencing a code-side catalog; no per-instance item state.
- No magic numbers in engine logic — read levers from `src/data/`.

Work is tracked in **beads** — run `bd ready` for the next unblocked task before writing code.

## Git & Sync Policy (ACTIVE — overrides the beads block below)

Standing push authority (user, 2026-07-06) — this **overrides** the "Conservative (default)" profile in the beads block below; treat the repo as **Team-maintainer**:

- **Keep git and Dolt up to date.** After landing a coherent unit of work (a feature/fix merged to `main`, or closed beads), commit, `git push`, and `bd dolt push` without asking.
- You **have permission to push** — do not stop and ask for a landing decision each time. Push `main` and sync beads as part of normal session close.
- Still hold to good hygiene: run the quality gates (`bun test` + `bun run typecheck` + `bun run lint`) green before pushing; write clear commit messages; branch for risky/large work and merge when green.
- A later explicit "don't push" / "hold off" from the user overrides this for that request.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:6cd5cc61 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote (`bd dolt push`/`pull`). There is no JSONL export in this repo (`export.auto: false`), and the only tracked `.beads/` files are `README.md`, `.gitignore`, `hooks/*`, `identity.toml`, `config.yaml` and `metadata.json` (shared settings; gc may add machine-local keys to `config.yaml` — don't commit those). See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->


## Build & Test

bun (runtime + package manager), `bun test`, ESLint flat config (D20).

```bash
bun install        # install deps
bun test           # run the test suite (native runner)
bun run typecheck  # tsc --noEmit
bun run lint       # eslint . — enforces the engine-purity boundary
```

The engine-purity boundary is lint-enforced and checked by `test/boundary.test.ts`.

## Architecture (full module map: `docs/architecture.md`)

One pure engine (`src/engine/`), one shared presentation layer (`src/render/render.ts`), two thin surfaces (web `src/web/`, headless console `src/sim/`). The reducer is the single source of truth; surfaces never decide legality.

- `reduce.ts` is the dispatch switch only (exhaustive, `assertNever`). To add an action: a case there + a handler in `reduce-town|expedition|combat.ts`. Rejections return the ORIGINAL state + an `action-rejected` event (`rejected()` in `reduce-shared.ts`). Import chain: `shared ← combat ← expedition ← town ← reduce`.
- `src/data/` holds every number; import from `constants.ts` (it re-exports `combat.ts`/`crafting.ts`/`spec.ts`).
- Randomness is `rand(seed, …namespace)` (stateless) and `weightedPick` over SORTED keys; a new generation roll gets its own namespace so existing maps don't shift.
- Presentation both surfaces need lives in `render.ts` (`formatEvent` is the one exhaustive `GameEvent` → text switch). For "why can't I?", use `whyNot(state, action)` (`sim/legal.ts`) → `rejectCopy` — never re-derive from the catalog.
- The console (`sim/playtest.ts`) is the blind-playtest surface: append new lines, never reshape existing ones.
- **Web verification:** read `docs/working-on-this-codebase.md` first; always start a FRESH server and add `?cb=$RANDOM` to every `agent-browser open` (a stale bundle looks like a game-breaking bug).
- **Art:** separate repo `../idle-adventure-assets`; `bun run refresh` there copies approved atlases into `src/web/assets/`, then commit them here. A defId with no frame falls back to its glyph — a creature never borrows another's sprite. The user picks every asset from rendered sheets before it ships.

## Conventions & Patterns

- Grids are `[y][x]`; `x ∈ [0, MAP_WIDTH)`, `y ∈ [0, MAP_HEIGHT)` (35×35 square since D84).
- Optional `Expedition`/`GameState` fields exist for old saves + terse test states — always read with the documented `??` default (`autoQuaff ?? true`, `autoGather ?? true`, `maps ?? []`, …). New optional fields follow this pattern and document their default in `types.ts`.
- `GameEvent` is a closed union and `formatEvent` (render.ts) is exhaustive — adding an event without a log line breaks typecheck (by design).
- The web UI is landscape-phone-first (map fills the screen, everything else in the drawer/sidebar); check layout changes at ~844×390 as well as desktop. The user picks visual directions from mockups before a UI build.
- A map's biome is frozen when it's minted/offered (`MapItem.biomeId` → `Expedition.biomeId`, D93) — never re-derive a held map's identity from its seed.
- Every lever change lands with its docs: a `decisions.md` D-row (dense single-row style, cite the spec) and a `balance-levers.md` update. Check the highest D-number before writing.
- Deeper working rules (gates, test idioms, harness invariants, browser verification): **`docs/working-on-this-codebase.md`** — hand this to any subagent touching code.
- Beads state lives in Dolt and syncs via `bd dolt push` — nothing under `.beads/` should churn in git (machine-local files are ignored). If a tracked `.beads/` file (hooks, `identity.toml`) does change, commit it on its own, not folded into a feature commit.
