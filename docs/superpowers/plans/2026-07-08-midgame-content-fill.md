# Mid-game Content Fill + Food-system Rework (m0a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the eat model (least-dense-first auto-eat + a manual over-eat past max, resolving si7.7), then land the pre-designed mid-game content (3 monsters, 4 gather materials, recipes) that fills the runs 14–21 sag and gives the bow line mid-tier prey.

**Architecture:** Part A changes two pure functions — `eatToRefill` (auto-eat, `src/engine/food.ts`) and the `eat` handler (`src/engine/reduce.ts`) — plus the web energy bar to show over-full state. Part B is data-only additions to `src/data/constants.ts` (biome tables, `MATERIAL_TIER`, `FOOD_ENERGY`, `RECIPE`, `MONSTERS`, `LOOT_TABLE`), sequenced materials → recipes → monsters so `roster.test`'s "every drop feeds a recipe" invariant never goes red mid-plan.

**Tech Stack:** TypeScript, bun, `bun test`, pure-engine reducer.

## Global Constraints

- **Engine purity (lint-enforced):** no `Math.random`/`Date.now`/DOM and no `render`/`sim`/`web` imports under `src/engine/**`.
- **No magic numbers in engine logic:** all food/material/monster values are named `export const`s in `src/data/constants.ts`.
- **`FOOD_ENERGY.ration` stays 80** (T1 sustainability floor); `test/harness-sustainability.test.ts` stays green (re-derived, never weakened).
- **Pinned gate tests stay UN-EDITED:** `test/combat-toll.test.ts`, `test/roster.test.ts` (except where a task's deliverable is explicitly a new roster-satisfying entry), `test/balance-tables.test.ts`.
- **`MONSTERS`/`WEAPONS`/`ARMOUR` are a balance surface:** any change requires `bun run sim:tables` regen + committing `docs/balance/tables.{json,md}` + `tier-table.json` (`test/balance-tables.test.ts` enforces).
- **Every new monster drop must feed ≥1 recipe** (`roster.test`); **every biome's tier-1/2 band keeps exactly 3 dmg types + 3 hide types** (`roster.test`, `Set.size === 3`).
- **Optional state fields** read with `?? default` (`maxEnergy ?? MAX_ENERGY`, `autoEat ?? true`, `tentMultOf`).
- **Quality gates before every commit:** `bun test` + `bun run typecheck` + `bun run lint` green.
- Every lever change lands with docs: `decisions.md` **D48** (verify D47 is current highest; cite `docs/superpowers/specs/2026-07-08-midgame-content-fill-design.md`) + `balance-levers.md`.

## File Structure

- `src/engine/food.ts` — `eatToRefill` least-dense-first rewrite (Task 1).
- `src/engine/reduce.ts` — `eat` handler most-dense over-eat rewrite (Task 2).
- `src/web/main.ts` + `src/web/index.html` — energy bar over-full display (Task 3).
- `src/data/constants.ts` — all Part B data (Tasks 4–6).
- Tests: `test/food.test.ts` (extend), new `test/over-eat.test.ts`, `test/midgame-content.test.ts`; `test/roster.test.ts` stays green throughout.
- Docs: `decisions.md` (D48), `balance-levers.md`; `docs/balance/*.json|md` regen.

---

## PART A — Food-system rework (resolves si7.7)

### Task 1: Auto-eat becomes least-dense-first

**Files:**
- Modify: `src/engine/food.ts` (`eatToRefill`, ~L25-41)
- Test: `test/food.test.ts` (extend) — and run the full suite for regressions

**Interfaces:**
- Produces: `eatToRefill(food, energy, maxEnergy, tentMult=1)` — same signature; new selection rule (least-dense unit that fits, repeat; waste-free). Consumed by `autoRefill` (`reduce.ts`) unchanged.

- [ ] **Step 1: Write the failing test**

Add to `test/food.test.ts`:

```typescript
import { eatToRefill } from "../src/engine/food";
// (existing imports stay)

test("auto-eat is least-dense-first and never blocks on a dense front unit", () => {
  // pemmican(240) at FRONT, ration(80) behind, no tent, max 300, energy 0.
  // Old front-to-back would eat pemmican (240) then stop (80 fits: 240+80=320>300 → stop at 320? no).
  // New least-dense-first: eat ration(80) first → 80, then ration none; pemmican 240 fits (80+240=320>300 → no).
  const r = eatToRefill([{ defId: "pemmican", qty: 1 }, { defId: "ration", qty: 1 }], 0, 300);
  expect(r.energy).toBe(80);                       // ate the ration, not blocked by pemmican
  expect(r.food.find((s) => s.defId === "ration")).toBeUndefined(); // ration consumed
  expect(r.food.find((s) => s.defId === "pemmican")?.qty).toBe(1);  // pemmican left as reserve
});

test("auto-eat stays waste-free (never overfills past max)", () => {
  const r = eatToRefill([{ defId: "ration", qty: 5 }], 260, 300); // 260+80=340>300 → can't fit even one
  expect(r.energy).toBe(260);
  expect(r.food[0]!.qty).toBe(5);
});

test("auto-eat with a single food type is unchanged (order-invariant)", () => {
  const r = eatToRefill([{ defId: "ration", qty: 4 }], 0, 300); // 80×3=240 ≤300, 4th 320>300
  expect(r.energy).toBe(240);
  expect(r.food[0]!.qty).toBe(1);
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `bun test test/food.test.ts`
Expected: the least-dense-first test FAILS (current code eats front pemmican first / blocks).

- [ ] **Step 3: Rewrite `eatToRefill` least-dense-first**

Replace the body of `eatToRefill` in `src/engine/food.ts`:

```typescript
export function eatToRefill(
  food: ItemStack[],
  energy: number,
  maxEnergy: number,
  tentMult = 1,
): { food: ItemStack[]; energy: number } {
  const next = food.map((s) => ({ ...s }));
  let e = energy;
  // Least-dense-first (m0a): repeatedly eat the lowest-FOOD_ENERGY unit whose
  // boosted restore still fits under maxEnergy. Never blocks (a too-dense unit is
  // passed over, not a wall — resolves si7.7); stays waste-free; fresh forage is
  // the least dense so it's still eaten first. Ties break by lowest index.
  for (;;) {
    let bestIdx = -1;
    let bestDensity = Infinity;
    for (let i = 0; i < next.length; i++) {
      if (next[i]!.qty <= 0) continue;
      const density = foodEnergyOf(next[i]!.defId);
      if (e + density * tentMult > maxEnergy) continue; // doesn't fit — skip
      if (density < bestDensity) { bestDensity = density; bestIdx = i; }
    }
    if (bestIdx === -1) break; // nothing fits
    e += foodEnergyOf(next[bestIdx]!.defId) * tentMult;
    next[bestIdx]!.qty -= 1;
  }
  return { food: next.filter((s) => s.qty > 0), energy: e };
}
```

- [ ] **Step 4: Run the new tests + full suite**

Run: `bun test test/food.test.ts`
Expected: PASS.

Run: `bun test`
Expected: all green. **If a mixed-food-order test fails**, it's the legitimate least-dense-first behavior change, not a regression — update the expected value to match least-dense-first order (do NOT weaken the assertion), and note it in your report. `test/harness-sustainability.test.ts` (rations only) and `test/food-ladder.test.ts` (single-type lists) must pass **unchanged**.

- [ ] **Step 5: Commit**

```bash
git add src/engine/food.ts test/food.test.ts
git commit -m "feat(m0a): auto-eat least-dense-first — never blocks on a dense unit (resolves si7.7 auto-eat half)"
```

---

### Task 2: Manual `eat` — deliberate over-eat + close si7.7 docs

**Files:**
- Modify: `src/engine/reduce.ts` (`eat` handler, ~L710-734)
- Test: `test/over-eat.test.ts` (new)
- Modify: `src/data/constants.ts` (pemmican comment), `docs/balance-levers.md` (over-eat note)

**Interfaces:**
- Consumes: `foodEnergyOf` (`food.ts`), `tentMultOf` (`reduce.ts`), `expedition.energy`/`maxEnergy`.
- Produces: `eat` action now targets the MOST-dense food unit and sets `energy = foodEnergy × tentMult` (may exceed `maxEnergy`); rejects when that boosted value ≤ current energy or no food.

- [ ] **Step 1: Write the failing test**

Create `test/over-eat.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { candidateMaps } from "../src/engine/town";
import { MAX_ENERGY } from "../src/data/constants";
import type { GameState, Action } from "../src/engine/types";

// Embark a run with a given food loadout + tools, then drain energy to `energy`.
function onMap(food: { defId: string; qty: number }[], tools: string[], energy: number): GameState {
  const seed = candidateMaps("oe", 0)[0]!.mapSeed;
  const bank = [...tools.map((d) => ({ defId: d, qty: 1 })), ...food];
  let s: GameState = { seed: "oe", phase: "town", bank, loadout: emptyLoadout(), expedition: null, runs: 0 };
  for (const t of tools) s = reduce(s, { type: "pack", slot: "tool", itemId: t } as Action).state;
  for (const f of food) for (let i = 0; i < f.qty; i++) s = reduce(s, { type: "pack", slot: "food", itemId: f.defId } as Action).state;
  s = reduce(s, { type: "embark", mapSeed: seed } as Action).state;
  s = { ...s, expedition: { ...s.expedition!, energy } };
  return s;
}

test("manual eat over-eats the MOST-dense unit up to food×tentMult, past max", () => {
  // tent (×1.5), pemmican(240)→boosted 360, ration behind. energy 100, max 300.
  const s = onMap([{ defId: "pemmican", qty: 1 }, { defId: "ration", qty: 2 }], ["tent"], 100);
  const r = reduce(s, { type: "eat" } as Action);
  expect(r.events.some((e) => e.type === "action-rejected")).toBe(false);
  expect(r.state.expedition!.energy).toBe(360);   // jumped to pemmican's boosted value, over max
  expect(r.state.expedition!.loadout.food.find((f) => f.defId === "pemmican")).toBeUndefined();
});

test("manual eat without a tent uses raw density; rejects when boosted ≤ current", () => {
  // no tent, ration(80). energy 250, boosted 80 ≤ 250 → reject (pointless).
  const s = onMap([{ defId: "ration", qty: 2 }], [], 250);
  const r = reduce(s, { type: "eat" } as Action);
  expect(r.events.some((e) => e.type === "action-rejected")).toBe(true);
  expect(r.state.expedition!.energy).toBe(250);   // unchanged
});

test("manual eat sets energy TO the boosted value (not additive)", () => {
  // smoked-venison(200)→boosted 300 under tent. energy 100 → 300 (your example).
  const s = onMap([{ defId: "smoked-venison", qty: 1 }], ["tent"], 100);
  const r = reduce(s, { type: "eat" } as Action);
  expect(r.state.expedition!.energy).toBe(300);
});
```

> Note: `smoked-venison` (FOOD_ENERGY 200) is added in Task 5. This test file will not fully pass until Task 5 lands the food; run the pemmican/ration cases now, and re-run the smoked-venison case after Task 5. State this in your report.

- [ ] **Step 2: Run to confirm failure**

Run: `bun test test/over-eat.test.ts`
Expected: FAIL — current `eat` clamps to max and takes the front unit.

- [ ] **Step 3: Rewrite the `eat` handler**

Replace the body of `eat` in `src/engine/reduce.ts` (keep the guards):

```typescript
function eat(state: GameState): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) {
    return rejected(state, "eat", "not-on-expedition");
  }
  if (expedition.combat) return rejected(state, "eat", "engaged");
  const tentMult = tentMultOf(expedition);
  const food = expedition.loadout.food;
  if (food.length === 0) return rejected(state, "eat", "insufficient");
  // Deliberate over-eat (m0a): target the MOST-dense unit (the reserve auto-eat
  // leaves alone) and jump energy TO its boosted value (foodEnergy × tentMult),
  // which may exceed maxEnergy. Ties break by lowest index. Reject if eating it
  // wouldn't raise energy (boosted ≤ current) — nothing to gain.
  let idx = 0;
  for (let i = 1; i < food.length; i++) {
    if (foodEnergyOf(food[i]!.defId) > foodEnergyOf(food[idx]!.defId)) idx = i;
  }
  const boosted = foodEnergyOf(food[idx]!.defId) * tentMult;
  if (boosted <= expedition.energy) return rejected(state, "eat", "insufficient");
  const energy = boosted;
  const nextFood = food.map((s) => ({ ...s }));
  nextFood[idx]!.qty -= 1;
  const filtered = nextFood.filter((s) => s.qty > 0);
  return {
    state: {
      ...state,
      expedition: { ...expedition, energy, loadout: { ...expedition.loadout, food: filtered } },
    },
    events: [{ type: "ate", defId: food[idx]!.defId, restored: energy - expedition.energy, energy }],
  };
}
```

- [ ] **Step 4: Run the tests (pemmican/ration cases) + full suite**

Run: `bun test test/over-eat.test.ts -t "MOST-dense"` and `-t "rejects when boosted"`
Expected: PASS (the smoked-venison case waits for Task 5).

Run: `bun test`
Expected: green. If an existing `eat`-behavior test asserted the old front-unit/clamp semantics, update it to the over-eat semantics (legitimate change) and note it.

- [ ] **Step 5: Correct the pemmican comment + balance-levers note + close si7.7**

In `src/data/constants.ts`, replace the `FOOD_ENERGY.pemmican` comment with:
```typescript
  pemmican: 240, // tier-food line (si7.2): dense trail food (meat + berries). Auto-eat (least-dense-first, m0a) leaves it as a RESERVE; you cash it in with a manual `eat` (over-eats up to foodEnergy×tentMult, may exceed maxEnergy). No tent-safe density cap needed (m0a).
