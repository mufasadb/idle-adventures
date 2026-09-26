# Reach Economy on the Long Map (e3j) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the energy/food reach tension (G3) by making every map a 20×60 strip with noise-generated barrier walls, denser POIs, and a fresh-vs-processed food axis (forage berries: eat now for 30, or haul home where they stale into jam inputs).

**Architecture:** Pure-engine changes only touch `src/engine/` + `src/data/` levers (no DOM/`Math.random`/`Date.now` — lint-enforced). `GRID_SIZE` splits into `MAP_WIDTH`/`MAP_HEIGHT`; generation gains a second low-frequency Perlin "barrier" layer plus a connectivity carve pass; gather routes food-catalog yields into the expedition food reserve; `endExpedition` maps fresh→stale defIds at banking.

**Tech Stack:** bun (runtime + `bun test`), TypeScript strict, ESLint flat config (engine-purity boundary).

**Spec:** `docs/superpowers/specs/2026-07-06-reach-economy-long-map-design.md`
**Beads:** Task 1 = `idle-adventure-e3j.1` · Task 2 = `e3j.2` · Task 3 = `e3j.3` · Task 4 = `e3j.4`. Tasks 1 and 3 are independent (parallel-safe; both touch `constants.ts`/`reduce.ts` in disjoint regions — expect trivial rebases). Task 2 needs Task 1. Task 4 needs 1–3.

## Global Constraints

- Engine purity: nothing under `src/engine/` imports from `render`/`sim`/`web` or uses `Math.random`/`Date.now`/DOM (verified by `test/boundary.test.ts`).
- Items are `{defId, qty}` — no per-instance state; "freshness" is a defId transition at run boundaries only.
- No magic numbers in engine logic — every tunable is a named lever in `src/data/constants.ts`.
- All generation is deterministic in `(mapSeed, biomeId)` — the grid cache and replayability depend on it.
- Arrays are indexed `[y][x]`; `x ∈ [0, MAP_WIDTH)`, `y ∈ [0, MAP_HEIGHT)`.
- Quality gates before any commit lands on `main`: `bun test`, `bun run typecheck`, `bun run lint`.

---

### Task 1: 20×60 map dimensions (bead e3j.1)

**Files:**
- Modify: `src/data/constants.ts:7`
- Modify: `src/engine/grid.ts` (imports, terrain loops :75-86, entry :91-101, POI sampling :114-115)
- Modify: `src/engine/reach.ts` (import :5, bounds :29 and :68, array :48-49, scan loops :56-57)
- Modify: `src/engine/reduce.ts` (import :13, move bounds :183)
- Modify: `src/web/main.ts` (import :16, path bounds :153, render loops :382, grid template + scroll wrapper :448)
- Modify: `src/web/index.html` (add `.gridscroll` CSS next to `.grid` at :23)
- Modify: `src/sim/playtest.ts` (import :21, render loops :144-146)
- Test: `test/constants.test.ts`, `test/reach.test.ts`, `test/reduce-move.test.ts`, `test/harness-sustainability.test.ts`, `test/harness-loop.test.ts`, snapshot regeneration

**Interfaces:**
- Consumes: nothing (foundation task).
- Produces: `MAP_WIDTH: number` (20) and `MAP_HEIGHT: number` (60) exported from `src/data/constants.ts`; `GRID_SIZE` is GONE. Tasks 2 and 4 import these names.

- [ ] **Step 1: Update the constants test to the new levers (failing test first)**

In `test/constants.test.ts`, replace the `GRID_SIZE` import with `MAP_WIDTH, MAP_HEIGHT` and replace the two assertions (lines ~42 and ~48):

```ts
expect(typeof MAP_WIDTH).toBe("number");
expect(typeof MAP_HEIGHT).toBe("number");
// 20×60 strip (e3j): phone-portrait — thumb-wide, scroll-long
expect(MAP_WIDTH).toBe(20);
expect(MAP_HEIGHT).toBe(60);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test test/constants.test.ts`
Expected: FAIL — `MAP_WIDTH` is not exported.

- [ ] **Step 3: Replace the lever**

In `src/data/constants.ts` line 7, replace `export const GRID_SIZE = 20; // tiles per side` with:

```ts
// 20×60 strip (e3j): the map outgrows one 300-energy tank so food buys reach
// again. WIDTH is thumb-sized for phone portrait; HEIGHT is the long axis you
// scroll — the whole reach economy hangs off this pair.
export const MAP_WIDTH = 20; // tiles across
export const MAP_HEIGHT = 60; // tiles along the strip
```

- [ ] **Step 4: Sweep the engine consumers**

