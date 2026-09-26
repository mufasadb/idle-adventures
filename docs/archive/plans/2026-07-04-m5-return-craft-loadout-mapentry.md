# M5 — Return, Crafting, Loadout, Map Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the core loop — `return` hauls carry to bank, `craft` turns materials into gear, `pack` assembles a town-side loadout plan, `embark` validates + debits that plan from the bank, and town offers 3 seeded candidate maps with biome-name previews.

**Architecture:** Extends the pure `reduce(state, action) → {state, events}` engine (M0–M4). New pure helpers (`craft`, `pack`, catalog/slot classification, town entry) live in focused files under `src/engine/`; all tunables (recipes, the weighted material tables) are levers in `src/data/constants.ts`. Two design refinements from brainstorming: **D27** (materials are weighted per biome/node-type, not exclusive) and **D28** (`pack` is a plan; `embark` validates + debits the bank).

**Tech Stack:** TypeScript · bun + `bun test` (jest-compatible) · ESLint engine-purity boundary.

## Global Constraints

- Engine is pure: no DOM, no `Math.random`/`Date.now`, no imports from `render`/`sim`/`web`. RNG = `rand(seed, ...context)` (stateless `hash(seed, context)`), from `src/engine/rng.ts`.
- `GameState` holds **only the present**. Items are `{defId, qty}` referencing the code-side catalog in `src/data/constants.ts`. No per-instance item state.
- No magic numbers in engine logic — read every tunable from `src/data/constants.ts`.
- Every reducer path is total: an unhandled `Action` variant is a compile error via `assertNever`.
- Test runner is `bun test`. Test files import from `"bun:test"`. Run the full suite with `bun test`; typecheck with `bun run typecheck`; lint with `bun run lint`.
- Reducer rejections emit exactly `[{ type: "action-rejected", action, reason }]` and return `state` unchanged.

## Decisions this plan implements

- **D27** — `BIOMES[id].materialTable[nodeType]` is a **weighted table** (`Record<defId, number>`); `generateGrid` rolls each POI's material from the map seed and stamps it. Tundra is the *efficient* silver farm, not the only source. Refines D25.
- **D28** — `pack(slot,itemId)` edits `state.loadout` (a plan) without touching bank, validating against `bank − plan-reservations`; `embark` validates + debits the whole loadout from bank (food→energy). No `unpack` action.
- D22/D23/D26 unchanged: staging loadout lives on `GameState.loadout`; food is ballast converted to energy at embark and never banked back; `endExpedition` banks carry + durables + unspent potions.

## File Structure

- **Modify** `src/data/constants.ts` — weighted `materialTable`; `ARMOUR` entries gain `slot`; new `FOOD`/`POTION` catalogs; `spyglass` + tiered tools into `TOOL_CAPABILITY`/`TOOL_QUALITY`; fill `RECIPE`; `PREVIEW_FIDELITY` stays `0`.
- **Modify** `src/engine/grid.ts` — roll POI material from a weighted table (D27).
- **Create** `src/engine/catalog.ts` — item classification: `slotOf(defId)`, `validForSlot(slot, defId)`.
- **Create** `src/engine/craft.ts` — `craft(bank, recipeId)` pure helper.
- **Create** `src/engine/pack.ts` — `reserveLoadout`, `reservedQty`, `packItem`.
- **Modify** `src/engine/bank.ts` — add `subtractStacks`.
- **Create** `src/engine/town.ts` — `newGame(seed)`, `candidateMaps(seed)`.
- **Modify** `src/engine/reduce.ts` — fill `craft`/`pack`/`return`; add debit+validate to `embark`.
- **Modify** `src/engine/types.ts` — add `crafted`/`packed` events.
- **Modify** `test/constants.test.ts` — update material invariants for weighted tables.
- **Modify** `test/reduce-embark.test.ts` — embark now debits the bank.
- **Create** `test/catalog.test.ts`, `test/craft.test.ts`, `test/reduce-craft.test.ts`, `test/reduce-pack.test.ts`, `test/reduce-return.test.ts`, `test/town.test.ts`, `test/loop.test.ts`.

---

## Task 1: Weighted materials (D27)

**Files:**
- Modify: `src/data/constants.ts` (the `Biome.materialTable` type + `BIOMES[*].materialTable`)
- Modify: `src/engine/grid.ts` (material roll in `generateGrid`)
- Modify: `test/constants.test.ts` (material invariants)
- Test: `test/grid.test.ts` (add a determinism assertion)

**Interfaces:**
- Produces: `BIOMES[id].materialTable[nodeType]: Record<string, number>` (weighted). `generateGrid` still returns `Poi.material: string | null`, now rolled from the weighted table.

- [ ] **Step 1: Update the `Biome.materialTable` type and fill weighted tables**

In `src/data/constants.ts`, change the `Biome` type's `materialTable` field:

```ts
  materialTable: Partial<Record<NodeType, Record<string, number>>>; // node kind → weighted material defIds (D27)
```

Replace each biome's `materialTable` with weighted tables (ores/wood/herb/hide cross-available, skewed to the biome's specialty — silver is best-farmed in tundra, not exclusive):

```ts
  woodland: {
    // ...terrainWeights, nodeTypeWeights, creatureTable unchanged...
    materialTable: {
      mining: { "iron-ore": 7, "copper-ore": 2, "silver-ore": 1 },
      wood: { "oak-log": 7, "pine-log": 2, "cactus-wood": 1 },
      herb: { "forest-herb": 7, "desert-sage": 2, "ice-moss": 1 },
      animal: { "deer-hide": 7, "wolf-pelt": 2, "lizard-hide": 1 },
    },
  },
  desert: {
    // ...
    materialTable: {
      mining: { "copper-ore": 7, "iron-ore": 2, "silver-ore": 1 },
      wood: { "cactus-wood": 7, "oak-log": 2, "pine-log": 1 },
      herb: { "desert-sage": 7, "forest-herb": 2, "ice-moss": 1 },
      animal: { "lizard-hide": 7, "deer-hide": 2, "wolf-pelt": 1 },
    },
  },
  tundra: {
    // ...
    materialTable: {
      mining: { "silver-ore": 7, "iron-ore": 2, "copper-ore": 1 },
      wood: { "pine-log": 7, "oak-log": 2, "cactus-wood": 1 },
      herb: { "ice-moss": 7, "desert-sage": 2, "forest-herb": 1 },
      animal: { "wolf-pelt": 7, "deer-hide": 2, "lizard-hide": 1 },
    },
  },
```

- [ ] **Step 2: Update `generateGrid` to roll the material**

In `src/engine/grid.ts`, replace the POI push line (currently `material: biome.materialTable[kind] ?? null`). Add a helper above `generateGrid`:

```ts
// Roll a POI's material from the biome's weighted table (D27). Keys are sorted
// for a deterministic order independent of literal insertion order.
function rollMaterial(
  table: Record<string, number> | undefined,
  roll: number,
): string | null {
  if (!table) return null;
  const order = Object.keys(table).sort();
  if (order.length === 0) return null;
  return weightedPick(table, order, roll);
}
```

Then in the POI loop, replace the push with:

```ts
    const material =
      kind === "monster"
        ? null
        : rollMaterial(biome.materialTable[kind], rand(mapSeed, "poi-material", attempt));
    pois.push({ x, y, kind, material, creature });
```

Update the `Poi.material` comment to reference D27:

```ts
  material: string | null; // yield defId, rolled from the biome's weighted table at generation (D25/D27) — gather never consults the biome
```

- [ ] **Step 3: Rewrite the material invariants in `test/constants.test.ts`**

Replace the two material tests (`"every biome yields a material for every gatherable node type"` and `"biome materials are distinct so cross-biome recipes have pulls"`) with:

```ts
test("constants: every biome yields a non-empty weighted material table per gatherable node type", () => {
  for (const id of BIOME_IDS) {
    for (const kind of ["mining", "wood", "herb", "animal"] as const) {
      const table = BIOMES[id].materialTable[kind];
      expect(table).toBeTruthy();
      const weights = Object.values(table!);
      expect(weights.length).toBeGreaterThan(0);
      for (const w of weights) expect(w).toBeGreaterThan(0);
    }
  }
});

test("constants: each biome's DOMINANT material per node type is distinct (D27 soft pulls)", () => {
  const dominant = (table: Record<string, number>) =>
    Object.entries(table).sort((a, b) => b[1] - a[1])[0]![0];
  const dominants = BIOME_IDS.flatMap((id) =>
    (["mining", "wood", "herb", "animal"] as const).map((kind) =>
      dominant(BIOMES[id].materialTable[kind]!),
    ),
  );
  expect(new Set(dominants).size).toBe(dominants.length); // 12 distinct dominants
});

test("constants: silver is dominant in tundra mining but present elsewhere (D27)", () => {
  expect(BIOMES.tundra.materialTable.mining!["silver-ore"]).toBeGreaterThan(
    BIOMES.woodland.materialTable.mining!["silver-ore"] ?? 0,
  );
  expect(BIOMES.woodland.materialTable.mining!["silver-ore"]).toBeGreaterThan(0);
});
```

- [ ] **Step 4: Add a determinism assertion in `test/grid.test.ts`**

Append (adapt imports to those already at the top of the file):

```ts
test("generateGrid: POI materials are deterministic and drawn from the biome table (D27)", () => {
  const seed = "d27-seed";
  const biomeId = rollBiome(seed);
  const g1 = generateGrid(seed, biomeId);
  const g2 = generateGrid(seed, biomeId);
  expect(g1.pois).toEqual(g2.pois); // byte-identical
  for (const poi of g1.pois) {
    if (poi.kind === "monster") continue;
    const table = BIOMES[biomeId].materialTable[poi.kind]!;
    expect(Object.keys(table)).toContain(poi.material);
  }
});
```

Ensure `BIOMES` is imported in `test/grid.test.ts`.

- [ ] **Step 5: Run the full suite**

Run: `bun test`
Expected: PASS. Terrain/kind/creature snapshots are unchanged (the new `"poi-material"` RNG context does not perturb existing streams); only material invariants moved.

- [ ] **Step 6: Typecheck + lint**

Run: `bun run typecheck && bun run lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/data/constants.ts src/engine/grid.ts test/constants.test.ts test/grid.test.ts
git commit -m "M5: weighted POI materials (D27) — silver farmable everywhere, best in tundra"
```

---

## Task 2: Item catalogs & slot classification

**Files:**
- Modify: `src/data/constants.ts` (ARMOUR `slot`; `FOOD`/`POTION`; tiered tools; `spyglass` into tool catalogs)
- Create: `src/engine/catalog.ts`
- Test: `test/catalog.test.ts`
- Modify: `test/constants.test.ts` (extend the tool/armour consistency checks)

**Interfaces:**
- Produces:
  - `FOOD: string[]`, `POTION: string[]` in constants.
  - `ARMOUR[defId]: { armourType: ArmourType; defense: number; slot: ArmourSlot }` where `ArmourSlot = "helmet"|"chest"|"legs"|"boots"|"gloves"`.
  - `slotOf(defId: string): LoadoutSlot | null` and `validForSlot(slot: LoadoutSlot, defId: string): boolean` from `src/engine/catalog.ts`.

- [ ] **Step 1: Add `slot` to every `ARMOUR` entry**

In `src/data/constants.ts`, change the `ARMOUR` type and entries:

```ts
export type ArmourSlot = "helmet" | "chest" | "legs" | "boots" | "gloves";
export const ARMOUR: Record<string, { armourType: ArmourType; defense: number; slot: ArmourSlot }> = {
  "plate-helmet": { armourType: "plate", defense: 2, slot: "helmet" },
  "plate-chest": { armourType: "plate", defense: 3, slot: "chest" },
  "plate-legs": { armourType: "plate", defense: 2, slot: "legs" },
  "plate-boots": { armourType: "plate", defense: 1, slot: "boots" },
  "plate-gloves": { armourType: "plate", defense: 1, slot: "gloves" },
  "light-helmet": { armourType: "light", defense: 1, slot: "helmet" },
  "light-chest": { armourType: "light", defense: 2, slot: "chest" },
  "light-legs": { armourType: "light", defense: 1, slot: "legs" },
  "light-boots": { armourType: "light", defense: 1, slot: "boots" },
  "light-gloves": { armourType: "light", defense: 1, slot: "gloves" },
  "robe-hood": { armourType: "robe", defense: 1, slot: "helmet" },
  "robe-chest": { armourType: "robe", defense: 1, slot: "chest" },
  "robe-legs": { armourType: "robe", defense: 1, slot: "legs" },
  "robe-boots": { armourType: "robe", defense: 1, slot: "boots" },
  "robe-gloves": { armourType: "robe", defense: 1, slot: "gloves" },
};
```

- [ ] **Step 2: Add `spyglass` + tiered tools to the tool catalogs**

Replace `TOOL_CAPABILITY` and `TOOL_QUALITY` in `src/data/constants.ts`:

```ts
export const TOOL_CAPABILITY: Record<string, string> = {
  pick: "pick",
  axe: "axe",
  knife: "knife",
  "iron-pick": "pick",
  "iron-axe": "axe",
  "steel-knife": "knife",
  spyglass: "scout", // scouting capability; NODE_TOOL never asks for "scout", so no gather impact
};
export const TOOL_QUALITY: Record<string, number> = {
  pick: 1,
  axe: 1,
  knife: 1,
  "iron-pick": 2, // halves mining cost vs the basic pick — the "cheaper second run" demonstrator
  "iron-axe": 2,
  "steel-knife": 2,
  spyglass: 1, // quality irrelevant to scouting; present to satisfy the catalog invariant
};
```

Remove the now-inaccurate `SCOUT_TOOL = "spyglass"` comment drift if any; keep `SCOUT_TOOL` as-is (still `"spyglass"`).

- [ ] **Step 3: Add `FOOD` and `POTION` catalogs**

Add near the crafting section of `src/data/constants.ts`:

```ts
// --- Consumable item catalogs (M5) ---
// ENERGY_PER_FOOD / POTION_HEAL are flat, so these are single-item catalogs for
// the POC; the list is what `pack`/`slotOf` validate a food/potion defId against.
export const FOOD: string[] = ["ration"];
export const POTION: string[] = ["potion"];
```

- [ ] **Step 4: Write the failing catalog test**

Create `test/catalog.test.ts`:

```ts
import { test, expect } from "bun:test";
import { slotOf, validForSlot } from "../src/engine/catalog";

test("slotOf: classifies each catalog family to its loadout slot", () => {
  expect(slotOf("sword")).toBe("weapon");
  expect(slotOf("plate-helmet")).toBe("helmet");
  expect(slotOf("robe-hood")).toBe("helmet");
  expect(slotOf("plate-chest")).toBe("chest");
  expect(slotOf("iron-pick")).toBe("tool");
  expect(slotOf("spyglass")).toBe("tool");
  expect(slotOf("horse")).toBe("transport");
  expect(slotOf("leather")).toBe("backpack");
  expect(slotOf("ration")).toBe("food");
  expect(slotOf("potion")).toBe("potion");
  expect(slotOf("iron-ore")).toBeNull(); // raw material, not equippable
});

test("validForSlot: only accepts a defId in its own slot", () => {
  expect(validForSlot("helmet", "plate-helmet")).toBe(true);
  expect(validForSlot("chest", "plate-helmet")).toBe(false);
  expect(validForSlot("tool", "spyglass")).toBe(true);
  expect(validForSlot("weapon", "iron-ore")).toBe(false);
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `bun test test/catalog.test.ts`
Expected: FAIL — cannot find module `../src/engine/catalog`.

- [ ] **Step 6: Implement `src/engine/catalog.ts`**

```ts
// Item classification (M5): maps a defId to the loadout slot it belongs to, so
// `pack` can reject items in the wrong slot. Reads the code-side catalog only.
import { WEAPONS, ARMOUR, TOOL_CAPABILITY, TRANSPORT_MULTIPLIER, BACKPACK_SLOTS, FOOD, POTION } from "../data/constants";
import type { LoadoutSlot } from "./types";

