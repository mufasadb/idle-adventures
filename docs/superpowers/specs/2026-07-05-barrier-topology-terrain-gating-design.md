# Phase 3 — Barrier Topology & Terrain-Gating Gear

**Milestone:** M7 "Making the decisions real" (epic `idle-adventure-dub`), Phase 3.
**Beads:** `idle-adventure-b91` (barrier topology), `idle-adventure-boo` (terrain-gating gear), `idle-adventure-9h7` (spyglass what-if — DEFERRED).
**Supersedes/extends:** design spec §4.5 (`docs/superpowers/specs/2026-07-05-decisions-and-goal-design.md`).

## 1. Problem

Sim + playtest established: raising terrain *cost* alone does nothing to routing — the path-planner (A* in the web UI) simply routes around expensive tiles, and mountains (`Infinity`) just wedge naive routes. What bites is **topology**: a prize walled off behind a band of impassable/expensive terrain forces a real path decision — go around (spend energy), or bring gear that opens the route (spend a loadout slot). Phase 3 makes the *map* drive the loadout/routing decision, and makes crafted gear *unlock routes*.

## 2. Design goals

- High-value POIs sit behind terrain barriers so "how do I reach that?" is a live call.
- Crafted gear (climbing-pick, raft) opens/cheapens gated terrain — gear unlocks the map.
- A bare loadout is **never** walled off from food (reachability guard).
- Hard walls stay **rare**; the dominant flavor is expensive-but-passable bands (a detour, or a slot spent), per the user's "mostly roundabout / fewer options, fine to dip into true gating."
- Engine stays pure and deterministic; `embark` still carries only `mapSeed`.

## 3. Terrain-gating gear (`boo`) — built first (makes `moveCost` gear-aware)

**New lever** (`src/data/constants.ts`):

```ts
// Equipped tools that reduce/enable gated terrain. Effective terrain cost is the
// MIN of the base TERRAIN_COST and any gate value a currently-equipped tool
// confers. Hard walls (mountain = Infinity) become finite only with the tool.
export const TERRAIN_GATE: Record<Terrain, Record<string /*toolDefId*/, number>> = {
  mountain: { "climbing-pick": 4 }, // Infinity → 4: passable but expensive — a detour-or-climb call
  river:    { raft: 1 },            // 3 → 1: a cheap crossing where rivers wall you off
};
```

**`moveCost(terrain, transport, tools)`** — adds a third param `tools: string[]`:

```
effectiveTerrainCost = min(TERRAIN_COST[terrain], ...gateValues(terrain, tools))
cost = (MOVE_BASE_COST * effectiveTerrainCost) / transportMultiplier
```

Where `gateValues` yields the gate numbers for whichever gating tools are equipped. No gating tool → the set is empty → cost unchanged (identical to today). Purity boundary unaffected — still no biome lookup, no RNG.

**New catalog items** — each a **tool** (like spyglass), so each costs one tool/inventory slot; that slot cost *is* the "fewer options" tension (bring the pick, or bring more food):

- `climbing-pick` — `TOOL_CAPABILITY: "climb"`, `TOOL_QUALITY: 1` (quality irrelevant, present for the catalog invariant). `NODE_TOOL` never asks for "climb", so zero gather impact.
- `raft` — `TOOL_CAPABILITY: "ford"`, `TOOL_QUALITY: 1`.
- `RECIPE` entries (materials TBD in the plan — cheap-ish, e.g. climbing-pick from iron-ore + oak-log; raft from oak/pine logs + hide). Real numbers land in the plan, read from levers only.

**Ripple — exactly two call sites:**
1. Engine `move` reducer (`reduce.ts`): pass `expedition.loadout.equipment.tools` into `moveCost`. Mountain with climbing-pick now returns finite → no longer rejected `"impassable"`.
2. Web A* `findPath` (`src/web/main.ts`): pass tools so previewed routes price the pick/raft correctly.
The sim drives moves through `reduce`, so it needs no change.

## 4. Barrier topology + reachability guard (`b91`)

Approach chosen: **bias prizes into natural basins** the Perlin noise already creates (least invasive; no active band-carving that would override noise-driven terrain).