`src/engine/grid.ts` — import `MAP_WIDTH, MAP_HEIGHT` instead of `GRID_SIZE`, then:
- Terrain loops (:75, :77): `y < MAP_HEIGHT`, `x < MAP_WIDTH`.
- Entry (:91-95): `const preferred = Math.floor(rand(mapSeed, "entry") * MAP_WIDTH);`, `let entry = { x: preferred, y: MAP_HEIGHT - 1 };`, scan `for (let x = 0; x < MAP_WIDTH; x++)`, `const cand = { x, y: MAP_HEIGHT - 1 };`.
- POI sampling (:114-115): `const x = Math.floor(rand(mapSeed, "poi-x", attempt) * MAP_WIDTH);`, `const y = Math.floor(rand(mapSeed, "poi-y", attempt) * MAP_HEIGHT);`

`src/engine/reach.ts` — import swap, then:
- Bounds (:29, :68): `if (nx < 0 || ny < 0 || nx >= MAP_WIDTH || ny >= MAP_HEIGHT) continue;`
- Cost array (:48-49): `Array.from({ length: MAP_HEIGHT }, () => Array<number>(MAP_WIDTH).fill(Infinity))`
- Min-scan loops (:56-57): `y < MAP_HEIGHT`, `x < MAP_WIDTH`. Update the :53 comment: the grid is now 20×60 = 1200 tiles; the plain min-scan Dijkstra is still fine.

`src/engine/reduce.ts` — import swap (:13), move bounds (:183): `if (step.x < 0 || step.x >= MAP_WIDTH || step.y < 0 || step.y >= MAP_HEIGHT)`.

- [ ] **Step 5: Sweep the web + console surfaces**

`src/web/main.ts` — import swap (:16), then:
- A* bounds (:153): `if (nx < 0 || ny < 0 || nx >= MAP_WIDTH || ny >= MAP_HEIGHT) continue;`
- Render loops (:382): `for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++)`
- Grid element (:448): wrap in a scroll viewport and key columns off the width:

```ts
<div class="gridscroll"><div class="grid" style="grid-template-columns:repeat(${MAP_WIDTH}, 1.4rem);">${cells}</div></div>
```

`src/web/index.html` — next to the `.grid` rule (:23) add:

```css
.gridscroll { max-height: 72vh; overflow-y: auto; width: max-content; max-width: 100%; overflow-x: auto; border-radius: 4px; }
```

`src/sim/playtest.ts` — import swap (:21), render loops (:144, :146): `y < MAP_HEIGHT`, `x < MAP_WIDTH`.

- [ ] **Step 6: Reconcile the remaining tests**

- `test/reach.test.ts`: import swap; the plains-field helper (:9) becomes `Array.from({ length: MAP_HEIGHT }, () => Array<Terrain>(MAP_WIDTH).fill("plains"))`; the wall loops (:21, :29) become `y < MAP_HEIGHT`.
- `test/reduce-move.test.ts`: import swap; grid-scan loops (:22-28) use `MAP_HEIGHT`/`MAP_WIDTH` (y/x); the out-of-bounds case (:190-191) becomes `{ x: 0, y: MAP_HEIGHT - 1 }` / `to: { x: 0, y: MAP_HEIGHT + 5 }`.
- `test/harness-sustainability.test.ts`: import swap; step budget (:50) becomes `(MAP_WIDTH + MAP_HEIGHT) * 3` (was `GRID_SIZE * 6` = 120 → 240); bounds (:63) `nb.x >= MAP_WIDTH || nb.y >= MAP_HEIGHT`.
- `test/harness-loop.test.ts`: import swap; step budget (:34) becomes `MAP_WIDTH + MAP_HEIGHT` (was `GRID_SIZE * 2` = 40 → 80); update the :32 comment.

- [ ] **Step 7: Run the full suite; regenerate snapshots deliberately**

Run: `bun test`
Expected: dimension/bounds tests PASS; any `__snapshots__` failures are 20×20 renders that are now 20×60. Eyeball one diff to confirm it's shape-only (taller map, same glyph vocabulary), then run `bun test -u` and re-run `bun test` to green. If a NON-snapshot test fails, fix the code, not the test.

- [ ] **Step 8: Gates + commit**

Run: `bun run typecheck && bun run lint && bun test`
Expected: all green (typecheck also proves no `GRID_SIZE` stragglers — the export is gone).

```bash
git add -A
git commit -m "e3j.1: 20×60 long map — MAP_WIDTH/MAP_HEIGHT replace GRID_SIZE; web strip scrolls"
```

---

### Task 2: Barrier noise layer + connectivity carve (bead e3j.2 — needs Task 1)

**Files:**
- Modify: `src/data/constants.ts` (barrier levers near `NOISE_FREQUENCY` :8; `Biome` type + three biome entries :39-80)
- Modify: `src/engine/grid.ts` (barrier sample in the terrain loop; carve pass before entry selection)
- Test: `test/barrier.test.ts` (create)

**Interfaces:**
- Consumes: `MAP_WIDTH`/`MAP_HEIGHT` (Task 1); `perlin2(seed, x, y)` from `src/engine/noise.ts`; `moveCost(terrain, transport, tools)` from `src/engine/move.ts`.
- Produces: `BARRIER_NOISE_FREQUENCY: number`, `BARRIER_THRESHOLD: number`, `Biome.barrierTerrain: Terrain`. No new engine exports — `generateGrid`'s signature is unchanged.

