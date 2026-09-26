# M3 — Nodes, Gathering, Carry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Bead:** `idle-adventure-868.4` (M3). Design sources: spec §3/§10 (two budgets, carry slots), plan doc M3 section, bead notes (D21 tie-in: hardness/yield/tool-gating are per node type, never per biome), D23 (food ballast), and two new decisions recorded here: **D24** (Expedition gains a `cleared` POI list) and **D25** (materials stamped onto POIs at generation from the biome's `materialTable`).

**Goal:** `gather` consumes the node the player is standing on — gated by the right tool, costing `NODE_HARDNESS ÷ tool quality` energy — and lands its biome-flavoured material in carry under a backpack-defined slot cap that counts packed food/potions as ballast (D23); `drop` frees a slot.

**Architecture:** Two new pure helper modules — `src/engine/carry.ts` (`slotCap`, `addToCarry`) and `src/engine/tools.ts` (`toolQualityFor`) — plus `gather`/`drop` cases in `reduce`. Node exhaustion is state, but the grid is never stored, so `Expedition` gains `cleared: {x,y}[]` (D24) listing POIs consumed this run — M4's defeated monsters will reuse it. D21 stays airtight: `generateGrid` stamps each POI's yield (`Poi.material`) from the biome's `materialTable` at generation time, so `gather` reads the POI and **never consults the biome at runtime**. Hardness/tool/yield levers are keyed by node type only. Slot accounting realizes D23: used slots = carry stacks + packed food stacks + potion stacks; `drop` operates on carry only (dropping eaten-food ballast would cheat the tension).

**Tech Stack:** TypeScript · bun (`bun test`) · no new dependencies.

## Global Constraints

- Engine purity (lint-enforced): no DOM, no `Math.random`/`Date.now`, no imports from `render`/`sim`/`web` under `src/engine/**`.
- No magic numbers in engine logic — every tunable read from `src/data/constants.ts`.
- D21: node hardness / tool-gating / yield are **per node type, never per biome**; the biome is consulted only inside `generateGrid` (material stamping happens there).
- D23: packed food/potion stacks are carry-slot ballast; `drop` cannot touch them.
- Grid regenerated from `mapSeed`; `GameState`/`Expedition` hold only the present (the `cleared` list is current state, not history).
- `reduce` never mutates input; rejections = unchanged state + `action-rejected` event; `GameEvent` union extended for new events.
- Render snapshots must NOT churn (render reads `kind`, not `material`).
- Gates before closing the bead: `bun test` · `bun run typecheck` · `bun run lint`.
- Commit-as-you-go in small commits (established M0–M2 authority).

## File Structure

- Modify `src/data/constants.ts` — fill carry + gathering levers; add `NODE_TOOL`, `TOOL_CAPABILITY`, `BASE_CARRY_SLOTS`, `GatherableNodeType`; fill `BIOMES[*].materialTable`.
- Modify `src/engine/types.ts` — `Expedition.cleared` (D24); `GameEvent` gains `gathered`/`dropped` variants.
- Modify `src/engine/grid.ts` — `Poi.material` stamped at generation (D25).
- Create `src/engine/carry.ts` — `slotCap`, `addToCarry`.
- Create `src/engine/tools.ts` — `toolQualityFor`.
- Modify `src/engine/reduce.ts` — `gather` and `drop` cases; `embark` initializes `cleared: []`.
- Modify `docs/decisions.md` (D24 + D25 rows), `docs/balance-levers.md` (Task 6).
- Tests: `test/carry.test.ts`, `test/tools.test.ts`, `test/reduce-gather.test.ts`, `test/reduce-drop.test.ts` (new); extend `test/constants.test.ts`, `test/grid.test.ts`; touch expedition literals in `test/render.test.ts`, `test/reduce-move.test.ts`, `test/reduce-embark.test.ts`.

---

### Task 1: Carry + gathering levers, biome material tables

**Files:**
- Modify: `src/data/constants.ts`
- Test: `test/constants.test.ts` (extend)

