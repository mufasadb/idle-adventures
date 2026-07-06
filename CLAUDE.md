# Project Instructions for AI Agents

This file provides instructions and context for AI coding agents working on this project.

## This project — Idle Adventure (POC)

A turn-based exploration RPG built as a "logistics puzzle on a grid": pack a loadout, drop onto a procedural 20×20 map, make routing/gather/fight/turn-back calls under an **energy + HP budget**, return, craft upgrades, go again. The POC validates exactly one thing — **is that loop fun?**

**Read first (in `docs/`):**
- `superpowers/specs/2026-06-30-idle-adventure-poc-core-loop-design.md` — the design (what + why), including the engine contract.
- `superpowers/plans/2026-06-30-poc-core-loop-plan.md` — milestone plan M0→M7.
- `decisions.md` — decision history (D1–D19, with rationale).
- `balance-levers.md` — every tunable is a named lever; tuning happens here.
- Full vision/notes: the user's Obsidian vault, `Project Ideas/idle adventures/`.

**Non-negotiables:**
- Engine is pure: `reduce(state, action) → {state, events}`, seed in state, no DOM / `Math.random` / `Date.now`, no imports from `render`/`sim`/`web` (lint-enforced).
- Items are `{defId, qty}` referencing a code-side catalog; no per-instance item state.
- No magic numbers in engine logic — read levers from `src/data/`.

Work is tracked in **beads** — run `bd ready` for the next unblocked task before writing code.

## Git & Sync Policy (ACTIVE — overrides the beads block below)

The user has granted standing push authority and wants the remote kept current (set 2026-07-06). This **overrides** the "Conservative (default)" profile in the Beads Integration block — treat the repo as **Team-maintainer**:

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

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

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

Toolchain settled in **D20**: **bun** (package manager + runtime), **`bun test`** (native runner, jest-compatible snapshots), **ESLint flat config** for the engine-purity boundary. These scripts are established by **M0** (`idle-adventure-868.1`); they won't exist until M0 lands.

```bash
bun install        # install deps
bun test           # run the test suite (native runner)
bun run typecheck  # tsc --noEmit
bun run lint       # eslint . — enforces the engine-purity boundary
```

The engine-purity boundary (no `render`/`sim`/`web` imports, no `Math.random`/`Date.now`/DOM under `src/engine/**`) is lint-enforced and verified by `test/boundary.test.ts` via the ESLint Node API.

## Architecture Overview

One pure engine, three thin surfaces. The reducer is the single source of truth for every rule; UI and sim never decide legality themselves.

**`src/engine/`** (pure — lint-enforced boundary):
- `types.ts` — the contract: `GameState`/`Expedition`/`Engagement`, `Action`, `GameEvent`, `RejectionReason` (closed unions; adding an Action without a reducer case is a compile error).
- `reduce.ts` — the reducer. All rules live here. A rejected action returns the ORIGINAL state plus an `action-rejected` event.
- `grid.ts` — deterministic map generation: base Perlin terrain + low-frequency barrier layer, connectivity carve (all walkable tiles = one component), south-edge entry (must be walkable), POI rejection-sampling on walkable tiles with value-vs-reach pairing. Memoized per `(mapSeed, biomeId)`.
- `noise.ts` / `rng.ts` — seeded primitives: `perlin2`, `rand` (stateless hash — namespace seeds like `` `${seed}:barrier` ``), `weightedPick` (always over sorted keys for determinism).
- `reach.ts` — `costToReach` (Dijkstra) + `reachableTiles` (flood); honours gear/transport via `moveCost`.
- `move.ts` — `moveCost` = absolute terrain cost − gear discounts (floor `MIN_STEP`) ÷ per-terrain transport multiplier; mountain is ∞ unless enabled.
- `combat.ts` — pure fight math: `playerDamage` (weapon × matrix × affinity), `damageTaken` (% mitigation `K/(K+D)`), `strikeExchange` (one round), `resolveCombat` (atomic loop over exchanges), `rollLoot` (seeded), `explainMatchup`.
- `carry.ts` — all slot accounting: `carryCap`, `consumableSlots`, `freeLootStacks`, `usedSlots`, `addToCarry`. Consumables/tools = 1 slot per unit; only loot stacks (`STACK_CAP`).
- `food.ts` — stamina refills: `eatToRefill` eats whole units off the FRONT, waste-free (fresh forage inserts at the front so it's eaten before rations).
- `pack.ts` — town-side loadout planning validated against `bank − reservations`; bank debits only at embark.
- `bank.ts` — run-end banking (`endExpedition`, shared by return + combat soft-fail); applies `FRESH_TO_STALE` defId transforms.
- `craft.ts` / `catalog.ts` (`slotOf` derives slots from the catalog lists) / `town.ts` (`newGame`, `candidateMaps`, `previewHints`) / `loadout.ts`.

**`src/data/constants.ts`** — every lever and catalog. The only file where numbers live.

**`src/sim/`** — `legal.ts` (candidate actions filtered through speculative `reduce` — D29: legality can never drift), `playtest.ts` + `cli.ts` (the headless console; the blind-playtest surface — append to its output, never reshape existing lines).

**`src/web/`** — `main.ts` (the whole UI: string templates re-rendered from state on every action, one generic `data-act` click delegation in `wire()`) + `index.html` (all CSS).

## Conventions & Patterns

- Grids are `[y][x]`; `x ∈ [0, MAP_WIDTH)`, `y ∈ [0, MAP_HEIGHT)` (20×60 portrait strip).
- Optional `Expedition`/`GameState` fields exist for old saves + terse test states — always read with the documented `??` default (`autoEat ?? true`, `maps ?? []`, …). New optional fields follow this pattern and document their default in `types.ts`.
- `GameEvent` is a closed union and the web `fmt()` switch is exhaustive — adding an event without a log line breaks typecheck (by design).
- Every lever change lands with its docs: a `decisions.md` D-row (dense single-row style, cite the spec) and a `balance-levers.md` update. Check the highest D-number before writing.
- Deeper working rules (gates, test idioms, harness invariants, browser verification): **`docs/working-on-this-codebase.md`** — hand this to any subagent touching code.
- Beads export churn (`.beads/*.jsonl`) gets a `beads:` bookkeeping commit at session close — don't leave it dirty, don't fold it into feature commits.