- [ ] **Step 1: Write the failing property test**

Create `test/barrier.test.ts`:

```ts
import { test, expect } from "bun:test";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { moveCost } from "../src/engine/move";
import { MAP_WIDTH, MAP_HEIGHT, BARRIER_THRESHOLD, BARRIER_NOISE_FREQUENCY, NOISE_FREQUENCY } from "../src/data/constants";
import type { Terrain } from "../src/data/constants";

const walkable = (t: Terrain) => Number.isFinite(moveCost(t, null, []));

// Flood-fill walkable tiles from `from`; returns how many it reached (8-dir,
// mirroring movement adjacency).
function flood(terrain: Terrain[][], from: { x: number; y: number }): number {
  const seen = new Set<string>([`${from.x},${from.y}`]);
  const stack = [from];
  let n = 1;
  while (stack.length) {
    const c = stack.pop()!;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = c.x + dx, ny = c.y + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_WIDTH || ny >= MAP_HEIGHT) continue;
      const k = `${nx},${ny}`;
      if (seen.has(k) || !walkable(terrain[ny]![nx]!)) continue;
      seen.add(k); n++; stack.push({ x: nx, y: ny });
    }
  }
  return n;
}

test("levers: barrier layer is chunkier than base terrain", () => {
  expect(BARRIER_NOISE_FREQUENCY).toBeLessThan(NOISE_FREQUENCY);
  expect(BARRIER_THRESHOLD).toBeGreaterThan(0.5);
});

test("connectivity: every walkable tile is one component (30 seeds)", () => {
  for (let i = 0; i < 30; i++) {
    const seed = `conn-${i}`;
    const grid = generateGrid(seed, rollBiome(seed));
    let total = 0;
    let start: { x: number; y: number } | null = null;
    for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) {
      if (!walkable(grid.terrain[y]![x]!)) continue;
      total++;
      if (!start) start = { x, y };
    }
    expect(start).not.toBeNull();
    expect(flood(grid.terrain, start!)).toBe(total);
  }
});

test("barriers exist: most seeds carry a real wall mass", () => {
  let walled = 0;
  for (let i = 0; i < 30; i++) {
    const seed = `wall-${i}`;
    const grid = generateGrid(seed, rollBiome(seed));
    let walls = 0;
    for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) {
      if (!walkable(grid.terrain[y]![x]!)) walls++;
    }
    if (walls >= 60) walled++; // ≥5% of 1200 tiles is wall
  }
  expect(walled).toBeGreaterThanOrEqual(15); // "sometimes maze, often decisions, sometimes open" — at least half the seeds have real walls
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test test/barrier.test.ts`
Expected: FAIL — `BARRIER_NOISE_FREQUENCY` not exported. (The connectivity test may pass by luck pre-carve; the lever test anchors the red.)

- [ ] **Step 3: Add the levers + biome field**

In `src/data/constants.ts`, after `NOISE_FREQUENCY` (:8):

```ts
// Barrier layer (e3j): a SECOND, lower-frequency noise field lays long walls of
// each biome's barrierTerrain across the strip — the navigation puzzle. Tiles
// whose barrier sample exceeds BARRIER_THRESHOLD become wall; a connectivity
// pass then guarantees all walkable tiles stay one component (nothing is ever
// literally unreachable barefoot — mountains are cost-walls, not prisons).
export const BARRIER_NOISE_FREQUENCY = 0.06; // ≪ NOISE_FREQUENCY → chunky ridges, not speckle
export const BARRIER_THRESHOLD = 0.68; // the "how walled is the world" dial: lower = more maze
```

Extend the `Biome` type (:39-44) with `barrierTerrain: Terrain; // what a wall is made of here (e3j)` and add to each biome entry: `barrierTerrain: "mountain",` for woodland, desert, AND tundra (river-walled biomes are a data-tuning follow-up — the lever exists from day one).

- [ ] **Step 4: Compose the barrier layer in generation**

In `src/engine/grid.ts`, import `MAP_WIDTH, MAP_HEIGHT, BARRIER_NOISE_FREQUENCY, BARRIER_THRESHOLD` (add to the existing constants import) and `moveCost` from `./move`, and change the terrain loop body (:80-83) to:

```ts
// Sample mid-tile (the +0.5) so integer lattice points — where Perlin
// is always 0.5 — don't line up with the tile grid.
const noise = perlin2(mapSeed, (x + 0.5) * NOISE_FREQUENCY, (y + 0.5) * NOISE_FREQUENCY);
// Barrier layer (e3j): a low-frequency field carves long walls; the seed is
// namespaced so the two fields are independent.
const barrier = perlin2(`${mapSeed}:barrier`, (x + 0.5) * BARRIER_NOISE_FREQUENCY, (y + 0.5) * BARRIER_NOISE_FREQUENCY);
row.push(
  barrier > BARRIER_THRESHOLD
    ? biome.barrierTerrain
    : weightedPick(biome.terrainWeights, TERRAINS, noise),
);
```

