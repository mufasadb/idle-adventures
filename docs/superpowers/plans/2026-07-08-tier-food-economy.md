# Tier-scaled Food Economy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give higher-tier maps a matching food-supply side — denser food + a stamina-ceiling gear axis — so tier-appropriate food harvests ~60% of a high-tier map while base rations harvest ~30%, sim-proven.

**Architecture:** Two coupled levers. (1) A food-density ladder: keep `ration` at 80 (protects the T1 sustainability floor), compress `trail-ration` down to open headroom, add one denser tier-food line (`pemmican`). (2) A new energy-capacity gear axis (`ENERGY_CAP_BONUS`, tent-pattern) that raises `maxEnergy` at embark, so denser food stays whole-unit auto-eatable. A new `src/sim/harvest.ts` greedy-harvest sim + `test/harvest-fraction.test.ts` prove the 60/30 bracket. Plus a mechanical `tank → capacity` terminology rename.

**Tech Stack:** TypeScript, bun, `bun test` (jest-compatible), pure-engine reducer (`reduce(state, action) → {state, events}`).

## Global Constraints

- **Engine purity (lint-enforced):** no `Math.random`/`Date.now`/DOM and no imports from `render`/`sim`/`web` under `src/engine/**`. New sim code lives in `src/sim/**` (may import engine).
- **No magic numbers in engine logic:** every tunable is a named `export const` in `src/data/constants.ts`. Engine/sim read levers; they never inline numbers.
- **Items are `{defId, qty}`** against the code-side catalog in `src/data/constants.ts`; no per-instance item state.
- **Optional state fields** read with their documented `??` default (`mapTier ?? 1`, `autoEat ?? true`, `maxEnergy ?? MAX_ENERGY`).
- **Every lever change lands with docs:** a `decisions.md` D-row (next number is **D47**; cite `docs/superpowers/specs/2026-07-08-tier-food-economy-design.md`) and a `balance-levers.md` update. Check the highest D-number before writing (currently D46).
- **Quality gates before any commit is considered done:** `bun test` + `bun run typecheck` + `bun run lint` all green.
- **T1 identity / sustainability floor:** `FOOD_ENERGY.ration` stays `80`. `test/harness-sustainability.test.ts` must stay green.
- **Do not touch** `test/combat.test.ts`'s `tank` local (a "damage-tank" loadout — unrelated to energy capacity).

---

## File Structure

- `src/data/constants.ts` — all new levers: `ENERGY_CAP_BONUS`, `FOOD_ENERGY.pemmican`, `trail-ration` retune, `FOOD` += pemmican, `canteen` in `TOOL_CAPABILITY`, new `RECIPE` entries, `HARVEST_FRACTION_*_TARGET`.
- `src/engine/reduce.ts` — `energyCapOf(equipment)` helper (exported) + embark uses `maxEnergy = MAX_ENERGY + energyCapOf(...)` and embarks at full.
- `src/sim/balance.ts` / `src/sim/balance-cli.ts` — `tank → capacity` rename (`ReachRow.capacities`, `summary.farthestCapacities`).
- `src/sim/harvest.ts` — **new** — `simHarvest(loadout, mapSeed, mapTier)` greedy-harvest sim + `harvestFractionReport()`.
- `test/harvest-fraction.test.ts` — **new** — the 60/30 bracket proof.
- `test/energy-capacity.test.ts` — **new** — capacity-gear embark behaviour.
- `test/food-ladder.test.ts` — **new** — pemmican density + eat-under-ceiling coupling.
- Rename-touched tests: `test/entry-reach.test.ts`, `test/reach-fraction.test.ts`, `test/balance-sim.test.ts`.
- Docs: `docs/decisions.md` (D47), `docs/balance-levers.md`.

---

### Task 1: Terminology rename — `tank` → `capacity`

Mechanical, isolated, no behaviour change. Do it first so later diffs are clean.

**Files:**
- Modify: `src/sim/balance.ts:180,186,197,207`
- Modify: `src/sim/balance-cli.ts:56,60`
- Modify: `src/data/constants.ts:7` (comment)
- Modify: `test/entry-reach.test.ts:21,32,52,57`
- Modify: `test/reach-fraction.test.ts:25` (test name)
- Modify: `test/balance-sim.test.ts:52,58`

**Interfaces:**
- Produces: `ReachRow.capacities: number | null`, `ReachReport.summary.farthestCapacities: number` (consumed by the CLI renderer and `test/balance-sim.test.ts`).

- [ ] **Step 1: Rename the sim types + computations**

In `src/sim/balance.ts`, change `ReachRow` (line ~180) and the `simReach` body:

```typescript
export type ReachRow = { x: number; y: number; kind: NodeType; what: string | null; cost: number | null; capacities: number | null };
export type ReachReport = {
  mapSeed: string;
  biomeId: string;
  entry: { x: number; y: number };
  pois: ReachRow[];
  summary: { pois: number; reachable: number; farthestCost: number; farthestCapacities: number };
};
```