export function slotOf(defId: string): LoadoutSlot | null {
  if (defId in WEAPONS) return "weapon";
  if (defId in ARMOUR) return ARMOUR[defId]!.slot;
  if (defId in TOOL_CAPABILITY) return "tool";
  if (defId in TRANSPORT_MULTIPLIER) return "transport";
  if (defId in BACKPACK_SLOTS) return "backpack";
  if (FOOD.includes(defId)) return "food";
  if (POTION.includes(defId)) return "potion";
  return null;
}

export function validForSlot(slot: LoadoutSlot, defId: string): boolean {
  return slotOf(defId) === slot;
}
```

- [ ] **Step 7: Run the catalog test to verify it passes**

Run: `bun test test/catalog.test.ts`
Expected: PASS.

- [ ] **Step 8: Extend the constants consistency test**

In `test/constants.test.ts`, add (and import `FOOD`, `POTION`, `ArmourSlot` via `ARMOUR`):

```ts
test("constants: armour pieces declare a valid body slot", () => {
  const slots = ["helmet", "chest", "legs", "boots", "gloves"];
  for (const [, piece] of Object.entries(ARMOUR)) {
    expect(slots).toContain(piece.slot);
  }
});

test("constants: consumable catalogs are non-empty", () => {
  expect(FOOD.length).toBeGreaterThan(0);
  expect(POTION.length).toBeGreaterThan(0);
});
```

- [ ] **Step 9: Run full suite, typecheck, lint**

Run: `bun test && bun run typecheck && bun run lint`
Expected: clean. (The M4 combat code reads `ARMOUR[x].armourType/.defense` — adding `.slot` does not break it.)

- [ ] **Step 10: Commit**

```bash
git add src/data/constants.ts src/engine/catalog.ts test/catalog.test.ts test/constants.test.ts
git commit -m "M5: item catalogs — armour slots, food/potion, tiered tools, slotOf classifier"
```

---

## Task 3: Recipe tree + `craft` helper + `subtractStacks`

**Files:**
- Modify: `src/data/constants.ts` (`RECIPE`)
- Modify: `src/engine/bank.ts` (`subtractStacks`)
- Create: `src/engine/craft.ts`
- Test: `test/craft.test.ts`

**Interfaces:**
- Consumes: `bankStacks(bank, stacks)` (existing, `src/engine/bank.ts`).
- Produces:
  - `RECIPE: Record<string, { inputs: {defId,qty}[]; output: {defId,qty} }>`.
  - `subtractStacks(bank: ItemStack[], stacks: ItemStack[]): ItemStack[] | null` — removes `stacks` from `bank`, or `null` if any is short. Drops emptied stacks.
  - `craft(bank: ItemStack[], recipeId: string): { ok: true; bank: ItemStack[]; output: ItemStack } | { ok: false; reason: "no-recipe" | "insufficient-materials" }`.

- [ ] **Step 1: Fill the `RECIPE` lever (wide shared tree)**

Replace the `RECIPE` placeholder in `src/data/constants.ts`:

```ts
// --- Crafting (M5): direct & instant, materials → item (D10). One shared tree
// so hauls from different biomes feed each other. Weighted materials (D27) make
// cross-biome inputs a soft pull (silver best-farmed in tundra), not a hard gate.
export const RECIPE: Record<string, { inputs: ItemStackSpec[]; output: ItemStackSpec }> = {
  // Consumables
  ration: { inputs: [{ defId: "forest-herb", qty: 1 }, { defId: "deer-hide", qty: 1 }], output: { defId: "ration", qty: 2 } },
  potion: { inputs: [{ defId: "desert-sage", qty: 1 }, { defId: "forest-herb", qty: 1 }], output: { defId: "potion", qty: 1 } },
  // Tools — tiered upgrades (iron-pick is the "cheaper second run" demonstrator)
  "iron-pick": { inputs: [{ defId: "iron-ore", qty: 2 }, { defId: "oak-log", qty: 1 }], output: { defId: "iron-pick", qty: 1 } },
  "iron-axe": { inputs: [{ defId: "iron-ore", qty: 2 }, { defId: "oak-log", qty: 1 }], output: { defId: "iron-axe", qty: 1 } },
  "steel-knife": { inputs: [{ defId: "iron-ore", qty: 1 }, { defId: "silver-ore", qty: 1 }], output: { defId: "steel-knife", qty: 1 } },
  spyglass: { inputs: [{ defId: "copper-ore", qty: 2 }, { defId: "ice-moss", qty: 1 }], output: { defId: "spyglass", qty: 1 } }, // cross-biome: desert copper + tundra moss
  // Backpack — carry upgrade
  leather: { inputs: [{ defId: "deer-hide", qty: 2 }, { defId: "oak-log", qty: 1 }], output: { defId: "leather", qty: 1 } },
  // Transport
  horse: { inputs: [{ defId: "deer-hide", qty: 3 }, { defId: "oak-log", qty: 2 }], output: { defId: "horse", qty: 1 } },
  // Weapons
  "iron-sword": { inputs: [{ defId: "iron-ore", qty: 3 }], output: { defId: "iron-sword", qty: 1 } },
  "silver-sword": { inputs: [{ defId: "silver-ore", qty: 3 }], output: { defId: "silver-sword", qty: 1 } }, // werewolf affinity; silver best-farmed in tundra
  bow: { inputs: [{ defId: "oak-log", qty: 2 }, { defId: "deer-hide", qty: 1 }], output: { defId: "bow", qty: 1 } },
  "fire-staff": { inputs: [{ defId: "pine-log", qty: 2 }, { defId: "fae-dust", qty: 1 }], output: { defId: "fire-staff", qty: 1 } },
  // Armour — full plate set + light/robe samples
  "plate-helmet": { inputs: [{ defId: "iron-ore", qty: 2 }], output: { defId: "plate-helmet", qty: 1 } },
  "plate-chest": { inputs: [{ defId: "iron-ore", qty: 3 }], output: { defId: "plate-chest", qty: 1 } },
  "plate-legs": { inputs: [{ defId: "iron-ore", qty: 2 }], output: { defId: "plate-legs", qty: 1 } },
  "plate-boots": { inputs: [{ defId: "iron-ore", qty: 1 }], output: { defId: "plate-boots", qty: 1 } },
  "plate-gloves": { inputs: [{ defId: "iron-ore", qty: 1 }], output: { defId: "plate-gloves", qty: 1 } },
  "light-chest": { inputs: [{ defId: "deer-hide", qty: 2 }], output: { defId: "light-chest", qty: 1 } },
  "light-legs": { inputs: [{ defId: "deer-hide", qty: 1 }, { defId: "wolf-pelt", qty: 1 }], output: { defId: "light-legs", qty: 1 } },
  "robe-chest": { inputs: [{ defId: "forest-herb", qty: 2 }, { defId: "ice-moss", qty: 1 }], output: { defId: "robe-chest", qty: 1 } },
  "robe-hood": { inputs: [{ defId: "forest-herb", qty: 1 }, { defId: "ice-moss", qty: 1 }], output: { defId: "robe-hood", qty: 1 } },
};
```

Note: every recipe `output.defId` must be equippable/consumable (i.e. `slotOf` returns non-null) except that `ration`/`potion` are covered by `FOOD`/`POTION`. This is asserted in Task 3 Step 4.

- [ ] **Step 2: Add `subtractStacks` to `src/engine/bank.ts`**

```ts
// Inverse of bankStacks: remove `stacks` from `bank`, or return null if any
// required defId is short. Emptied stacks are dropped. Used by craft + embark (D28).
export function subtractStacks(bank: ItemStack[], stacks: ItemStack[]): ItemStack[] | null {
  const next = bank.map((s) => ({ ...s }));
  for (const need of stacks) {
    const existing = next.find((s) => s.defId === need.defId);
    if (!existing || existing.qty < need.qty) return null;
    existing.qty -= need.qty;
  }
  return next.filter((s) => s.qty > 0);
}
```

- [ ] **Step 3: Write the failing `craft` test**

Create `test/craft.test.ts`:

```ts
import { test, expect } from "bun:test";
import { craft } from "../src/engine/craft";
import { RECIPE, ARMOUR, WEAPONS, TOOL_CAPABILITY, BACKPACK_SLOTS, TRANSPORT_MULTIPLIER, FOOD, POTION } from "../src/data/constants";
import { slotOf } from "../src/engine/catalog";

