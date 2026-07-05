# Barrier Topology & Terrain-Gating Gear — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the map drive routing/loadout decisions — bias high-value POIs behind terrain barriers, and let crafted gear (climbing-pick, raft) open/cheapen gated terrain — while guaranteeing a bare loadout can always reach food.

**Architecture:** Terrain-gating adds a `TERRAIN_GATE` lever and a third `tools` arg to the pure `moveCost`; two call sites (engine `move` reducer, web A*) pass equipped tools. Barrier topology adds a pure `reach.ts` cost-to-reach BFS and restructures `generateGrid` to pair value-sorted POI specs with reach-sorted positions, with a food reachability guard + unbiased fallback.

**Tech Stack:** TypeScript, bun (`bun test` native runner, jest-compatible snapshots), ESLint flat config (engine-purity boundary).

## Global Constraints

- Engine is pure: `reduce(state, action) → {state, events}`, seed in state, no DOM / `Math.random` / `Date.now`, no imports from `render`/`sim`/`web`. Lint-enforced; verified by `test/boundary.test.ts`. `src/engine/reach.ts` may import only from `src/engine/**` and `src/data/**`.
- No magic numbers in engine logic — every tunable is a named lever in `src/data/constants.ts`.
- Items are `{defId, qty}` referencing the code-side catalog; no per-instance item state.
- Determinism: same `mapSeed` → same grid. `embark` carries only `mapSeed`.
- Gates for every task: `bun test` + `bun run typecheck` + `bun run lint` all green before commit.

---

### Task 1: Gear-aware `moveCost` + `TERRAIN_GATE` lever

**Files:**
- Modify: `src/data/constants.ts` (add `TERRAIN_GATE` after `TERRAIN_COST`)
- Modify: `src/engine/move.ts:22-26` (`moveCost` signature + gate logic)
- Test: `test/move.test.ts`

**Interfaces:**
- Produces: `moveCost(terrain: Terrain, transport: string | null, tools?: string[]): number` — third param defaults to `[]` so all existing callers/tests are unaffected. Effective terrain cost = `min(TERRAIN_COST[terrain], …gate values conferred by equipped tools)`.
- Produces: `TERRAIN_GATE: Record<Terrain, Record<string, number>>`.

- [ ] **Step 1: Add the lever.** In `src/data/constants.ts`, immediately after the `TERRAIN_COST` block (ends line ~107), add:

```ts
// Equipped tools that reduce/enable gated terrain (Phase 3, boo). Effective
// terrain cost = MIN of base TERRAIN_COST and any gate value a currently-equipped
// tool confers. Hard walls (mountain = Infinity) become finite only with the tool;
// that gear costs a tool slot, so bringing it is a real loadout tradeoff.
export const TERRAIN_GATE: Record<Terrain, Record<string, number>> = {
  mountain: { "climbing-pick": 4 }, // Infinity → 4: passable but expensive (detour-or-climb call)
  river: { raft: 1 }, // 3 → 1: a cheap crossing where rivers wall you off
};
```

- [ ] **Step 2: Write the failing tests.** Append to `test/move.test.ts`:

```ts
test("moveCost: climbing-pick makes mountain finite (Infinity → gate cost)", () => {
  expect(moveCost("mountain", null)).toBe(Infinity);
  expect(moveCost("mountain", null, ["climbing-pick"])).toBe(4);
});

test("moveCost: raft cheapens river (uses the min of base and gate)", () => {
  expect(moveCost("river", null)).toBe(3);
  expect(moveCost("river", null, ["raft"])).toBe(1);
});

test("moveCost: a gate never raises cost — irrelevant tool is a no-op", () => {
  expect(moveCost("plains", null, ["climbing-pick", "raft"])).toBe(moveCost("plains", null));
  expect(moveCost("mud", null, ["raft"])).toBe(moveCost("mud", null));
});

test("moveCost: gate composes with transport (÷ multiplier still applies)", () => {
  expect(moveCost("mountain", "horse", ["climbing-pick"])).toBe(4 / 1.5);
});
```