```

In `docs/balance-levers.md`, replace the si7.2 "Invariant to respect when adding dense foods" sentence (the `foodEnergy × TENT_FOOD_MULTIPLIER ≤ eat-max` footgun note) with:
```
Dense foods (m0a): auto-eat is least-dense-first and never blocks — a too-dense unit is passed over as a reserve; a manual `eat` over-eats the most-dense unit up to `foodEnergy × TENT_FOOD_MULTIPLIER`, which may push energy above maxEnergy (drains normally). No tent-safe cap on food density.
```

Then close the resolved footgun bead:
```bash
bd close idle-adventure-si7.7
```

- [ ] **Step 6: Commit**

```bash
git add src/engine/reduce.ts test/over-eat.test.ts src/data/constants.ts docs/balance-levers.md
git commit -m "feat(m0a): manual eat over-eats the densest unit past max (resolves si7.7); close si7.7"
```

---

### Task 3: Energy bar shows the over-full state

**Files:**
- Modify: `src/web/main.ts` (energy bar render) + `src/web/index.html` (CSS)
- Verify: browser/playtest (render change — no engine unit test)

**Interfaces:**
- Consumes: `expedition.energy` (may exceed `maxEnergy`), `maxEnergy`.

- [ ] **Step 1: Find and read the energy bar render**

Run: `grep -n "fill energy\|fill.energy\|energy.*maxEnergy\|width:.*energy\|/ *max" src/web/main.ts`
The energy bar is a `.bar` with a `.fill.energy` whose width is `energy/maxEnergy`. Read that block (near the expedition status render) to get the exact expression.

- [ ] **Step 2: Cap the bar fill at 100% and annotate the surplus**

In `src/web/main.ts`, where the energy bar fill width is computed, clamp the visual width to 100% and show the over-full amount. Pattern (adapt to the actual code found in Step 1):

```typescript
// energy may exceed maxEnergy after a manual over-eat (m0a) — cap the bar fill at
// 100% and surface the surplus rather than overflowing the track.
const pct = Math.min(100, (energy / maxEnergy) * 100);
const over = energy > maxEnergy ? ` <span class="over">+${round(energy - maxEnergy)}</span>` : "";
// ...render: width:${pct}%  and the numeric label `${round(energy)}/${maxEnergy}${over}`
```

Add a CSS rule in `src/web/index.html` near the existing `.over` rules:
```css
.bar .over { color: #6bbf59; font-weight: 600; } /* over-full stamina after a manual over-eat (m0a) */
```

- [ ] **Step 3: Typecheck + lint**

Run: `bun run typecheck && bun run lint`
Expected: PASS. (No new `GameEvent`, so `fmt()` is unaffected.)

- [ ] **Step 4: Browser/playtest spot-check**

Run the app (`bun run web` or the project's browser-verify path). Embark with a tent + a pemmican, drain energy, manually Eat, and confirm the bar shows e.g. `360/300` with the surplus indicated and the fill not overflowing the track. If the agent-browser path isn't readily available, run `bun run playtest 2>&1 | grep -i energy | head` to confirm the console prints `cur/max` with `cur > max` cleanly, and note that a browser spot-check is recommended.

- [ ] **Step 5: Commit**

```bash
git add src/web/main.ts src/web/index.html
git commit -m "feat(m0a): energy bar shows over-full state (manual over-eat surplus)"
```

---

## PART B — Mid-game content (data-only; materials → recipes → monsters)

### Task 4: Gather materials + fresh apple food

**Files:**
- Modify: `src/data/constants.ts` (biome `materialTable`s, `MATERIAL_TIER`, `FOOD`, `FOOD_ENERGY`, `FRESH_TO_STALE`)
- Test: `test/midgame-content.test.ts` (new)

**Interfaces:**
- Produces: gather materials `salt`, `thistle`, `seal`→`seal-blubber`, and fresh food `apple` (via `apple-tree` wood node) with `FRESH_TO_STALE apple → bruised-apple`.

- [ ] **Step 1: Write the failing test**

Create `test/midgame-content.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { FOOD, FOOD_ENERGY, FRESH_TO_STALE, MATERIAL_TIER, BIOMES } from "../src/data/constants";
import { slotOf } from "../src/engine/catalog";

test("apple is a fresh food that stales to bruised-apple", () => {
  expect(FOOD.includes("apple")).toBe(true);
  expect(slotOf("apple")).toBe("food");
  expect(FOOD_ENERGY.apple).toBe(40);
  expect(FRESH_TO_STALE.apple).toBe("bruised-apple");
});

test("new gather materials sit at their tier and biome", () => {
  expect(MATERIAL_TIER.salt).toBe(2);
  expect(MATERIAL_TIER.seal).toBe(2);
  expect(BIOMES.desert.materialTable.mining?.salt).toBe(2);
  expect(BIOMES.tundra.materialTable.herb?.thistle).toBe(2);
  expect(BIOMES.woodland.materialTable.herb?.thistle).toBe(1);
  expect(BIOMES.woodland.materialTable.wood?.["apple-tree"]).toBe(2);
  expect(BIOMES.tundra.materialTable.animal?.seal).toBe(2);
});
```

> Check the exact `materialTable` node-kind keys and whether the yield defId (`apple-tree` the node material vs `apple` the food) matches how `berries` works — the node's `material` is the FOOD defId for herb/berries. Confirm apple follows the berries pattern (wood node whose material yields the food) and adjust the assertion to the real yield defId if the codebase maps node-material→food differently.

- [ ] **Step 2: Run to confirm failure**

Run: `bun test test/midgame-content.test.ts`
Expected: FAIL — new defIds absent.

- [ ] **Step 3: Add the materials + apple food**

In `src/data/constants.ts`:
- `FOOD` array: add `"apple"` → `["ration", "trail-ration", "berries", "jam", "pemmican", "apple"]`.
- `FOOD_ENERGY`: add `apple: 40, // fresh forage (m0a): woodland orchard fruit — weak-but-immediate, stales to bruised-apple`.
- `FRESH_TO_STALE`: add `apple: "bruised-apple"`.
- `MATERIAL_TIER`: add `salt: 2, seal: 2,` (thistle stays tier 1 → absent; apple-tree tier via node — if the wood node needs a tier gate, set `"apple-tree": 2` only if MATERIAL_TIER gates wood harvest; otherwise leave absent=1).
- Biome `materialTable`s: desert `mining` += `salt: 2`; tundra `herb` += `thistle: 2`, `animal` += `seal: 2`; woodland `herb` += `thistle: 1`, `wood` += `"apple-tree": 2`. (Match the existing weight scale in each table.)

> Follow the berries precedent for apple: berries is an herb-node material that IS a food (in `FOOD`). apple is a wood-node material that is a food. Confirm the gather path (`reduce.ts` gather) routes a wood-node material that's in `FOOD` into `loadout.food` (it checks `FOOD.includes(poi.material)` regardless of node kind — so apple flows to food automatically). If the node material must equal the food defId, use `apple` as the wood material (not `apple-tree`); `apple-tree` is only flavor. Adjust the biome table + test to whichever the gather code requires, and note the choice.

- [ ] **Step 4: Run the test + full suite**

Run: `bun test test/midgame-content.test.ts && bun test`
Expected: PASS. Snapshot tests may shift (new material rolls) — if a grid/POI snapshot fails, eyeball one diff to confirm it's just new materials appearing, then `bun test -u` and note it.

- [ ] **Step 5: Commit**

```bash
git add src/data/constants.ts test/midgame-content.test.ts
git commit -m "feat(m0a): gather materials (salt/thistle/seal) + fresh apple food line"
```

---

### Task 5: Recipes + tier foods

**Files:**
- Modify: `src/data/constants.ts` (`RECIPE`, `FOOD`, `FOOD_ENERGY`)
- Test: `test/midgame-content.test.ts` (extend)

**Interfaces:**
- Consumes: materials from Task 4 (`salt`, `seal-blubber`, `bruised-apple`, `thistle`) + monster-drop materials referenced ahead of Task 6 (`rich-venison`, `djinn-ember`).
- Produces: recipes `smoked-venison`, `blubber-stew`, apple→jam, elixir alt; `FOOD_ENERGY` for `smoked-venison` (200) + `blubber-stew` (160).

- [ ] **Step 1: Write the failing test**

Add to `test/midgame-content.test.ts`:

```typescript
import { RECIPE } from "../src/data/constants";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import type { GameState, Action } from "../src/engine/types";

function craft(bank: { defId: string; qty: number }[], recipeId: string) {
  const s: GameState = { seed: "c", phase: "town", bank, loadout: emptyLoadout(), expedition: null, runs: 0 };
  return reduce(s, { type: "craft", recipeId } as Action);
}

test("mid-game tier foods exist with documented densities", () => {
  expect(FOOD_ENERGY["smoked-venison"]).toBe(200);
  expect(FOOD_ENERGY["blubber-stew"]).toBe(160);
  expect(FOOD.includes("smoked-venison")).toBe(true);
  expect(FOOD.includes("blubber-stew")).toBe(true);
});

test("mid-game recipes craft from their inputs", () => {
  const a = craft([{ defId: "rich-venison", qty: 1 }, { defId: "salt", qty: 1 }], "smoked-venison");
  expect(a.state.bank.find((x) => x.defId === "smoked-venison")?.qty).toBe(1);
  const b = craft([{ defId: "seal-blubber", qty: 1 }, { defId: "ice-moss", qty: 1 }], "blubber-stew");
  expect(b.state.bank.find((x) => x.defId === "blubber-stew")?.qty).toBe(1);
  const c = craft([{ defId: "bruised-apple", qty: 3 }], "apple-jam");
  expect(c.state.bank.find((x) => x.defId === "jam")?.qty).toBe(1);
  const d = craft([{ defId: "thistle", qty: 2 }, { defId: "djinn-ember", qty: 1 }], "elixir-thistle");
  expect(d.state.bank.find((x) => x.defId === "elixir-of-power")?.qty).toBe(1);
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `bun test test/midgame-content.test.ts`
Expected: FAIL — recipes/foods absent.

- [ ] **Step 3: Add the recipes + food densities**

In `src/data/constants.ts`:
- `FOOD` array: add `"smoked-venison"`, `"blubber-stew"`.
- `FOOD_ENERGY`: add `"smoked-venison": 200, // m0a: woodland cured meat — a manual-over-eat reserve under a tent` and `"blubber-stew": 160, // m0a: tundra rendered fat + moss`.
- `RECIPE`: add
```typescript
  "smoked-venison": { inputs: [{ defId: "rich-venison", qty: 1 }, { defId: "salt", qty: 1 }], output: { defId: "smoked-venison", qty: 1 } }, // m0a: woodland tier-food (elk meat + desert salt — cross-biome pull)
  "blubber-stew": { inputs: [{ defId: "seal-blubber", qty: 1 }, { defId: "ice-moss", qty: 1 }], output: { defId: "blubber-stew", qty: 1 } }, // m0a: tundra tier-food
  "apple-jam": { inputs: [{ defId: "bruised-apple", qty: 3 }], output: { defId: "jam", qty: 1 } }, // m0a: staled orchard fruit → jam (mirrors stale-berries→jam)
  "elixir-thistle": { inputs: [{ defId: "thistle", qty: 2 }, { defId: "djinn-ember", qty: 1 }], output: { defId: "elixir-of-power", qty: 1 } }, // m0a: breaks the vampire-only gate on the battle-item line
```

> `elixir-of-power` is an existing `BATTLE_ITEM` — this is an alt recipe to the same output (like `ration`'s many variants), so no catalog change beyond the recipe. `djinn-ember` is a Task-6 monster drop; the recipe referencing it now is fine (recipes may reference not-yet-dropped materials). `rich-venison` likewise.

- [ ] **Step 4: Run the test + full suite**

Run: `bun test test/midgame-content.test.ts && bun test`
Expected: PASS.

- [ ] **Step 5: Also verify the Task-2 smoked-venison over-eat case now passes**

Run: `bun test test/over-eat.test.ts`
Expected: all three cases PASS now (smoked-venison exists).

- [ ] **Step 6: Commit**

```bash
git add src/data/constants.ts test/midgame-content.test.ts
git commit -m "feat(m0a): mid-game recipes — smoked-venison, blubber-stew, apple-jam, thistle elixir"
```

---

### Task 6: Monsters + loot + creatureTable + sim regen

**Files:**
- Modify: `src/data/constants.ts` (`MONSTERS`, `LOOT_TABLE`, biome `creatureTable`s)
- Test: `test/midgame-content.test.ts` (extend); `test/roster.test.ts` stays green un-edited
- Regen: `docs/balance/tables.{json,md}`, `tier-table.json`

**Interfaces:**
- Consumes: recipes from Task 5 (so every drop feeds a recipe).
- Produces: `giant-elk` (woodland), `dust-djinn` (desert), `frost-hatchling` (tundra) with loot + creatureTable weights.

- [ ] **Step 1: Write the failing test**

Add to `test/midgame-content.test.ts`:

```typescript
import { MONSTERS, LOOT_TABLE } from "../src/data/constants";

test("mid-game monsters: 2 of 3 are robe-hide bow-bait, all tier 2", () => {
  for (const id of ["giant-elk", "dust-djinn", "frost-hatchling"]) {
    expect(MONSTERS[id]?.tier).toBe(2);
  }
  const robe = ["giant-elk", "dust-djinn", "frost-hatchling"].filter((id) => MONSTERS[id]!.armourType === "robe");
  expect(robe.length).toBe(2); // dust-djinn + frost-hatchling
  expect(MONSTERS["giant-elk"]!.armourType).toBe("light");
});

test("frost-hatchling drops a map-scroll (the wyrm herald)", () => {
  expect(LOOT_TABLE["frost-hatchling"]!.some((d) => d.defId === "map-scroll")).toBe(true);
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `bun test test/midgame-content.test.ts`
Expected: FAIL — monsters absent.

- [ ] **Step 3: Add monsters, loot, and creatureTable weights**

In `src/data/constants.ts`:
- `MONSTERS`:
```typescript
  "giant-elk": { tier: 2, dmgType: "melee", armourType: "light", category: "beast", tags: ["beast"] }, // m0a: woodland mid-tier — rich-venison source
  "dust-djinn": { tier: 2, dmgType: "magic", armourType: "robe", category: "fae", tags: ["fae"] }, // m0a: desert bow-bait (robe hide)
  "frost-hatchling": { tier: 2, dmgType: "magic", armourType: "robe", category: "beast", tags: ["dragon"] }, // m0a: tundra wyrm herald, bow-bait
```
- `LOOT_TABLE`:
```typescript
  "giant-elk": [{ defId: "rich-venison", qty: 2 }, { defId: "elk-antler", qty: 1 }],
  "dust-djinn": [{ defId: "djinn-ember", qty: 1 }],
  "frost-hatchling": [{ defId: "hatchling-scale", qty: 1 }, { defId: "map-scroll", qty: 1, chance: 0.15 }],
```
- Biome `creatureTable`s: woodland += `"giant-elk": 3`; desert += `"dust-djinn": 3`; tundra += `"frost-hatchling": 3`.

> **`elk-antler` MUST feed a recipe or `roster.test` fails** (every monster drop feeds the tree). The bead's `antler-handle` was "optional", but dropping elk-antler makes it required. Simplest satisfying resolution WITHOUT a weapon balance-surface change: give elk-antler a small non-combat recipe, e.g. add to `RECIPE`:
> ```typescript
>   "bone-needle": { inputs: [{ defId: "elk-antler", qty: 1 }], output: { defId: "bone-needle", qty: 1 } }, // m0a: antler → a crafting sundry; consumes the drop so roster's tree-rule holds
> ```
> and give `bone-needle` a use OR — cleaner — **do not drop elk-antler at all** (giant-elk drops `rich-venison ×2` only). Choose the drop-only option unless you want the antler content; it's the minimal, roster-clean path. Update the `giant-elk` `LOOT_TABLE` entry and the Step-1 test accordingly, and state your choice in the report.
>
> **`hatchling-scale` and `djinn-ember` MUST also feed recipes.** `djinn-ember` → `elixir-thistle` (Task 5) ✓. `hatchling-scale` needs a consumer — add a small recipe (e.g. `"scale-charm": { inputs: [{ defId: "hatchling-scale", qty: 2 }], output: {...} }`) OR fold hatchling-scale into an existing/new gear recipe. Confirm every Task-6 drop has a Task-5-or-here recipe before adding the monster to its creatureTable.
>
> **`map-scroll` interception:** confirm `fightAt`/`resolveCombat` mints a `MapItem` from a `map-scroll` in a monster's own `LOOT_TABLE` (not only `CATEGORY_LOOT_TABLE`). Read the `MAP_SCROLL_ID` handling in `reduce.ts`; if it only intercepts category loot, either route the hatchling's scroll via a mechanism that mints the map, or note the gap. The drop must yield a held map, not a raw `map-scroll` material.

- [ ] **Step 4: Regenerate balance tables + run suite**

Run: `bun run sim:tables` (MONSTERS changed — balance surface). Then `git add docs/balance/tables.json docs/balance/tables.md docs/balance/tier-table.json`.

Run: `bun test`
Expected: green — including `roster.test` (spread still 3/3; every new drop feeds a recipe) and `combat-toll.test` **un-edited**. If a new monster's toll lands outside the tier-2 band and trips a pinned test, adjust the monster's fields (not the test) until it's in band, and note it.

- [ ] **Step 5: Commit**

```bash
git add src/data/constants.ts test/midgame-content.test.ts docs/balance/tables.json docs/balance/tables.md docs/balance/tier-table.json
git commit -m "feat(m0a): mid-game monsters (giant-elk/dust-djinn/frost-hatchling) + loot + spawns"
```

---

### Task 7: Docs, legibility, close-out

**Files:**
- Modify: `docs/decisions.md` (D48), `docs/balance-levers.md`
- Verify: recipe-book legibility (playtest/web)

- [ ] **Step 1: D48 + balance-levers**

Add a `D48` row to `docs/decisions.md` (dense single-row; cite `docs/superpowers/specs/2026-07-08-midgame-content-fill-design.md`) covering: the food rework (least-dense-first auto-eat; manual over-eat to `foodEnergy × tentMult` past max; over-full display; resolves si7.7); and the content additions (3 monsters incl. 2 robe bow-bait + wyrm-herald map drop; salt/thistle/apple/seal materials; smoked-venison/blubber-stew/apple-jam/thistle-elixir recipes). Verify D47 is the current highest first.

Update `docs/balance-levers.md`: add `FOOD_ENERGY.apple` (40), `smoked-venison` (200), `blubber-stew` (160); the new monsters under the creature-roster note; the least-dense-first/over-eat rule (already touched in Task 2 — ensure consistent).

- [ ] **Step 2: Legibility check**

Run: `bun run playtest 2>&1 | head -50` — confirm it runs and the new recipes (`smoked-venison`, `blubber-stew`, `apple-jam`, `elixir-thistle`) appear in the recipe book (recipe surfaces iterate `Object.keys(RECIPE)`, so they appear for free). Confirm the new monsters appear when encountered. No new `GameEvent`, so `fmt()` is unaffected (typecheck confirms).

- [ ] **Step 3: Full gates + commit**

Run: `bun test && bun run typecheck && bun run lint`
Expected: all PASS.

```bash
git add docs/decisions.md docs/balance-levers.md
git commit -m "docs(m0a): D48 + balance-levers for mid-game content fill and food rework"
```

- [ ] **Step 4: Close the bead (controller handles push/sync at session close)**

```bash
bd close idle-adventure-m0a
```
Leave `git push` + `bd dolt push` to the controller's session-close step.

---

## Self-Review

**Spec coverage:**
- Part A A1 least-dense auto-eat → Task 1. ✓
- Part A A2 manual over-eat → Task 2. ✓
- Part A A3 over-full display + no-clamp audit → Task 3 (+ the reducer paths never clamp; `eatToRefill` won't fire while over-full). ✓
- Part A A4 close si7.7 + doc correction → Task 2 Step 5. ✓
- Part B B1 materials + fresh apple → Task 4. ✓
- Part B B2 recipes + tier foods → Task 5. ✓
- Part B B3 monsters + loot + spawns + sim regen → Task 6. ✓
- Part B B4 content constraints (roster, toll bands, sim regen, snapshots) → Tasks 4/6 verification steps. ✓
- Acceptance docs D48 + balance-levers → Task 7. ✓

**Placeholder scan:** the `~200/~160/~40` spec values are pinned to concrete numbers here (200/160/40); the "optional antler" ambiguity is resolved to a concrete default (drop-only, no elk-antler) with the alternative spelled out; `hatchling-scale`'s recipe requirement is flagged with a concrete resolution. No bare TODO/TBD.

**Type consistency:** `eatToRefill` signature unchanged (Task 1) and consumed by `autoRefill` (unchanged); `eat` produces the same `ate` event shape (Task 2); food defIds (`apple`/`smoked-venison`/`blubber-stew`) added to both `FOOD` and `FOOD_ENERGY` in the same task; monster-drop materials (`rich-venison`/`djinn-ember`/`hatchling-scale`) each have a consuming recipe before the monster enters a creatureTable (Task 5 before Task 6).

**Ordering invariant:** materials (4) → recipes (5) → monsters (6) keeps `roster.test`'s drop-feeds-recipe green at every commit.