In `simReach`, the POI map (line ~197) and summary (line ~207):

```typescript
      return { x: p.x, y: p.y, kind: p.kind, what: p.creature ?? p.material, cost: finite ? round1(c) : null, capacities: finite ? round1(c / MAX_ENERGY) : null };
```
```typescript
    summary: { pois: pois.length, reachable: finiteCosts.length, farthestCost, farthestCapacities: round1(farthestCost / MAX_ENERGY) },
```

- [ ] **Step 2: Rename in the CLI renderer**

In `src/sim/balance-cli.ts`, `renderReach` (lines 56 & 60):

```typescript
  const rows = r.pois.map((p) => `  (${String(p.x).padStart(2)},${String(p.y).padStart(2)}) ${p.kind.padEnd(7)} ${(p.what ?? "—").padEnd(16)} ${p.cost === null ? "  unreachable" : `${String(p.cost).padStart(6)}e  ${p.capacities}x capacity`}`);
```
```typescript
    `summary: ${r.summary.reachable}/${r.summary.pois} reachable · farthest ${r.summary.farthestCost}e = ${r.summary.farthestCapacities}x capacity`,
```

- [ ] **Step 3: Rename in tests + the constants comment**

`src/data/constants.ts:7` — reword the comment, e.g. `// 20×60 strip (e3j): the map outgrows one 300-energy capacity so food buys reach`.

`test/balance-sim.test.ts:58`:
```typescript
  expect(report.summary.farthestCapacities).toBeGreaterThan(1); // e3j: the strip out-ranges one energy capacity
```
Update its test-name string (line 52) `... out-ranges one tank` → `... out-ranges one capacity`.

`test/reach-fraction.test.ts:25` — test name `... out-ranges one energy tank ...` → `... out-ranges one energy capacity ...`.

`test/entry-reach.test.ts` — rename `WITHIN_TANK_FLOOR` → `WITHIN_CAPACITY_FLOOR` (declaration line 32 + use line 52), and reword the "within-tank" comment/log phrasing (lines 21, 57) to "within-capacity".

- [ ] **Step 4: Verify green + no stray "tank" (energy sense) remains**

Run: `bun test && bun run typecheck && bun run lint`
Expected: all PASS.