- [ ] **Step 5: Add the connectivity carve pass**

In `src/engine/grid.ts`, add above `buildGrid`:

```ts
// e3j connectivity: barrier walls must never seal a pocket off entirely.
// Flood-label walkable (finite on-foot cost) regions; carve a pass from each
// minor region to the largest along the closest tile pair (Chebyshev, stable
// row-major tie-break — deterministic with no extra RNG). Carved tiles become
// the biome's most-weighted walkable terrain, so a pass reads as native
// ground (tundra passes are ice, elsewhere plains), not a scar.
const walkableTerrain = (t: Terrain): boolean => Number.isFinite(moveCost(t, null, []));

function carveTerrainOf(biome: Biome): Terrain {
  let best: Terrain = "plains";
  let bw = -1;
  for (const t of TERRAINS) {
    const w = biome.terrainWeights[t] ?? 0;
    if (walkableTerrain(t) && w > bw) { bw = w; best = t; }
  }
  return best;
}

function walkableRegions(terrain: Terrain[][]): { x: number; y: number }[][] {
  const label: number[][] = terrain.map((row) => row.map(() => -1));
  const regions: { x: number; y: number }[][] = [];
  for (let sy = 0; sy < MAP_HEIGHT; sy++) {
    for (let sx = 0; sx < MAP_WIDTH; sx++) {
      if (!walkableTerrain(terrain[sy]![sx]!) || label[sy]![sx]! !== -1) continue;
      const id = regions.length;
      const tiles: { x: number; y: number }[] = [];
      const stack = [{ x: sx, y: sy }];
      label[sy]![sx] = id;
      while (stack.length) {
        const c = stack.pop()!;
        tiles.push(c);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = c.x + dx, ny = c.y + dy;
            if (nx < 0 || ny < 0 || nx >= MAP_WIDTH || ny >= MAP_HEIGHT) continue;
            if (!walkableTerrain(terrain[ny]![nx]!) || label[ny]![nx]! !== -1) continue;
            label[ny]![nx] = id;
            stack.push({ x: nx, y: ny });
          }
        }
      }
      regions.push(tiles);
    }
  }
  return regions;
}

function carveConnectivity(terrain: Terrain[][], biome: Biome): void {
  const carve = carveTerrainOf(biome);
  // Each pass merges the second-largest region into the largest, so the
  // region count strictly decreases — guaranteed termination.
  for (;;) {
    const regions = walkableRegions(terrain).sort((a, b) => b.length - a.length);
    if (regions.length <= 1) return;
    const main = regions[0]!, minor = regions[1]!;
    let from = minor[0]!, to = main[0]!, best = Infinity;
    for (const a of minor) {
      for (const b of main) {
        const d = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
        if (d < best) { best = d; from = a; to = b; }
      }
    }
    let cx = from.x, cy = from.y;
    while (cx !== to.x || cy !== to.y) {
      cx += Math.sign(to.x - cx);
      cy += Math.sign(to.y - cy);
      if (!walkableTerrain(terrain[cy]![cx]!)) terrain[cy]![cx] = carve;
    }
  }
}
```

Then in `buildGrid`, immediately after the terrain loops finish (after :86, before the entry comment), insert:

```ts
carveConnectivity(terrain, biome);
```

(Entry selection and POI placement then run on the always-connected field, so the b91 guarantees hold unchanged.)

- [ ] **Step 6: Run the barrier tests**

Run: `bun test test/barrier.test.ts`
Expected: PASS ×3. If "barriers exist" fails low, lower `BARRIER_THRESHOLD` toward 0.62; if maps feel sealed (connectivity test slow / carves everywhere), raise it. Tune the lever, not the test — but keep the test's thresholds once green.

- [ ] **Step 7: Full suite (generation changed — snapshots + harnesses will notice)**

Run: `bun test`
Expected: snapshot diffs (terrain changed under every seed) — eyeball one for sanity (walls visible as mountain runs), then `bun test -u`. The sustainability harness MUST pass un-edited: if it goes red, the barrier layer is starving forage reach — lower `BARRIER_THRESHOLD` until green. Do NOT land red or weaken the harness.

- [ ] **Step 8: Gates + commit**

Run: `bun run typecheck && bun run lint && bun test`

```bash
git add -A
git commit -m "e3j.2: barrier noise layer + connectivity carve — walls with guaranteed passes"
```

---

### Task 3: Fresh/processed food — berries → stale-berries → jam (bead e3j.3 — parallel-safe with Task 1)

**Files:**
- Modify: `src/data/constants.ts` (`FOOD` :402, `FOOD_ENERGY` :111-114, `RECIPE` :409, biome herb tables :54/:65/:76, new `FRESH_TO_STALE` lever)
- Modify: `src/engine/carry.ts` (add `usedSlots`)
- Modify: `src/engine/reduce.ts` (gather: food-catalog yield routing, :236-270)
- Modify: `src/engine/bank.ts` (fresh→stale defId map at banking, :55)
- Test: `test/forage.test.ts` (create)

