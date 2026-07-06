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

## Test idioms

- **Seed-scan helpers:** to test against a generated map, scan deterministic seeds for the fixture you need (see `mapWith`/`standingOn` in `test/reduce-gather.test.ts`, `monsterMap`/`onMonster` in `test/engagement.test.ts`). When a data change shifts what seeds produce, **widen the scan range or tighten its filter — never weaken an assertion**.
- **Snapshots:** generation/data changes shift snapshots under every seed. Eyeball ONE diff first (shape/identity changes only — the glyph vocabulary and terrain topology should match your change's story), then `bun test -u`. A non-snapshot failure means fix the code, not the test.
- **Premise-breaks:** if a test's premise is invalidated by an approved design change (not just its numbers), rewrite it to assert the new contract meaningfully — and say so in your report. Watch for the vacuous-assertion trap (e.g. `0 >= 0` after both scenarios die).
- **Value updates:** when expected numbers change, show the arithmetic in a comment where it isn't obvious.
- **Slow statistical tests:** the 120-seed generation tests run ~12s at 20×60; per-test timeouts are bumped with an explanatory comment. Follow that pattern if you add seed sweeps.
- **Multi-round combat in drivers:** after any `move`, a walk-in may engage — loop `fight` until the engagement resolves (see the harness hardening in `test/harness-loop.test.ts`).

## Running the game

- **Web:** preview config exists — `.claude/launch.json` has a `web` server (bun-served `src/web/index.html`, port 3457). Use the `preview_*` tools: `preview_start` → interact → verify via `preview_snapshot`/`preview_inspect`/console logs. Known flake: `preview_click` sometimes misses buttons — fall back to `preview_eval` with `document.querySelector(...).click()`; that's an equivalent interaction.
- **Headless console:** `bun run playtest` (the blind-playtest surface) and `bun run play` (single-state CLI). Console output is parsed by playtest drivers — **append new lines; never reshape existing ones**.
- State lives in localStorage on the web; "new game" wipes it. Hand-built `GameState` objects in tests are the fastest way to reach a specific situation — mirror the optional-field `??` defaults from `types.ts`.

## Session conventions (controller-side)

- **SDD scratch files** go under `.superpowers/sdd/<feature>/` (briefs, reports, review packages) — per-feature subdirectories, because bare `task-N-*.md` names collide across features and stale reports mislead reviewers.
- **Beads:** subagents don't touch `bd` — the controller owns claim/close/sync. `.beads/*.jsonl` export churn gets its own `beads:` bookkeeping commit at session close.
- **Docs numbering:** check `docs/decisions.md` for the highest D-row before writing the next one.