Run: `grep -rn "tank" src/ test/ | grep -iv "combat.test"`
Expected: no energy-sense "tank" hits (the only remaining `tank` is `test/combat.test.ts`'s damage-tank local — intentionally untouched).

- [ ] **Step 5: Commit**

```bash
git add src/sim/balance.ts src/sim/balance-cli.ts src/data/constants.ts test/entry-reach.test.ts test/reach-fraction.test.ts test/balance-sim.test.ts
git commit -m "refactor(si7.2): rename energy 'tank' → 'capacity' (sim + tests + comment)"
```

---

### Task 2: Energy-capacity gear axis

New `ENERGY_CAP_BONUS` lever + `canteen` tool; embark raises `maxEnergy` and embarks at full.

**Files:**
- Modify: `src/data/constants.ts` (energy section ~120-123; `TOOL_CAPABILITY` ~207; `RECIPE` ~502)
- Modify: `src/engine/reduce.ts` (embark ~99,119; helper near `tentMultOf` ~679)
- Test: `test/energy-capacity.test.ts` (new)

**Interfaces:**
- Produces: `ENERGY_CAP_BONUS: Record<string, number>` (constants); `energyCapOf(equipment: Equipment): number` (exported from `reduce.ts`); embark sets `expedition.maxEnergy = MAX_ENERGY + energyCapOf(equipment)` and `expedition.energy = maxEnergy`.

- [ ] **Step 1: Write the failing test**

Create `test/energy-capacity.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { candidateMaps } from "../src/engine/town";
import { emptyLoadout } from "../src/engine/loadout";
import { MAX_ENERGY, ENERGY_CAP_BONUS } from "../src/data/constants";
import { energyCapOf } from "../src/engine/reduce";
import type { GameState, Action } from "../src/engine/types";

function town(bank: { defId: string; qty: number }[]): GameState {
  return { seed: "cap", phase: "town", bank, loadout: emptyLoadout(), expedition: null, runs: 0 };
}

test("energyCapOf sums ENERGY_CAP_BONUS over equipped tools", () => {
  const eq = { ...emptyLoadout().equipment, tools: ["canteen"] };
  expect(energyCapOf(eq)).toBe(ENERGY_CAP_BONUS.canteen);
  expect(energyCapOf(emptyLoadout().equipment)).toBe(0);
});

test("embark with a canteen raises maxEnergy and starts full", () => {
  const seed = candidateMaps("cap", 0)[0]!.mapSeed;
  let s = town([{ defId: "canteen", qty: 1 }]);
  s = reduce(s, { type: "pack", slot: "tool", itemId: "canteen" } as Action).state;
  s = reduce(s, { type: "embark", mapSeed: seed } as Action).state;
  expect(s.expedition!.maxEnergy).toBe(MAX_ENERGY + ENERGY_CAP_BONUS.canteen);
  expect(s.expedition!.energy).toBe(MAX_ENERGY + ENERGY_CAP_BONUS.canteen);
});

test("embark with no capacity gear is unchanged at MAX_ENERGY", () => {
  const seed = candidateMaps("cap", 0)[0]!.mapSeed;
  let s = town([]);
  s = reduce(s, { type: "embark", mapSeed: seed } as Action).state;
  expect(s.expedition!.maxEnergy).toBe(MAX_ENERGY);
  expect(s.expedition!.energy).toBe(MAX_ENERGY);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `bun test test/energy-capacity.test.ts`
Expected: FAIL — `ENERGY_CAP_BONUS`/`energyCapOf`/`canteen` not defined.

- [ ] **Step 3: Add the lever + tool + recipe in constants.ts**

After `TENT_FOOD_MULTIPLIER` (line ~123) add:

```typescript
// Energy-capacity gear (si7.2): a durable tool that RAISES the stamina ceiling
// (maxEnergy) additively at embark, so denser tier food stays whole-unit
// auto-eatable (eatToRefill only eats a unit that fits under max). One proof
// line for the POC (canteen +100 → 300→400); biome-tier variants are m0a.
export const ENERGY_CAP_BONUS: Record<string, number> = {
  canteen: 100,
};
```

In `TOOL_CAPABILITY` (after the `tent` line ~221) add:

```typescript
  canteen: "provision", // stamina gear (si7.2): raises maxEnergy; NODE_TOOL never asks for "provision", so no gather impact
```

In `RECIPE` (near `tent` ~502) add (copper is a known dead material — playtest v3; this gives it a sink):

```typescript
  canteen: { inputs: [{ defId: "copper-ore", qty: 2 }, { defId: "deer-hide", qty: 1 }], output: { defId: "canteen", qty: 1 } }, // provision gear (si7.2): +maxEnergy; a copper sink
```

- [ ] **Step 4: Add `energyCapOf` + use it in embark**

In `src/engine/reduce.ts`, add the import of `ENERGY_CAP_BONUS` to the constants import, and add near `tentMultOf` (~679):

```typescript
// Sum of ENERGY_CAP_BONUS over equipped tools (si7.2): the flat maxEnergy raise
// from capacity gear. Mirrors tentMultOf's read-gear-on-demand pattern.
export function energyCapOf(equipment: Equipment): number {
  return equipment.tools.reduce((sum, t) => sum + (ENERGY_CAP_BONUS[t] ?? 0), 0);
}
```

(Ensure `Equipment` is imported from `./types` in reduce.ts — it is used widely; add to the type import if missing.)

In `embark` (lines ~96-99), replace the fixed energy with the raised ceiling:

```typescript
  const maxEnergy = MAX_ENERGY + energyCapOf(state.loadout.equipment);
  const energy = maxEnergy;
```

And in the expedition object (line ~119) set `maxEnergy,` (shorthand) instead of `maxEnergy: MAX_ENERGY,`. The `embarked` event keeps `energy` (now the raised value).

- [ ] **Step 5: Run the test + full gates**

Run: `bun test test/energy-capacity.test.ts`
Expected: PASS.

Run: `bun test && bun run typecheck && bun run lint`
Expected: all PASS (sustainability + reach-fraction unaffected — no capacity gear in those kits).

- [ ] **Step 6: Commit**

```bash
git add src/data/constants.ts src/engine/reduce.ts test/energy-capacity.test.ts
git commit -m "feat(si7.2): energy-capacity gear axis (ENERGY_CAP_BONUS + canteen), embark at raised ceiling"
```

---

### Task 3: Food-density ladder — `pemmican` + `trail-ration` compression

**Files:**
- Modify: `src/data/constants.ts` (`FOOD_ENERGY` ~126-131; `FOOD` ~464; `RECIPE` add pemmican)
- Test: `test/food-ladder.test.ts` (new)

**Interfaces:**
- Produces: `FOOD_ENERGY.pemmican` (denser tier food), retuned `FOOD_ENERGY["trail-ration"]`, `FOOD` includes `"pemmican"`, `RECIPE.pemmican`. (Initial numbers below are seeds; **Task 5 tunes them** to hit the 60/30 bracket.)

- [ ] **Step 1: Write the failing test**

Create `test/food-ladder.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { foodEnergyOf, eatToRefill } from "../src/engine/food";
import { slotOf } from "../src/engine/catalog";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { FOOD_ENERGY, MAX_ENERGY } from "../src/data/constants";
import type { GameState, Action } from "../src/engine/types";

test("pemmican is a food, denser than trail-ration, under the base ceiling", () => {
  expect(slotOf("pemmican")).toBe("food");
  expect(foodEnergyOf("pemmican")).toBeGreaterThan(FOOD_ENERGY["trail-ration"]!);
  expect(foodEnergyOf("pemmican")).toBeLessThan(MAX_ENERGY); // must stay auto-eatable
});

test("ration stays at 80 (T1 sustainability floor)", () => {
  expect(FOOD_ENERGY.ration).toBe(80);
});

test("dense food is blocked at a full base ceiling but eats under a raised one", () => {
  const dense = foodEnergyOf("pemmican");
  // At MAX_ENERGY with only headroom for a smaller unit, pemmican at the front blocks:
  const blocked = eatToRefill([{ defId: "pemmican", qty: 1 }], MAX_ENERGY - 1, MAX_ENERGY);
  expect(blocked.food.length).toBe(1); // uneaten — would overfill
  // With a raised ceiling and low energy, it eats:
  const eaten = eatToRefill([{ defId: "pemmican", qty: 1 }], 100, 100 + dense);
  expect(eaten.food.length).toBe(0);
  expect(eaten.energy).toBe(100 + dense);
});

test("pemmican crafts from a hunt input + foraged berries", () => {
  const s: GameState = { seed: "f", phase: "town", bank: [{ defId: "drake-hide", qty: 1 }, { defId: "stale-berries", qty: 2 }], loadout: emptyLoadout(), expedition: null, runs: 0 };
  const r = reduce(s, { type: "craft", recipeId: "pemmican" } as Action);
  expect(r.events.some((e) => e.type === "action-rejected")).toBe(false);
  expect(r.state.bank.find((x) => x.defId === "pemmican")?.qty).toBe(1);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `bun test test/food-ladder.test.ts`
Expected: FAIL — pemmican unknown.

- [ ] **Step 3: Add pemmican + compress trail-ration**

In `src/data/constants.ts`, update `FOOD_ENERGY` (lines ~126-131):

```typescript
export const FOOD_ENERGY: Record<string, number> = {
  ration: 80, // T1 floor — do NOT lower (tundra forage-only sustainability, harness-gated)
  "trail-ration": 130, // compressed from 160 (si7.2) — opens ladder headroom above it
  berries: 30, // fresh forage (e3j): weak-but-immediate — eat on the trail or lose them to staleness
  jam: 120, // processed stale-berries — hauling the harvest home beats eating it raw (1.5 rations/slot)
  pemmican: 240, // tier-food line (si7.2): dense trail food (meat + berries); < MAX_ENERGY so it stays auto-eatable. TUNED in the harvest sim.
};
```

Add `"pemmican"` to `FOOD` (line ~464):

```typescript
export const FOOD: string[] = ["ration", "trail-ration", "berries", "jam", "pemmican"];
```

Add the recipe in `RECIPE` (near `jam`/`trail-ration`, e.g. after line ~484). Pemmican needs **both** a meat input (huntable hide OR — noted for m0a — a monster-drop meat) and a foraged berry input, so either gather source feeds it:

```typescript
  pemmican: { inputs: [{ defId: "drake-hide", qty: 1 }, { defId: "stale-berries", qty: 2 }], output: { defId: "pemmican", qty: 1 } }, // dense trail food (si7.2): meat + berries. Monster-drop-meat variant → m0a.
```

- [ ] **Step 4: Run the test + full gates (sustainability MUST stay green)**

Run: `bun test test/food-ladder.test.ts`
Expected: PASS.

Run: `bun test test/harness-sustainability.test.ts`
Expected: PASS (harness uses only `ration`, unchanged).

Run: `bun test && bun run typecheck && bun run lint`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/constants.ts test/food-ladder.test.ts
git commit -m "feat(si7.2): pemmican tier-food line + trail-ration compression (density ladder)"
```

---

### Task 4: Harvest-fraction sim (`src/sim/harvest.ts`)

A greedy reference player that packs a loadout, embarks at a given map tier, harvests the reachable POIs, and returns the cleared fraction. Modeled on `test/reach-fraction.test.ts`'s greedy walker but parameterized by tier + loadout.

**Files:**
- Create: `src/sim/harvest.ts`
- Test: `test/harvest-fraction.test.ts` (structural half; the bracket assertion is Task 5)

**Interfaces:**
- Produces:
  - `type HarvestResult = { mapSeed: string; mapTier: number; cleared: number; total: number; fraction: number }`
  - `simHarvest(pack: PackSpec, mapSeed: string, mapTier: number): HarvestResult`
  - `type PackSpec = { tools?: string[]; backpack?: string; transport?: string; food: { defId: string; qty: number }[] }`
  - `harvestFractionReport(pack: PackSpec, mapTier: number, seeds: string[]): { rows: HarvestResult[]; avg: number }`

- [ ] **Step 1: Write the sim module**

Create `src/sim/harvest.ts`:

```typescript
// Harvest-fraction sim (si7.2): a greedy reference player packs a loadout, embarks
// at a given MAP TIER, and greedily clears the nearest gatherable POI it can afford
// until exhausted/wedged. Returns the fraction of the map's POIs cleared — the
// "reachable-and-affordable ceiling" for that loadout at that tier. Pure/seeded
// (drives reduce; no Math.random). Sibling to simReach/mapTierReport in balance.ts.
import { reduce } from "../engine/reduce";
import { generateGrid, rollBiome } from "../engine/grid";
import { emptyLoadout } from "../engine/loadout";
import { MAP_WIDTH, MAP_HEIGHT } from "../data/constants";
import type { BiomeId } from "../data/constants";
import type { GameState, Action } from "../engine/types";

export type PackSpec = { tools?: string[]; backpack?: string; transport?: string; food: { defId: string; qty: number }[] };
export type HarvestResult = { mapSeed: string; mapTier: number; cleared: number; total: number; fraction: number };

const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export function simHarvest(pack: PackSpec, mapSeed: string, mapTier: number): HarvestResult {
  const biomeId = rollBiome(mapSeed) as BiomeId;
  // A stocked bank that covers everything we pack (generous qty), plus a HELD map
  // carrying the tier so embark threads mapTier (reduce reads heldMap.tier).
  const bank = [
    ...(pack.tools ?? []).map((defId) => ({ defId, qty: 1 })),
    ...(pack.backpack ? [{ defId: pack.backpack, qty: 1 }] : []),
    ...(pack.transport ? [{ defId: pack.transport, qty: 1 }] : []),
    ...pack.food.map((f) => ({ ...f })),
  ];
  let s: GameState = {
    seed: "harvest",
    phase: "town",
    bank,
    loadout: emptyLoadout(),
    maps: [{ mapSeed, biomeId, vintage: 0, tier: mapTier }],
    expedition: null,
    runs: 0,
  };
  const pk = (slot: string, itemId: string) => { s = reduce(s, { type: "pack", slot, itemId } as Action).state; };
  if (pack.backpack) pk("backpack", pack.backpack);
  if (pack.transport) pk("transport", pack.transport);
  for (const t of pack.tools ?? []) pk("tool", t);
  for (const f of pack.food) for (let i = 0; i < f.qty; i++) pk("food", f.defId);

  s = reduce(s, { type: "embark", mapSeed } as Action).state;
  const grid = generateGrid(mapSeed, biomeId, mapTier);
  const total = grid.pois.length;
  if (!s.expedition) return { mapSeed, mapTier, cleared: 0, total, fraction: 0 };

  // Only nodes a bare-hands/pick/knife kit can work (skip wood — no axe here) and
  // materials at tier ≤ 1 tool quality; keeps the greedy walker from wedging on
  // tool-too-weak rejections. This measures reach, not tool progression.
  const gatherable = grid.pois.filter((p) => p.kind === "herb" || p.kind === "mining" || p.kind === "animal");
  let cleared = 0;
  const skipped = new Set<string>();
  for (let step = 0; step < (MAP_WIDTH + MAP_HEIGHT) * 4 && s.expedition; step++) {
    const here = s.expedition.pos;
    const targets = gatherable.filter(
      (p) => !s.expedition!.cleared.some((q) => q.x === p.x && q.y === p.y) && !skipped.has(`${p.x},${p.y}`),
    );
    if (targets.length === 0) break;
    targets.sort((a, b) => cheb(a, here) - cheb(b, here));
    const t = targets[0]!;
    if (t.x === here.x && t.y === here.y) {
      const r = reduce(s, { type: "gather" });
      s = r.state;
      if (!r.events.some((e) => e.type === "gathered")) { skipped.add(`${t.x},${t.y}`); continue; }
      cleared++;
      if (t.material) s = reduce(s, { type: "drop", itemId: t.material } as Action).state; // shed loot: measure reach, not carry
      continue;
    }
    const r = reduce(s, { type: "move", to: { x: t.x, y: t.y } });
    if (r.events.some((e) => e.type === "action-rejected")) break;
    s = r.state;
    if (s.expedition?.combat) { skipped.add(`${t.x},${t.y}`); continue; } // walked into a monster; skip it
    if (s.expedition && s.expedition.pos.x === here.x && s.expedition.pos.y === here.y) break; // wedged
  }
  return { mapSeed, mapTier, cleared, total, fraction: total ? cleared / total : 0 };
}

export function harvestFractionReport(pack: PackSpec, mapTier: number, seeds: string[]): { rows: HarvestResult[]; avg: number } {
  const rows = seeds.map((seed) => simHarvest(pack, seed, mapTier));
  const avg = rows.reduce((sum, r) => sum + r.fraction, 0) / (rows.length || 1);
  return { rows, avg };
}
```

Note: if `s.expedition?.combat` blocks a walk (aggressive monster on the path), the greedy walker skips that target. If a `move` returns no rejection but leaves you engaged, the `combat` guard catches it next iteration.

- [ ] **Step 2: Write the structural test**

Create `test/harvest-fraction.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { simHarvest, harvestFractionReport } from "../src/sim/harvest";
import { candidateMaps } from "../src/engine/town";

const seeds = (n: number) => Array.from({ length: n }, (_, i) => candidateMaps("hf", i)[0]!.mapSeed);

test("simHarvest returns a fraction in [0,1] with a positive POI total", () => {
  const r = simHarvest({ tools: ["pick", "knife"], food: [{ defId: "ration", qty: 2 }] }, seeds(1)[0]!, 1);
  expect(r.total).toBeGreaterThan(0);
  expect(r.fraction).toBeGreaterThanOrEqual(0);
  expect(r.fraction).toBeLessThanOrEqual(1);
});

test("harvestFractionReport averages across seeds", () => {
  const rep = harvestFractionReport({ tools: ["pick", "knife"], food: [{ defId: "ration", qty: 3 }] }, 3, seeds(5));
  expect(rep.rows.length).toBe(5);
  expect(rep.avg).toBeGreaterThanOrEqual(0);
  expect(rep.avg).toBeLessThanOrEqual(1);
});
```

- [ ] **Step 3: Run the tests**

Run: `bun test test/harvest-fraction.test.ts`
Expected: PASS.

Run: `bun run typecheck && bun run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/sim/harvest.ts test/harvest-fraction.test.ts
git commit -m "feat(si7.2): harvest-fraction sim — greedy reference player, tiered, per-loadout"
```

---

### Task 5: The 60/30 proof + lever tuning (core deliverable)

Add the named targets and the bracket assertion, then **tune** the levers from Tasks 2–3 (and, only if needed, 2yn's demand levers) until a tier-matched loadout brackets ~60% and a base-ration loadout brackets ~30% on the same high-tier maps.

**Files:**
- Modify: `src/data/constants.ts` (add `HARVEST_FRACTION_*_TARGET`; retune `FOOD_ENERGY["trail-ration"]`, `FOOD_ENERGY.pemmican`, `ENERGY_CAP_BONUS.canteen`, and if required `POI_DENSITY_BY_TIER` / `TERRAIN_WEIGHT_TIER_SHIFT`)
- Modify: `test/harvest-fraction.test.ts` (add the bracket test)

**Interfaces:**
- Consumes: `simHarvest`/`harvestFractionReport` (Task 4), `FOOD_ENERGY.pemmican` + `ENERGY_CAP_BONUS.canteen` (Tasks 2–3).
- Produces: `HARVEST_FRACTION_TIER_TARGET`, `HARVEST_FRACTION_BASE_TARGET` (constants).

- [ ] **Step 1: Add the named targets**

In `src/data/constants.ts`, in the Map-tiers section (near `POI_DENSITY_BY_TIER`, ~L575+):

```typescript
// Harvest-fraction targets (si7.2) — the core balance contract, sim-verified by
// test/harvest-fraction.test.ts. On a tier-matched map, a tier-appropriate food
// loadout should clear ~TIER of the POIs; a base-ration loadout ~BASE (half) —
// bringing cheap food visibly under-values the map. Bands (± in the test) absorb
// seed noise; WHICH ~60% the player takes stays a live routing choice.
export const HARVEST_FRACTION_TIER_TARGET = 0.6;
export const HARVEST_FRACTION_BASE_TARGET = 0.3;
```

- [ ] **Step 2: Write the bracket test**

Add to `test/harvest-fraction.test.ts` (`PROOF_TIER = 3` is the high-tier proof map):

```typescript
import { HARVEST_FRACTION_TIER_TARGET, HARVEST_FRACTION_BASE_TARGET } from "../src/data/constants";

const PROOF_TIER = 3;
const BAND = 0.12; // seed-noise tolerance around each named target

test("60/30 proof: tier food out-harvests base rations on a high-tier map", () => {
  const maps = seeds(5);
  // Tier-matched loadout: dense pemmican + capacity gear + tent + full tool/hauler kit.
  const tierPack = { tools: ["pick", "knife", "canteen", "tent", "ice-cleats", "climbing-pick"], backpack: "large-pack", transport: "horse", food: [{ defId: "pemmican", qty: 6 }] };
  // Base loadout: the same reach-relevant gear but CHEAP food (base rations only).
  const basePack = { tools: ["pick", "knife", "tent", "ice-cleats", "climbing-pick"], backpack: "large-pack", transport: "horse", food: [{ defId: "ration", qty: 6 }] };
  const tier = harvestFractionReport(tierPack, PROOF_TIER, maps).avg;
  const base = harvestFractionReport(basePack, PROOF_TIER, maps).avg;
  console.log(`[si7.2] tier=${(100 * tier).toFixed(0)}% base=${(100 * base).toFixed(0)}% (targets ${100 * HARVEST_FRACTION_TIER_TARGET}/${100 * HARVEST_FRACTION_BASE_TARGET})`);
  expect(tier).toBeGreaterThan(HARVEST_FRACTION_TIER_TARGET - BAND);
  expect(base).toBeLessThan(HARVEST_FRACTION_BASE_TARGET + BAND);
  expect(tier).toBeGreaterThan(base + 0.15); // tier food must MEANINGFULLY out-value cheap food
});
```

- [ ] **Step 3: Run to see the gap**

Run: `bun test test/harvest-fraction.test.ts`
Expected: likely FAIL initially — read the `[si7.2]` log line to see actual tier% / base%.

- [ ] **Step 4: Tune the levers until the bracket holds**

Adjust and re-run, one lever at a time (re-run the full suite each change — every lever below has other consumers):

- **tier% too LOW** → raise `FOOD_ENERGY.pemmican` (keep `< MAX_ENERGY + ENERGY_CAP_BONUS.canteen` so it stays auto-eatable) and/or raise `ENERGY_CAP_BONUS.canteen`.
- **base% too HIGH** (cheap food reaches too much of the map) → the map isn't demanding enough at tier: raise `POI_DENSITY_BY_TIER[PROOF_TIER]` and/or `TERRAIN_WEIGHT_TIER_SHIFT[PROOF_TIER]` (documented as a D46 amendment in Task 6, since these are 2yn levers). Also confirm `trail-ration` compression (Task 3) didn't over-shoot.
- **tier% too HIGH (near 100%)** → the map is too small to differentiate; raise tier demand (same `POI_DENSITY_BY_TIER`/terrain levers) rather than nerfing food.

Guardrails that MUST stay green after every tune:
```
bun test test/harness-sustainability.test.ts   # T1 food floor
bun test test/reach-fraction.test.ts           # e3j structural ceilings
bun test test/map-tier.test.ts                 # 2yn generation invariants
```
If you touch `POI_DENSITY_BY_TIER` or any tier lever feeding `mapTierReport`, regenerate the committed tier-table: `bun run sim:tables` then `git add docs/balance/tier-table.json` (its staleness gate is `test/balance-tables.test.ts`).

- [ ] **Step 5: Full gates green**

Run: `bun test && bun run typecheck && bun run lint`
Expected: all PASS, including the new bracket test.

- [ ] **Step 6: Commit**

```bash
git add src/data/constants.ts test/harvest-fraction.test.ts docs/balance/tier-table.json
git commit -m "feat(si7.2): 60/30 harvest-fraction proof + named targets, levers tuned"
```

---

### Task 6: Docs, CLI surface, legibility check, m0a capture

**Files:**
- Modify: `src/sim/balance-cli.ts` (add a `harvest` subcommand — optional inspection surface)
- Modify: `docs/decisions.md` (D47), `docs/balance-levers.md`
- Update the `idle-adventure-m0a` bead (capture biome variants)

- [ ] **Step 1: Add a `harvest` CLI view**

In `src/sim/balance-cli.ts`, import `harvestFractionReport` from `./balance`… — actually import from `./harvest`:

```typescript
import { harvestFractionReport } from "./harvest";
```

Add a branch in the command dispatch (mirror how `tables`/`reach` are handled; keep it `--json`-aware). Minimal render:

```typescript
// inside run(), when the subcommand is "harvest":
const tier = Number(flags.seed ?? 3); // reuse --seed as the tier selector for this view
const maps = Array.from({ length: 5 }, (_, i) => candidateMaps("hf", i)[0]!.mapSeed);
const rep = harvestFractionReport({ tools: ["pick", "knife", "canteen", "tent", "ice-cleats", "climbing-pick"], backpack: "large-pack", transport: "horse", food: [{ defId: "pemmican", qty: 6 }] }, tier, maps);
const output = `harvest@T${tier}: avg ${(100 * rep.avg).toFixed(0)}% over ${rep.rows.length} maps\n` + rep.rows.map((r) => `  ${r.mapSeed}: ${r.cleared}/${r.total} (${(100 * r.fraction).toFixed(0)}%)`).join("\n");
```

(Wire `candidateMaps` import + the subcommand string into the existing `parseFlags`/dispatch shape — follow the file's current structure exactly; add `harvest` to the usage/help text near line ~117.)

Run: `bun run sim harvest --seed 3`
Expected: prints the per-map + avg harvest line.

- [ ] **Step 2: Legibility check (no regression)**

New food/gear are data-driven; confirm nothing exhaustive broke and the recipe surfaces show them:

Run: `bun run playtest 2>&1 | head -40`  → confirm it runs; pemmican/canteen appear in the recipe book / craftables listing.
Run: `bun run web` (or the project's browser-verify path) → spot-check the recipe book lists `pemmican` and `canteen`, and a gather/craft of them logs cleanly.

There is **no** `GameEvent` change (new items aren't new events), so `web fmt()` exhaustiveness is unaffected — but run `bun run typecheck` to be certain.

- [ ] **Step 3: Docs — D47 + balance-levers**

Add a `D47` row to `docs/decisions.md` (dense single-row style; cite `docs/superpowers/specs/2026-07-08-tier-food-economy-design.md`) covering: the density×capacity model; `pemmican` (FOOD_ENERGY, meat+berries recipe); `trail-ration` compression 160→(final); `ENERGY_CAP_BONUS` + `canteen` + embark-at-raised-ceiling; `HARVEST_FRACTION_*_TARGET` + the harvest-fraction sim; the `tank→capacity` rename; and (if tuned) the `POI_DENSITY_BY_TIER`/`TERRAIN_WEIGHT_TIER_SHIFT` bump as a D46 amendment.

Update `docs/balance-levers.md`: add `ENERGY_CAP_BONUS`, `FOOD_ENERGY.pemmican`, `HARVEST_FRACTION_TIER_TARGET`/`HARVEST_FRACTION_BASE_TARGET`; update the `FOOD_ENERGY` line's trail-ration value; add `ENERGY_CAP_BONUS`/`HARVEST_FRACTION_*` to the "dials that most change feel" list (line ~66); reword any "tank" phrasing to "capacity".

- [ ] **Step 4: Capture biome variants into the m0a bead**

Record the deferred breadth so m0a is turnkey:

```bash
bd update idle-adventure-m0a --notes "si7.2 handoff (food/gear breadth): pemmican is the ONE proof tier-food line (FOOD_ENERGY, meat+berries recipe). m0a fills biome-flavored variants slotting into the same density ladder + ENERGY_CAP_BONUS axis: (a) monster-drop-meat pemmican variant (e.g. troll-hide/boar-hide → pemmican, mirroring ration-boar); (b) per-biome fresh-forage dense foods with a fresh→stale→processed spine like berries→jam (desert/tundra analogues); (c) tier capacity-gear variants above canteen (+100) — a higher waterskin/pack tier raising maxEnergy further. Keep each new food < the capacity it's meant to be eaten at. All land between horse and wyrm gate."
```

- [ ] **Step 5: Final gates + commit**

Run: `bun test && bun run typecheck && bun run lint`
Expected: all PASS.

```bash
git add src/sim/balance-cli.ts docs/decisions.md docs/balance-levers.md
git commit -m "docs(si7.2): D47 + balance-levers for tier food economy; harvest CLI view; m0a capture"
```

- [ ] **Step 6: Close the bead + sync**

```bash
bd close idle-adventure-si7.2
git push
bd dolt push
```
(Per the repo's Team-maintainer git policy: gates green → push `main` + sync beads at session close. The `.beads/*.jsonl` export churn gets its own `beads:` bookkeeping commit if dirty.)

---

## Self-Review

**Spec coverage:**
- §1 food-density ladder → Task 3 (pemmican + trail-ration compression, ration floor protected). ✓
- §2 energy-capacity gear → Task 2 (`ENERGY_CAP_BONUS` + `canteen` + embark). ✓
- §3 consume 2yn demand, tune if needed → Task 5 Step 4 (tune `POI_DENSITY_BY_TIER`/`TERRAIN_WEIGHT_TIER_SHIFT` only if base% too high; D46 amendment). ✓
- §4 unrestricted fresh→dense sourcing → Task 3 (pemmican recipe = huntable hide + foraged berries; monster-meat variant captured for m0a in Task 6). ✓
- §5 balance targets + sim → Tasks 4 (sim) + 5 (named targets + bracket proof). ✓
- §6 scope boundary / m0a capture → Task 6 Step 4. ✓
- §7 tank→capacity rename → Task 1. ✓
- Acceptance "legibility no worse" → Task 6 Step 2. ✓
- Acceptance "sustainability green" → guardrail in Tasks 2/3/5. ✓

**Placeholder scan:** numeric seeds (pemmican 240, trail-ration 130, canteen +100) are explicitly labelled as tuned-in-Task-5, not TBD; the Task 5 tuning loop names exact levers + directions. No "add error handling"/"write tests for the above" placeholders. ✓

**Type consistency:** `energyCapOf(equipment: Equipment)` defined in Task 2 and used in embark; `PackSpec`/`HarvestResult`/`simHarvest`/`harvestFractionReport` defined in Task 4 and consumed identically in Task 5 + Task 6 CLI; `ReachRow.capacities`/`summary.farthestCapacities` renamed in Task 1 and consumed in `test/balance-sim.test.ts`. ✓