- [ ] **Step 3: Run tests, verify they fail.** Run: `bun test test/move.test.ts`. Expected: the 4 new tests FAIL (arity / gate not applied).

- [ ] **Step 4: Implement.** Replace `src/engine/move.ts` lines 1-26 body of `moveCost` — new version:

```ts
import {
  MOVE_BASE_COST,
  TERRAIN_COST,
  TERRAIN_GATE,
  TRANSPORT_MULTIPLIER,
} from "../data/constants";
import type { Terrain } from "../data/constants";

// ... stepToward unchanged ...

// Energy cost of stepping ONTO `terrain` with `transport` + `tools` equipped.
// Spec §10 / Phase 3: effective terrain cost is the MIN of base cost and any
// gate an equipped tool confers, then base × terrain ÷ transport. Infinity = impassable.
export function moveCost(
  terrain: Terrain,
  transport: string | null,
  tools: string[] = [],
): number {
  let terrainCost = TERRAIN_COST[terrain];
  const gates = TERRAIN_GATE[terrain];
  if (gates) {
    for (const tool of tools) {
      const gated = gates[tool];
      if (gated !== undefined && gated < terrainCost) terrainCost = gated;
    }
  }
  const multiplier = transport === null ? 1 : (TRANSPORT_MULTIPLIER[transport] ?? 1);
  return (MOVE_BASE_COST * terrainCost) / multiplier;
}
```

- [ ] **Step 5: Run tests, verify pass.** Run: `bun test test/move.test.ts`. Expected: all PASS (old + new).

- [ ] **Step 6: Commit.**

```bash
git add src/data/constants.ts src/engine/move.ts test/move.test.ts
git commit -m "P3(boo): gear-aware moveCost + TERRAIN_GATE lever"
```

---

### Task 2: Catalog the gating tools (`climbing-pick`, `raft`) + recipes

**Files:**
- Modify: `src/data/constants.ts` (`TOOL_CAPABILITY`, `TOOL_QUALITY`, `RECIPE`)
- Test: `test/catalog.test.ts` (add a case; `test/constants.test.ts` invariant already covers quality/capability pairing)

**Interfaces:**
- Produces: catalog entries so `slotOf("climbing-pick") === "tool"` and `slotOf("raft") === "tool"`, both craftable via `RECIPE`.

- [ ] **Step 1: Write the failing test.** Append to `test/catalog.test.ts`:

```ts
test("slotOf: gating tools classify as tools", () => {
  expect(slotOf("climbing-pick")).toBe("tool");
  expect(slotOf("raft")).toBe("tool");
});
```

- [ ] **Step 2: Run, verify fail.** Run: `bun test test/catalog.test.ts`. Expected: FAIL (`slotOf` returns null — defIds unknown).

- [ ] **Step 3: Implement.** In `src/data/constants.ts`:

In `TOOL_CAPABILITY` (after the `spyglass` line ~165), add:
```ts
  "climbing-pick": "climb", // gating capability; NODE_TOOL never asks for "climb", so no gather impact
  raft: "ford", // gating capability for rivers
```
In `TOOL_QUALITY` (after the `spyglass` line ~176), add:
```ts
  "climbing-pick": 1, // quality irrelevant to gating; present to satisfy the catalog invariant
  raft: 1,
```
In `RECIPE` (near the other tool recipes, after `spyglass` line ~373), add:
```ts
  "climbing-pick": { inputs: [{ defId: "iron-ore", qty: 2 }, { defId: "oak-log", qty: 1 }], output: { defId: "climbing-pick", qty: 1 } },
  raft: { inputs: [{ defId: "pine-log", qty: 2 }, { defId: "deer-hide", qty: 1 }], output: { defId: "raft", qty: 1 } },
```

- [ ] **Step 4: Run, verify pass.** Run: `bun test test/catalog.test.ts test/constants.test.ts`. Expected: PASS (capability+quality invariant satisfied, slot classification works).

- [ ] **Step 5: Commit.**

```bash
git add src/data/constants.ts test/catalog.test.ts
git commit -m "P3(boo): climbing-pick + raft catalog entries & recipes"
```