test("craft: consumes inputs and yields output (bead acceptance)", () => {
  const bank = [{ defId: "iron-ore", qty: 5 }, { defId: "oak-log", qty: 2 }];
  const r = craft(bank, "iron-pick");
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.output).toEqual({ defId: "iron-pick", qty: 1 });
  expect(r.bank).toEqual([{ defId: "iron-ore", qty: 3 }, { defId: "oak-log", qty: 1 }]);
});

test("craft: insufficient materials is rejected, bank untouched", () => {
  const bank = [{ defId: "iron-ore", qty: 1 }];
  const r = craft(bank, "iron-pick");
  expect(r).toEqual({ ok: false, reason: "insufficient-materials" });
});

test("craft: unknown recipe is rejected", () => {
  expect(craft([], "no-such-recipe")).toEqual({ ok: false, reason: "no-recipe" });
});

test("craft: does not mutate the input bank", () => {
  const bank = [{ defId: "iron-ore", qty: 5 }, { defId: "oak-log", qty: 2 }];
  const before = structuredClone(bank);
  craft(bank, "iron-pick");
  expect(bank).toEqual(before);
});

test("recipes: every output is a real equippable/consumable defId", () => {
  const known = (d: string) =>
    d in WEAPONS || d in ARMOUR || d in TOOL_CAPABILITY || d in BACKPACK_SLOTS ||
    d in TRANSPORT_MULTIPLIER || FOOD.includes(d) || POTION.includes(d);
  for (const [id, recipe] of Object.entries(RECIPE)) {
    expect(known(recipe.output.defId)).toBe(true);
    expect(recipe.output.qty).toBeGreaterThan(0);
    expect(recipe.inputs.length).toBeGreaterThan(0);
    // recipe id conventionally matches its output for gear
    if (slotOf(recipe.output.defId) !== "food" && slotOf(recipe.output.defId) !== "potion") {
      expect(id).toBe(recipe.output.defId);
    }
  }
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `bun test test/craft.test.ts`
Expected: FAIL — cannot find module `../src/engine/craft`.

- [ ] **Step 5: Implement `src/engine/craft.ts`**

```ts
// Direct, instant crafting (M5, D10): consume a recipe's inputs from the bank,
// produce its output. Pure — returns the new bank, never mutates.
import type { ItemStack } from "./types";
import { RECIPE } from "../data/constants";
import { subtractStacks, bankStacks } from "./bank";

export function craft(
  bank: ItemStack[],
  recipeId: string,
):
  | { ok: true; bank: ItemStack[]; output: ItemStack }
  | { ok: false; reason: "no-recipe" | "insufficient-materials" } {
  const recipe = RECIPE[recipeId];
  if (!recipe) return { ok: false, reason: "no-recipe" };
  const afterInputs = subtractStacks(bank, recipe.inputs);
  if (afterInputs === null) return { ok: false, reason: "insufficient-materials" };
  const output = { ...recipe.output };
  return { ok: true, bank: bankStacks(afterInputs, [output]), output };
}
```

- [ ] **Step 6: Run the craft test to verify it passes**

Run: `bun test test/craft.test.ts`
Expected: PASS.

- [ ] **Step 7: Full suite, typecheck, lint**

Run: `bun test && bun run typecheck && bun run lint`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/data/constants.ts src/engine/bank.ts src/engine/craft.ts test/craft.test.ts
git commit -m "M5: wide recipe tree + craft() helper + subtractStacks"
```

---

## Task 4: `reduce` — `craft`

**Files:**
- Modify: `src/engine/reduce.ts` (fill the `craft` case)
- Modify: `src/engine/types.ts` (add `crafted` event)
- Test: `test/reduce-craft.test.ts`

**Interfaces:**
- Consumes: `craft(bank, recipeId)` (Task 3).
- Produces: `reduce(state, {type:"craft", recipeId})` — town-only; on success replaces `state.bank`, emits `{ type: "crafted"; recipeId; output }`.

- [ ] **Step 1: Add the `crafted` event to `src/engine/types.ts`**

Add to the `GameEvent` union:

```ts
  | { type: "crafted"; recipeId: string; output: ItemStack }
```

- [ ] **Step 2: Write the failing test**

Create `test/reduce-craft.test.ts`:

```ts
import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import type { GameState } from "../src/engine/types";

function town(bank: { defId: string; qty: number }[]): GameState {
  return { seed: "c", phase: "town", bank, loadout: emptyLoadout(), expedition: null };
}

test("craft: town-side, consumes inputs and banks the output (bead acceptance)", () => {
  const { state, events } = reduce(
    town([{ defId: "iron-ore", qty: 3 }, { defId: "oak-log", qty: 1 }]),
    { type: "craft", recipeId: "iron-pick" },
  );
  expect(state.bank).toEqual([
    { defId: "iron-ore", qty: 1 },
    { defId: "iron-pick", qty: 1 },
  ]);
  expect(events).toEqual([
    { type: "crafted", recipeId: "iron-pick", output: { defId: "iron-pick", qty: 1 } },
  ]);
});

test("craft: insufficient materials is rejected", () => {
  const { state, events } = reduce(town([{ defId: "iron-ore", qty: 1 }]), {
    type: "craft",
    recipeId: "iron-pick",
  });
  expect(state.bank).toEqual([{ defId: "iron-ore", qty: 1 }]);
  expect(events).toEqual([
    { type: "action-rejected", action: "craft", reason: "insufficient-materials" },
  ]);
});

test("craft: rejected outside town", () => {
  const expeditionState: GameState = {
    ...town([{ defId: "iron-ore", qty: 3 }, { defId: "oak-log", qty: 1 }]),
    phase: "expedition",
  };
  const { events } = reduce(expeditionState, { type: "craft", recipeId: "iron-pick" });
  expect(events).toEqual([
    { type: "action-rejected", action: "craft", reason: "not-in-town" },
  ]);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `bun test test/reduce-craft.test.ts`
Expected: FAIL — `craft` case is currently a no-op stub returning `[]` events.

- [ ] **Step 4: Implement the `craft` case in `src/engine/reduce.ts`**

Add the import at the top:

```ts
import { craft as applyRecipe } from "./craft";
```

Replace the combined `case "craft": case "pack": case "return":` stub — split `craft` out:

```ts
    case "craft":
      return craftAction(state, action.recipeId);
    case "pack":
    case "return":
      return { state, events: [] };
```

Add the handler:

```ts
function craftAction(
  state: GameState,
  recipeId: string,
): { state: GameState; events: GameEvent[] } {
  if (state.phase !== "town") return rejected(state, "craft", "not-in-town");
  const result = applyRecipe(state.bank, recipeId);
  if (!result.ok) return rejected(state, "craft", result.reason);
  return {
    state: { ...state, bank: result.bank },
    events: [{ type: "crafted", recipeId, output: result.output }],
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test test/reduce-craft.test.ts`
Expected: PASS.

- [ ] **Step 6: Full suite, typecheck, lint**

Run: `bun test && bun run typecheck && bun run lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/engine/reduce.ts src/engine/types.ts test/reduce-craft.test.ts
git commit -m "M5: reduce craft — town-only, consumes bank, emits crafted"
```

---

## Task 5: `reduce` — `pack` (plan editor, D28)

**Files:**
- Create: `src/engine/pack.ts`
- Modify: `src/engine/reduce.ts` (fill the `pack` case)
- Modify: `src/engine/types.ts` (add `packed` event)
- Test: `test/reduce-pack.test.ts`

**Interfaces:**
- Consumes: `slotOf`/`validForSlot` (Task 2); `slotCap`, `addToCarry` (`src/engine/carry.ts`).
- Produces:
  - `reserveLoadout(loadout: Loadout): ItemStack[]` — every defId the plan pulls from the bank (equipment ×1 each, tools ×1 each, transport, backpack, food stacks, potion stacks).
  - `packItem(loadout, bank, slot, itemId): { ok: true; loadout: Loadout } | { ok: false; reason: "wrong-slot" | "insufficient" | "already-packed" | "no-slot" }`.
  - `reduce(state, {type:"pack", slot, itemId})` — town-only; edits `state.loadout`; emits `{ type: "packed"; slot; defId }`.

- [ ] **Step 1: Add the `packed` event to `src/engine/types.ts`**

```ts
  | { type: "packed"; slot: LoadoutSlot; defId: string }
```

(`LoadoutSlot` is already exported from `types.ts`.)

- [ ] **Step 2: Write the failing test**

Create `test/reduce-pack.test.ts`:

```ts
import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { reserveLoadout } from "../src/engine/pack";
import type { GameState } from "../src/engine/types";

function town(bank: { defId: string; qty: number }[]): GameState {
  return { seed: "p", phase: "town", bank, loadout: emptyLoadout(), expedition: null };
}

test("pack: equipment slot is set, bank untouched (D28 plan)", () => {
  const { state, events } = reduce(town([{ defId: "iron-sword", qty: 1 }]), {
    type: "pack",
    slot: "weapon",
    itemId: "iron-sword",
  });
  expect(state.loadout.equipment.weapon).toBe("iron-sword");
  expect(state.bank).toEqual([{ defId: "iron-sword", qty: 1 }]); // NOT debited until embark
  expect(events).toEqual([{ type: "packed", slot: "weapon", defId: "iron-sword" }]);
});

test("pack: re-packing an equipment slot overwrites (frees the old reservation)", () => {
  const s1 = reduce(town([{ defId: "sword", qty: 1 }, { defId: "iron-sword", qty: 1 }]), {
    type: "pack", slot: "weapon", itemId: "sword",
  }).state;
  const s2 = reduce(s1, { type: "pack", slot: "weapon", itemId: "iron-sword" }).state;
  expect(s2.loadout.equipment.weapon).toBe("iron-sword");
});

test("pack: wrong slot is rejected", () => {
  const { events } = reduce(town([{ defId: "plate-helmet", qty: 1 }]), {
    type: "pack", slot: "chest", itemId: "plate-helmet",
  });
  expect(events).toEqual([{ type: "action-rejected", action: "pack", reason: "wrong-slot" }]);
});

test("pack: cannot plan more than the bank holds", () => {
  // one ration in bank, pack it, then try to pack a second
  const s1 = reduce(town([{ defId: "ration", qty: 1 }]), {
    type: "pack", slot: "food", itemId: "ration",
  }).state;
  const { events } = reduce(s1, { type: "pack", slot: "food", itemId: "ration" });
  expect(events).toEqual([{ type: "action-rejected", action: "pack", reason: "insufficient" }]);
});

test("pack: food merges into a stack up to STACK_CAP before opening a new slot", () => {
  const s = reduce(town([{ defId: "ration", qty: 5 }]), {
    type: "pack", slot: "food", itemId: "ration",
  }).state;
  const s2 = reduce(s, { type: "pack", slot: "food", itemId: "ration" }).state;
  expect(s2.loadout.food).toEqual([{ defId: "ration", qty: 2 }]); // one stack, qty 2
});

test("pack: rejects when a new food/potion stack would exceed backpack slots (bead note e)", () => {
  // starter backpack = 4 slots; fill all 4 with distinct-stack food, then packing
  // a potion (new stack) must fail. Use STACK_CAP-sized ration stacks to force new slots.
  let state = town([
    { defId: "leather", qty: 1 },
    { defId: "ration", qty: 60 },
    { defId: "potion", qty: 1 },
  ]);
  state = reduce(state, { type: "pack", slot: "backpack", itemId: "leather" }).state; // 6 slots
  // pack 6 full ration stacks (STACK_CAP=10 each → 60 rations = 6 stacks = 6 slots)
  for (let i = 0; i < 60; i++) {
    state = reduce(state, { type: "pack", slot: "food", itemId: "ration" }).state;
  }
  expect(state.loadout.food.length).toBe(6);
  const { events } = reduce(state, { type: "pack", slot: "potion", itemId: "potion" });
  expect(events).toEqual([{ type: "action-rejected", action: "pack", reason: "no-slot" }]);
});

test("pack: duplicate tool defId is rejected", () => {
  const s1 = reduce(town([{ defId: "pick", qty: 1 }]), {
    type: "pack", slot: "tool", itemId: "pick",
  }).state;
  const { events } = reduce(s1, { type: "pack", slot: "tool", itemId: "pick" });
  expect(events).toEqual([{ type: "action-rejected", action: "pack", reason: "already-packed" }]);
});

test("pack: rejected outside town", () => {
  const { events } = reduce({ ...town([{ defId: "sword", qty: 1 }]), phase: "expedition" }, {
    type: "pack", slot: "weapon", itemId: "sword",
  });
  expect(events).toEqual([{ type: "action-rejected", action: "pack", reason: "not-in-town" }]);
});

test("reserveLoadout: enumerates every defId the plan pulls from the bank", () => {
  const loadout = emptyLoadout();
  loadout.equipment.weapon = "iron-sword";
  loadout.equipment.tools = ["pick", "spyglass"];
  loadout.equipment.backpack = "leather";
  loadout.food = [{ defId: "ration", qty: 3 }];
  loadout.potions = [{ defId: "potion", qty: 2 }];
  expect(reserveLoadout(loadout)).toEqual([
    { defId: "iron-sword", qty: 1 },
    { defId: "pick", qty: 1 },
    { defId: "spyglass", qty: 1 },
    { defId: "leather", qty: 1 },
    { defId: "ration", qty: 3 },
    { defId: "potion", qty: 2 },
  ]);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `bun test test/reduce-pack.test.ts`
Expected: FAIL — cannot find module `../src/engine/pack`.

- [ ] **Step 4: Implement `src/engine/pack.ts`**

```ts
// Town-side loadout planning (M5, D28). `pack` edits a PLAN on GameState.loadout
// without touching the bank; the plan is validated against `bank − reservations`
// so it never exceeds holdings. The bank is only debited at embark. There is no
// unpack action — reduce a mis-planned consumable by embarking and re-planning.
import type { ItemStack, Loadout, LoadoutSlot } from "./types";
import { slotOf } from "./catalog";
import { slotCap, addToCarry } from "./carry";

// Single-occupancy equipment slots keyed exactly by LoadoutSlot name.
const EQUIP_SLOTS = ["weapon", "helmet", "chest", "legs", "boots", "gloves", "transport", "backpack"] as const;
type EquipSlot = (typeof EQUIP_SLOTS)[number];

// Every defId the plan reserves from the bank (each equipment piece ×1, each
// tool ×1, transport, backpack, plus food/potion stack quantities). This is the
// exact set embark debits (D28) and mirrors what endExpedition banks back (D26,
// minus food).
export function reserveLoadout(loadout: Loadout): ItemStack[] {
  const { equipment, food, potions } = loadout;
  const out: ItemStack[] = [];
  for (const piece of [equipment.weapon, equipment.helmet, equipment.chest, equipment.legs, equipment.boots, equipment.gloves]) {
    if (piece !== null) out.push({ defId: piece, qty: 1 });
  }
  for (const tool of equipment.tools) out.push({ defId: tool, qty: 1 });
  if (equipment.transport !== null) out.push({ defId: equipment.transport, qty: 1 });
  if (equipment.backpack !== null) out.push({ defId: equipment.backpack, qty: 1 });
  for (const stack of food) out.push({ defId: stack.defId, qty: stack.qty });
  for (const stack of potions) out.push({ defId: stack.defId, qty: stack.qty });
  return out;
}

function reservedQty(loadout: Loadout, defId: string): number {
  return reserveLoadout(loadout)
    .filter((s) => s.defId === defId)
    .reduce((sum, s) => sum + s.qty, 0);
}

function bankQty(bank: ItemStack[], defId: string): number {
  return bank.find((s) => s.defId === defId)?.qty ?? 0;
}

export function packItem(
  loadout: Loadout,
  bank: ItemStack[],
  slot: LoadoutSlot,
  itemId: string,
):
  | { ok: true; loadout: Loadout }
  | { ok: false; reason: "wrong-slot" | "insufficient" | "already-packed" | "no-slot" } {
  if (slotOf(itemId) !== slot) return { ok: false, reason: "wrong-slot" };

  // Equipment: overwrite the slot. Affordability is checked against the CANDIDATE
  // loadout, so replacing frees the old occupant's reservation.
  if ((EQUIP_SLOTS as readonly string[]).includes(slot)) {
    const equipment = { ...loadout.equipment, [slot as EquipSlot]: itemId };
    const candidate: Loadout = { ...loadout, equipment };
    if (reservedQty(candidate, itemId) > bankQty(bank, itemId)) {
      return { ok: false, reason: "insufficient" };
    }
    return { ok: true, loadout: candidate };
  }

  if (slot === "tool") {
    if (loadout.equipment.tools.includes(itemId)) return { ok: false, reason: "already-packed" };
    const equipment = { ...loadout.equipment, tools: [...loadout.equipment.tools, itemId] };
    const candidate: Loadout = { ...loadout, equipment };
    if (reservedQty(candidate, itemId) > bankQty(bank, itemId)) {
      return { ok: false, reason: "insufficient" };
    }
    return { ok: true, loadout: candidate };
  }

  // food / potion: merge into stacks (STACK_CAP), opening a new slot only when
  // needed; addToCarry returns null when a new stack would exceed the slot cap
  // shared with the other consumable list (bead note e).
  const cap = slotCap(loadout.equipment.backpack);
  if (slot === "food") {
    const food = addToCarry(loadout.food, itemId, 1, cap - loadout.potions.length);
    if (food === null) return { ok: false, reason: "no-slot" };
    const candidate: Loadout = { ...loadout, food };
    if (reservedQty(candidate, itemId) > bankQty(bank, itemId)) {
      return { ok: false, reason: "insufficient" };
    }
    return { ok: true, loadout: candidate };
  }
  // slot === "potion"
  const potions = addToCarry(loadout.potions, itemId, 1, cap - loadout.food.length);
  if (potions === null) return { ok: false, reason: "no-slot" };
  const candidate: Loadout = { ...loadout, potions };
  if (reservedQty(candidate, itemId) > bankQty(bank, itemId)) {
    return { ok: false, reason: "insufficient" };
  }
  return { ok: true, loadout: candidate };
}
```

- [ ] **Step 5: Implement the `pack` case in `src/engine/reduce.ts`**

Add import:

```ts
import { packItem } from "./pack";
```

Replace the `case "pack": case "return":` stub — split `pack` out:

```ts
    case "pack":
      return packAction(state, action.slot, action.itemId);
    case "return":
      return { state, events: [] };
```

Add the handler:

```ts
function packAction(
  state: GameState,
  slot: import("./types").LoadoutSlot,
  itemId: string,
): { state: GameState; events: GameEvent[] } {
  if (state.phase !== "town") return rejected(state, "pack", "not-in-town");
  const result = packItem(state.loadout, state.bank, slot, itemId);
  if (!result.ok) return rejected(state, "pack", result.reason);
  return {
    state: { ...state, loadout: result.loadout },
    events: [{ type: "packed", slot, defId: itemId }],
  };
}
```

(If you prefer, add `LoadoutSlot` to the existing `import type { ... } from "./types"` line rather than the inline import.)

- [ ] **Step 6: Run the test to verify it passes**

Run: `bun test test/reduce-pack.test.ts`
Expected: PASS.

- [ ] **Step 7: Full suite, typecheck, lint**

Run: `bun test && bun run typecheck && bun run lint`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/engine/pack.ts src/engine/reduce.ts src/engine/types.ts test/reduce-pack.test.ts
git commit -m "M5: reduce pack — plan editor validated against bank (D28)"
```

---

## Task 6: `embark` — validate + debit the bank (D28)

**Files:**
- Modify: `src/engine/reduce.ts` (`embark`)
- Test: `test/reduce-embark.test.ts` (update — embark now debits)

**Interfaces:**
- Consumes: `reserveLoadout` (Task 5), `subtractStacks` (Task 3).
- Produces: `embark` debits `reserveLoadout(state.loadout)` from `state.bank`; rejects `"unaffordable"` if short; energy still `food qty × ENERGY_PER_FOOD`; zero-food still allowed.

- [ ] **Step 1: Read the current embark tests**

Run: `bun test test/reduce-embark.test.ts`
Expected: currently PASS. Note which tests build a `loadout` with food but an empty `bank` — those must now seed the bank with the packed items, because embark debits them.

- [ ] **Step 2: Update `embark` in `src/engine/reduce.ts`**

Add imports:

```ts
import { reserveLoadout } from "./pack";
import { subtractStacks } from "./bank";
```

Replace the `embark` function body's bank handling. New version:

```ts
function embark(
  state: GameState,
  mapSeed: string,
): { state: GameState; events: GameEvent[] } {
  if (state.phase !== "town") return rejected(state, "embark", "not-in-town");
  // D28: settle the plan against the bank — debit everything the loadout pulls.
  const reserved = reserveLoadout(state.loadout);
  const bank = subtractStacks(state.bank, reserved);
  if (bank === null) return rejected(state, "embark", "unaffordable");
  const grid = generateGrid(mapSeed, rollBiome(mapSeed));
  const foodQty = state.loadout.food.reduce((sum, stack) => sum + stack.qty, 0);
  const energy = foodQty * ENERGY_PER_FOOD;
  return {
    state: {
      ...state,
      phase: "expedition",
      bank,
      loadout: emptyLoadout(),
      expedition: {
        mapSeed,
        pos: grid.entry,
        energy,
        hp: PLAYER_BASE_HP,
        loadout: state.loadout,
        carry: [],
        cleared: [],
      },
    },
    events: [{ type: "embarked", mapSeed, biomeId: grid.biomeId, pos: grid.entry, energy }],
  };
}
```

- [ ] **Step 3: Update `test/reduce-embark.test.ts`**

For every test that packs food/gear into `loadout` and expects a successful embark, seed `bank` with those same items. Add two new tests:

```ts
test("embark: debits the packed loadout from the bank (D28)", () => {
  const loadout = emptyLoadout();
  loadout.equipment.weapon = "sword";
  loadout.food = [{ defId: "ration", qty: 3 }];
  const state: GameState = {
    seed: "e", phase: "town",
    bank: [{ defId: "sword", qty: 1 }, { defId: "ration", qty: 5 }, { defId: "iron-ore", qty: 9 }],
    loadout, expedition: null,
  };
  const { state: next } = reduce(state, { type: "embark", mapSeed: "map-1" });
  // sword + 3 rations removed; the untouched iron-ore and 2 leftover rations remain
  expect(next.bank).toEqual([{ defId: "ration", qty: 2 }, { defId: "iron-ore", qty: 9 }]);
  expect(next.expedition!.energy).toBe(3 * 10); // ENERGY_PER_FOOD
  expect(next.expedition!.loadout.equipment.weapon).toBe("sword");
});

test("embark: unaffordable plan is rejected (safety net)", () => {
  const loadout = emptyLoadout();
  loadout.food = [{ defId: "ration", qty: 3 }];
  const state: GameState = {
    seed: "e", phase: "town", bank: [{ defId: "ration", qty: 1 }], loadout, expedition: null,
  };
  const { events } = reduce(state, { type: "embark", mapSeed: "map-1" });
  expect(events).toEqual([{ type: "action-rejected", action: "embark", reason: "unaffordable" }]);
});

test("embark: zero-food is allowed (0 energy expedition)", () => {
  const state: GameState = {
    seed: "e", phase: "town", bank: [], loadout: emptyLoadout(), expedition: null,
  };
  const { state: next, events } = reduce(state, { type: "embark", mapSeed: "map-1" });
  expect(next.phase).toBe("expedition");
  expect(next.expedition!.energy).toBe(0);
  expect(events[0]!.type).toBe("embarked");
});
```

- [ ] **Step 4: Run the embark tests**

Run: `bun test test/reduce-embark.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite, typecheck, lint**

Run: `bun test && bun run typecheck && bun run lint`
Expected: clean. If other suites (e.g. a movement or combat test) build a town state and embark with a packed loadout but empty bank, seed their bank too.

- [ ] **Step 6: Commit**

```bash
git add src/engine/reduce.ts test/reduce-embark.test.ts
git commit -m "M5: embark validates + debits the bank (D28)"
```

---

## Task 7: `reduce` — `return`

**Files:**
- Modify: `src/engine/reduce.ts` (fill the `return` case)
- Test: `test/reduce-return.test.ts`

**Interfaces:**
- Consumes: `endExpedition(state, expedition)` (existing, `src/engine/bank.ts`).
- Produces: `reduce(state, {type:"return"})` — expedition-only; banks carry + durables + potions (not food, D26); `phase → town`; emits `{ type: "run-ended"; reason: "returned" }`.

- [ ] **Step 1: Write the failing test**

Create `test/reduce-return.test.ts`:

```ts
import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import type { GameState, Loadout } from "../src/engine/types";

function onExpedition(over: { carry?: any[]; loadout?: Loadout; bank?: any[] } = {}): GameState {
  const loadout = over.loadout ?? emptyLoadout();
  return {
    seed: "r", phase: "expedition", bank: over.bank ?? [], loadout: emptyLoadout(),
    expedition: {
      mapSeed: "m", pos: { x: 0, y: 0 }, energy: 5, hp: 20,
      loadout, carry: over.carry ?? [], cleared: [],
    },
  };
}

test("return: banks carry + durables + potions, discards food (D26), back to town", () => {
  const loadout = emptyLoadout();
  loadout.equipment.weapon = "iron-sword";
  loadout.equipment.tools = ["pick"];
  loadout.food = [{ defId: "ration", qty: 2 }]; // must NOT be banked
  loadout.potions = [{ defId: "potion", qty: 1 }];
  const { state, events } = reduce(
    onExpedition({ carry: [{ defId: "silver-ore", qty: 4 }], loadout, bank: [{ defId: "iron-ore", qty: 1 }] }),
    { type: "return" },
  );
  expect(state.phase).toBe("town");
  expect(state.expedition).toBeNull();
  expect(state.bank).toEqual([
    { defId: "iron-ore", qty: 1 },
    { defId: "silver-ore", qty: 4 },
    { defId: "iron-sword", qty: 1 },
    { defId: "pick", qty: 1 },
    { defId: "potion", qty: 1 },
  ]);
  expect(state.bank.find((s) => s.defId === "ration")).toBeUndefined();
  expect(events).toEqual([{ type: "run-ended", reason: "returned" }]);
});

test("return: rejected in town", () => {
  const town: GameState = { seed: "r", phase: "town", bank: [], loadout: emptyLoadout(), expedition: null };
  const { events } = reduce(town, { type: "return" });
  expect(events).toEqual([{ type: "action-rejected", action: "return", reason: "not-on-expedition" }]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test test/reduce-return.test.ts`
Expected: FAIL — `return` is a no-op stub.

- [ ] **Step 3: Implement the `return` case in `src/engine/reduce.ts`**

Replace `case "return": return { state, events: [] };` with:

```ts
    case "return":
      return returnHome(state);
```

Add the handler (reuses the existing `endExpedition` import — add it if not present: `import { endExpedition, subtractStacks } from "./bank";`):

```ts
function returnHome(state: GameState): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) {
    return rejected(state, "return", "not-on-expedition");
  }
  return {
    state: endExpedition(state, expedition),
    events: [{ type: "run-ended", reason: "returned" }],
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test test/reduce-return.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite, typecheck, lint**

Run: `bun test && bun run typecheck && bun run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/engine/reduce.ts test/reduce-return.test.ts
git commit -m "M5: reduce return — banks the haul via endExpedition, back to town"
```

---

## Task 8: Town entry — `newGame` + `candidateMaps`

**Files:**
- Create: `src/engine/town.ts`
- Test: `test/town.test.ts`

**Interfaces:**
- Consumes: `rollBiome` (`src/engine/grid.ts`), `emptyLoadout` (`src/engine/loadout.ts`), `CANDIDATE_MAP_COUNT`/`PREVIEW_FIDELITY` (constants).
- Produces:
  - `newGame(seed: string): GameState` — a town state with a starter bank.
  - `candidateMaps(seed: string): { mapSeed: string; biomeId: BiomeId; preview: { headline: string; hints: string[] } }[]` — `CANDIDATE_MAP_COUNT` deterministic maps; `headline` is the biome name; `hints` empty while `PREVIEW_FIDELITY === 0`, structured to grow (and later feed a cartography system).

- [ ] **Step 1: Write the failing test**

Create `test/town.test.ts`:

```ts
import { test, expect } from "bun:test";
import { newGame, candidateMaps } from "../src/engine/town";
import { rollBiome } from "../src/engine/grid";
import { CANDIDATE_MAP_COUNT } from "../src/data/constants";

test("newGame: a town state with a functional starter bank", () => {
  const g = newGame("s1");
  expect(g.phase).toBe("town");
  expect(g.expedition).toBeNull();
  const has = (d: string) => g.bank.some((s) => s.defId === d && s.qty > 0);
  expect(has("starter")).toBe(true); // starter backpack
  expect(has("pick")).toBe(true);
  expect(has("ration")).toBe(true); // enough to embark with energy
});

test("newGame: deterministic", () => {
  expect(newGame("s1")).toEqual(newGame("s1"));
});

test("candidateMaps: CANDIDATE_MAP_COUNT deterministic maps, biome-name headline, no hints at fidelity 0", () => {
  const maps = candidateMaps("town-seed");
  expect(maps.length).toBe(CANDIDATE_MAP_COUNT);
  expect(candidateMaps("town-seed")).toEqual(maps); // deterministic
  for (const m of maps) {
    expect(m.biomeId).toBe(rollBiome(m.mapSeed)); // anyone with the seed re-derives the biome (D21)
    expect(m.preview.headline).toBe(m.biomeId); // headline IS the biome name
    expect(m.preview.hints).toEqual([]); // PREVIEW_FIDELITY === 0
  }
});

test("candidateMaps: distinct map seeds", () => {
  const seeds = candidateMaps("town-seed").map((m) => m.mapSeed);
  expect(new Set(seeds).size).toBe(seeds.length);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test test/town.test.ts`
Expected: FAIL — cannot find module `../src/engine/town`.

- [ ] **Step 3: Implement `src/engine/town.ts`**

```ts
// Town entry (M5): a fresh game's starter state, and the town's candidate-map
// offer. candidateMaps is a pure helper (like the future legalActions, M6) that
// feeds both the web view and the AI harness — it is NOT a reducer action;
// embark carries only the chosen mapSeed.
import type { GameState } from "./types";
import type { BiomeId } from "../data/constants";
import { emptyLoadout } from "./loadout";
import { rollBiome } from "./grid";
import { CANDIDATE_MAP_COUNT, PREVIEW_FIDELITY } from "../data/constants";

// Modest, functional starter kit: enough to run a real first expedition. Gear
// upgrades come from crafting the haul (the loop's point).
export function newGame(seed: string): GameState {
  return {
    seed,
    phase: "town",
    bank: [
      { defId: "starter", qty: 1 }, // starter backpack (4 slots)
      { defId: "pick", qty: 1 },
      { defId: "axe", qty: 1 },
      { defId: "knife", qty: 1 },
      { defId: "sword", qty: 1 },
      { defId: "ration", qty: 4 },
      { defId: "potion", qty: 2 },
    ],
    loadout: emptyLoadout(),
    expedition: null,
  };
}

// PREVIEW_FIDELITY (0 for the POC) scales hints beyond the biome-name headline.
// Structured so higher tiers — and a later cartography system (craftable/editable
// maps) — plug in here without reshaping the return type.
function previewHints(_mapSeed: string, _biomeId: BiomeId): string[] {
  if (PREVIEW_FIDELITY <= 0) return [];
  return []; // higher-fidelity whispers land here when the lever is raised
}

export function candidateMaps(
  seed: string,
): { mapSeed: string; biomeId: BiomeId; preview: { headline: string; hints: string[] } }[] {
  const maps = [];
  for (let i = 0; i < CANDIDATE_MAP_COUNT; i++) {
    const mapSeed = `${seed}:map:${i}`;
    const biomeId = rollBiome(mapSeed);
    maps.push({ mapSeed, biomeId, preview: { headline: biomeId, hints: previewHints(mapSeed, biomeId) } });
  }
  return maps;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test test/town.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite, typecheck, lint**

Run: `bun test && bun run typecheck && bun run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/engine/town.ts test/town.test.ts
git commit -m "M5: town entry — newGame starter kit + candidateMaps biome previews"
```

---

## Task 9: Full-loop integration + demonstrator, docs, close

**Files:**
- Test: `test/loop.test.ts`
- Modify: `docs/balance-levers.md` (mark RECIPE/preview filled), `docs/superpowers/plans/2026-06-30-poc-core-loop-plan.md` (note M5 done — optional)

**Interfaces:**
- Consumes: everything above. Proves the bead acceptance: *a second run with a crafted upgrade is measurably cheaper.*

- [ ] **Step 1: Write the integration test (the loop + demonstrator)**

Create `test/loop.test.ts`. It threads craft → pack → embark → gather → return → craft-upgrade → embark and asserts the mining cost drops. Movement is bypassed (standing the player on the node, as the M3/M4 unit tests do) — the full movement-driven loop is M6's scripted test.

```ts
import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { newGame } from "../src/engine/town";
import { generateGrid, rollBiome } from "../src/engine/grid";
import type { Grid, Poi } from "../src/engine/grid";
import { NODE_HARDNESS, TOOL_QUALITY } from "../src/data/constants";
import type { GameState } from "../src/engine/types";

// Find a map whose rolled biome has a mining POI, and return that POI.
function miningMap(): { seed: string; grid: Grid; poi: Poi } {
  for (let i = 0; i < 400; i++) {
    const seed = `loop-scan-${i}`;
    const grid = generateGrid(seed, rollBiome(seed));
    const poi = grid.pois.find((p) => p.kind === "mining");
    if (poi) return { seed, grid, poi };
  }
  throw new Error("no mining map in scan range");
}

// Drop the player onto `poi` in an active expedition with the given loadout.
function standingOn(state: GameState, seed: string, poi: Poi, energy: number): GameState {
  return {
    ...state,
    phase: "expedition",
    loadout: state.loadout, // consumed already; keep as-is
    expedition: {
      mapSeed: seed, pos: { x: poi.x, y: poi.y }, energy, hp: 30,
      loadout: state.expedition!.loadout, carry: [], cleared: [],
    },
  };
}

test("loop: crafting iron-pick makes the second run's mining measurably cheaper (bead acceptance)", () => {
  const { seed, poi } = miningMap();
  // --- Run 1: basic pick ---
  let state = newGame("loop");
  state = reduce(state, { type: "pack", slot: "tool", itemId: "pick" }).state;
  state = reduce(state, { type: "pack", slot: "backpack", itemId: "starter" }).state;
  state = reduce(state, { type: "pack", slot: "food", itemId: "ration" }).state;
  state = reduce(state, { type: "pack", slot: "food", itemId: "ration" }).state;
  state = reduce(state, { type: "embark", mapSeed: seed }).state;
  // stand on the mining node with plenty of energy, gather with the basic pick
  state = standingOn(state, seed, poi, 100);
  const gather1 = reduce(state, { type: "gather" });
  const cost1 = NODE_HARDNESS.mining / TOOL_QUALITY.pick!; // 6 / 1
  expect(gather1.events[0]).toMatchObject({ type: "gathered", cost: cost1 });
  state = gather1.state;
  // return the haul
  state = reduce(state, { type: "return" }).state;
  expect(state.phase).toBe("town");

  // --- Craft the upgrade. Top up the bank so the craft is guaranteed regardless
  // of which ore the node rolled (D27 weighting) — the point under test is the
  // cost drop, not the gather RNG. ---
  state = { ...state, bank: [...state.bank, { defId: "iron-ore", qty: 2 }, { defId: "oak-log", qty: 1 }] };
  const craft = reduce(state, { type: "craft", recipeId: "iron-pick" });
  expect(craft.events[0]).toMatchObject({ type: "crafted", output: { defId: "iron-pick", qty: 1 } });
  state = craft.state;

  // --- Run 2: iron-pick (quality 2) ---
  state = reduce(state, { type: "pack", slot: "tool", itemId: "iron-pick" }).state;
  state = reduce(state, { type: "pack", slot: "backpack", itemId: "starter" }).state;
  state = reduce(state, { type: "pack", slot: "food", itemId: "ration" }).state;
  state = reduce(state, { type: "pack", slot: "food", itemId: "ration" }).state;
  state = reduce(state, { type: "embark", mapSeed: seed }).state;
  state = standingOn(state, seed, poi, 100);
  const gather2 = reduce(state, { type: "gather" });
  const cost2 = NODE_HARDNESS.mining / TOOL_QUALITY["iron-pick"]!; // 6 / 2

  expect(cost2).toBeLessThan(cost1); // measurably cheaper
  expect(gather2.events[0]).toMatchObject({ type: "gathered", cost: cost2 });
});
```

- [ ] **Step 2: Run the integration test**

Run: `bun test test/loop.test.ts`
Expected: PASS. If `standingOn` trips a type error on `state.expedition!.loadout` after `return` (expedition is null in town), restructure by capturing the embarked expedition loadout before standing the player on the node — the embark result's `expedition.loadout` is the packed loadout. Adjust the helper to take the loadout explicitly if cleaner.

- [ ] **Step 3: Update `docs/balance-levers.md`**

Under the Crafting group, confirm `RECIPE` is described as "the shared tree (M5, filled)"; under Map & forecast, note `PREVIEW_FIDELITY` ships at `0` (biome-name headline only) with structure for later fidelity + cartography. Keep edits to one or two lines — the lever names are unchanged.

- [ ] **Step 4: Full suite, typecheck, lint**

Run: `bun test && bun run typecheck && bun run lint`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add test/loop.test.ts docs/balance-levers.md
git commit -m "M5: full-loop integration test proves cheaper second run; docs"
```

- [ ] **Step 6: Close the bead**

```bash
bd close idle-adventure-868.6 --reason="M5 complete: craft/pack/return, embark debit (D28), weighted materials (D27), town candidateMaps; loop-cheaper-second-run test green"
```

Report to the user: changed files, `bun test` result, and that M6 (headless harness + `legalActions`) is now unblocked (`bd ready`).

---

## Self-Review

**Spec coverage (against the M5 bead + plan §M5):**
- `return` hauls carry → bank — Task 7. ✓
- `craft` consumes materials → item (recipe from catalog, instant) — Tasks 3–4. ✓
- `pack` builds a loadout within slot limits — Task 5 (slot-cap guard = bead note e). ✓
- 3 seeded candidate maps, biome-name headline, hidden layout, `PREVIEW_FIDELITY` hints — Task 8. ✓
- Pick → embark; embark debits (D28) — Task 6. ✓
- Levers RECIPE / PREVIEW_FIDELITY / CANDIDATE_MAP_COUNT — Tasks 3, 8 (fidelity stays 0), constants. ✓
- D23 food-as-ballast, never banked back — Tasks 5 (ballast via addToCarry) + 7 (endExpedition discards food). ✓
- Bead acceptance "second run measurably cheaper" — Task 9. ✓
- Bead note (a) D23 return discards food — Task 7. ✓ (b) zero-food embark warn — engine allows it (Task 6 test); UI warning is a web-view concern, out of engine scope. (c) entry passability nudge in previews — `candidateMaps` is the home; deferred content (hints empty at fidelity 0) — noted, not blocking. (e) pack rejects over-slot food+potions — Task 5. ✓
- D27 weighted materials — Task 1. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. `previewHints` intentionally returns `[]` (fidelity 0) — documented, not a placeholder.

**Type consistency:** `reserveLoadout` (Task 5) is consumed by embark (Task 6) with matching signature; `subtractStacks` (Task 3) used by craft (Task 3) and embark (Task 6); `craft` result shape matches `craftAction`'s use; `slotOf` return type `LoadoutSlot | null` matches `validForSlot` and `packItem`; event shapes (`crafted`, `packed`, `run-ended`) match the `GameEvent` additions. `ArmourSlot` values ⊂ `LoadoutSlot`, so `slotOf` returning `ARMOUR[d].slot` typechecks.

**Open follow-ups (file as beads at close, do not block M5):**
- Bead note (b): web-view zero-food embark warning (UI task, M5-web or M7).
- Bead note (c)/(d): entry-passability preview nudge + `renderGridHtml` "same tile walk" comment reconciliation — surface when the renderer is next touched.
- Higher `PREVIEW_FIDELITY` tiers + the cartography (craftable maps) direction — deferred, post-POC.