**New pure module `src/engine/reach.ts`** (no RNG — reusable by generation and, later, previews):
- `costToReach(terrain, entry, transport?, tools?)` → a `number[][]` of on-foot cost-to-reach per tile via Dijkstra/BFS over finite-cost terrain (mountain = wall). Baseline classification uses **on-foot, no-gear** passability so the guard protects a bare loadout.

**`generateGrid` restructures to:**
1. Terrain from noise (unchanged).
2. `reach.ts` → cost-to-reach map from `entry`. Classify each tile **near** (cost-to-reach ≤ `REACH_COST_THRESHOLD`, the cheap core) vs **far/pocket** (above threshold, or unreachable-on-foot = walled behind a band).
3. Collect accepted **positions** via the existing rejection sampler (spacing + entry-clear + `POI_PLACEMENT_ATTEMPTS` budget), unchanged. Separately roll a **spec** `(kind, material, creature)` per accepted position from the biome, then **score each by value**: `monster` = 3 > higher-tier material (via `MATERIAL_TIER` ≥ 2) = 2 > basic forage = 1.
4. **Continuous pairing:** sort specs by value descending, sort positions by cost-to-reach descending, and pair them index-for-index — highest-value spec lands on the hardest-to-reach position, food/basic drifts to the cheap core. No threshold/quantile lever; the sort *is* the bias (a smooth gradient, so true walls stay noise-rare while distance-to-prize is always live).
5. **Reachability guard:** count forageable food nodes (`herb`/`animal`) that landed on **finite** cost-to-reach tiles. If ≥ `FOOD_REACH_MIN`, keep the biased layout; otherwise **fall back to unbiased zip** (spec `i` → position `i`, today's behaviour) — a bare loadout is never walled off from food.

**New lever** (`constants.ts`):
- `FOOD_REACH_MIN` — minimum forageable food nodes guaranteed on finite-reach tiles (else fall back). Value: 2.

**Determinism:** BFS is deterministic; placement remains a seeded stream. Same seed → same grid. `embark` still carries only `mapSeed`. Callers already must not assume `pois.length === POI_DENSITY` (attempt budget can exhaust) — unchanged.

## 5. Spyglass what-if (`9h7`) — DEFERRED

**Intended design (not built this phase):** scout, for each nearby monster whose forecast is a loss, re-runs `resolveCombat` with each hypothetical buff (a packed battle-item, or an affinity weapon) and surfaces which single addition flips loss→win — making the spyglass worth its slot.

**Why deferred:** this surfaces *exact* pre-fight outcomes, which directly conflicts with `idle-adventure-9u9.2` ("Combat information rework — hide exact pre-fight outcome, teach matchup instead") in the playtest-follow-ups epic. Building exact-reveal now, then fuzzing it, is wasted work. **9h7 is blocked on reconciling with 9u9.2**; a dependency is recorded in beads. Revisit once the combat-info direction is settled.

## 6. Testing

- **boo:** `moveCost` units — mountain+climbing-pick = 4, river+raft = 1, no-tool cases unchanged; engine `move` onto a mountain with/without the pick (rejected vs finite cost); `test/boundary.test.ts` stays green (no new impure imports).
- **b91:** determinism (same seed → identical grid); **guard invariant** — every generated grid across many seeds (all 3 biomes) has ≥ `FOOD_REACH_MIN` on-foot-reachable food nodes; statistical check that prizes trend higher cost-to-reach than food nodes; `pois.length ≤ POI_DENSITY` preserved.
- **Re-run `test/harness-sustainability.test.ts`** — topology can shift forageability; it must stay green (do not land if it regresses).
- Gates: `bun test` + `bun run typecheck` + `bun run lint`.

## 7. Out of scope

- Spyglass what-if implementation (§5, deferred).
- Active band-carving / stamped barriers (rejected in favor of natural basins).
- Ice/mud gating tools (ice stays a pure cost-tax; only mountain + river gate this phase).
- Gear-aware reachability in the guard (guard is intentionally on-foot/no-gear so a bare loadout is always fed).
