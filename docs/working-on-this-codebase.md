# Working on this codebase

The standing rules for anyone (human or agent) changing code here. CLAUDE.md's Architecture Overview says what lives where; this file says how to work on it without breaking the things that keep the project honest. Dispatch prompts should cite this file instead of restating it.

## Quality gates

```bash
bun test && bun run typecheck && bun run lint
```

All three green before every commit. Lint enforces the engine-purity boundary (no `render`/`sim`/`web` imports, no `Math.random`/`Date.now`/DOM under `src/engine/**`), double-checked by `test/boundary.test.ts`.

## The non-negotiables

- **Engine purity:** `reduce(state, action) → {state, events}`. Zero RNG in fight math; all generation deterministic in `(mapSeed, biomeId)`. Seeded randomness goes through `rand`/`weightedPick` (sorted keys) with namespaced seed strings.
- **Lever discipline:** no magic numbers in engine logic — every tunable is a named, commented constant in `src/data/constants.ts`, and lands with a `decisions.md` D-row + `balance-levers.md` update.
- **Items are `{defId, qty}`** — no per-instance state, ever. State transitions (freshness, etc.) are defId swaps at run boundaries.
- **Rejected actions return the ORIGINAL state** plus an `action-rejected` event — no mutation leaks from partially-computed candidates.
- **`legalActions` filters candidates through speculative `reduce` (D29)** — never encode legality rules anywhere but the reducer.

## Harness invariants (tune levers, never these tests)

- `test/harness-sustainability.test.ts` passes **UN-EDITED**. If your change reds it, your levers are wrong — adjust them until it greens. Editing the harness to pass is landing a lie.
- Pinned design gates: `test/combat-toll.test.ts` (toll bands; Wyrm = 3 greater-potions win / 2 die; wyrmfang farmability), `test/barrier.test.ts` (walkable-tile connectivity + walkable entry across seeds), `test/roster.test.ts` (type-spread + Wyrm rarity), `test/reach-fraction.test.ts` structural asserts (farthest POI > `MAX_ENERGY`). Their thresholds encode approved design decisions — a red pin means your change broke a decision, not that the test needs "updating."
- `test/balance-tables.test.ts` — the committed docs/balance/ tables must match simTables(); red means a combat-affecting change landed without `bun run sim:tables`. Regenerate and commit the table diff — reading that diff is how a tuning change gets reviewed.

## Test idioms