**Interfaces:**
- Consumes: existing `NodeType`, `Biome` shapes.
- Produces (used by Tasks 2–5):
  - `type GatherableNodeType = Exclude<NodeType, "monster">`
  - `BASE_CARRY_SLOTS = 2` — carry stacks with no backpack.
  - `BACKPACK_SLOTS: Record<string, number> = { starter: 4, leather: 6 }` — total carry stacks by backpack defId (replaces, not adds to, the base).
  - `STACK_CAP = 10` — max qty per stack.
  - `NODE_HARDNESS: Record<GatherableNodeType, number> = { mining: 6, wood: 4, herb: 2, animal: 4 }` — energy cost numerator.
  - `NODE_TOOL: Record<GatherableNodeType, string | null> = { mining: "pick", wood: "axe", herb: null, animal: "knife" }` — required tool capability; `null` = bare hands.
  - `TOOL_CAPABILITY: Record<string, string> = { pick: "pick", axe: "axe", knife: "knife" }` — tool defId → capability (M5's tiered tools, e.g. `"iron-pick": "pick"`, are data-only additions).
  - `TOOL_QUALITY: Record<string, number> = { pick: 1, axe: 1, knife: 1 }` — cost divisor by tool defId.
  - `GATHER_YIELD: Record<GatherableNodeType, number> = { mining: 3, wood: 3, herb: 2, animal: 2 }` — qty per gather.
  - `BIOMES[*].materialTable` filled: woodland `{ mining: "iron-ore", wood: "oak-log", herb: "forest-herb", animal: "deer-hide" }`; desert `{ mining: "copper-ore", wood: "cactus-wood", herb: "desert-sage", animal: "lizard-hide" }`; tundra `{ mining: "silver-ore", wood: "pine-log", herb: "ice-moss", animal: "wolf-pelt" }` (silver in tundra deliberately feeds the M4 werewolf affinity and M5 cross-biome recipes).

- [ ] **Step 1: Extend the constants test (failing)**

Append to `test/constants.test.ts` (merge `BASE_CARRY_SLOTS, BACKPACK_SLOTS, STACK_CAP, NODE_HARDNESS, NODE_TOOL, TOOL_QUALITY, TOOL_CAPABILITY, GATHER_YIELD` into the existing constants import):

```ts
test("constants: M3 carry + gathering levers are filled", () => {
  expect(BASE_CARRY_SLOTS).toBeGreaterThan(0);
  expect(BACKPACK_SLOTS.starter).toBeGreaterThan(BASE_CARRY_SLOTS);
  expect(STACK_CAP).toBeGreaterThan(0);
  expect(NODE_TOOL.mining).toBe("pick"); // bead acceptance hinges on this gate
  expect(NODE_TOOL.herb).toBeNull(); // herbs gather bare-handed
  for (const kind of ["mining", "wood", "herb", "animal"] as const) {
    expect(NODE_HARDNESS[kind]).toBeGreaterThan(0);
    expect(GATHER_YIELD[kind]).toBeGreaterThan(0);
  }
  for (const tool of Object.keys(TOOL_QUALITY)) {
    expect(TOOL_CAPABILITY[tool]).toBeDefined(); // every tool declares its capability
  }
});

test("constants: every biome yields a material for every gatherable node type", () => {
  for (const id of BIOME_IDS) {
    for (const kind of ["mining", "wood", "herb", "animal"] as const) {
      expect(BIOMES[id].materialTable[kind]).toBeTruthy();
    }
  }
});

test("constants: biome materials are distinct so cross-biome recipes have pulls", () => {
  const all = BIOME_IDS.flatMap((id) =>
    (["mining", "wood", "herb", "animal"] as const).map(
      (kind) => BIOMES[id].materialTable[kind],
    ),
  );
  expect(new Set(all).size).toBe(all.length); // 12 unique material defIds
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/constants.test.ts`
Expected: FAIL — `BASE_CARRY_SLOTS` not exported.

- [ ] **Step 3: Fill the levers**

In `src/data/constants.ts`:

Add after the `NODE_TYPES` block:

```ts
// Node types the player can gather (monster nodes resolve via fight, M4).
export type GatherableNodeType = Exclude<NodeType, "monster">;
```

Replace the carry + gathering groups:

```ts
// --- Carry (filled in M3) ---
export const BASE_CARRY_SLOTS = 2; // carry stacks with no backpack equipped
export const BACKPACK_SLOTS: Record<string, number> = {
  starter: 4,
  leather: 6,
}; // TOTAL carry stacks by backpack defId (replaces the base, not added to it)
export const STACK_CAP = 10; // max qty per stack; overflow starts a new stack (new slot)

// --- Gathering (filled in M3) ---
// D21: hardness/tool/yield are per NODE TYPE, never per biome. The biome only
// flavours WHICH material a node yields — stamped at generation (D25).
export const NODE_HARDNESS: Record<GatherableNodeType, number> = {
  mining: 6,
  wood: 4,
  herb: 2,
  animal: 4,
}; // energy cost numerator: cost = hardness ÷ tool quality
export const NODE_TOOL: Record<GatherableNodeType, string | null> = {
  mining: "pick",
  wood: "axe",
  herb: null, // bare hands
  animal: "knife",
}; // required tool CAPABILITY per node type
export const TOOL_CAPABILITY: Record<string, string> = {
  pick: "pick",
  axe: "axe",
  knife: "knife",
}; // tool defId → capability; tiered tools (M5: "iron-pick": "pick") are data-only
export const TOOL_QUALITY: Record<string, number> = {
  pick: 1,
  axe: 1,
  knife: 1,
}; // gather-cost divisor by tool defId
export const GATHER_YIELD: Record<GatherableNodeType, number> = {
  mining: 3,
  wood: 3,
  herb: 2,
  animal: 2,
}; // qty gathered per (one-shot) node
```

Fill each biome's `materialTable` in `BIOMES` (values from the Interfaces block above).

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test`
Expected: all green (nothing consumes these yet; snapshots untouched).

- [ ] **Step 5: Full gate + commit**

Run: `bun test && bun run typecheck && bun run lint`

```bash
git add src/data/constants.ts test/constants.test.ts
git commit -m "M3: fill carry + gathering levers; biome material tables (D25 data)"
```

---

### Task 2: D24 + D25 contract — `Expedition.cleared` and `Poi.material`

**Files:**
- Modify: `src/engine/types.ts`, `src/engine/grid.ts`, `src/engine/reduce.ts` (embark init only)
- Modify: `test/render.test.ts`, `test/reduce-move.test.ts`, `test/reduce-embark.test.ts` (expedition literals/assertions)
- Test: `test/grid.test.ts` (extend)
- Modify: `docs/decisions.md` (D24 + D25 rows)

**Interfaces:**
- Produces:
  - `Expedition.cleared: { x: number; y: number }[]` — POIs consumed this run (gathered nodes now; M4 adds defeated monsters). Initialized `[]` by `embark`.
  - `Poi.material: string | null` — yield defId stamped from `BIOMES[biomeId].materialTable[kind]` at generation; `null` when the table has no entry (monster).

- [ ] **Step 1: Write the failing test (append to `test/grid.test.ts`)**

```ts
test("generateGrid: POIs carry their material stamped from the biome table (D25)", () => {
  for (const biome of BIOME_IDS) {
    const grid = generateGrid(`material-stamp-${biome}`, biome);
    for (const poi of grid.pois) {
      if (poi.kind === "monster") {
        expect(poi.material).toBeNull();
      } else {
        expect(poi.material).toBe(BIOMES[biome].materialTable[poi.kind]!);
      }
    }
  }
});
```

(merge `BIOMES` into the existing constants import in `test/grid.test.ts`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/grid.test.ts`
Expected: FAIL — `poi.material` is `undefined`.

- [ ] **Step 3: Implement the contract changes**

`src/engine/grid.ts` — extend `Poi` and stamp at placement:

```ts
export type Poi = {
  x: number;
  y: number;
  kind: NodeType;
  material: string | null; // yield defId, stamped from the biome at generation (D25) — gather never consults the biome
};
```

In the POI loop, after `kind` is picked:

```ts
    pois.push({ x, y, kind, material: biome.materialTable[kind] ?? null });
```

`src/engine/types.ts` — extend `Expedition` (after `carry`):

```ts
  carry: ItemStack[]; // capped by backpack slots
  cleared: { x: number; y: number }[]; // POIs consumed this run (D24): gathered nodes; M4 adds defeated monsters
```

`src/engine/reduce.ts` — in `embark`'s expedition construction add `cleared: [],` after `carry: [],`.

- [ ] **Step 4: Fix compile sites + strengthen embark test**

`bun run typecheck` flags the expedition literals; add `cleared: [],` after `carry: [],` in:
- `test/render.test.ts` — the `expeditionState` helper.
- `test/reduce-move.test.ts` — the `expeditionState` helper.

In `test/reduce-embark.test.ts`, in the first test add:

```ts
  expect(state.expedition!.cleared).toEqual([]);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test && bun run typecheck`
Expected: all green — **including unchanged render snapshots** (render reads `kind`, not `material`).

- [ ] **Step 6: Record D24 + D25 in `docs/decisions.md`**

Append after the D23 row:

```markdown
| D24 | `Expedition` gains `cleared: {x,y}[]` — POIs consumed this run (2026-07-03): `gather` one-shots a node and records it; M4's `fight` records defeated monsters the same way | Node exhaustion is required (infinite nodes would make routing pointless — park on one node forever) but the grid is regenerated, never stored; the cleared list is the minimal present-state delta between "the map as generated" and "the map as consumed" |
| D25 | POIs carry their yield: `Poi.material` is stamped from `BIOMES[biomeId].materialTable[kind]` **inside `generateGrid`** (2026-07-03); biome material tables filled at M3 (12 distinct materials across 3 biomes) | `gather` needs biome-flavoured yields (cross-biome recipe pulls, M5) without violating D21's "engine never consults the biome after generation" — stamping at generation keeps the biome read inside the generator; gather reads the POI |
```

- [ ] **Step 7: Full gate + commit**

Run: `bun test && bun run typecheck && bun run lint`

```bash
git add src/engine/types.ts src/engine/grid.ts src/engine/reduce.ts test/grid.test.ts test/render.test.ts test/reduce-move.test.ts test/reduce-embark.test.ts docs/decisions.md
git commit -m "M3: D24 cleared-POI list + D25 material stamped on POIs at generation"
```

---

### Task 3: Carry + tool helpers (`src/engine/carry.ts`, `src/engine/tools.ts`)

**Files:**
- Create: `src/engine/carry.ts`, `src/engine/tools.ts`
- Test: `test/carry.test.ts`, `test/tools.test.ts`

**Interfaces:**
- Consumes: `BASE_CARRY_SLOTS`, `BACKPACK_SLOTS`, `STACK_CAP`, `TOOL_CAPABILITY`, `TOOL_QUALITY` from constants; `ItemStack` from types.
- Produces:
  - `slotCap(backpack: string | null): number` — total carry stacks: `BASE_CARRY_SLOTS` when null/unknown, else `BACKPACK_SLOTS[backpack]`.
  - `addToCarry(carry: ItemStack[], defId: string, qty: number, maxStacks: number): ItemStack[] | null` — pure; merges into existing same-defId stacks up to `STACK_CAP`, overflows into new stacks; returns `null` if the result would exceed `maxStacks` (gather is all-or-nothing).
  - `toolQualityFor(tools: string[], capability: string | null): number | null` — `1` for bare-hands capability (`null`); else the best `TOOL_QUALITY` among equipped tools whose `TOOL_CAPABILITY` matches; `null` if none match (missing tool).

- [ ] **Step 1: Write the failing tests**

```ts
// test/carry.test.ts
import { test, expect } from "bun:test";
import { slotCap, addToCarry } from "../src/engine/carry";
import { BASE_CARRY_SLOTS, BACKPACK_SLOTS, STACK_CAP } from "../src/data/constants";

test("slotCap: no backpack gives base slots; backpack defines the cap", () => {
  expect(slotCap(null)).toBe(BASE_CARRY_SLOTS);
  expect(slotCap("starter")).toBe(BACKPACK_SLOTS.starter!);
  expect(slotCap("unknown-pack")).toBe(BASE_CARRY_SLOTS);
});

test("addToCarry: new material starts a stack", () => {
  expect(addToCarry([], "iron-ore", 3, 2)).toEqual([{ defId: "iron-ore", qty: 3 }]);
});

test("addToCarry: merges into an existing stack without a new slot", () => {
  const carry = [{ defId: "iron-ore", qty: 3 }];
  expect(addToCarry(carry, "iron-ore", 3, 1)).toEqual([{ defId: "iron-ore", qty: 6 }]);
  expect(carry).toEqual([{ defId: "iron-ore", qty: 3 }]); // pure — input untouched
});

test("addToCarry: overflow past STACK_CAP starts a new stack", () => {
  const carry = [{ defId: "iron-ore", qty: STACK_CAP - 1 }];
  expect(addToCarry(carry, "iron-ore", 3, 2)).toEqual([
    { defId: "iron-ore", qty: STACK_CAP },
    { defId: "iron-ore", qty: 2 },
  ]);
});

test("addToCarry: rejects when the result needs more than maxStacks", () => {
  expect(addToCarry([{ defId: "oak-log", qty: 2 }], "iron-ore", 3, 1)).toBeNull();
  const full = [{ defId: "iron-ore", qty: STACK_CAP }];
  expect(addToCarry(full, "iron-ore", 1, 1)).toBeNull(); // cap reached, needs slot 2
});

test("addToCarry: zero free stacks still allows a pure merge", () => {
  const carry = [{ defId: "iron-ore", qty: 2 }];
  expect(addToCarry(carry, "iron-ore", 3, 1)).toEqual([{ defId: "iron-ore", qty: 5 }]);
});
```

```ts
// test/tools.test.ts
import { test, expect } from "bun:test";
import { toolQualityFor } from "../src/engine/tools";
import { TOOL_QUALITY } from "../src/data/constants";

test("toolQualityFor: bare-hands capability needs no tool", () => {
  expect(toolQualityFor([], null)).toBe(1);
  expect(toolQualityFor(["pick"], null)).toBe(1);
});

test("toolQualityFor: missing tool gives null", () => {
  expect(toolQualityFor([], "pick")).toBeNull();
  expect(toolQualityFor(["axe", "spyglass"], "pick")).toBeNull();
});

test("toolQualityFor: matching tool returns its quality", () => {
  expect(toolQualityFor(["pick"], "pick")).toBe(TOOL_QUALITY.pick!);
  expect(toolQualityFor(["axe", "pick"], "pick")).toBe(TOOL_QUALITY.pick!);
});

test("toolQualityFor: unknown equipped defIds are ignored", () => {
  expect(toolQualityFor(["spyglass"], "pick")).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/carry.test.ts test/tools.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the implementations**

```ts
// src/engine/carry.ts
// Carry-slot accounting (M3). A slot holds ONE stack; STACK_CAP bounds qty
// per stack. D23: callers count packed food/potion stacks against the cap.
import { BASE_CARRY_SLOTS, BACKPACK_SLOTS, STACK_CAP } from "../data/constants";
import type { ItemStack } from "./types";

// Total carry stacks available. The backpack REPLACES the base (it IS your
// storage), it doesn't add to it.
export function slotCap(backpack: string | null): number {
  if (backpack === null) return BASE_CARRY_SLOTS;
  return BACKPACK_SLOTS[backpack] ?? BASE_CARRY_SLOTS;
}

// Pure: returns the new carry, or null if qty can't FULLY fit within
// maxStacks (gather is all-or-nothing). Merges into existing same-defId
// stacks first, then opens new stacks.
export function addToCarry(
  carry: ItemStack[],
  defId: string,
  qty: number,
  maxStacks: number,
): ItemStack[] | null {
  let remaining = qty;
  const next = carry.map((stack) => {
    if (stack.defId !== defId || stack.qty >= STACK_CAP || remaining === 0) {
      return stack;
    }
    const take = Math.min(STACK_CAP - stack.qty, remaining);
    remaining -= take;
    return { defId, qty: stack.qty + take };
  });
  while (remaining > 0) {
    const take = Math.min(STACK_CAP, remaining);
    next.push({ defId, qty: take });
    remaining -= take;
  }
  return next.length > maxStacks ? null : next;
}
```

```ts
// src/engine/tools.ts
// Tool gating for gathering (M3). NODE_TOOL names a CAPABILITY; equipped
// tool defIds map to capabilities via TOOL_CAPABILITY, so tiered tools
// (M5: "iron-pick") are pure data additions.
import { TOOL_CAPABILITY, TOOL_QUALITY } from "../data/constants";

// Best equipped quality for a capability. null capability = bare hands
// (quality 1). Returns null when no equipped tool provides the capability.
export function toolQualityFor(
  tools: string[],
  capability: string | null,
): number | null {
  if (capability === null) return 1;
  let best: number | null = null;
  for (const defId of tools) {
    if (TOOL_CAPABILITY[defId] !== capability) continue;
    const quality = TOOL_QUALITY[defId] ?? 1;
    if (best === null || quality > best) best = quality;
  }
  return best;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test test/carry.test.ts test/tools.test.ts`
Expected: PASS.

- [ ] **Step 5: Full gate + commit**

Run: `bun test && bun run typecheck && bun run lint`

```bash
git add src/engine/carry.ts src/engine/tools.ts test/carry.test.ts test/tools.test.ts
git commit -m "M3: carry-slot accounting + capability-based tool gating helpers"
```

---

### Task 4: `reduce` case `gather`

**Files:**
- Modify: `src/engine/reduce.ts`, `src/engine/types.ts` (GameEvent variant)
- Test: `test/reduce-gather.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3 plus existing `rejected` helper, `generateGrid`/`rollBiome`.
- Produces `gather` semantics (guard order as listed):
  1. Not on expedition → reject `"not-on-expedition"`.
  2. No POI at `pos`, or `pos` in `cleared` → reject `"no-node"`.
  3. POI kind `monster` or `material === null` → reject `"not-gatherable"`.
  4. `toolQualityFor(tools, NODE_TOOL[kind])` is null → reject `"missing-tool"`.
  5. `cost = NODE_HARDNESS[kind] / quality`; `cost > energy` → reject `"exhausted"`.
  6. `maxStacks = slotCap(backpack) − food.length − potions.length` (D23 ballast); `addToCarry(carry, material, GATHER_YIELD[kind], maxStacks)` null → reject `"carry-full"`.
  7. Success: energy −= cost, carry = new carry, `cleared` += pos. Event:
  - `GameEvent` gains: `{ type: "gathered"; at: {x,y}; kind: NodeType; material: string; qty: number; cost: number; energy: number }` (energy = remaining).

- [ ] **Step 1: Write the failing test**

```ts
// test/reduce-gather.test.ts
import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { generateGrid, rollBiome } from "../src/engine/grid";
import type { Grid, Poi } from "../src/engine/grid";
import {
  NODE_HARDNESS,
  GATHER_YIELD,
  TOOL_QUALITY,
  BASE_CARRY_SLOTS,
} from "../src/data/constants";
import type { NodeType } from "../src/data/constants";
import type { GameState } from "../src/engine/types";

// Deterministically find a map whose rolled biome contains a POI of `kind`.
function mapWith(kind: NodeType): { seed: string; grid: Grid; poi: Poi } {
  for (let i = 0; i < 300; i++) {
    const seed = `m3-scan-${i}`;
    const grid = generateGrid(seed, rollBiome(seed));
    const poi = grid.pois.find((p) => p.kind === kind);
    if (poi) return { seed, grid, poi };
  }
  throw new Error(`no map with a ${kind} POI in scan range`);
}

function standingOn(
  seed: string,
  poi: Poi,
  opts: { tools?: string[]; energy?: number; food?: { defId: string; qty: number }[] } = {},
): GameState {
  const loadout = emptyLoadout();
  loadout.equipment.tools = opts.tools ?? [];
  loadout.food = opts.food ?? [];
  return {
    seed: "g",
    phase: "expedition",
    bank: [],
    loadout: emptyLoadout(),
    expedition: {
      mapSeed: seed,
      pos: { x: poi.x, y: poi.y },
      energy: opts.energy ?? 100,
      hp: 0,
      loadout,
      carry: [],
      cleared: [],
    },
  };
}

test("gather: ore without a pick fails (bead acceptance)", () => {
  const { seed, poi } = mapWith("mining");
  const { state, events } = reduce(standingOn(seed, poi, { tools: [] }), { type: "gather" });
  expect(events).toEqual([
    { type: "action-rejected", action: "gather", reason: "missing-tool" },
  ]);
  expect(state.expedition!.carry).toEqual([]);
});

test("gather: with a pick, yield lands in carry and node clears (bead acceptance)", () => {
  const { seed, poi } = mapWith("mining");
  const before = standingOn(seed, poi, { tools: ["pick"] });
  const { state, events } = reduce(before, { type: "gather" });
  const cost = NODE_HARDNESS.mining / TOOL_QUALITY.pick!;
  expect(state.expedition!.carry).toEqual([
    { defId: poi.material!, qty: GATHER_YIELD.mining },
  ]);
  expect(state.expedition!.energy).toBe(100 - cost);
  expect(state.expedition!.cleared).toEqual([{ x: poi.x, y: poi.y }]);
  expect(events).toEqual([
    {
      type: "gathered",
      at: { x: poi.x, y: poi.y },
      kind: "mining",
      material: poi.material!,
      qty: GATHER_YIELD.mining,
      cost,
      energy: 100 - cost,
    },
  ]);
});

test("gather: a cleared node cannot be gathered again (one-shot, D24)", () => {
  const { seed, poi } = mapWith("mining");
  const first = reduce(standingOn(seed, poi, { tools: ["pick"] }), { type: "gather" }).state;
  const { state, events } = reduce(first, { type: "gather" });
  expect(state).toEqual(first);
  expect(events).toEqual([
    { type: "action-rejected", action: "gather", reason: "no-node" },
  ]);
});

test("gather: herbs come up bare-handed", () => {
  const { seed, poi } = mapWith("herb");
  const { state } = reduce(standingOn(seed, poi, { tools: [] }), { type: "gather" });
  expect(state.expedition!.carry).toEqual([
    { defId: poi.material!, qty: GATHER_YIELD.herb },
  ]);
});

test("gather: monster nodes are not gatherable", () => {
  const { seed, poi } = mapWith("monster");
  const { events } = reduce(standingOn(seed, poi, { tools: ["pick", "axe", "knife"] }), {
    type: "gather",
  });
  expect(events).toEqual([
    { type: "action-rejected", action: "gather", reason: "not-gatherable" },
  ]);
});

test("gather: empty tile has no node", () => {
  const { seed, grid, poi } = mapWith("mining");
  // find a tile with no POI
  let empty: { x: number; y: number } | null = null;
  outer: for (let y = 0; y < grid.terrain.length; y++) {
    for (let x = 0; x < grid.terrain.length; x++) {
      if (!grid.pois.some((p) => p.x === x && p.y === y)) {
        empty = { x, y };
        break outer;
      }
    }
  }
  const state = standingOn(seed, poi, { tools: ["pick"] });
  state.expedition!.pos = empty!;
  const { events } = reduce(state, { type: "gather" });
  expect(events).toEqual([
    { type: "action-rejected", action: "gather", reason: "no-node" },
  ]);
});

test("gather: insufficient energy is rejected before touching carry", () => {
  const { seed, poi } = mapWith("mining");
  const { state, events } = reduce(
    standingOn(seed, poi, { tools: ["pick"], energy: NODE_HARDNESS.mining / TOOL_QUALITY.pick! - 0.5 }),
    { type: "gather" },
  );
  expect(events).toEqual([
    { type: "action-rejected", action: "gather", reason: "exhausted" },
  ]);
  expect(state.expedition!.carry).toEqual([]);
});

test("gather: packed food is slot ballast — full slots reject the gather (D23)", () => {
  const { seed, poi } = mapWith("mining");
  // no backpack → BASE_CARRY_SLOTS; fill them all with food stacks
  const food = Array.from({ length: BASE_CARRY_SLOTS }, (_, i) => ({
    defId: `ration-${i}`,
    qty: 1,
  }));
  const { events } = reduce(standingOn(seed, poi, { tools: ["pick"], food }), {
    type: "gather",
  });
  expect(events).toEqual([
    { type: "action-rejected", action: "gather", reason: "carry-full" },
  ]);
});

test("gather: rejected in town", () => {
  const town: GameState = {
    seed: "g",
    phase: "town",
    bank: [],
    loadout: emptyLoadout(),
    expedition: null,
  };
  const { events } = reduce(town, { type: "gather" });
  expect(events).toEqual([
    { type: "action-rejected", action: "gather", reason: "not-on-expedition" },
  ]);
});

test("gather: deterministic and does not mutate input", () => {
  const { seed, poi } = mapWith("wood");
  const a = standingOn(seed, poi, { tools: ["axe"] });
  const before = structuredClone(a);
  const r1 = reduce(a, { type: "gather" });
  expect(a).toEqual(before);
  expect(r1).toEqual(reduce(standingOn(seed, poi, { tools: ["axe"] }), { type: "gather" }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/reduce-gather.test.ts`
Expected: FAIL — gather is a no-op stub (no events).

- [ ] **Step 3: Implement**

`src/engine/types.ts` — add to the `GameEvent` union (and `NodeType` to the type-only constants import):

```ts
  | {
      type: "gathered";
      at: { x: number; y: number };
      kind: NodeType;
      material: string;
      qty: number;
      cost: number;
      energy: number; // remaining after the gather
    }
```

`src/engine/reduce.ts` — imports: `slotCap, addToCarry` from `"./carry"`; `toolQualityFor` from `"./tools"`; add `NODE_HARDNESS, NODE_TOOL, GATHER_YIELD` (and type `GatherableNodeType`) to the constants import. Change `case "gather":` to `return gather(state);` and add:

```ts
function gather(state: GameState): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) {
    return rejected(state, "gather", "not-on-expedition");
  }
  const { pos } = expedition;
  const grid = generateGrid(expedition.mapSeed, rollBiome(expedition.mapSeed));
  const poi = grid.pois.find((p) => p.x === pos.x && p.y === pos.y);
  const alreadyCleared = expedition.cleared.some(
    (c) => c.x === pos.x && c.y === pos.y,
  );
  if (!poi || alreadyCleared) return rejected(state, "gather", "no-node");
  if (poi.kind === "monster" || poi.material === null) {
    return rejected(state, "gather", "not-gatherable");
  }
  const kind = poi.kind as GatherableNodeType;
  const quality = toolQualityFor(expedition.loadout.equipment.tools, NODE_TOOL[kind]);
  if (quality === null) return rejected(state, "gather", "missing-tool");
  const cost = NODE_HARDNESS[kind] / quality;
  if (cost > expedition.energy) return rejected(state, "gather", "exhausted");
  // D23: packed food/potion stacks are ballast against the same slot cap.
  const maxStacks =
    slotCap(expedition.loadout.equipment.backpack) -
    expedition.loadout.food.length -
    expedition.loadout.potions.length;
  const qty = GATHER_YIELD[kind];
  const carry = addToCarry(expedition.carry, poi.material, qty, maxStacks);
  if (carry === null) return rejected(state, "gather", "carry-full");
  const energy = expedition.energy - cost;
  return {
    state: {
      ...state,
      expedition: {
        ...expedition,
        energy,
        carry,
        cleared: [...expedition.cleared, { x: pos.x, y: pos.y }],
      },
    },
    events: [
      {
        type: "gathered",
        at: { x: pos.x, y: pos.y },
        kind: poi.kind,
        material: poi.material,
        qty,
        cost,
        energy,
      },
    ],
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test`
Expected: all green.

- [ ] **Step 5: Full gate + commit**

Run: `bun test && bun run typecheck && bun run lint`

```bash
git add src/engine/reduce.ts src/engine/types.ts test/reduce-gather.test.ts
git commit -m "M3: gather — tool-gated, hardness÷quality cost, one-shot nodes, D23 ballast"
```

---

### Task 5: `reduce` case `drop`

**Files:**
- Modify: `src/engine/reduce.ts`, `src/engine/types.ts` (GameEvent variant)
- Test: `test/reduce-drop.test.ts`

**Interfaces:**
- Produces `drop` semantics:
  - Not on expedition → reject `"not-on-expedition"`.
  - No carry stack with `defId === itemId` → reject `"not-carried"` (loadout food/potions are NOT droppable — D23 ballast).
  - Success: remove the FIRST matching stack entirely (frees exactly one slot). Event: `{ type: "dropped"; defId: string; qty: number }`.

- [ ] **Step 1: Write the failing test**

```ts
// test/reduce-drop.test.ts
import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import type { GameState, ItemStack } from "../src/engine/types";

function carrying(carry: ItemStack[], food: ItemStack[] = []): GameState {
  const loadout = emptyLoadout();
  loadout.food = food;
  return {
    seed: "g",
    phase: "expedition",
    bank: [],
    loadout: emptyLoadout(),
    expedition: {
      mapSeed: "m3-drop",
      pos: { x: 5, y: 5 },
      energy: 10,
      hp: 0,
      loadout,
      carry,
      cleared: [],
    },
  };
}

test("drop: removes the first matching stack and frees its slot", () => {
  const { state, events } = reduce(
    carrying([
      { defId: "iron-ore", qty: 3 },
      { defId: "oak-log", qty: 2 },
      { defId: "iron-ore", qty: 1 },
    ]),
    { type: "drop", itemId: "iron-ore" },
  );
  expect(state.expedition!.carry).toEqual([
    { defId: "oak-log", qty: 2 },
    { defId: "iron-ore", qty: 1 }, // only the FIRST matching stack dropped
  ]);
  expect(events).toEqual([{ type: "dropped", defId: "iron-ore", qty: 3 }]);
});

test("drop: costs nothing", () => {
  const { state } = reduce(carrying([{ defId: "iron-ore", qty: 3 }]), {
    type: "drop",
    itemId: "iron-ore",
  });
  expect(state.expedition!.energy).toBe(10);
});

test("drop: something not carried is rejected", () => {
  const before = carrying([{ defId: "iron-ore", qty: 3 }]);
  const { state, events } = reduce(before, { type: "drop", itemId: "oak-log" });
  expect(state).toEqual(before);
  expect(events).toEqual([
    { type: "action-rejected", action: "drop", reason: "not-carried" },
  ]);
});

test("drop: packed food is ballast, not droppable (D23)", () => {
  const { events } = reduce(
    carrying([], [{ defId: "bread", qty: 3 }]),
    { type: "drop", itemId: "bread" },
  );
  expect(events).toEqual([
    { type: "action-rejected", action: "drop", reason: "not-carried" },
  ]);
});

test("drop: rejected in town", () => {
  const town: GameState = {
    seed: "g",
    phase: "town",
    bank: [],
    loadout: emptyLoadout(),
    expedition: null,
  };
  const { events } = reduce(town, { type: "drop", itemId: "iron-ore" });
  expect(events).toEqual([
    { type: "action-rejected", action: "drop", reason: "not-on-expedition" },
  ]);
});

test("drop: does not mutate the input state", () => {
  const input = carrying([{ defId: "iron-ore", qty: 3 }]);
  const before = structuredClone(input);
  reduce(input, { type: "drop", itemId: "iron-ore" });
  expect(input).toEqual(before);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/reduce-drop.test.ts`
Expected: FAIL — drop is a no-op stub.

- [ ] **Step 3: Implement**

`src/engine/types.ts` — add to the `GameEvent` union:

```ts
  | { type: "dropped"; defId: string; qty: number }
```

`src/engine/reduce.ts` — change `case "drop":` to `return drop(state, action.itemId);` and add:

```ts
function drop(
  state: GameState,
  itemId: string,
): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) {
    return rejected(state, "drop", "not-on-expedition");
  }
  // Only carry is droppable — packed food/potions are slot ballast (D23).
  const index = expedition.carry.findIndex((stack) => stack.defId === itemId);
  if (index === -1) return rejected(state, "drop", "not-carried");
  const dropped = expedition.carry[index]!;
  const carry = expedition.carry.filter((_, i) => i !== index);
  return {
    state: { ...state, expedition: { ...expedition, carry } },
    events: [{ type: "dropped", defId: dropped.defId, qty: dropped.qty }],
  };
}
```

Also update the reducer's header comment: remaining stubs are `scout/fight → M4; craft/pack/return → M5`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test`
Expected: all green.

- [ ] **Step 5: Full gate + commit**

Run: `bun test && bun run typecheck && bun run lint`

```bash
git add src/engine/reduce.ts src/engine/types.ts test/reduce-drop.test.ts
git commit -m "M3: drop — frees one carry slot; food ballast stays (D23)"
```

---

### Task 6: Acceptance check, docs, gates

**Files:**
- Modify: `docs/balance-levers.md` (carry + gathering groups)
- No code changes expected.

- [ ] **Step 1: Verify the bead's acceptance criteria**

1. *Gathering ore without a pick fails* — `bun test test/reduce-gather.test.ts` → the missing-tool test PASSES.
2. *Carry respects the slot cap* — carry-full test (D23 ballast) + `test/carry.test.ts` maxStacks tests PASS.
3. *Yields land in carry* — the with-a-pick test asserts material + qty in carry.
4. D21 spot-check: `grep -n "BIOMES\|biome" src/engine/reduce.ts src/engine/carry.ts src/engine/tools.ts` → no biome consultation outside `generateGrid` (rollBiome/generateGrid calls only). Capture output.

- [ ] **Step 2: Update `docs/balance-levers.md`**

Replace the **Carry** and **Gathering** groups:

```markdown
**Carry** — loot vs supplies tension
- `BASE_CARRY_SLOTS` — carry stacks with no backpack · `BACKPACK_SLOTS{tier}` — total stacks per backpack (replaces the base) · `STACK_CAP` — max qty per stack
- D23: packed food/potion stacks count against the same cap (ballast) — every ration packed is a loot slot spent

**Gathering**
- `NODE_HARDNESS{nodeType}` — energy cost numerator · `TOOL_QUALITY{toolDefId}` — cost divisor · `GATHER_YIELD{nodeType}` — qty per (one-shot) node
- `NODE_TOOL{nodeType}` — required capability (herb = bare hands) · `TOOL_CAPABILITY{toolDefId}` — tiered tools are data-only (D21: all per node type, never per biome)
- Yield defIds come from `BIOMES{id}.materialTable`, stamped onto POIs at generation (D25) — 12 distinct materials across 3 biomes feed one shared recipe tree (M5)
```

- [ ] **Step 3: Full gates**

Run: `bun test && bun run typecheck && bun run lint`
Expected: all green; render snapshots unchanged all milestone.

- [ ] **Step 4: Commit**

```bash
git add docs/balance-levers.md
git commit -m "M3: document carry + gathering levers"
```

(The controller closes the bead after the final whole-branch review.)

---

## Self-Review

- **Spec coverage:** gather requires the right tool ✓ (T1 NODE_TOOL, T3 toolQualityFor, T4) · cost = hardness ÷ quality ✓ (T4) · fills carry ✓ (T3/T4) · backpack slot cap ✓ (T1/T3) · drop frees a slot ✓ (T5) · levers BACKPACK_SLOTS/STACK_CAP/NODE_HARDNESS/TOOL_QUALITY/GATHER_YIELD filled ✓ (T1) · node types feed biome materialTables, one shared material pool for M5 recipes ✓ (T1/T2) · hardness/yield/tool-gating per node type never per biome ✓ (lever shapes + T6 grep).
- **Placeholder scan:** none — every step carries code or exact commands.
- **Type consistency:** `GatherableNodeType` defined in constants (T1), used in reduce (T4); `Poi.material: string | null` (T2) consumed in T4; `cleared` shape `{x,y}[]` consistent across types/embark/tests; `addToCarry(carry, defId, qty, maxStacks)` signature identical in T3 definition and T4 usage; event variants `gathered`/`dropped` match between types.ts additions and test assertions.
- **Noted judgment calls:** gather is all-or-nothing (no partial fills — reject `carry-full`); nodes are one-shot (D24 — infinite nodes would kill routing); backpack REPLACES base slots; guard order puts `exhausted` before `carry-full`; drop removes the first matching stack only; monster POIs stay untouched for M4 (`fight` will consume them via the same `cleared` list); stepping onto a monster tile is legal and costless beyond terrain (M4 decides encounter rules).
