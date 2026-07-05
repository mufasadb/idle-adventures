# Town Screen — Recipe Book + No-Farm Map Choice

**Beads:** `idle-adventure-9u9.1` (recipe book), `idle-adventure-9u9.3` (no seed re-farming), both under epic `idle-adventure-9u9` (playtest follow-ups).

## 1. Problem

Two blind-playtest findings, both on the town screen:

1. **Recipe book (9u9.1) — the #1 playtest blocker (all 3 agents):** the craft menu shows only recipes you can already afford, so locked recipes are invisible and you can't see what to aim for ("I'd never have found the winning combo without engine spelunking"). The tech tree is opaque.
2. **No seed re-farming (9u9.3):** `embark` accepts *any* `mapSeed`, so a driver can re-embark a favourable seed and farm the same map. `legalActions` already only offers the 3 rotating candidates (`townActions`, `sim/legal.ts:30-31`), but the `embark` *reducer* doesn't validate, so anything building its own action bypasses the offer.

## 2. Design

### A. Recipe book (9u9.1) — web-only

Replace the affordable-only Craft list (`townView`, `src/web/main.ts:256-265`) with a full **recipe book**: iterate **all** `RECIPE` entries and render each as `output qty× name` + its ingredient list (`qty× name` per input). **Fully visible** — output and ingredient names *and* quantities, affordable or not. **No source/location** for ingredients (discovering where materials come from stays part of play).

- Affordable recipes (those in the existing `craftable` legal set) keep a working Craft button.
- Locked recipes render greyed/disabled with the same ingredient list.
- **Order:** affordable first, then locked — "what can I make now" on top, "what to aim for" below. Within each group, keep `RECIPE` insertion order (already tech-tier-ish).
- No engine change; `RECIPE` already exists and is covered by `constants`/`craft` tests.

### B. No-farm map choice (9u9.3) — engine + web

**Engine:** `embark` (`src/engine/reduce.ts`) validates the chosen seed is one the town is currently offering:
```
const offered = candidateMaps(state.seed, state.runs ?? 0).map((m) => m.mapSeed);
if (!offered.includes(mapSeed)) return rejected(state, "embark", "not-offered");
```
Add `"not-offered"` to the `RejectionReason` union (`src/engine/types.ts`; closed set, D30). Import `candidateMaps` from `./town` (no cycle: `town` doesn't import `reduce`). This makes the reducer the single source of truth (D29) — `legalActions` already offers only the 3, and now `reduce` enforces it, closing the farm loop for *any* driver.

**Web:** `townView` shows **all 3 candidate maps** (biome headline each) with an Embark button per map, replacing the current `Math.random()` single-pick (`pickMap`, `src/web/main.ts:66-70`). Biome choice becomes the real per-visit lever. Remove the now-dead `chosenMap`/`pickMap` single-map state.

## 3. Components / boundaries

- `candidateMaps(seed, runs)` (`town.ts`) — unchanged; now consumed by the `embark` reducer as well as `legalActions` and the web.
- `embark` reducer — gains one validation guard + one rejection reason.
- `townView` (web) — recipe book render + 3-map offer render. Both are presentation over existing pure data.

## 4. Testing

- **`reduce-embark`:** embarking a **candidate** seed (from `candidateMaps(seed, runs)`) still succeeds and produces the `embarked` event; embarking an **off-offer** seed → rejected `"not-offered"` (costs nothing, no phase change); the valid set **rotates with `runs`** (a seed offered at `runs=0` is rejected at `runs=1` unless it recurs). Update any existing embark tests that use ad-hoc seeds to pull from `candidateMaps`.
- **Recipe book:** pure `townView` UI — manual smoke (all recipes listed, locked ones greyed, ingredient names+qty shown, no source text). No engine test (RECIPE already tested).
- Gates: `bun test` + `bun run typecheck` + `bun run lint`. No snapshot impact (ASCII map render unchanged; town screen isn't snapshotted).

## 5. Out of scope

- Ingredient **source/location** hints (deliberately withheld — discovery stays play; a later cartography/almanac feature could add it).
- Recipe search/filter/categorisation beyond affordable-first ordering.
- Changing `candidateMaps`, `CANDIDATE_MAP_COUNT`, or the rotation model (D32) — only *enforcing* it.
