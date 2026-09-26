# Graded Movement Economy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace binary gated movement with a graded model — finer ×10 terrain scale, subtractive gear discounts, terrain-conditional transport — with mountains the one hard gate and the energy economy recalibrated ×10.

**Architecture:** All the movement/energy tunables live in `src/data/constants.ts`; `src/engine/move.ts`'s `moveCost` gains a subtract-then-floor formula with per-terrain transport. Mountains stay `Infinity` (climbing-pick *enables*), so `reach.ts`/b91/entry-selection are untouched — only finite magnitudes scale.

**Tech Stack:** TypeScript, bun (`bun test`), ESLint flat config (engine-purity boundary).

## Global Constraints

- Engine is pure: `reduce(state, action) → {state, events}`, no DOM/`Math.random`/`Date.now`, no `render`/`sim`/`web` imports under `src/engine/**`.
- No magic numbers in engine logic — every tunable is a named lever in `src/data/constants.ts`.
- Mountains stay `Infinity` unless a tool *enables* them — b91/`reach.ts` must remain behaviorally unchanged (only cost magnitudes scale).
- Energy recalibration is ×10 across ALL energy-denominated levers so ratios are preserved.
- Gates every task: `bun test` + `bun run typecheck` + `bun run lint` green before commit.

---

### Task 1: Core lever rework + graded `moveCost` + `move.test`

**Files:**
- Modify: `src/data/constants.ts` (`TERRAIN_COST`, remove `MOVE_BASE_COST`, add `MIN_STEP`, reshape `TERRAIN_GATE` + `TRANSPORT_MULTIPLIER`, ×10 energy levers)
- Modify: `src/engine/move.ts` (new `moveCost` formula)
- Test: `test/move.test.ts` (rewrite)

**Interfaces:**
- Produces: `moveCost(terrain, transport, tools?)` — same signature; subtract-then-floor, per-terrain transport.
- Produces levers: `TERRAIN_COST: Record<Terrain, number>` (absolute step energy), `MIN_STEP: number`, `TERRAIN_GATE: Partial<Record<Terrain, Record<string, { enable?: number; discount?: number }>>>`, `TRANSPORT_MULTIPLIER: Record<string, Partial<Record<Terrain, number>>>`.

- [ ] **Step 1: Rewrite `test/move.test.ts`** for the graded model:

