# M1 — Deterministic Map Generation + Render Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Bead:** `idle-adventure-868.2` (M1). Design sources: `docs/superpowers/specs/2026-06-30-idle-adventure-poc-core-loop-design.md` §6/§10, `docs/superpowers/specs/2026-07-02-biomes-generation-profiles-design.md` (D21), plan doc M1 section.

**Goal:** `generateGrid(mapSeed, biomeId)` produces a deterministic 20×20 terrain grid with biome-weighted, min-spaced POIs, and `render(state)` serializes it as text (snapshots) and as a CSS grid (web), with 3 biomes defined purely as data.

**Architecture:** All generation lives in the pure engine (`src/engine/`): a stateless hash-based RNG (`rand(seed, ...context)` per the engine contract "RNG = hash(seed, context)"), a dependency-free 2D Perlin noise, and `generateGrid` which reads every tunable from `src/data/constants.ts`. Terrain is picked by mapping the Perlin value through the biome's cumulative `terrainWeights` bands in a fixed elevation order (river → mud → plains → ice → mountain), so regions are spatially coherent and proportions follow the weights. POIs are placed by seeded rejection sampling under a Chebyshev min-distance rule, with node kinds drawn from the biome's `nodeTypeWeights`. The renderer regenerates the grid from `mapSeed` (grid is never stored in state, per D14) and only serializes.

**Tech Stack:** TypeScript · bun (`bun test` native runner, jest-compatible snapshots) · zero new dependencies (hand-rolled seeded Perlin) · Bun's HTML dev server for the demo page (`bun ./src/web/index.html`).

## Global Constraints

- Engine purity (lint-enforced): no DOM, no `Math.random`/`Date.now`, no imports from `render`/`sim`/`web` under `src/engine/**`.
- RNG = `hash(state.seed, context)` — stateless, no PRNG objects carried in state.
- No magic numbers in engine logic — every tunable is a named lever in `src/data/constants.ts`.
- `GameState` holds only the present; the grid is **regenerated from `mapSeed`**, never stored.
- Biomes are generation profiles only (D21): consumed by `generateGrid`, never consulted after generation. Adding a biome must be a pure data entry.
- Biome derives from the map seed (`rollBiome(mapSeed)`) — `embark` stays `{type:'embark', mapSeed}`, no `biomeId` in `Action` (M6 contract note).
- Items untouched this milestone; `reduce` untouched this milestone.
- Gates before closing the bead: `bun test` · `bun run typecheck` · `bun run lint`.
- Commit-as-you-go in small commits (same authority pattern as M0; confirm with user at kickoff).

## File Structure

- Create `src/engine/rng.ts` — `hashString`, `rand`, `weightedPick`. One responsibility: deterministic randomness.
- Create `src/engine/noise.ts` — `perlin2(seed, x, y) → [0,1]`. Depends only on `rng.ts`.
- Modify `src/data/constants.ts` — terrain/node/biome vocabularies (`TERRAINS`, `NODE_TYPES`, `BIOME_IDS` + derived types), `BIOMES` table, filled map/POI levers, `NOISE_FREQUENCY`; **delete** `NOISE_THRESHOLDS` (subsumed per bead note).
- Create `src/engine/grid.ts` — `Grid`/`Poi` types, `rollBiome`, `generateGrid`. Reads levers from data.
- Modify `src/render/render.ts` — replace stub: `render(state)` text serialization, plus `renderGridText`/`renderGridHtml` helpers.
- Create `src/web/index.html`, `src/web/main.ts` — static map-viewer page (delete `src/web/.gitkeep`); add `"web"` script to `package.json`.
- Tests: `test/rng.test.ts`, `test/noise.test.ts`, `test/grid.test.ts`, `test/render.test.ts`; extend `test/constants.test.ts`.

---

### Task 1: Stateless hash RNG (`src/engine/rng.ts`)

**Files:**
- Create: `src/engine/rng.ts`
- Test: `test/rng.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `hashString(s: string): number` — 32-bit unsigned hash.
  - `rand(seed: string, ...context: (string | number)[]): number` — deterministic float in `[0, 1)`.
  - `weightedPick<K extends string>(weights: Partial<Record<K, number>>, order: readonly K[], roll: number): K` — cumulative-band pick; zero-weight keys are skipped; `roll` in `[0, 1)`.

- [ ] **Step 1: Write the failing test**

```ts
// test/rng.test.ts
import { test, expect } from "bun:test";
import { hashString, rand, weightedPick } from "../src/engine/rng";

test("rand: deterministic for identical seed+context", () => {
  expect(rand("seed-1", "poi-x", 3)).toBe(rand("seed-1", "poi-x", 3));
});

test("rand: different context gives different values", () => {
  const values = new Set(
    Array.from({ length: 100 }, (_, i) => rand("seed-1", "poi-x", i)),
  );
  expect(values.size).toBeGreaterThan(95); // no meaningful collisions
});

test("rand: different seeds decorrelate", () => {
  expect(rand("seed-1", "biome")).not.toBe(rand("seed-2", "biome"));
});

test("rand: stays in [0, 1)", () => {
  for (let i = 0; i < 1000; i++) {
    const v = rand("range-check", i);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  }
});

test("hashString: 32-bit unsigned and stable", () => {
  const h = hashString("abc");
  expect(h).toBe(hashString("abc"));
  expect(h).toBeGreaterThanOrEqual(0);
  expect(h).toBeLessThanOrEqual(0xffffffff);
  expect(Number.isInteger(h)).toBe(true);
});