- **Seed-scan helpers:** to test against a generated map, scan deterministic seeds for the fixture you need (see `mapWith`/`standingOn` in `test/reduce-gather.test.ts`, `monsterMap`/`onMonster` in `test/engagement.test.ts`). When a data change shifts what seeds produce, **widen the scan range or tighten its filter — never weaken an assertion**.
- **Snapshots:** generation/data changes shift snapshots under every seed. Eyeball ONE diff first (shape/identity changes only — the glyph vocabulary and terrain topology should match your change's story), then `bun test -u`. A non-snapshot failure means fix the code, not the test.
- **Premise-breaks:** if a test's premise is invalidated by an approved design change (not just its numbers), rewrite it to assert the new contract meaningfully — and say so in your report. Watch for the vacuous-assertion trap (e.g. `0 >= 0` after both scenarios die).
- **Value updates:** when expected numbers change, show the arithmetic in a comment where it isn't obvious.
- **Slow statistical tests:** the 120-seed generation tests run ~12s at 20×60; per-test timeouts are bumped with an explanatory comment. Follow that pattern if you add seed sweeps.
- **Multi-round combat in drivers:** after any `move`, a walk-in may engage — loop `fight` until the engagement resolves (see the harness hardening in `test/harness-loop.test.ts`).

## Running the game

- **Web:** preview config exists — `.claude/launch.json` has a `web` server (bun-served `src/web/index.html`, port 3457). If the `preview_*` tools are available: `preview_start` → interact → verify via `preview_snapshot`/`preview_inspect`/console logs (known flake: `preview_click` sometimes misses buttons — fall back to `preview_eval` with `document.querySelector(...).click()`). If they're NOT loaded in your harness (they often aren't), the equivalent is `bun --port 3457 ./src/web/index.html &` + the `agent-browser` skill: `agent-browser open` then drive with `agent-browser eval "document.querySelector(...).click(); <read-back-expr>"` — `eval` is more reliable than `click` for this UI. Read state back by evaluating DOM expressions (`.pathbanner`/`.logline` text, `.slot.food` counts).
  - **⚠ STALE-BUNDLE TRAP (bit us twice, 2026-07-09/10 — the single biggest web-verification footgun):** bun's dev server does HMR and the shared `agent-browser` Chrome caches the JS bundle. After you edit files, or across a long session, `agent-browser open "http://localhost:3000/"` can silently serve a **stale bundle** — symptoms are `Cannot read properties of undefined (reading 'includes'/'in')` in `catalog.ts`/`slotOf`, `X is not a function`, or a feature/recipe you just added appearing **absent**. These read as game-breaking bugs but are pure caching. **Always: (1) `pkill -f "src/web/index.html"` and start a fresh server before verifying; (2) append a cache-buster to EVERY load — `agent-browser open "http://localhost:3000/?cb=$RANDOM"`; (3) before trusting a "bug", confirm it in a fresh Node context (`bun -e 'import {slotOf} from "./src/engine/catalog"; console.log(slotOf("berries"))'`) — if the engine is fine, it's a stale bundle, not code.** If you run concurrent web sessions, give each a distinct `--port` (two servers can't share :3000).
- **Headless console:** `bun run playtest` (the blind-playtest surface) and `bun run play` (single-state CLI). Console output is parsed by playtest drivers — **append new lines; never reshape existing ones**.
- State lives in localStorage on the web; "new game" wipes it. Hand-built `GameState` objects in tests are the fastest way to reach a specific situation — mirror the optional-field `??` defaults from `types.ts`.
- **Reaching a hard web state for manual verification** (full bag next to a monster, standing beside a mountain, mid-fight, …) — do NOT play there by hand. Write a throwaway bun script at repo root that builds the exact state with the *pure engine + helpers* you'd use anyway (`newGame`→`reduce({embark})`, then `generateGrid`/`costToReach`/`carryCap`/`freeLootStacks` to find/verify the spot, teleport `expedition.pos`, tweak `carry`/`hp`/`energy`), `writeFileSync` it to JSON, then inject: `agent-browser eval "localStorage.setItem('idle-adv:<seed>', JSON.stringify(<json>)); localStorage.setItem('idle-adv:<seed>:log','[]'); location.reload()"` (SAVE_KEY is `idle-adv:${seed}` from the `?seed=` param; the log key is `${SAVE_KEY}:log`). Assert the engine actually produces the branch you're testing IN the builder (e.g. `reduce(state,{type:'move',to:monster}).events` is `carry-full`) before touching the browser — that separates a driver/messaging bug from an engine one. Clean up the `_*.ts`/`_*.json` scratch files before committing.

## Session conventions (controller-side)

- **SDD scratch files** go under `.superpowers/sdd/<feature>/` (briefs, reports, review packages) — per-feature subdirectories, because bare `task-N-*.md` names collide across features and stale reports mislead reviewers.
- **Beads:** subagents don't touch `bd` — the controller owns claim/close/sync. `.beads/*.jsonl` export churn gets its own `beads:` bookkeeping commit at session close.
- **Docs numbering:** check `docs/decisions.md` for the highest D-row before writing the next one.
- **Parallel worktree agents (2026-07-09/10 lessons):** dispatching two `isolation: "worktree"` agents on independent features works well, but integrate deliberately: (1) **reserve D-numbers up front** — both agents grabbed the same next D-number (D59) since each read the same `main`; when dispatching N doc-writing agents, tell each which D-number to use, or renumber on merge. (2) **`.claude/worktrees/**` is git-ignored + eslint-ignored** — nested worktrees otherwise break `eslint .` ("multiple candidate TSConfigRootDirs") and get staged by `git add -A` as embedded repos. Never `git add -A` while worktrees are live; stage explicit paths. (3) **Merge the smaller/lower-risk feature first**, run the FULL gates on the integrated tree (not just each worktree's own green), then the second — conflicts land in shared surfaces (`types.ts`/`constants.ts`/`web/main.ts`/`playtest.ts`). (4) `git worktree remove --force <path>` + `git branch -D` to clean up after merging.