**Interfaces:**
- Consumes: `FOOD`, `carryCap`, `consumableSlots`, `GATHER_YIELD`, existing gather/return flows. (If Task 1 hasn't landed in this branch yet, `GRID_SIZE` may still exist — this task doesn't touch dimensions either way.)
- Produces: `FRESH_TO_STALE: Record<string, string>` in constants; `usedSlots(loadout, carry, carriedMaps): number` in `src/engine/carry.ts`. Task 4's docs step records both.

- [ ] **Step 1: Write the failing tests**

Create `test/forage.test.ts`:

```ts
import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { generateGrid, rollBiome } from "../src/engine/grid";
import type { Poi } from "../src/engine/grid";
import { slotOf } from "../src/engine/catalog";
import { GATHER_YIELD, FOOD_ENERGY, MAX_ENERGY } from "../src/data/constants";
import type { GameState } from "../src/engine/types";

// Find a map holding a berry-bush (an herb POI whose rolled material is
// "berries") — mirrors reduce-gather.test.ts's mapWith scan.
function berryMap(): { seed: string; poi: Poi } {
  for (let i = 0; i < 600; i++) {
    const seed = `forage-scan-${i}`;
    const grid = generateGrid(seed, rollBiome(seed));
    const poi = grid.pois.find((p) => p.kind === "herb" && p.material === "berries");
    if (poi) return { seed, poi };
  }
  throw new Error("no berries herb node in scan range");
}

function standingOn(
  seed: string,
  poi: Poi,
  opts: { energy?: number; food?: { defId: string; qty: number }[] } = {},
): GameState {
  const loadout = emptyLoadout();
  loadout.food = opts.food ?? [];
  return {
    seed: "g",
    phase: "expedition",
    bank: [],
    loadout: emptyLoadout(),
    expedition: {
      mapSeed: seed,
      pos: { x: poi.x, y: poi.y },
      energy: opts.energy ?? MAX_ENERGY,
      hp: 10,
      loadout,
      carry: [],
      cleared: [],
    },
  };
}

test("berries are food, stale-berries are not packable anywhere", () => {
  expect(slotOf("berries")).toBe("food");
  expect(slotOf("jam")).toBe("food");
  expect(slotOf("stale-berries")).toBeNull();
});

test("gathering berries routes to the FRONT of the food reserve, not carry", () => {
  const { seed, poi } = berryMap();
  // Full energy → the waste-free auto-eat can't fire, so packed food is untouched.
  const before = standingOn(seed, poi, { energy: MAX_ENERGY, food: [{ defId: "ration", qty: 2 }] });
  const { state, events } = reduce(before, { type: "gather" });
  expect(events[0]!.type).toBe("gathered");
  expect(state.expedition!.carry).toEqual([]); // NOT loot
  expect(state.expedition!.loadout.food).toEqual([
    { defId: "berries", qty: GATHER_YIELD.herb }, // fresh eats first — it stales on return, rations bank back
    { defId: "ration", qty: 2 },
  ]);
  expect(state.expedition!.cleared).toEqual([{ x: poi.x, y: poi.y }]);
});

test("gathering berries rejects carry-full when the bag can't hold the units", () => {
  const { seed, poi } = berryMap();
  // Bare bag = 6 slots (BASE_CARRY_SLOTS); 5 packed rations + 2 berries = 7 > 6.
  const before = standingOn(seed, poi, { energy: MAX_ENERGY, food: [{ defId: "ration", qty: 5 }] });
  const { events } = reduce(before, { type: "gather" });
  expect(events).toEqual([{ type: "action-rejected", action: "gather", reason: "carry-full" }]);
});

test("berries eat like food (30 restore)", () => {
  const { seed, poi } = berryMap();
  const before = standingOn(seed, poi, { energy: 200, food: [{ defId: "berries", qty: 1 }] });
  const { state, events } = reduce(before, { type: "eat" });
  expect(events[0]).toEqual({ type: "ate", defId: "berries", restored: FOOD_ENERGY.berries!, energy: 200 + FOOD_ENERGY.berries! });
  expect(state.expedition!.loadout.food).toEqual([]);
});

test("returning banks berries as stale-berries; rations bank back unchanged", () => {
  const { seed, poi } = berryMap();
  const before = standingOn(seed, poi, {
    energy: MAX_ENERGY,
    food: [
      { defId: "berries", qty: 2 },
      { defId: "ration", qty: 1 },
    ],
  });
  const { state } = reduce(before, { type: "return" });
  expect(state.phase).toBe("town");
  expect(state.bank).toEqual(
    expect.arrayContaining([
      { defId: "stale-berries", qty: 2 },
      { defId: "ration", qty: 1 },
    ]),
  );
  expect(state.bank.some((s) => s.defId === "berries")).toBe(false);
});

test("town crafts stale-berries ×3 → jam", () => {
  const town: GameState = {
    seed: "g",
    phase: "town",
    bank: [{ defId: "stale-berries", qty: 3 }],
    loadout: emptyLoadout(),
    expedition: null,
  };
  const { state, events } = reduce(town, { type: "craft", recipeId: "jam" });
  expect(events[0]!.type).toBe("crafted");
  expect(state.bank).toEqual([{ defId: "jam", qty: 1 }]);
});
```