---

### Task 3: Wire equipped tools into the `move` reducer and web A*

**Files:**
- Modify: `src/engine/reduce.ts:159` (pass tools to `moveCost`)
- Modify: `src/web/main.ts:110,136` (`findPath` accepts + forwards tools) and its call site (~line 397)
- Test: `test/reduce-move.test.ts`

**Interfaces:**
- Consumes: `moveCost(terrain, transport, tools)` from Task 1.
- Produces: with a `climbing-pick` equipped in `loadout.equipment.tools`, `move` onto a mountain tile succeeds at finite cost instead of rejecting `"impassable"`.

- [ ] **Step 1: Write the failing test.** Add to `test/reduce-move.test.ts` a test that embarks onto a seed with a mountain adjacent to entry, then moves onto it with/without a climbing-pick. Use the existing helpers in that file for building expedition state. Concrete test (adapt the state-builder to the file's existing pattern):

```ts
import { generateGrid, rollBiome } from "../src/engine/grid";
import { GRID_SIZE } from "../src/data/constants";

test("move: climbing-pick lets you step onto a mountain (finite cost, not rejected)", () => {
  // Find a seed where a mountain sits directly above the entry tile.
  let seed = "";
  for (let i = 0; i < 500; i++) {
    const s = `pick-mtn-${i}`;
    const g = generateGrid(s, rollBiome(s));
    const above = { x: g.entry.x, y: g.entry.y - 1 };
    if (above.y >= 0 && g.terrain[above.y]![above.x] === "mountain"
        && !g.pois.some((p) => p.x === above.x && p.y === above.y)) { seed = s; break; }
  }
  expect(seed).not.toBe(""); // sanity: such a seed exists

  const base = embarkedState(seed); // helper: state on-expedition at entry with plenty of energy
  const target = { x: base.expedition!.pos.x, y: base.expedition!.pos.y - 1 };

  const noPick = reduce(base, { type: "move", to: target });
  expect(noPick.events.some((e) => e.type === "action-rejected" && e.reason === "impassable")).toBe(true);

  const withPick = withTools(base, ["climbing-pick"]); // helper: clone state adding a tool
  const climbed = reduce(withPick, { type: "move", to: target });
  expect(climbed.events.some((e) => e.type === "moved")).toBe(true);
});
```

If `embarkedState` / `withTools` helpers don't already exist in the file, add small local builders that mirror the file's existing expedition-construction pattern (equipment with `tools: []`, ample `energy`). Keep them in the test file, not the engine.

- [ ] **Step 2: Run, verify fail.** Run: `bun test test/reduce-move.test.ts`. Expected: the new test FAILS (climb still rejected — reducer ignores tools).

- [ ] **Step 3: Implement (engine).** In `src/engine/reduce.ts` line 159, change:

```ts
  const cost = moveCost(terrain, expedition.loadout.equipment.transport);
```
to:
```ts
  const cost = moveCost(terrain, expedition.loadout.equipment.transport, expedition.loadout.equipment.tools);
```

- [ ] **Step 4: Run, verify pass.** Run: `bun test test/reduce-move.test.ts`. Expected: PASS.

- [ ] **Step 5: Implement (web A*).** In `src/web/main.ts`:

Line 110 — add a `tools` param:
```ts
function findPath(grid: Grid, start: Pos, goal: Pos, transport: string | null, tools: string[], blocked: Set<string>): { path: Pos[]; cost: number } | null {
```
Line 136 — forward it:
```ts
      const step = moveCost(grid.terrain[ny]![nx]!, transport, tools);
```
At the `findPath(...)` call site (~line 397, inside the click handler that builds `found`), pass the equipped tools:
```ts
  const found = findPath(grid, from, to, exp.loadout.equipment.transport, exp.loadout.equipment.tools, blocked);
```
(Use whatever local variable already holds the expedition — match the surrounding code; the transport arg is already sourced there.)

- [ ] **Step 6: Verify build.** Run: `bun run typecheck && bun run lint`. Expected: no errors (web A* now type-checks with the new arg).

- [ ] **Step 7: Commit.**

```bash
git add src/engine/reduce.ts src/web/main.ts test/reduce-move.test.ts
git commit -m "P3(boo): wire equipped tools into move reducer + web A*"
```

---

### Task 4: Pure `reach.ts` cost-to-reach BFS

**Files:**
- Create: `src/engine/reach.ts`
- Test: `test/reach.test.ts`

**Interfaces:**
- Consumes: `moveCost` (Task 1), `GRID_SIZE`, `Terrain`, `Coord`.
- Produces: `costToReach(terrain: Terrain[][], entry: Coord, transport?: string | null, tools?: string[]): number[][]` — `[y][x]` accumulated energy cost to reach each tile from `entry` (Dijkstra over finite-cost terrain). Entry tile = 0; unreachable tiles = `Infinity`.

- [ ] **Step 1: Write the failing test.** Create `test/reach.test.ts`:

```ts
import { test, expect } from "bun:test";
import { costToReach } from "../src/engine/reach";
import type { Terrain } from "../src/data/constants";

// 3×3 helper padded to nothing — costToReach expects a full GRID_SIZE grid, so
// build a small explicit case by filling a GRID_SIZE grid with plains and
// dropping features in. Keep it tiny and readable.
import { GRID_SIZE } from "../src/data/constants";
function plainsGrid(): Terrain[][] {
  return Array.from({ length: GRID_SIZE }, () => Array<Terrain>(GRID_SIZE).fill("plains"));
}

test("costToReach: entry is 0, neighbors cost one plains step", () => {
  const g = plainsGrid();
  const entry = { x: 5, y: 5 };
  const cost = costToReach(g, entry);
  expect(cost[5]![5]).toBe(0);
  expect(cost[5]![6]).toBe(1); // one plains step (8-dir; diagonal same cost as orthogonal here)
});

test("costToReach: a full mountain wall makes the far side Infinity on foot", () => {
  const g = plainsGrid();
  const entry = { x: 0, y: 0 };
  for (let y = 0; y < GRID_SIZE; y++) g[y]![10] = "mountain"; // vertical wall at x=10
  const cost = costToReach(g, entry);
  expect(Number.isFinite(cost[0]![9]!)).toBe(true); // near side reachable
  expect(cost[0]![11]).toBe(Infinity); // far side walled off on foot
});

test("costToReach: climbing-pick opens the wall (far side finite)", () => {
  const g = plainsGrid();
  const entry = { x: 0, y: 0 };
  for (let y = 0; y < GRID_SIZE; y++) g[y]![10] = "mountain";
  const cost = costToReach(g, entry, null, ["climbing-pick"]);
  expect(Number.isFinite(cost[0]![11]!)).toBe(true);
});
```

- [ ] **Step 2: Run, verify fail.** Run: `bun test test/reach.test.ts`. Expected: FAIL (`reach.ts` does not exist).

- [ ] **Step 3: Implement.** Create `src/engine/reach.ts`:

```ts
// Pure cost-to-reach (Dijkstra) from an entry tile over finite-cost terrain
// (Phase 3, b91). No RNG, no biome lookup — reused by generation and, later, by
// previews. Uses moveCost so it honours transport + gating tools identically to
// the move reducer. mountain (Infinity) is a wall unless a gating tool cheapens it.
import { GRID_SIZE } from "../data/constants";
import type { Terrain } from "../data/constants";
import { moveCost } from "./move";
import type { Coord } from "./move";

export function costToReach(
  terrain: Terrain[][],
  entry: Coord,
  transport: string | null = null,
  tools: string[] = [],
): number[][] {
  const cost = Array.from({ length: GRID_SIZE }, () =>
    Array<number>(GRID_SIZE).fill(Infinity),
  );
  cost[entry.y]![entry.x] = 0;
  const visited = new Set<string>();
  // Grid is 20×20 = 400 tiles; a plain min-scan Dijkstra is fine (no heap needed).
  for (;;) {
    let bx = -1, by = -1, best = Infinity;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (visited.has(`${x},${y}`)) continue;
        if (cost[y]![x]! < best) { best = cost[y]![x]!; bx = x; by = y; }
      }
    }
    if (bx < 0 || !Number.isFinite(best)) break; // all remaining tiles unreachable
    visited.add(`${bx},${by}`);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = bx + dx, ny = by + dy;
        if (nx < 0 || ny < 0 || nx >= GRID_SIZE || ny >= GRID_SIZE) continue;
        const step = moveCost(terrain[ny]![nx]!, transport, tools);
        if (!Number.isFinite(step)) continue; // impassable neighbor
        const nc = best + step;
        if (nc < cost[ny]![nx]!) cost[ny]![nx] = nc;
      }
    }
  }
  return cost;
}
```

- [ ] **Step 4: Run, verify pass.** Run: `bun test test/reach.test.ts`. Expected: PASS.

- [ ] **Step 5: Boundary check.** Run: `bun test test/boundary.test.ts`. Expected: PASS (`reach.ts` imports only engine + data — no purity violation).

- [ ] **Step 6: Commit.**

```bash
git add src/engine/reach.ts test/reach.test.ts
git commit -m "P3(b91): pure cost-to-reach BFS module"
```

---

### Task 5: Barrier topology in `generateGrid` + reachability guard

**Files:**
- Modify: `src/data/constants.ts` (add `FOOD_REACH_MIN`)
- Modify: `src/engine/grid.ts` (restructure `generateGrid` POI placement; import `costToReach`, `MATERIAL_TIER`)
- Test: `test/grid.test.ts` (add topology + guard tests); update snapshots
- Re-run: `test/harness-sustainability.test.ts`

**Interfaces:**
- Consumes: `costToReach` (Task 4).
- Produces: `generateGrid` unchanged signature/return type; POIs now biased so higher-value nodes trend to higher cost-to-reach, with ≥ `FOOD_REACH_MIN` forageable food on finite-reach tiles (or unbiased fallback).

- [ ] **Step 1: Add the lever.** In `src/data/constants.ts`, near the map levers (after `POI_PLACEMENT_ATTEMPTS`, line ~11), add:

```ts
export const FOOD_REACH_MIN = 2; // Phase 3 (b91): min forageable (herb/animal) nodes that must sit on finite on-foot cost-to-reach tiles; else generateGrid falls back to unbiased placement so a bare loadout is never walled off from food
```

- [ ] **Step 2: Write the failing tests.** Append to `test/grid.test.ts`:

```ts
import { costToReach } from "../src/engine/reach";
import { FOOD_REACH_MIN } from "../src/data/constants";

test("generateGrid: is deterministic — same seed yields identical POIs", () => {
  const a = generateGrid("topo-seed-1", rollBiome("topo-seed-1"));
  const b = generateGrid("topo-seed-1", rollBiome("topo-seed-1"));
  expect(b.pois).toEqual(a.pois);
});

test("generateGrid: reachability guard — every seed keeps >= FOOD_REACH_MIN forageable food on finite-reach tiles", () => {
  for (let i = 0; i < 120; i++) {
    const seed = `guard-${i}`;
    const g = generateGrid(seed, rollBiome(seed));
    const reach = costToReach(g.terrain, g.entry);
    const reachableFood = g.pois.filter(
      (p) => (p.kind === "herb" || p.kind === "animal") && Number.isFinite(reach[p.y]![p.x]!),
    ).length;
    const totalFood = g.pois.filter((p) => p.kind === "herb" || p.kind === "animal").length;
    // Guard only promises the minimum when the map actually has that much food.
    expect(reachableFood).toBeGreaterThanOrEqual(Math.min(FOOD_REACH_MIN, totalFood));
  }
});

test("generateGrid: prizes trend farther to reach than food (statistical, across seeds)", () => {
  let prizeSum = 0, prizeN = 0, foodSum = 0, foodN = 0;
  for (let i = 0; i < 120; i++) {
    const seed = `trend-${i}`;
    const g = generateGrid(seed, rollBiome(seed));
    const reach = costToReach(g.terrain, g.entry);
    for (const p of g.pois) {
      const c = reach[p.y]![p.x]!;
      const r = Number.isFinite(c) ? c : 1000; // treat walled-off as very far
      if (p.kind === "monster") { prizeSum += r; prizeN++; }
      else if (p.kind === "herb" || p.kind === "animal") { foodSum += r; foodN++; }
    }
  }
  expect(prizeSum / prizeN).toBeGreaterThan(foodSum / foodN); // monsters farther than food on average
});
```

- [ ] **Step 3: Run, verify fail.** Run: `bun test test/grid.test.ts`. Expected: the `trend` test FAILS (no biasing yet); `guard` + `deterministic` likely pass already — that's fine, they lock behaviour.

- [ ] **Step 4: Implement.** In `src/engine/grid.ts`, add imports at top:

```ts
import { MATERIAL_TIER, FOOD_REACH_MIN } from "../data/constants";
import { costToReach } from "./reach";
```
(Merge `MATERIAL_TIER`/`FOOD_REACH_MIN` into the existing `../data/constants` import list rather than duplicating the line.)

Replace the POI placement loop (current lines 77-106, from `const pois: Poi[] = [];` through the closing `}` of the `for` loop) with the position/spec/pair/guard structure:

```ts
  // Phase 3 (b91): place POIs in two steps so we can bias by value against terrain.
  // (a) Collect accepted POSITIONS via the same seeded rejection sampler (spacing
  //     + entry-clear + attempt budget). NOTE: pois.length may be < POI_DENSITY.
  const positions: { x: number; y: number }[] = [];
  for (
    let attempt = 0;
    attempt < POI_PLACEMENT_ATTEMPTS && positions.length < POI_DENSITY;
    attempt++
  ) {
    const x = Math.floor(rand(mapSeed, "poi-x", attempt) * GRID_SIZE);
    const y = Math.floor(rand(mapSeed, "poi-y", attempt) * GRID_SIZE);
    if (x === entry.x && y === entry.y) continue; // entry tile stays clear
    const clear = positions.every(
      (p) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) >= POI_MIN_SPACING,
    );
    if (!clear) continue;
    positions.push({ x, y });
  }
  // (b) Roll a SPEC (kind/creature/material) per accepted position, indexed by
  //     acceptance order — decoupled from position so we can reassign by value.
  const specs = positions.map((_, i) => {
    const kind = weightedPick(biome.nodeTypeWeights, NODE_TYPES, rand(mapSeed, "poi-kind", i));
    const creature =
      kind === "monster" && biome.creatureTable.length > 0
        ? biome.creatureTable[
            Math.floor(rand(mapSeed, "poi-creature", i) * biome.creatureTable.length)
          ]!
        : null;
    const material =
      kind === "monster"
        ? null
        : rollMaterial(biome.materialTable[kind], rand(mapSeed, "poi-material", i));
    return { kind, material, creature };
  });
  // (c) Value score: monster (combat reward) > higher-tier material > basic forage.
  const value = (s: { kind: NodeType; material: string | null }): number => {
    if (s.kind === "monster") return 3;
    if (s.material && (MATERIAL_TIER[s.material] ?? 1) >= 2) return 2;
    return 1;
  };
  // (d) Continuous pairing: highest-value spec → hardest-to-reach position.
  //     Explicit comparators (no arithmetic on Infinity, stable index tiebreak).
  const reach = costToReach(terrain, entry); // on-foot, no gear — the guard's baseline
  const reachCost = positions.map((p) => reach[p.y]![p.x]!);
  const specOrder = specs.map((_, i) => i).sort((a, b) => {
    const d = value(specs[b]!) - value(specs[a]!);
    return d !== 0 ? d : a - b;
  });
  const posOrder = positions.map((_, i) => i).sort((a, b) => {
    const ca = reachCost[a]!, cb = reachCost[b]!;
    if (ca === cb) return a - b;
    return ca < cb ? 1 : -1; // descending, Infinity-safe
  });
  const biased: Poi[] = specOrder.map((si, k) => {
    const p = positions[posOrder[k]!]!;
    const s = specs[si]!;
    return { x: p.x, y: p.y, kind: s.kind, material: s.material, creature: s.creature };
  });
  // (e) Reachability guard: forageable food on finite-reach tiles must clear the
  //     floor (bounded by how much food the map has), else fall back to unbiased.
  const reachableFood = biased.filter(
    (p) => (p.kind === "herb" || p.kind === "animal") && Number.isFinite(reach[p.y]![p.x]!),
  ).length;
  const totalFood = specs.filter((s) => s.kind === "herb" || s.kind === "animal").length;
  const pois =
    reachableFood >= Math.min(FOOD_REACH_MIN, totalFood)
      ? biased
      : positions.map((p, i) => {
          const s = specs[i]!;
          return { x: p.x, y: p.y, kind: s.kind, material: s.material, creature: s.creature };
        });
```

Leave the final `return { biomeId, terrain, pois, entry };` unchanged. Delete the now-obsolete `NOTE:` comment block that described the old single-loop sampler (lines ~71-76) and the old loop it referred to.

- [ ] **Step 5: Run, verify pass.** Run: `bun test test/grid.test.ts`. Expected: `trend` now PASSES; `guard` + `deterministic` PASS.

- [ ] **Step 6: Update snapshots.** POI assignment changed, so any grid snapshots are stale. Run: `bun test --update-snapshots`, then inspect the diff (`git diff test/__snapshots__`) to confirm only POI ordering/placement changed (not terrain, not counts).

- [ ] **Step 7: Re-run the sustainability harness.** Run: `bun test test/harness-sustainability.test.ts`. Expected: PASS. If it regresses (topology walled off too much forage), raise `FOOD_REACH_MIN` or revisit — do NOT land a red harness.

- [ ] **Step 8: Full gates.** Run: `bun test && bun run typecheck && bun run lint`. Expected: all green.

- [ ] **Step 9: Commit.**

```bash
git add src/data/constants.ts src/engine/grid.ts test/grid.test.ts test/__snapshots__
git commit -m "P3(b91): barrier topology bias + food reachability guard"
```

---

### Task 6: Record the 9h7 (spyglass what-if) deferral

**Files:** none (bookkeeping only).

- [ ] **Step 1: Encode the dependency in beads.** Run:

```bash
bd dep add idle-adventure-9h7 idle-adventure-9u9.2   # 9h7 blocked on the combat-info rework decision
bd update idle-adventure-9h7 --notes="DEFERRED (Phase 3 spec §5): surfaces exact loss→win deltas, which conflicts with 9u9.2 (hide exact outcomes). Reconcile 9u9.2's direction first. Design captured in docs/superpowers/specs/2026-07-05-barrier-topology-terrain-gating-design.md."
```

- [ ] **Step 2: Close the two implemented tasks.** After Tasks 1-5 land and gates are green:

```bash
bd close idle-adventure-boo idle-adventure-b91 --reason="Phase 3 structural: terrain-gating gear + barrier topology shipped; see plan 2026-07-05-barrier-topology-terrain-gating.md"
```

---

## Self-Review

**Spec coverage:**
- §3 terrain-gating (lever, moveCost, catalog, ripple) → Tasks 1-3. ✓
- §4 barrier topology (reach.ts, restructured placement, pairing, guard, FOOD_REACH_MIN) → Tasks 4-5. ✓
- §5 spyglass deferral (bead dependency + notes) → Task 6. ✓
- §6 testing (moveCost units, boundary green, determinism, guard invariant, prize-trend, sustainability re-run) → Tasks 1,3,4,5. ✓

**Placeholder scan:** No TBD/TODO in steps; recipe materials are concrete; test bodies are complete. The only adapt-to-local note is the `reduce-move.test.ts` state-builder (Task 3 Step 1), which is explicit about mirroring the file's existing pattern. ✓

**Type consistency:** `moveCost(terrain, transport, tools?)` used identically in Tasks 1, 3, 4. `costToReach(terrain, entry, transport?, tools?)` used identically in Tasks 4, 5, and the grid tests. `value(spec)` local to Task 5. POI shape `{x,y,kind,material,creature}` matches `Poi` type. ✓