```ts
// test/move.test.ts
import { test, expect } from "bun:test";
import { stepToward, moveCost } from "../src/engine/move";
import { TERRAIN_COST, MIN_STEP } from "../src/data/constants";

test("stepToward: steps one tile on each axis toward the target (8-dir)", () => {
  expect(stepToward({ x: 5, y: 5 }, { x: 8, y: 8 })).toEqual({ x: 6, y: 6 });
  expect(stepToward({ x: 5, y: 5 }, { x: 5, y: 0 })).toEqual({ x: 5, y: 4 });
  expect(stepToward({ x: 5, y: 5 }, { x: 2, y: 5 })).toEqual({ x: 4, y: 5 });
});

test("stepToward: already at target means no step", () => {
  expect(stepToward({ x: 3, y: 3 }, { x: 3, y: 3 })).toEqual({ x: 3, y: 3 });
});

test("moveCost: on foot equals the terrain's absolute step energy", () => {
  expect(moveCost("plains", null)).toBe(TERRAIN_COST.plains); // 10
  expect(moveCost("mud", null)).toBe(TERRAIN_COST.mud); // 15
  expect(moveCost("river", null)).toBe(TERRAIN_COST.river); // 30
});

test("moveCost: ice costs more than plains", () => {
  expect(moveCost("ice", null)).toBeGreaterThan(moveCost("plains", null));
});

test("moveCost: mountain is impassable without a tool, regardless of transport", () => {
  expect(moveCost("mountain", null)).toBe(Infinity);
  expect(moveCost("mountain", "horse")).toBe(Infinity);
});

test("moveCost: climbing-pick ENABLES mountain (Infinity → finite enable value)", () => {
  expect(moveCost("mountain", null, ["climbing-pick"])).toBe(40);
});

test("moveCost: raft discounts river (subtractive)", () => {
  expect(moveCost("river", null, ["raft"])).toBe(30 - 20); // 10
});

test("moveCost: waders discount mud", () => {
  expect(moveCost("mud", null, ["waders"])).toBe(15 - 5); // 10
});

test("moveCost: ice-cleats make ice faster than plains (glide, floored at MIN_STEP)", () => {
  const iced = moveCost("ice", null, ["ice-cleats"]); // 20 - 15 = 5
  expect(iced).toBe(Math.max(MIN_STEP, 5));
  expect(iced).toBeLessThan(moveCost("plains", null)); // faster than plains
});

test("moveCost: a discount never drops a step below MIN_STEP", () => {
  // ice-cleats overshoot on a cheaper terrain still floors at MIN_STEP
  expect(moveCost("ice", null, ["ice-cleats", "ice-cleats"])).toBe(MIN_STEP);
});

test("moveCost: an irrelevant tool is a no-op", () => {
  expect(moveCost("plains", null, ["raft", "climbing-pick"])).toBe(moveCost("plains", null));
});

test("moveCost: transport is per-terrain — horse is fast on plains, no help on river", () => {
  expect(moveCost("plains", "horse")).toBe(TERRAIN_COST.plains / 2); // horse plains ÷2
  expect(moveCost("river", "horse")).toBe(TERRAIN_COST.river); // no help on river (÷1)
});

test("moveCost: wagon answers ice (÷2 on ice)", () => {
  expect(moveCost("ice", "wagon")).toBe(TERRAIN_COST.ice / 2);
});

test("moveCost: unknown transport behaves as on foot", () => {
  expect(moveCost("plains", "rocket-skates")).toBe(moveCost("plains", null));
});

test("moveCost: gate + transport compose (enable then divide)", () => {
  expect(moveCost("mountain", "horse", ["climbing-pick"])).toBe(40); // horse ÷1 on mountain
});
```

- [ ] **Step 2: Run, verify fail.** Run: `bun test test/move.test.ts`. Expected: FAIL (old scale / old formula).

- [ ] **Step 3: Update the levers in `src/data/constants.ts`.**

Replace the `MOVE_BASE_COST` + `TERRAIN_COST` + `TRANSPORT_MULTIPLIER` block (lines ~100-112) with:

```ts
// Movement is GRADED (svz, 2026-07-06): TERRAIN_COST is ABSOLUTE step energy on a
// ×10 scale, gear subtracts point-discounts (TERRAIN_GATE), transport divides
// per-terrain. Mountains stay the one hard gate (Infinity) until a tool ENABLES them.
export const MIN_STEP = 5; // a discounted step never costs less than this
export const TERRAIN_COST: Record<Terrain, number> = {
  plains: 10,
  mud: 15,
  ice: 20,
  river: 30,
  mountain: Infinity, // impassable — climbing-pick enables it (TERRAIN_GATE)
}; // absolute energy per tile stepped ONTO, on foot, before gear/transport
export const TRANSPORT_MULTIPLIER: Record<string, Partial<Record<Terrain, number>>> = {
  horse: { plains: 2, mud: 1.2 }, // open-ground speed; ice/river/mountain default ÷1
  wagon: { ice: 2, plains: 1.5, mud: 1.2 }, // the ice answer + general hauler
  mule: { plains: 0.8, mud: 0.8, ice: 0.8, river: 0.8 }, // slow, but the big carrier (carry role unchanged)
}; // per-terrain move-cost divisor by transport defId; absent terrain / on-foot = ÷1
```

Replace the `TERRAIN_GATE` block (added in `boo`) with the enable/discount shape:

```ts
// Equipped tools that modify gated terrain (svz). `enable` makes an impassable
// terrain finite (mountain only); `discount` subtracts from the step energy. Each
// tool costs a tool slot, so bringing it is a real loadout tradeoff.
export const TERRAIN_GATE: Partial<Record<Terrain, Record<string, { enable?: number; discount?: number }>>> = {
  mountain: { "climbing-pick": { enable: 40 } }, // ∞ → 40 (crossable at 4× plains)
  river: { raft: { discount: 20 } }, // 30 → 10 (≈ plains)
  mud: { waders: { discount: 5 } }, // 15 → 10
  ice: { "ice-cleats": { discount: 15 } }, // 20 → 5 (faster than plains — a tundra highway)
};
```

Recalibrate the energy levers ×10 (in their existing spots):
- `ENERGY_PER_FOOD` 8 → `80`
- `FOOD_ENERGY` → `{ ration: 80, "trail-ration": 160 }`
- `BASE_ENERGY_FLOOR` 20 → `200`
- `NODE_HARDNESS` → `{ mining: 60, wood: 40, herb: 20, animal: 40 }`

(Update the trailing comments that cite old numbers, e.g. the `ENERGY_PER_FOOD`/`BASE_ENERGY_FLOOR` notes — keep them accurate: "~5 actions" is now ~200÷40.)

- [ ] **Step 4: Rewrite `moveCost` in `src/engine/move.ts`:**

```ts
// Movement math. GRADED model (svz): absolute terrain step-energy, minus any gear
// discounts (or an enable that turns Infinity finite), floored at MIN_STEP, then
// divided by the transport's per-terrain multiplier. Infinity = impassable.
import {
  TERRAIN_COST,
  TERRAIN_GATE,
  TRANSPORT_MULTIPLIER,
  MIN_STEP,
} from "../data/constants";
import type { Terrain } from "../data/constants";

export type Coord = { x: number; y: number };

export function stepToward(from: Coord, to: Coord): Coord {
  return {
    x: from.x + Math.sign(to.x - from.x),
    y: from.y + Math.sign(to.y - from.y),
  };
}

export function moveCost(
  terrain: Terrain,
  transport: string | null,
  tools: string[] = [],
): number {
  let step = TERRAIN_COST[terrain];
  const mods = TERRAIN_GATE[terrain];
  if (mods) {
    for (const tool of tools) {
      const m = mods[tool];
      if (!m) continue;
      if (m.enable !== undefined && !Number.isFinite(step)) step = m.enable;
      if (m.discount) step -= m.discount;
    }
  }
  step = Number.isFinite(step) ? Math.max(MIN_STEP, step) : Infinity;
  const divisor =
    transport === null ? 1 : (TRANSPORT_MULTIPLIER[transport]?.[terrain] ?? 1);
  return step / divisor;
}
```

- [ ] **Step 5: Run, verify pass.** Run: `bun test test/move.test.ts`. Expected: all PASS.

- [ ] **Step 6: Commit.**

```bash
git add src/data/constants.ts src/engine/move.ts test/move.test.ts
git commit -m "svz: graded moveCost — absolute ×10 scale, subtractive gear, per-terrain transport"
```

---

### Task 2: Craftable `waders` + `ice-cleats`

**Files:**
- Modify: `src/data/constants.ts` (`TOOL_CAPABILITY`, `TOOL_QUALITY`, `RECIPE`)
- Test: `test/catalog.test.ts`

**Interfaces:**
- Produces: `slotOf("waders") === "tool"`, `slotOf("ice-cleats") === "tool"`, both craftable.

- [ ] **Step 1: Write the failing test.** Append to `test/catalog.test.ts`:

```ts
test("slotOf: graded-movement gear classifies as tools", () => {
  expect(slotOf("waders")).toBe("tool");
  expect(slotOf("ice-cleats")).toBe("tool");
});
```

- [ ] **Step 2: Run, verify fail.** Run: `bun test test/catalog.test.ts`. Expected: FAIL (unknown defIds).

- [ ] **Step 3: Implement.** In `src/data/constants.ts`:

`TOOL_CAPABILITY` (after `raft`):
```ts
  waders: "wade", // graded-movement gear (svz); NODE_TOOL never asks for it
  "ice-cleats": "trek",
```
`TOOL_QUALITY` (after `raft`):
```ts
  waders: 1,
  "ice-cleats": 1,
```
`RECIPE` (near the other gating tools):
```ts
  waders: { inputs: [{ defId: "deer-hide", qty: 2 }, { defId: "pine-log", qty: 1 }], output: { defId: "waders", qty: 1 } }, // cheapens mud
  "ice-cleats": { inputs: [{ defId: "iron-ore", qty: 1 }, { defId: "wolf-pelt", qty: 1 }], output: { defId: "ice-cleats", qty: 1 } }, // glide on ice
```

- [ ] **Step 4: Run, verify pass.** Run: `bun test test/catalog.test.ts test/constants.test.ts`. Expected: PASS (capability+quality invariant satisfied).

- [ ] **Step 5: Commit.**

```bash
git add src/data/constants.ts test/catalog.test.ts
git commit -m "svz: waders + ice-cleats catalog entries & recipes"
```

---

### Task 3: Reconcile the rest of the suite to the ×10 scale

**Files:**
- Modify: `test/reduce-move.test.ts` (energy literals, mountain cost)
- Modify: `test/consumable-transport-tiers.test.ts` (food-energy numbers)
- Modify: `test/constants.test.ts` (drop `MOVE_BASE_COST`, fix per-terrain transport assert)

**Interfaces:** consumes the Task-1 levers.

- [ ] **Step 1: Update `test/reduce-move.test.ts`.** The starter energy `10` no longer affords ×10 steps. Bump the ample-energy movement cases to `200` and their `10 -` expressions to `200 -`:
  - Line ~59-63 ("steps one tile onto the target terrain"): `expeditionState(seed, from, 10)` → `...200)`; `10 - cost` (both occurrences) → `200 - cost`.
  - Line ~88-89 (transport lowers cost): both `expeditionState(..., 10, ...)` → `..., 200, ...`; the `10 -` comparison expressions (lines ~90-92) → `200 -`.
  - Line ~99-106 (ice > plains): the two `expeditionState(..., 10)` → `..., 200)` and the two `10 -` → `200 -`.
  - Line ~116 (biome-invariance): `expeditionState(seed, from, 10)` → `..., 200)` and `10 - ` → `200 - `.
  - Line ~122-131 (impassable rejected costs nothing): `expeditionState(seed, from, 10)` → `..., 200)`; `expect(...energy).toBe(10)` → `.toBe(200)`.
  - Line ~140-152 (climbing-pick mountain): both `expeditionState(seed, from, 10)` → `..., 200)`; the expected event `cost: 4, energy: 6` → `cost: 40, energy: 160` (200 − 40).
  - Line ~178, ~190, ~217 (no-step / out-of-bounds / no-mutate): these don't spend; leaving `10` is harmless, but bump to `200` for consistency.
  - Leave the edge cases as-is: energy `0` (exhausted, ~159), energy `1` (insufficient for mud 15, ~170 — still insufficient, still rejects "exhausted"), and the exact-cost case (~228, energy `cost` is lever-derived → auto-scales, lands on 0).

- [ ] **Step 2: Update `test/consumable-transport-tiers.test.ts`.** Food energy scaled ×10:
  - `expect(withRation.expedition!.energy).toBe(24)` → `.toBe(240)` (3 × 80); update the `// 3 × 8` comment to `// 3 × 80`.
  - `expect(withTrail.expedition!.energy).toBe(48)` → `.toBe(480)` (3 × 160); update the comment.
  - Update the `BASE_ENERGY_FLOOR (20)` comment to `(200)`.

- [ ] **Step 3: Update `test/constants.test.ts`.**
  - Remove the `MOVE_BASE_COST` import (line ~15) and its assertion `expect(MOVE_BASE_COST).toBeGreaterThan(0);` (line ~85).
  - Fix the transport assertion (line ~88): `expect(TRANSPORT_MULTIPLIER.horse).toBeGreaterThan(1);` → `expect(TRANSPORT_MULTIPLIER.horse.plains!).toBeGreaterThan(1);` (horse is fast on plains).