test("weightedPick: bands follow cumulative weights in the given order", () => {
  const order = ["a", "b", "c"] as const;
  const weights = { a: 0.5, b: 0.25, c: 0.25 };
  expect(weightedPick(weights, order, 0.0)).toBe("a");
  expect(weightedPick(weights, order, 0.49)).toBe("a");
  expect(weightedPick(weights, order, 0.5)).toBe("b");
  expect(weightedPick(weights, order, 0.74)).toBe("b");
  expect(weightedPick(weights, order, 0.75)).toBe("c");
  expect(weightedPick(weights, order, 0.999)).toBe("c");
});

test("weightedPick: skips zero/absent weights and normalizes the rest", () => {
  const order = ["a", "b", "c"] as const;
  expect(weightedPick({ b: 2 }, order, 0.99)).toBe("b");
  expect(weightedPick({ a: 1, c: 3 }, order, 0.1)).toBe("a"); // a band = [0, 0.25)
  expect(weightedPick({ a: 1, c: 3 }, order, 0.3)).toBe("c");
});

test("weightedPick: throws when all weights are zero", () => {
  expect(() => weightedPick({}, ["a", "b"] as const, 0.5)).toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/rng.test.ts`
Expected: FAIL — `Cannot find module '../src/engine/rng'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/engine/rng.ts
// Deterministic, stateless randomness per the engine contract: RNG = hash(seed, context).
// No PRNG state is ever carried — every roll names its context explicitly.

export function hashString(s: string): number {
  // FNV-1a 32-bit, then a murmur3-style finalizer so near-identical
  // strings (e.g. "poi-x|1" vs "poi-x|2") don't produce correlated values.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function rand(seed: string, ...context: (string | number)[]): number {
  return hashString([seed, ...context].join("|")) / 0x100000000;
}

// Maps roll ∈ [0,1) onto cumulative bands of `weights`, walked in `order`.
// Zero/absent weights are skipped; remaining weights are normalized.
export function weightedPick<K extends string>(
  weights: Partial<Record<K, number>>,
  order: readonly K[],
  roll: number,
): K {
  let total = 0;
  for (const k of order) total += weights[k] ?? 0;
  if (total <= 0) throw new Error("weightedPick: all weights zero");
  let acc = 0;
  for (const k of order) {
    const w = weights[k] ?? 0;
    if (w === 0) continue;
    acc += w / total;
    if (roll < acc) return k;
  }
  for (const k of [...order].reverse()) {
    if ((weights[k] ?? 0) > 0) return k;
  }
  throw new Error("weightedPick: unreachable");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/rng.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Full gate + commit**

Run: `bun test && bun run typecheck && bun run lint`
Expected: all green (boundary test confirms `rng.ts` is purity-clean).

```bash
git add src/engine/rng.ts test/rng.test.ts
git commit -m "M1: stateless hash RNG — rand(seed, context) + weightedPick"
```

---

### Task 2: Seeded 2D Perlin noise (`src/engine/noise.ts`)

**Files:**
- Create: `src/engine/noise.ts`
- Test: `test/noise.test.ts`

**Interfaces:**
- Consumes: `rand` from `src/engine/rng.ts`.
- Produces: `perlin2(seed: string, x: number, y: number): number` — gradient noise normalized to `[0, 1]`, ≈0.5 at lattice points, spatially smooth.

- [ ] **Step 1: Write the failing test**

```ts
// test/noise.test.ts
import { test, expect } from "bun:test";
import { perlin2 } from "../src/engine/noise";

test("perlin2: deterministic for identical inputs", () => {
  expect(perlin2("s1", 3.7, 8.2)).toBe(perlin2("s1", 3.7, 8.2));
});

test("perlin2: different seeds give different fields", () => {
  expect(perlin2("s1", 3.7, 8.2)).not.toBe(perlin2("s2", 3.7, 8.2));
});

test("perlin2: output stays in [0, 1]", () => {
  for (let i = 0; i < 500; i++) {
    const v = perlin2("range", i * 0.173, i * 0.311);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  }
});

test("perlin2: spatially smooth — close samples differ less than far samples", () => {
  // Average |delta| over many probe points: a 0.05 step should move the
  // field far less than the field's overall spread does.
  let nearDelta = 0;
  let spread = 0;
  const probes = 200;
  for (let i = 0; i < probes; i++) {
    const x = 0.31 * i;
    const y = 0.17 * i;
    const v = perlin2("smooth", x, y);
    nearDelta += Math.abs(perlin2("smooth", x + 0.05, y) - v);
    spread += Math.abs(v - 0.5);
  }
  expect(nearDelta / probes).toBeLessThan((spread / probes) * 0.5);
});

test("perlin2: varies across the field (not constant)", () => {
  const values = new Set(
    Array.from({ length: 50 }, (_, i) => perlin2("vary", i * 0.37 + 0.5, i * 0.53 + 0.5)),
  );
  expect(values.size).toBeGreaterThan(40);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/noise.test.ts`
Expected: FAIL — `Cannot find module '../src/engine/noise'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/engine/noise.ts
import { rand } from "./rng";

// Classic 2D Perlin gradient noise, seeded via the stateless hash RNG.
// Gradients come from a fixed 8-direction set (no trig, no permutation
// table) — the lattice gradient for (xi, yi) is chosen by rand(seed, ...).

const GRADIENTS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [Math.SQRT1_2, Math.SQRT1_2],
  [-Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, -Math.SQRT1_2],
  [-Math.SQRT1_2, -Math.SQRT1_2],
];

function gradient(seed: string, xi: number, yi: number): readonly [number, number] {
  const i = Math.floor(rand(seed, "grad", xi, yi) * GRADIENTS.length);
  return GRADIENTS[i] ?? GRADIENTS[0]!;
}

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// Returns noise normalized to [0, 1]. Raw Perlin with unit gradients spans
// ±SQRT1_2, so we rescale by 1/SQRT1_2 before shifting to [0, 1].
export function perlin2(seed: string, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const dot = (xi: number, yi: number): number => {
    const [gx, gy] = gradient(seed, xi, yi);
    return gx * (x - xi) + gy * (y - yi);
  };
  const u = fade(x - x0);
  const v = fade(y - y0);
  const top = lerp(dot(x0, y0), dot(x0 + 1, y0), u);
  const bottom = lerp(dot(x0, y0 + 1), dot(x0 + 1, y0 + 1), u);
  const raw = lerp(top, bottom, v);
  const normalized = (raw / Math.SQRT1_2) * 0.5 + 0.5;
  return Math.min(1, Math.max(0, normalized));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/noise.test.ts`
Expected: PASS.

- [ ] **Step 5: Full gate + commit**

Run: `bun test && bun run typecheck && bun run lint`
Expected: all green.

```bash
git add src/engine/noise.ts test/noise.test.ts
git commit -m "M1: seeded dependency-free 2D Perlin noise"
```

---

### Task 3: Biome & map levers (`src/data/constants.ts`)

**Files:**
- Modify: `src/data/constants.ts` (map & forecast group, lines 6–12)
- Test: `test/constants.test.ts` (extend)

**Interfaces:**
- Consumes: nothing (pure data).
- Produces (used by Tasks 4–6):
  - `TERRAINS: readonly ["river","mud","plains","ice","mountain"]` — canonical **elevation band order** used to map noise → terrain.
  - `type Terrain = (typeof TERRAINS)[number]`
  - `NODE_TYPES: readonly ["mining","wood","herb","animal","monster"]`, `type NodeType`
  - `BIOME_IDS: readonly ["woodland","desert","tundra"]`, `type BiomeId`
  - `type Biome = { terrainWeights: Partial<Record<Terrain, number>>; nodeTypeWeights: Partial<Record<NodeType, number>>; creatureTable: string[]; materialTable: Partial<Record<NodeType, string>> }`
  - `BIOMES: Record<BiomeId, Biome>`
  - Filled levers: `POI_DENSITY = 12`, `POI_MIN_SPACING = 3`, `POI_PLACEMENT_ATTEMPTS = 400`, `NOISE_FREQUENCY = 0.15`; `GRID_SIZE` stays `20`.
  - `NOISE_THRESHOLDS` is **deleted**.
  - `TERRAIN_COST` retyped to `Record<Terrain, number>` (same keys/values — M2 fills real numbers).

- [ ] **Step 1: Extend the constants test (failing)**

Replace `test/constants.test.ts` with:

```ts
// test/constants.test.ts
import { test, expect } from "bun:test";
import {
  GRID_SIZE,
  TERRAIN_COST,
  BACKPACK_SLOTS,
  TERRAINS,
  NODE_TYPES,
  BIOME_IDS,
  BIOMES,
  POI_DENSITY,
  POI_MIN_SPACING,
  NOISE_FREQUENCY,
} from "../src/data/constants";

test("constants: lever groups exist with the documented shape", () => {
  expect(typeof GRID_SIZE).toBe("number");
  expect(TERRAIN_COST).toHaveProperty("ice");
  expect(BACKPACK_SLOTS).toHaveProperty("starter");
});

test("constants: M1 map levers are filled", () => {
  expect(GRID_SIZE).toBe(20);
  expect(POI_DENSITY).toBeGreaterThan(0);
  expect(POI_MIN_SPACING).toBeGreaterThanOrEqual(3);
  expect(NOISE_FREQUENCY).toBeGreaterThan(0);
});

test("constants: every biome is a complete generation profile", () => {
  expect(BIOME_IDS).toEqual(["woodland", "desert", "tundra"]);
  for (const id of BIOME_IDS) {
    const biome = BIOMES[id];
    const terrainTotal = TERRAINS.reduce(
      (sum, t) => sum + (biome.terrainWeights[t] ?? 0),
      0,
    );
    const nodeTotal = NODE_TYPES.reduce(
      (sum, n) => sum + (biome.nodeTypeWeights[n] ?? 0),
      0,
    );
    expect(terrainTotal).toBeGreaterThan(0);
    expect(nodeTotal).toBeGreaterThan(0);
    // creatureTable/materialTable stay empty until M4/M5 — but the slots exist
    expect(Array.isArray(biome.creatureTable)).toBe(true);
    expect(typeof biome.materialTable).toBe("object");
  }
});

test("constants: biomes are visibly distinct profiles", () => {
  expect(BIOMES.tundra.terrainWeights.ice ?? 0).toBeGreaterThan(0);
  expect(BIOMES.woodland.terrainWeights.ice ?? 0).toBe(0);
  expect(BIOMES.desert.terrainWeights.ice ?? 0).toBe(0);
  expect(BIOMES.desert.nodeTypeWeights.mining ?? 0).toBeGreaterThan(
    BIOMES.woodland.nodeTypeWeights.mining ?? 0,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/constants.test.ts`
Expected: FAIL — `TERRAINS` etc. not exported.

- [ ] **Step 3: Update the lever file**

In `src/data/constants.ts`, replace the map & forecast group (lines 6–12) with:

```ts
// --- Map & forecast (filled in M1) ---
export const GRID_SIZE = 20; // tiles per side
export const NOISE_FREQUENCY = 0.15; // Perlin sample step per tile; lower = larger terrain regions
export const POI_DENSITY = 12; // POIs per map
export const POI_MIN_SPACING = 3; // min Chebyshev distance between POIs (spec: 3–4 tiles apart)
export const POI_PLACEMENT_ATTEMPTS = 400; // seeded rejection-sampling budget per map
export const CANDIDATE_MAP_COUNT = 3; // town map choices (spec §11)
export const PREVIEW_FIDELITY = 0; // how much a preview reveals (placeholder — M5)

// Terrain vocabulary. Array order = elevation band order for noise→terrain
// mapping (river lowest … mountain highest) — reordering it reshapes maps.
export const TERRAINS = ["river", "mud", "plains", "ice", "mountain"] as const;
export type Terrain = (typeof TERRAINS)[number];

// Node (POI) vocabulary — what biome nodeTypeWeights and (M3) hardness/yield key on.
export const NODE_TYPES = ["mining", "wood", "herb", "animal", "monster"] as const;
export type NodeType = (typeof NODE_TYPES)[number];

// --- Biomes (D21): generation profiles ONLY, consumed by generateGrid and
// never consulted after generation. Adding a biome = adding one entry here.
export const BIOME_IDS = ["woodland", "desert", "tundra"] as const;
export type BiomeId = (typeof BIOME_IDS)[number];

export type Biome = {
  terrainWeights: Partial<Record<Terrain, number>>; // relative mix; zero/absent = never generates
  nodeTypeWeights: Partial<Record<NodeType, number>>; // relative POI kind mix
  creatureTable: string[]; // biome-flavoured monster defIds (filled M4)
  materialTable: Partial<Record<NodeType, string>>; // node kind → material defId (filled M3/M5)
};

export const BIOMES: Record<BiomeId, Biome> = {
  woodland: {
    terrainWeights: { plains: 0.4, mud: 0.25, river: 0.15, mountain: 0.2 },
    nodeTypeWeights: { wood: 0.35, herb: 0.25, animal: 0.2, monster: 0.15, mining: 0.05 },
    creatureTable: [],
    materialTable: {},
  },
  desert: {
    terrainWeights: { plains: 0.75, mountain: 0.2, river: 0.05 },
    nodeTypeWeights: { mining: 0.4, monster: 0.25, herb: 0.15, wood: 0.1, animal: 0.1 },
    creatureTable: [],
    materialTable: {},
  },
  tundra: {
    terrainWeights: { ice: 0.5, mountain: 0.25, plains: 0.15, river: 0.1 },
    nodeTypeWeights: { animal: 0.35, monster: 0.25, mining: 0.2, wood: 0.1, herb: 0.1 },
    creatureTable: [],
    materialTable: {},
  },
};
```

(`NOISE_THRESHOLDS` is gone — it was the flat pre-D21 shape.)

Then retype `TERRAIN_COST` (keep the placeholder zeros, M2 fills values):

```ts
export const TERRAIN_COST: Record<Terrain, number> = {
  plains: 0,
  mud: 0,
  ice: 0,
  river: 0,
  mountain: 0,
}; // per-terrain multiplier (values — M2)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test`
Expected: PASS — including the pre-existing constants/boundary tests. (Nothing imports `NOISE_THRESHOLDS`; if lint flags anything, fix before committing.)

- [ ] **Step 5: Full gate + commit**

Run: `bun test && bun run typecheck && bun run lint`
Expected: all green.

```bash
git add src/data/constants.ts test/constants.test.ts
git commit -m "M1: BIOMES generation profiles + map/POI levers (drops flat NOISE_THRESHOLDS)"
```

---

### Task 4: Terrain generation + biome roll (`src/engine/grid.ts`)

**Files:**
- Create: `src/engine/grid.ts`
- Test: `test/grid.test.ts`

**Interfaces:**
- Consumes: `rand`, `weightedPick` (Task 1); `perlin2` (Task 2); levers + types (Task 3).
- Produces:
  - `type Poi = { x: number; y: number; kind: NodeType }`
  - `type Grid = { biomeId: BiomeId; terrain: Terrain[][]; pois: Poi[]; entry: { x: number; y: number } }` — `terrain[y][x]`, row-major.
  - `rollBiome(mapSeed: string): BiomeId` — each candidate map rolls its biome from its seed (D21/M6: `embark` carries only `mapSeed`).
  - `generateGrid(mapSeed: string, biomeId: BiomeId): Grid` — POIs/entry arrive in Task 5; this task returns `pois: []`, `entry` placed.

- [ ] **Step 1: Write the failing test**

```ts
// test/grid.test.ts
import { test, expect } from "bun:test";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { GRID_SIZE, BIOME_IDS, TERRAINS } from "../src/data/constants";
import type { Terrain } from "../src/data/constants";

function terrainCounts(seed: string, biome: "woodland" | "desert" | "tundra") {
  const grid = generateGrid(seed, biome);
  const counts = Object.fromEntries(TERRAINS.map((t) => [t, 0])) as Record<Terrain, number>;
  for (const row of grid.terrain) for (const t of row) counts[t]++;
  return counts;
}

test("generateGrid: 20×20, row-major, fully terrained", () => {
  const grid = generateGrid("map-1", "woodland");
  expect(grid.terrain.length).toBe(GRID_SIZE);
  for (const row of grid.terrain) {
    expect(row.length).toBe(GRID_SIZE);
    for (const t of row) expect(TERRAINS).toContain(t);
  }
});

test("generateGrid: same seed+biome is deeply identical (deterministic)", () => {
  expect(generateGrid("map-1", "tundra")).toEqual(generateGrid("map-1", "tundra"));
});

test("generateGrid: different seeds give different terrain", () => {
  expect(generateGrid("map-1", "woodland").terrain).not.toEqual(
    generateGrid("map-2", "woodland").terrain,
  );
});

test("generateGrid: biome weights shape the terrain mix", () => {
  const desert = terrainCounts("mix-check", "desert");
  const tundra = terrainCounts("mix-check", "tundra");
  const woodland = terrainCounts("mix-check", "woodland");
  expect(desert.ice).toBe(0); // zero-weight terrain never generates
  expect(woodland.ice).toBe(0);
  expect(tundra.ice).toBeGreaterThan(0);
  expect(desert.plains).toBeGreaterThan(woodland.plains); // 0.75 vs 0.4 weight
});

test("generateGrid: terrain regions are coherent, not per-tile static", () => {
  // With NOISE_FREQUENCY ≈ 0.15, neighbours usually match — count horizontal
  // adjacent same-terrain pairs; static noise would sit near the weight-derived
  // collision rate (~0.3–0.45), coherent regions should clear it comfortably.
  const grid = generateGrid("coherence", "woodland");
  let same = 0;
  let pairs = 0;
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 1; x < GRID_SIZE; x++) {
      pairs++;
      if (grid.terrain[y]![x] === grid.terrain[y]![x - 1]) same++;
    }
  }
  expect(same / pairs).toBeGreaterThan(0.6);
});

test("rollBiome: deterministic and lands on a real biome", () => {
  expect(rollBiome("map-1")).toBe(rollBiome("map-1"));
  expect(BIOME_IDS).toContain(rollBiome("map-1"));
});

test("rollBiome: different seeds can roll different biomes", () => {
  const rolled = new Set(
    Array.from({ length: 30 }, (_, i) => rollBiome(`candidate-${i}`)),
  );
  expect(rolled.size).toBe(BIOME_IDS.length); // 30 seeds should hit all 3
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/grid.test.ts`
Expected: FAIL — `Cannot find module '../src/engine/grid'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/engine/grid.ts
// Deterministic map generation (M1). A biome is a generation profile only
// (D21): it is read here, at generation time, and never consulted again.
import {
  GRID_SIZE,
  NOISE_FREQUENCY,
  BIOMES,
  BIOME_IDS,
  TERRAINS,
} from "../data/constants";
import type { Terrain, NodeType, BiomeId } from "../data/constants";
import { rand, weightedPick } from "./rng";
import { perlin2 } from "./noise";

export type Poi = { x: number; y: number; kind: NodeType };

export type Grid = {
  biomeId: BiomeId;
  terrain: Terrain[][]; // [y][x]
  pois: Poi[];
  entry: { x: number; y: number };
};

// Each candidate map rolls its biome from its own seed — embark carries only
// mapSeed, and anyone holding the seed can re-derive the biome (D21, M6 note).
export function rollBiome(mapSeed: string): BiomeId {
  const i = Math.floor(rand(mapSeed, "biome") * BIOME_IDS.length);
  return BIOME_IDS[i] ?? BIOME_IDS[0]!;
}

export function generateGrid(mapSeed: string, biomeId: BiomeId): Grid {
  const biome = BIOMES[biomeId];
  const terrain: Terrain[][] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    const row: Terrain[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      // Sample mid-tile (the +0.5) so integer lattice points — where Perlin
      // is always 0.5 — don't line up with the tile grid.
      const noise = perlin2(mapSeed, (x + 0.5) * NOISE_FREQUENCY, (y + 0.5) * NOISE_FREQUENCY);
      // The noise value walks the biome's cumulative weight bands in TERRAINS
      // (elevation) order: coherent noise regions become coherent terrain.
      row.push(weightedPick(biome.terrainWeights, TERRAINS, noise));
    }
    terrain.push(row);
  }
  const entry = { x: Math.floor(rand(mapSeed, "entry") * GRID_SIZE), y: GRID_SIZE - 1 };
  return { biomeId, terrain, pois: [], entry };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/grid.test.ts`
Expected: PASS. If the coherence assertion falls short, lower `NOISE_FREQUENCY` (e.g. 0.12) — tune the lever, don't touch engine code.

- [ ] **Step 5: Full gate + commit**

Run: `bun test && bun run typecheck && bun run lint`
Expected: all green (boundary test covers the new engine files).

```bash
git add src/engine/grid.ts test/grid.test.ts
git commit -m "M1: biome-weighted Perlin terrain generation + rollBiome"
```

---

### Task 5: POI placement with min spacing (`src/engine/grid.ts`)

**Files:**
- Modify: `src/engine/grid.ts` (fill `pois` in `generateGrid`)
- Test: `test/grid.test.ts` (extend)

**Interfaces:**
- Consumes: everything from Task 4; levers `POI_DENSITY`, `POI_MIN_SPACING`, `POI_PLACEMENT_ATTEMPTS`.
- Produces: `generateGrid` now returns `pois` — `POI_DENSITY` entries, pairwise Chebyshev distance ≥ `POI_MIN_SPACING`, kinds drawn from the biome's `nodeTypeWeights`.

- [ ] **Step 1: Write the failing tests (append to `test/grid.test.ts`)**

```ts
import { POI_DENSITY, POI_MIN_SPACING, NODE_TYPES } from "../src/data/constants";
// (merge with the existing imports from ../src/data/constants)

const chebyshev = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

test("generateGrid: places POI_DENSITY POIs, in bounds, with valid kinds", () => {
  for (const seed of ["poi-a", "poi-b", "poi-c"]) {
    const grid = generateGrid(seed, "woodland");
    expect(grid.pois.length).toBe(POI_DENSITY);
    for (const poi of grid.pois) {
      expect(poi.x).toBeGreaterThanOrEqual(0);
      expect(poi.x).toBeLessThan(GRID_SIZE);
      expect(poi.y).toBeGreaterThanOrEqual(0);
      expect(poi.y).toBeLessThan(GRID_SIZE);
      expect(NODE_TYPES).toContain(poi.kind);
    }
  }
});

test("generateGrid: POIs respect min spacing (pairwise Chebyshev)", () => {
  for (const seed of ["poi-a", "poi-b", "poi-c"]) {
    const { pois } = generateGrid(seed, "desert");
    for (let i = 0; i < pois.length; i++) {
      for (let j = i + 1; j < pois.length; j++) {
        expect(chebyshev(pois[i]!, pois[j]!)).toBeGreaterThanOrEqual(POI_MIN_SPACING);
      }
    }
  }
});

test("generateGrid: biome nodeTypeWeights shape the POI kind mix", () => {
  // Aggregate across seeds: desert (mining 0.4) must out-mine woodland (0.05).
  const count = (biome: "woodland" | "desert", kind: string) => {
    let n = 0;
    for (let i = 0; i < 10; i++) {
      for (const poi of generateGrid(`kind-mix-${i}`, biome).pois) {
        if (poi.kind === kind) n++;
      }
    }
    return n;
  };
  expect(count("desert", "mining")).toBeGreaterThan(count("woodland", "mining"));
  expect(count("woodland", "wood")).toBeGreaterThan(count("desert", "wood"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/grid.test.ts`
Expected: FAIL — `pois.length` is 0.

- [ ] **Step 3: Implement placement**

In `src/engine/grid.ts`: add `POI_DENSITY, POI_MIN_SPACING, POI_PLACEMENT_ATTEMPTS` to the constants import, and replace `pois: []` construction in `generateGrid` with:

```ts
  // Seeded rejection sampling: walk a deterministic candidate stream, keep
  // candidates that clear POI_MIN_SPACING (Chebyshev — 8-dir movement) from
  // every accepted POI. Kind is drawn per accepted candidate from the biome.
  const pois: Poi[] = [];
  for (
    let attempt = 0;
    attempt < POI_PLACEMENT_ATTEMPTS && pois.length < POI_DENSITY;
    attempt++
  ) {
    const x = Math.floor(rand(mapSeed, "poi-x", attempt) * GRID_SIZE);
    const y = Math.floor(rand(mapSeed, "poi-y", attempt) * GRID_SIZE);
    const clear = pois.every(
      (p) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) >= POI_MIN_SPACING,
    );
    if (!clear) continue;
    const kind = weightedPick(
      biome.nodeTypeWeights,
      NODE_TYPES,
      rand(mapSeed, "poi-kind", attempt),
    );
    pois.push({ x, y, kind });
  }
```

(also import `NODE_TYPES` from `../data/constants` and return this `pois` in the `Grid`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/grid.test.ts`
Expected: PASS — including the Task 4 determinism test, which now also covers POIs via `toEqual`.

- [ ] **Step 5: Full gate + commit**

Run: `bun test && bun run typecheck && bun run lint`
Expected: all green.

```bash
git add src/engine/grid.ts test/grid.test.ts
git commit -m "M1: seeded POI placement — min spacing + biome-weighted node kinds"
```

---

### Task 6: Text render + snapshots (`src/render/render.ts`)

**Files:**
- Modify: `src/render/render.ts` (replace the M0 stub)
- Test: `test/render.test.ts`

**Interfaces:**
- Consumes: `generateGrid`, `rollBiome`, `Grid` (Tasks 4–5); `Terrain`, `NodeType` types (Task 3); `GameState` from `src/engine/types`.
- Produces:
  - `render(state: GameState): string` — `"(town)"` when no expedition; otherwise the text grid with `@` at `expedition.pos`. Grid is regenerated from `expedition.mapSeed` via `rollBiome` (never stored).
  - `renderGridText(grid: Grid, pos?: { x: number; y: number }): string` — one char per tile, rows joined with `\n`.
  - Char maps (exported): terrain `river "~" · mud "," · plains "." · ice "*" · mountain "^"`; POI `mining "O" · wood "T" · herb "H" · animal "A" · monster "X"`; player `"@"`.

- [ ] **Step 1: Write the failing test**

```ts
// test/render.test.ts
import { test, expect } from "bun:test";
import { render, renderGridText } from "../src/render/render";
import { generateGrid } from "../src/engine/grid";
import { GRID_SIZE, POI_DENSITY } from "../src/data/constants";
import type { GameState } from "../src/engine/types";

const expeditionState = (mapSeed: string): GameState => ({
  seed: "game-seed",
  phase: "expedition",
  bank: [],
  expedition: {
    mapSeed,
    pos: { x: 5, y: 5 },
    energy: 0,
    hp: 0,
    loadout: {
      equipment: {
        weapon: null, helmet: null, chest: null, legs: null, boots: null,
        gloves: null, tools: [], transport: null, backpack: null,
      },
      food: [],
      potions: [],
    },
    carry: [],
  },
});

test("render: town state renders the town placeholder", () => {
  const state: GameState = { seed: "s", phase: "town", bank: [], expedition: null };
  expect(render(state)).toBe("(town)");
});

test("renderGridText: 20 rows × 20 chars, byte-identical for same seed+biome", () => {
  const text = renderGridText(generateGrid("snap-1", "woodland"));
  const again = renderGridText(generateGrid("snap-1", "woodland"));
  expect(text).toBe(again);
  const rows = text.split("\n");
  expect(rows.length).toBe(GRID_SIZE);
  for (const row of rows) expect(row.length).toBe(GRID_SIZE);
});

test("renderGridText: snapshot per biome — same seed, visibly different maps", () => {
  expect(renderGridText(generateGrid("snap-1", "woodland"))).toMatchSnapshot("woodland");
  expect(renderGridText(generateGrid("snap-1", "desert"))).toMatchSnapshot("desert");
  expect(renderGridText(generateGrid("snap-1", "tundra"))).toMatchSnapshot("tundra");
  expect(renderGridText(generateGrid("snap-1", "desert"))).not.toBe(
    renderGridText(generateGrid("snap-1", "tundra")),
  );
});

test("renderGridText: draws all POIs as uppercase markers", () => {
  const grid = generateGrid("snap-1", "desert");
  const flat = renderGridText(grid).replace(/\n/g, "");
  const poiChars = flat.split("").filter((c) => "OTHAX".includes(c));
  expect(poiChars.length).toBe(POI_DENSITY);
});

test("render: expedition renders the grid with the player at pos", () => {
  const text = render(expeditionState("snap-1"));
  const rows = text.split("\n");
  expect(rows.length).toBe(GRID_SIZE);
  expect(rows[5]![5]).toBe("@");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/render.test.ts`
Expected: FAIL — `renderGridText` not exported; `render` returns `""`.

- [ ] **Step 3: Write the implementation**

Replace `src/render/render.ts` with:

```ts
import type { GameState } from "../engine/types";
import { generateGrid, rollBiome } from "../engine/grid";
import type { Grid } from "../engine/grid";
import type { Terrain, NodeType } from "../data/constants";

// Dumb view: state → string. The grid is REGENERATED from mapSeed (D14) —
// render holds no state and makes no decisions.

export const TERRAIN_CHAR: Record<Terrain, string> = {
  river: "~",
  mud: ",",
  plains: ".",
  ice: "*",
  mountain: "^",
};

export const POI_CHAR: Record<NodeType, string> = {
  mining: "O",
  wood: "T",
  herb: "H",
  animal: "A",
  monster: "X",
};

export const PLAYER_CHAR = "@";

export function render(state: GameState): string {
  if (!state.expedition) return "(town)";
  const { mapSeed, pos } = state.expedition;
  const grid = generateGrid(mapSeed, rollBiome(mapSeed));
  return renderGridText(grid, pos);
}

export function renderGridText(grid: Grid, pos?: { x: number; y: number }): string {
  const poiAt = new Map(grid.pois.map((p) => [`${p.x},${p.y}`, p.kind]));
  return grid.terrain
    .map((row, y) =>
      row
        .map((terrain, x) => {
          if (pos && pos.x === x && pos.y === y) return PLAYER_CHAR;
          const kind = poiAt.get(`${x},${y}`);
          return kind ? POI_CHAR[kind] : TERRAIN_CHAR[terrain];
        })
        .join(""),
    )
    .join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/render.test.ts`
Expected: PASS; three new snapshots written to `test/__snapshots__/render.test.ts.snap`. **Eyeball the snapshots** — woodland should read as plains/mud with rivers, desert as open plains with mountain ridges and `O` markers, tundra as ice fields. This is the first visual check of the whole milestone.

- [ ] **Step 5: Full gate + commit**

Run: `bun test && bun run typecheck && bun run lint`
Expected: all green (boundary intact: render imports engine, never the reverse).

```bash
git add src/render/render.ts test/render.test.ts test/__snapshots__/
git commit -m "M1: text grid serialization + per-biome snapshots"
```

---

### Task 7: CSS-grid web view (`renderGridHtml` + demo page)

**Files:**
- Modify: `src/render/render.ts` (add `renderGridHtml`)
- Create: `src/web/index.html`, `src/web/main.ts`
- Delete: `src/web/.gitkeep`
- Modify: `package.json` (add `"web"` script)
- Test: `test/render.test.ts` (extend)

**Interfaces:**
- Consumes: `Grid`, char maps, `poiAt` pattern from Task 6.
- Produces: `renderGridHtml(grid: Grid, pos?: { x: number; y: number }): string` — a `<div class="grid">` using `display:grid` with one `<div class="tile terrain-<t> [poi poi-<kind>] [player]">` per tile; page served with `bun run web`.

- [ ] **Step 1: Write the failing test (append to `test/render.test.ts`)**

```ts
import { renderGridHtml } from "../src/render/render";
// (merge into the existing import from ../src/render/render)

test("renderGridHtml: emits a CSS grid with one tile per cell", () => {
  const grid = generateGrid("snap-1", "woodland");
  const html = renderGridHtml(grid, grid.entry);
  expect(html).toContain(`grid-template-columns: repeat(${GRID_SIZE}`);
  expect(html.match(/class="tile /g)?.length).toBe(GRID_SIZE * GRID_SIZE);
  expect(html).toContain("player");
  expect(html.match(/ poi /g)?.length).toBe(POI_DENSITY);
  expect(html).toBe(renderGridHtml(generateGrid("snap-1", "woodland"), grid.entry));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/render.test.ts`
Expected: FAIL — `renderGridHtml` not exported.

- [ ] **Step 3: Implement `renderGridHtml` + the demo page**

Append to `src/render/render.ts`:

```ts
// HTML twin of renderGridText: same tile walk, CSS classes instead of chars.
// Styling lives in the web page; this stays a pure string serialization.
export function renderGridHtml(grid: Grid, pos?: { x: number; y: number }): string {
  const poiAt = new Map(grid.pois.map((p) => [`${p.x},${p.y}`, p.kind]));
  const cols = grid.terrain[0]?.length ?? 0;
  const tiles = grid.terrain
    .map((row, y) =>
      row
        .map((terrain, x) => {
          const kind = poiAt.get(`${x},${y}`);
          const isPlayer = pos !== undefined && pos.x === x && pos.y === y;
          const classes = `tile terrain-${terrain}${kind ? ` poi poi-${kind}` : ""}${isPlayer ? " player" : ""}`;
          const char = isPlayer ? PLAYER_CHAR : kind ? POI_CHAR[kind] : TERRAIN_CHAR[terrain];
          return `<div class="${classes}">${char}</div>`;
        })
        .join(""),
    )
    .join("");
  return `<div class="grid" style="display: grid; grid-template-columns: repeat(${cols}, 1.5rem);">${tiles}</div>`;
}
```

Create `src/web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Idle Adventure — map viewer</title>
    <style>
      body { font-family: ui-monospace, monospace; background: #1c1c22; color: #ddd; padding: 1.5rem; }
      .tile { width: 1.5rem; height: 1.5rem; display: flex; align-items: center; justify-content: center; }
      .terrain-plains { background: #4a6b3a; }
      .terrain-mud { background: #5c4a33; }
      .terrain-river { background: #2e5a8f; }
      .terrain-ice { background: #9fc4d8; color: #333; }
      .terrain-mountain { background: #6b6b70; }
      .poi { font-weight: bold; color: #ffd75e; }
      .player { color: #fff; background: #b03030; }
      a { color: #8ab4ff; }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

Create `src/web/main.ts`:

```ts
// Map-viewer demo driver (M1): pick a seed (and optionally force a biome)
// via query params, render the generated grid. ?seed=abc&biome=tundra
import { generateGrid, rollBiome } from "../engine/grid";
import { renderGridHtml } from "../render/render";
import { BIOME_IDS } from "../data/constants";
import type { BiomeId } from "../data/constants";

const params = new URLSearchParams(location.search);
const seed = params.get("seed") ?? "demo";
const forced = params.get("biome");
const biomeId: BiomeId = BIOME_IDS.includes(forced as BiomeId)
  ? (forced as BiomeId)
  : rollBiome(seed);
const grid = generateGrid(seed, biomeId);

document.querySelector("#app")!.innerHTML = `
  <h1>${biomeId} — seed “${seed}”</h1>
  ${renderGridHtml(grid, grid.entry)}
  <p>
    ${BIOME_IDS.map((b) => `<a href="?seed=${seed}&biome=${b}">${b}</a>`).join(" · ")}
    · <a href="?seed=${Math.floor(performance.now() * 997) % 100000}">random seed</a>
  </p>
`;
```

Add to `package.json` scripts:

```json
"web": "bun ./src/web/index.html"
```

Delete `src/web/.gitkeep`.

- [ ] **Step 4: Run tests + look at the page**

Run: `bun test && bun run typecheck && bun run lint`
Expected: all green (web code is outside the engine boundary; `performance.now` is fine there).

Run: `bun run web` — open the printed URL; check all three biome links produce visibly different 20×20 maps. Then stop the server.

- [ ] **Step 5: Commit**

```bash
git add src/render/render.ts src/web/index.html src/web/main.ts package.json test/render.test.ts
git rm src/web/.gitkeep
git commit -m "M1: CSS-grid HTML render + bun-served map viewer page"
```

---

### Task 8: Acceptance check, docs, close-out

**Files:**
- Modify: `docs/balance-levers.md` (map & forecast group)
- No code changes expected.

**Interfaces:** none — verification and bookkeeping.

- [ ] **Step 1: Verify the bead's acceptance criteria, one by one**

1. *Same seed+biome → byte-identical grid snapshot* — `bun test test/render.test.ts` (byte-identity + snapshot tests) → PASS.
2. *Different biomes → visibly different terrain/node mixes* — grid mix tests + snapshot diff test → PASS; eyeball `test/__snapshots__/render.test.ts.snap`.
3. *20×20 renders* — `bun run web`, view all three biomes.
4. *POIs respect min spacing* — `bun test test/grid.test.ts` → PASS.
5. *Adding a biome requires only a data entry* — review: `grid.ts`/`render.ts` reference only `BIOME_IDS`/`BIOMES` (no biome literals in engine logic). Temporarily add a fourth `BIOMES` entry + `BIOME_IDS` member locally, run `bun test` (snapshot tests unaffected — they name biomes explicitly), confirm compile+green, then revert the scratch entry.

- [ ] **Step 2: Update `docs/balance-levers.md`**

In the **Map & forecast** group, replace the first bullet and extend:

```markdown
- `GRID_SIZE` · `POI_DENSITY` · `POI_MIN_SPACING` · `POI_PLACEMENT_ATTEMPTS`
- `NOISE_FREQUENCY` — Perlin sample step per tile; lower = larger, chunkier terrain regions
```

(The `BIOMES` bullet is already current from the D21 doc pass — leave it.)

- [ ] **Step 3: Full gates**

Run: `bun test && bun run typecheck && bun run lint`
Expected: all green.

- [ ] **Step 4: Commit + close the bead**

```bash
git add docs/balance-levers.md
git commit -m "M1: document NOISE_FREQUENCY + POI placement levers"
bd close idle-adventure-868.2 --reason="M1 complete: biome-weighted Perlin terrain, min-spaced POIs, text+CSS-grid render, 3 data-only biomes. Gates green." --suggest-next
```

- [ ] **Step 5: Hand off**

Report per the conservative profile: changed files, gate results, snapshot eyeball notes, the pre-existing uncommitted doc changes from the previous session (`docs/decisions.md`, `docs/balance-levers.md`, spec/plan edits, `.beads/interactions.jsonl` — the D21 doc pass), and suggest next: `bd ready` → M2 (`idle-adventure-868.3`).

---

## Self-Review

- **Spec coverage:** `generateGrid(mapSeed, biomeId)` ✓ (T4/T5) · seeded Perlin via biome weights ✓ (T2/T4) · POI min-distance + biome-weighted kinds ✓ (T5) · text serialization for snapshots ✓ (T6) · CSS-grid render ✓ (T7) · levers filled incl. `BIOMES`, `NOISE_THRESHOLDS` removed ✓ (T3) · 3 biomes data-only, structured for N ✓ (T3, verified T8) · creature/material slots present-but-empty ✓ (T3) · biome-from-seed contract (`rollBiome`) ✓ (T4).
- **Placeholder scan:** none — every step carries code or exact commands.
- **Type consistency:** `Terrain`/`NodeType`/`BiomeId`/`Biome` defined once in `src/data/constants.ts` (T3), imported everywhere else; `Grid`/`Poi` defined once in `src/engine/grid.ts` (T4); `renderGridText(grid, pos?)` signature identical in T6 definition and T7 usage.
- **Noted judgment calls:** POIs may land on any terrain (impassability is an M2 concept — revisit there); `entry` sits on the bottom edge, seeded x (M2's `embark` will consume it); Perlin's center-heavy distribution skews band proportions slightly — acceptable, weights are feel-pass levers.