- [ ] **Step 2: Run to verify failures**

Run: `bun test test/forage.test.ts`
Expected: FAIL — `berryMap` throws (no berries in any herb table yet), `slotOf("berries")` is null.

- [ ] **Step 3: Add the data — catalog, energies, weights, recipe, stale map**

In `src/data/constants.ts`:

`FOOD` (:402): `export const FOOD: string[] = ["ration", "trail-ration", "berries", "jam"];`

`FOOD_ENERGY` (:111-114) — add two entries:

```ts
export const FOOD_ENERGY: Record<string, number> = {
  ration: 80,
  "trail-ration": 160, // stays 2× a ration — the T2 density edge
  berries: 30, // fresh forage (e3j): weak-but-immediate — eat on the trail or lose them to staleness
  jam: 120, // processed stale-berries — hauling the harvest home beats eating it raw (1.5 rations/slot)
};
```

Below `FOOD_ENERGY`, add the lever:

```ts
// Fresh→processed food (e3j): fresh forage eaten on-map is good NOW; hauled
// home it STALES into a material (endExpedition maps defIds at banking) that
// town-crafts into denser food (jam). Stale forms are materials — slotOf never
// returns "food" for them — so they can't be packed back out: "old berries"
// enforce themselves with no extra rule.
export const FRESH_TO_STALE: Record<string, string> = { berries: "stale-berries" };
```

Biome herb tables — berries join the roll (woodland-heavy, desert/tundra light):
- woodland (:54): `herb: { "forest-herb": 7, berries: 4, "desert-sage": 2, "ice-moss": 1 },`
- desert (:65): `herb: { "desert-sage": 7, "forest-herb": 2, berries: 1, "ice-moss": 1 },`
- tundra (:76): `herb: { "ice-moss": 7, "desert-sage": 2, berries: 1, "forest-herb": 1 },`

`RECIPE` (:409 block) — after the `ration-*` group:

```ts
jam: { inputs: [{ defId: "stale-berries", qty: 3 }], output: { defId: "jam", qty: 1 } }, // the stale-berry payoff (e3j): denser than ration, cheaper than trail-ration
```

- [ ] **Step 4: Add the whole-bag occupancy helper**

In `src/engine/carry.ts`, after `freeLootStacks`:

```ts
// Whole-bag occupancy (e3j): consumable units + loot stacks + carried maps.
// Fresh forage lands in loadout.food (not carry), so gather's fit check for
// food yields must count every slot source, not just loot stacks.
export function usedSlots(
  loadout: Loadout,
  carry: ItemStack[],
  carriedMaps: { mapSeed: string }[] | undefined,
): number {
  return consumableSlots(loadout) + carry.length + (carriedMaps ?? []).length;
}
```

- [ ] **Step 5: Route food-catalog yields in gather**

In `src/engine/reduce.ts`: add `FOOD` to the constants import (:13) and `usedSlots, carryCap` to the carry import (:5 — `carryCap` comes from `./carry`). In `gather`, move `const qty = GATHER_YIELD[kind];` up to just after `const loadout = ...` (:243), then insert the branch before the `maxStacks` line (:244):

```ts
// Fresh forage (e3j): a yield that IS food (FOOD catalog) joins the food
// reserve at the FRONT — eaten before packed food, since fresh stales on
// return while rations bank back. One slot per unit, like packed food.
if (FOOD.includes(poi.material)) {
  const front = loadout.food[0];
  const food =
    front && front.defId === poi.material
      ? [{ defId: front.defId, qty: front.qty + qty }, ...loadout.food.slice(1)]
      : [{ defId: poi.material, qty }, ...loadout.food];
  const candidate = { ...loadout, food };
  if (usedSlots(candidate, expedition.carry, expedition.carriedMaps) > carryCap(candidate.equipment)) {
    return rejected(state, "gather", "carry-full");
  }
  return {
    state: {
      ...state,
      expedition: {
        ...expedition,
        energy,
        cleared: [...expedition.cleared, { x: pos.x, y: pos.y }],
        loadout: candidate,
      },
    },
    events: [
      { type: "gathered", at: { x: pos.x, y: pos.y }, kind: poi.kind, material: poi.material, qty, cost, energy },
    ],
  };
}
```

(The existing loot path below is untouched and still handles every non-food material.)

- [ ] **Step 6: Stale the fresh food at banking**