- [ ] **Step 4: Run the full suite.** Run: `bun test`. Expected: green. Fix any remaining hardcoded move/energy numbers the same way (search: `bun test 2>&1 | grep fail`).

- [ ] **Step 5: Re-verify the economy + b91 explicitly.** Run: `bun test test/harness-sustainability.test.ts test/reach.test.ts test/grid.test.ts`. Expected: all PASS (ratios preserved; mountain still `Infinity` so reach/topology invariants hold). If sustainability regresses, the ×10 rescale is inconsistent — audit that every energy lever (floor, food, hardness) scaled — do NOT land red.

- [ ] **Step 6: Full gates.** Run: `bun test && bun run typecheck && bun run lint`. Expected: green.

- [ ] **Step 7: Commit.**

```bash
git add test/reduce-move.test.ts test/consumable-transport-tiers.test.ts test/constants.test.ts
git commit -m "svz: reconcile test suite to the ×10 graded scale"
```

---

### Task 4: Docs + bead + push

**Files:**
- Modify: `docs/decisions.md`, `docs/balance-levers.md`

- [ ] **Step 1: Record the decision.** In `docs/decisions.md`, add a new `Dnn` (next number) row: graded movement economy — absolute ×10 `TERRAIN_COST`, subtractive `TERRAIN_GATE` (enable/discount), per-terrain `TRANSPORT_MULTIPLIER`, `MIN_STEP` floor, mountain the one hard gate; energy levers ×10 to preserve ratios. Note it supersedes the flat-scale / min-replace movement model (updates the D-entries that described `TERRAIN_GATE` from `boo`).

- [ ] **Step 2: Document the levers.** In `docs/balance-levers.md`, update the movement section: `TERRAIN_COST` (absolute), `MIN_STEP`, `TERRAIN_GATE` (enable/discount), `TRANSPORT_MULTIPLIER` (per-terrain); remove `MOVE_BASE_COST`; note the ×10 energy scale.

- [ ] **Step 3: Commit, close bead, push (active git/sync policy).**

```bash
git add docs/decisions.md docs/balance-levers.md
git commit -m "svz: decisions + balance-levers for the graded movement economy"
bd close idle-adventure-svz --reason="Graded movement economy shipped: ×10 absolute terrain scale, subtractive gear discounts (raft/waders/ice-cleats), climbing-pick enable, per-terrain transport, energy recalibrated ×10 (sustainability green). Plan: 2026-07-06-graded-movement-economy.md"
git push
bd dolt push
```

---

## Self-Review

**Spec coverage:**
- §3 scale + subtract-then-floor formula + `MIN_STEP` + mountain-Infinity preserved → Task 1. ✓
- §4 gear modifiers (climbing-pick enable, raft/waders/ice-cleats discounts) → Task 1 (TERRAIN_GATE) + Task 2 (craftable waders/ice-cleats). ✓
- §5 terrain-conditional transport → Task 1. ✓
- §6 energy recalibration ×10 → Task 1 (levers) + Task 3 (test reconcile + sustainability re-verify). ✓
- §7 testing (move.test rewrite, catalog, lever-relative reconcile, b91 + sustainability, docs) → Tasks 1-4. ✓

**Placeholder scan:** No TBD/TODO; all edits carry concrete numbers and code. Recipe materials are concrete.

**Type consistency:** `moveCost(terrain, transport, tools?)` identical across Task 1 + the reduce-move updates (Task 3). `TERRAIN_GATE` enable/discount shape used in Task 1's formula + move.test. `TRANSPORT_MULTIPLIER` per-terrain shape used in move.ts + move.test + the constants.test fix (Task 3). `TERRAIN_COST` absolute values referenced consistently (plains 10, mud 15, ice 20, river 30). ✓