In `src/engine/bank.ts`: import `FRESH_TO_STALE` from `../data/constants`. In `endExpedition`, before the `return`, add:

```ts
// Fresh forage stales at the door (e3j): berries → stale-berries. Stale forms
// are materials (jam inputs), not food, so they can never be packed back out —
// "good now" food is only good now.
const foodHome = expedition.loadout.food.map((s) => ({
  defId: FRESH_TO_STALE[s.defId] ?? s.defId,
  qty: s.qty,
}));
```

and replace `...expedition.loadout.food, // uneaten food banks back (pqp)` (:55) with `...foodHome, // uneaten food banks back (pqp); fresh forage stales (e3j)`.

- [ ] **Step 7: Run the forage tests**

Run: `bun test test/forage.test.ts`
Expected: PASS ×6.

- [ ] **Step 8: Full suite — watch the sustainability harness**

Run: `bun test`
Expected: green. Two known risks:
- **Sustainability harness**: berries now occupy a share of herb rolls, and berries can't craft rations. If the harness goes red, the forager is starving on herb-table dilution — first try dropping tundra's berries weight to 0 (the harness's floor case is forage-only tundra; the desert/woodland weights are the feature). If it's still red, the harness forager needs to EAT gathered berries (they're food — that's the mechanic) rather than expect ration ingredients; adjust the harness's forage accounting, not the engine.
- **Snapshot tests**: herb-table weights shift material rolls under existing seeds — eyeball, then `bun test -u`.

- [ ] **Step 9: Gates + commit**

Run: `bun run typecheck && bun run lint && bun test`

```bash
git add -A
git commit -m "e3j.3: fresh/processed food — berries forage to the food reserve, stale into jam inputs at banking"
```

---

### Task 4: Density retune + reach-fraction verification + docs (bead e3j.4 — needs Tasks 1–3)

**Files:**
- Modify: `src/data/constants.ts` (`POI_DENSITY` :9, `POI_PLACEMENT_ATTEMPTS` :11)
- Create: `test/reach-fraction.test.ts` (structural reach assert + harvest-fraction report)
- Modify: `docs/decisions.md`, `docs/balance-levers.md`

**Interfaces:**
- Consumes: everything above (`MAP_WIDTH`/`MAP_HEIGHT`, barrier generation, berries).
- Produces: final lever values + the D-row documenting e3j. Nothing downstream.

- [ ] **Step 1: Retune density**

In `src/data/constants.ts`:

```ts
export const POI_DENSITY = 60; // POIs per 20×60 map (e3j): ~3× area × slightly denser — a geared+provisioned run should harvest ~half and CHOOSE which half. Was 18 on 20×20.
export const POI_PLACEMENT_ATTEMPTS = 2000; // seeded rejection-sampling budget per map (scaled with density, e3j)
```

- [ ] **Step 2: Add the structural reach assert + harvest report**

The existing loop harness gathers ONE node per run, so the fraction metric gets its own greedy driver. Create `test/reach-fraction.test.ts` (asserts stay structural; the fraction is a logged report — the 15–20%/50% targets are feel-tuned, not hard gates):

```ts
import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { newGame, candidateMaps } from "../src/engine/town";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { costToReach } from "../src/engine/reach";
import { MAX_ENERGY, MAP_WIDTH, MAP_HEIGHT } from "../src/data/constants";
import type { Action, GameState } from "../src/engine/types";

test("e3j structural: the strip out-ranges one energy tank (5 offered maps)", () => {
  // The farthest POI must cost more than MAX_ENERGY to even REACH on foot —
  // food (and forage routing) is the only way to work the deep half.
  for (let r = 0; r < 5; r++) {
    const c = candidateMaps("rf", r)[0]!;
    const grid = generateGrid(c.mapSeed, rollBiome(c.mapSeed));
    const reach = costToReach(grid.terrain, grid.entry);
    const finite = grid.pois.map((p) => reach[p.y]![p.x]!).filter(Number.isFinite);
    expect(finite.length).toBeGreaterThan(0);
    expect(Math.max(...finite)).toBeGreaterThan(MAX_ENERGY);
  }
});

test("e3j report: starter-kit harvest fraction", () => {
  const c = candidateMaps("rf", 0)[0]!;
  let state: GameState = newGame("rf");
  const act = (a: Action) => { state = reduce(state, a).state; };
  act({ type: "pack", slot: "tool", itemId: "pick" });
  act({ type: "pack", slot: "tool", itemId: "axe" });
  act({ type: "pack", slot: "tool", itemId: "knife" });
  act({ type: "pack", slot: "backpack", itemId: "starter" });
  for (let i = 0; i < 4; i++) act({ type: "pack", slot: "food", itemId: "ration" });
  act({ type: "embark", mapSeed: c.mapSeed });
  expect(state.phase).toBe("expedition");
  const grid = generateGrid(c.mapSeed, rollBiome(c.mapSeed));
  const gatherable = grid.pois.filter((p) => p.kind !== "monster" && p.material !== null);
  let cleared = 0;
  // Greedy: walk to the nearest unworked gatherable node, gather, DROP the loot
  // (this measures energy reach, not carry pressure), repeat until exhausted,
  // wedged, or killed (walking into a blocking monster unarmed can end the run).
  for (let step = 0; step < (MAP_WIDTH + MAP_HEIGHT) * 4 && state.expedition; step++) {
    const exp = state.expedition;
    const here = exp.pos;
    const targets = gatherable.filter((p) => !exp.cleared.some((q) => q.x === p.x && q.y === p.y));
    if (targets.length === 0) break;
    targets.sort(
      (a, b) =>
        Math.max(Math.abs(a.x - here.x), Math.abs(a.y - here.y)) -
        Math.max(Math.abs(b.x - here.x), Math.abs(b.y - here.y)),
    );
    const t = targets[0]!;
    if (t.x === here.x && t.y === here.y) {
      const r = reduce(state, { type: "gather" });
      state = r.state;
      if (!r.events.some((e) => e.type === "gathered")) break; // tool-too-weak/carry-full — greedy is done
      cleared++;
      state = reduce(state, { type: "drop", itemId: t.material! }).state; // shed loot: measure reach, not carry
      continue;
    }
    const r = reduce(state, { type: "move", to: { x: t.x, y: t.y } });
    if (r.events.some((e) => e.type === "action-rejected")) break; // exhausted / impassable
    state = r.state;
    if (state.expedition && state.expedition.pos.x === here.x && state.expedition.pos.y === here.y) break; // wedged
  }
  if (state.expedition) state = reduce(state, { type: "return" }).state;
  const fraction = cleared / grid.pois.length;
  console.log(
    `[e3j] starter-kit harvest: ${cleared}/${grid.pois.length} POIs (${(100 * fraction).toFixed(0)}%) — target 15–20% starter, ~50% geared`,
  );
  // Structural ceiling only: even a perfect starter run must not clear most of the map.
  expect(fraction).toBeLessThan(0.6);
});
```

(The driver drops loot after each gather — berries route to the food reserve and get eaten/auto-eaten, which is the mechanic under test. A dropped `drop` rejection is harmless: berries never enter `carry`, so the drop just no-ops into a rejection event that the driver ignores.)

- [ ] **Step 3: Run the harnesses; sanity-check the numbers**

Run: `bun test test/harness-loop.test.ts test/harness-sustainability.test.ts test/barrier.test.ts`
Expected: PASS, with the harvest fraction printed. If the starter fraction prints far above ~35%, the map is too easy — nudge `POI_DENSITY` up or reconsider `BARRIER_THRESHOLD`; far below ~8%, the strip is too hostile — raise berries weights or lower the threshold. Tune levers only; document the final values in the next step.

- [ ] **Step 4: Record the decision + levers**

`docs/decisions.md` — add the next D-row (D42 if free): 20×60 strip (`MAP_WIDTH`/`MAP_HEIGHT` replace `GRID_SIZE`), barrier noise layer + connectivity carve (`BARRIER_NOISE_FREQUENCY`/`BARRIER_THRESHOLD`/`BIOMES[*].barrierTerrain`), fresh→processed food (`berries`/`FRESH_TO_STALE`/`jam`), `POI_DENSITY` 60. Rationale: G3 — geared movement hit the `MIN_STEP` floor and a 20×20 map fit inside one 300 tank; the map now out-ranges the tank so food buys reach, and fresh-vs-processed makes forage a live eat-now-or-haul-home call. Note it implements the e3j spec and supersedes `GRID_SIZE`.

`docs/balance-levers.md` — Map & forecast section: replace `GRID_SIZE` with `MAP_WIDTH`/`MAP_HEIGHT`, add the two barrier levers + `barrierTerrain`, update `POI_DENSITY`; Energy economy section: add `berries` 30 / `jam` 120 to the `FOOD_ENERGY` list and document `FRESH_TO_STALE`.

- [ ] **Step 5: Full gates + commit**

Run: `bun test && bun run typecheck && bun run lint`

```bash
git add -A
git commit -m "e3j.4: POI density 60 on the long map + reach-fraction report; decisions/levers docs"
```

- [ ] **Step 6: Close the beads + sync (Team-maintainer profile is active)**

```bash
bd close idle-adventure-e3j.1 idle-adventure-e3j.2 idle-adventure-e3j.3 idle-adventure-e3j.4
bd close idle-adventure-e3j --reason="Reach economy landed: 20×60 strip, barrier noise + connectivity carve, berries→stale-berries→jam fresh/processed food, POI_DENSITY 60. Spec: 2026-07-06-reach-economy-long-map-design.md"
bd update idle-adventure-si7.2 --notes="e3j landed 2026-07-06: map out-ranges the tank (20×60 + barriers), food = scalable reach (fresh forage + jam). Verify feel via blind playtest before closing."
git pull --rebase && git push && bd dolt push
```
