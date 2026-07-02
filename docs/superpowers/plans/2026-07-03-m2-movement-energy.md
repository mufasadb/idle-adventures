# M2 — Player, Movement, Energy Budget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Bead:** `idle-adventure-868.3` (M2). Design sources: `docs/superpowers/specs/2026-06-30-idle-adventure-poc-core-loop-design.md` §3/§10, plan doc M2 section, D21 guardrail note on the bead, D22 (new, recorded in Task 2). Also folds in two M2-scoped follow-ups from bead `idle-adventure-8eh` (M1 final review).

**Goal:** `embark` moves the town loadout onto a fresh expedition with energy derived from packed food; `move` steps one tile (8-dir) toward a target, paying `MOVE_BASE_COST × TERRAIN_COST[terrain] ÷ TRANSPORT_MULTIPLIER[transport]`, rejecting impassable tiles and moves the energy budget can't cover.

**Architecture:** Two new pure engine modules — `src/engine/loadout.ts` (`emptyLoadout()` factory) and `src/engine/move.ts` (`stepToward`, `moveCost`) — plus the first real `reduce` cases (`embark`, `move`). The grid is regenerated inside `reduce` from `mapSeed` via `rollBiome` (D14/D21); the **cost path reads only terrain and transport — never the biome** (`moveCost(terrain, transport)` takes nothing else by signature). `GameState` gains a town-side `loadout` staging slot (D22). Rejected actions return state unchanged plus an `action-rejected` event — the reducer never throws on legal-shaped but currently-invalid actions (M6's `legalActions` will mirror these guards).

**Tech Stack:** TypeScript · bun (`bun test`) · no new dependencies.

## Global Constraints

- Engine purity (lint-enforced): no DOM, no `Math.random`/`Date.now`, no imports from `render`/`sim`/`web` under `src/engine/**`.
- No magic numbers in engine logic — every tunable read from `src/data/constants.ts`.
- **D21 guardrail (verbatim from the bead): move cost is terrain×transport ONLY — no biome lookups anywhere in the cost path.** Biome-transport advantages must emerge purely from each biome's terrain mix.
- Grid regenerated from `mapSeed` (never stored); biome re-derived via `rollBiome(mapSeed)`; `Action` stays `{type:'embark', mapSeed}` (M6 contract).
- `GameState` holds only the present (D14). D22: the town `loadout` staging slot is current state, not history.
- Items stay `{defId, qty}`; no catalog needed yet (energy is per food *item*, transport multiplier keyed by defId).
- `reduce` returns `{state, events}` and never mutates its input; unhandled cases stay no-ops.
- Gates before closing the bead: `bun test` · `bun run typecheck` · `bun run lint`.
- Commit-as-you-go in small commits (established M0/M1 authority).

## File Structure

- Modify `src/data/constants.ts` — fill the energy-economy levers (values only; shapes exist since M0); Task 6 also nudges `BIOMES.desert.terrainWeights`.
- Modify `src/engine/types.ts` — `GameState` gains `loadout: Loadout` (D22).
- Create `src/engine/loadout.ts` — `emptyLoadout()`.
- Create `src/engine/move.ts` — `stepToward`, `moveCost`. One responsibility: movement math.
- Modify `src/engine/reduce.ts` — real `embark` and `move` cases.
- Modify `src/engine/grid.ts` — Task 6 only: exclude the entry tile from POI candidacy.
- Modify `docs/decisions.md` (D22 row), `docs/balance-levers.md` (Task 7).
- Tests: `test/move.test.ts` (new), `test/reduce-embark.test.ts` (new), `test/reduce-move.test.ts` (new); update `test/types.test.ts`, `test/engine.test.ts`, `test/render.test.ts`, `test/constants.test.ts`, `test/grid.test.ts`.

---

### Task 1: Fill the energy-economy levers

**Files:**
- Modify: `src/data/constants.ts` (energy group, currently lines ~33–43)
- Test: `test/constants.test.ts` (extend)

**Interfaces:**
- Consumes: nothing.
- Produces (used by Tasks 3–5):
  - `ENERGY_PER_FOOD = 10` — energy granted per packed food item (qty 1).
  - `MOVE_BASE_COST = 1` — energy per tile on neutral ground, on foot.
  - `TERRAIN_COST: Record<Terrain, number> = { plains: 1, mud: 1.5, ice: 2, river: 3, mountain: Infinity }` — cost multiplier; `Infinity` = impassable (no gating gear exists yet; gear-gated cheapening arrives with the item catalog).
  - `TRANSPORT_MULTIPLIER: Record<string, number> = { horse: 1.5, mule: 0.8 }` — move-cost **divisor** per spec §10 (`base × terrain ÷ transport`): >1 = faster than foot, <1 = slower (mule pays for future carry bonus). Unknown/absent transport = 1 (on foot).

- [ ] **Step 1: Extend the constants test (failing)**

Append to `test/constants.test.ts` (merge `ENERGY_PER_FOOD, MOVE_BASE_COST, TRANSPORT_MULTIPLIER` into the existing import from `../src/data/constants`):

```ts
test("constants: M2 energy levers are filled", () => {
  expect(ENERGY_PER_FOOD).toBeGreaterThan(0);
  expect(MOVE_BASE_COST).toBeGreaterThan(0);
  expect(TERRAIN_COST.ice).toBeGreaterThan(TERRAIN_COST.plains); // bead acceptance: ice > plains
  expect(Number.isFinite(TERRAIN_COST.mountain)).toBe(false); // impassable without gear
  expect(TRANSPORT_MULTIPLIER.horse).toBeGreaterThan(1); // horse cheapens movement (divisor)
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/constants.test.ts`
Expected: FAIL — `ENERGY_PER_FOOD` is 0.

- [ ] **Step 3: Fill the levers**

In `src/data/constants.ts`, replace the energy-economy group:

```ts
// --- Energy economy (filled in M2) ---
export const ENERGY_PER_FOOD = 10; // energy per packed food item
export const MOVE_BASE_COST = 1; // energy per tile on neutral ground, on foot
export const TERRAIN_COST: Record<Terrain, number> = {
  plains: 1,
  mud: 1.5,
  ice: 2,
  river: 3, // fordable but expensive
  mountain: Infinity, // impassable (gating gear may cheapen this later)
}; // cost multiplier per terrain stepped ONTO
export const TRANSPORT_MULTIPLIER: Record<string, number> = {
  horse: 1.5, // fast — divides move cost (spec §10: base × terrain ÷ transport)
  mule: 0.8, // slow — will pay for it in carry capacity (M3/M5)
}; // keyed by transport defId; absent/on-foot = 1
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test`
Expected: PASS across the whole suite (nothing consumed these values before).

- [ ] **Step 5: Full gate + commit**

Run: `bun test && bun run typecheck && bun run lint`
Expected: all green.

```bash
git add src/data/constants.ts test/constants.test.ts
git commit -m "M2: fill energy-economy levers (terrain costs, transport divisors)"
```

---

### Task 2: D22 — town-side loadout staging slot

**Files:**
- Modify: `src/engine/types.ts` (GameState)
- Create: `src/engine/loadout.ts`
- Modify: `test/types.test.ts`, `test/engine.test.ts`, `test/render.test.ts` (their `GameState` literals gain the new required field)
- Modify: `docs/decisions.md` (append D22)

**Interfaces:**
- Consumes: `Loadout` type (exists since M0).
- Produces:
  - `GameState.loadout: Loadout` — the loadout being assembled in town; `pack` (M5) edits it, `embark` (Task 4) consumes it.
  - `emptyLoadout(): Loadout` — fresh all-null/empty loadout (a factory, not a shared constant, so callers can't alias state).

- [ ] **Step 1: Write the failing test**

In `test/types.test.ts`, replace the existing test with:

```ts
import { test, expect } from "bun:test";
import type { GameState, Action } from "../src/engine/types";
import { emptyLoadout } from "../src/engine/loadout";

test("types: a minimal GameState and Action are constructible", () => {
  const state: GameState = {
    seed: "s",
    phase: "town",
    bank: [],
    loadout: emptyLoadout(),
    expedition: null,
  };
  const action: Action = { type: "return" };
  expect(state.phase).toBe("town");
  expect(action.type).toBe("return");
});

test("emptyLoadout: returns a fresh object each call (no shared aliasing)", () => {
  const a = emptyLoadout();
  const b = emptyLoadout();
  expect(a).toEqual(b);
  expect(a).not.toBe(b);
  expect(a.equipment).not.toBe(b.equipment);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/types.test.ts`
Expected: FAIL — `Cannot find module '../src/engine/loadout'`.

- [ ] **Step 3: Implement**

Create `src/engine/loadout.ts`:

```ts
import type { Loadout } from "./types";

// Fresh empty loadout. A factory (not a shared constant) so no two states
// ever alias the same loadout object.
export function emptyLoadout(): Loadout {
  return {
    equipment: {
      weapon: null,
      helmet: null,
      chest: null,
      legs: null,
      boots: null,
      gloves: null,
      tools: [],
      transport: null,
      backpack: null,
    },
    food: [],
    potions: [],
  };
}
```

In `src/engine/types.ts`, add the field to `GameState` (after `bank`):

```ts
export type GameState = {
  seed: string;
  phase: "town" | "expedition";
  bank: ItemStack[]; // materials + crafted gear (persists across runs)
  loadout: Loadout; // town-side staging (D22): pack (M5) edits it, embark consumes it
  expedition: Expedition | null;
};
```

- [ ] **Step 4: Fix the now-failing compile sites in tests**

`bun run typecheck` will fail on three test files' `GameState` literals. In each, add `loadout: emptyLoadout(),` after `bank: [],` and add the import `import { emptyLoadout } from "../src/engine/loadout";`:

- `test/engine.test.ts` — two literals (`baseState` and `input`).
- `test/render.test.ts` — the `expeditionState` helper's literal and the town-state literal inside the `"(town)"` test.

(`test/types.test.ts` was already updated in Step 1.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test && bun run typecheck`
Expected: all green (snapshots unaffected — render output doesn't include the loadout).

- [ ] **Step 6: Record D22 in `docs/decisions.md`**

Append this row to the "POC contract" table (after the D21 row):

```markdown
| D22 | `GameState` gains a town-side `loadout: Loadout` staging slot (2026-07-03): `pack` (M5) edits it, `embark` (M2) consumes it into the expedition (deriving energy from its food) and leaves town with a fresh empty one | `embark` needs packed food before `pack` exists as an action, and the contract previously had no home for a loadout being assembled in town. Still "present only" (D14) — the draft loadout is current state, not history |
```

Note: `docs/decisions.md` has pre-existing uncommitted hunks from an earlier session's D21 doc pass. Commit the whole file — they are related decision-log edits (same call as M1's Task 8 made for `balance-levers.md`) — but say so in the commit-adjacent report.

- [ ] **Step 7: Full gate + commit**

Run: `bun test && bun run typecheck && bun run lint`
Expected: all green.

```bash
git add src/engine/types.ts src/engine/loadout.ts test/types.test.ts test/engine.test.ts test/render.test.ts docs/decisions.md
git commit -m "M2: D22 — town-side loadout staging slot on GameState"
```

---

### Task 3: Movement math (`src/engine/move.ts`)

**Files:**
- Create: `src/engine/move.ts`
- Test: `test/move.test.ts`

**Interfaces:**
- Consumes: `MOVE_BASE_COST`, `TERRAIN_COST`, `TRANSPORT_MULTIPLIER`, `Terrain` from `src/data/constants`.
- Produces:
  - `stepToward(from: {x,y}, to: {x,y}): {x,y}` — one 8-dir step: each axis moves by `Math.sign(delta)`. `from === to` coordinates → returns `from`'s coordinates (no step).
  - `moveCost(terrain: Terrain, transport: string | null): number` — `MOVE_BASE_COST × TERRAIN_COST[terrain] ÷ multiplier`, where multiplier is `TRANSPORT_MULTIPLIER[transport] ?? 1` (and 1 for `null`). Returns `Infinity` for impassable terrain. **Takes terrain and transport by signature — the biome cannot reach this function (D21 guardrail).**

- [ ] **Step 1: Write the failing test**

```ts
// test/move.test.ts
import { test, expect } from "bun:test";
import { stepToward, moveCost } from "../src/engine/move";
import { MOVE_BASE_COST, TERRAIN_COST } from "../src/data/constants";

test("stepToward: steps one tile on each axis toward the target (8-dir)", () => {
  expect(stepToward({ x: 5, y: 5 }, { x: 8, y: 8 })).toEqual({ x: 6, y: 6 }); // diagonal
  expect(stepToward({ x: 5, y: 5 }, { x: 5, y: 0 })).toEqual({ x: 5, y: 4 }); // vertical
  expect(stepToward({ x: 5, y: 5 }, { x: 2, y: 5 })).toEqual({ x: 4, y: 5 }); // horizontal
  expect(stepToward({ x: 5, y: 5 }, { x: 6, y: 9 })).toEqual({ x: 6, y: 6 }); // mixed clamps to ±1
});

test("stepToward: already at target means no step", () => {
  expect(stepToward({ x: 3, y: 3 }, { x: 3, y: 3 })).toEqual({ x: 3, y: 3 });
});

test("moveCost: ice costs more than plains (bead acceptance)", () => {
  expect(moveCost("ice", null)).toBeGreaterThan(moveCost("plains", null));
});

test("moveCost: on foot equals base × terrain", () => {
  expect(moveCost("plains", null)).toBe(MOVE_BASE_COST * TERRAIN_COST.plains);
  expect(moveCost("mud", null)).toBe(MOVE_BASE_COST * TERRAIN_COST.mud);
});

test("moveCost: transport divides — horse lowers, mule raises (bead acceptance)", () => {
  expect(moveCost("plains", "horse")).toBeLessThan(moveCost("plains", null));
  expect(moveCost("plains", "mule")).toBeGreaterThan(moveCost("plains", null));
});

test("moveCost: unknown transport defId behaves as on foot", () => {
  expect(moveCost("plains", "rocket-skates")).toBe(moveCost("plains", null));
});

test("moveCost: mountain is impassable regardless of transport", () => {
  expect(moveCost("mountain", null)).toBe(Infinity);
  expect(moveCost("mountain", "horse")).toBe(Infinity);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/move.test.ts`
Expected: FAIL — `Cannot find module '../src/engine/move'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/engine/move.ts
// Movement math (M2). D21 guardrail: cost is terrain × transport ONLY —
// this module's signatures make a biome lookup impossible by construction.
import {
  MOVE_BASE_COST,
  TERRAIN_COST,
  TRANSPORT_MULTIPLIER,
} from "../data/constants";
import type { Terrain } from "../data/constants";

export type Coord = { x: number; y: number };

// One 8-directional step: each axis independently moves by sign(delta).
export function stepToward(from: Coord, to: Coord): Coord {
  return {
    x: from.x + Math.sign(to.x - from.x),
    y: from.y + Math.sign(to.y - from.y),
  };
}

// Energy cost of stepping ONTO `terrain` with `transport` equipped.
// Spec §10: base × terrain ÷ transport. Infinity = impassable.
export function moveCost(terrain: Terrain, transport: string | null): number {
  const multiplier =
    transport === null ? 1 : (TRANSPORT_MULTIPLIER[transport] ?? 1);
  return (MOVE_BASE_COST * TERRAIN_COST[terrain]) / multiplier;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/move.test.ts`
Expected: PASS.

- [ ] **Step 5: Full gate + commit**

Run: `bun test && bun run typecheck && bun run lint`
Expected: all green (boundary test covers the new engine file).

```bash
git add src/engine/move.ts test/move.test.ts
git commit -m "M2: movement math — stepToward + moveCost(terrain, transport)"
```

---

### Task 4: `reduce` case `embark`

**Files:**
- Modify: `src/engine/reduce.ts`
- Test: `test/reduce-embark.test.ts`

**Interfaces:**
- Consumes: `generateGrid`, `rollBiome` (grid.ts); `emptyLoadout` (loadout.ts); `ENERGY_PER_FOOD`, `PLAYER_BASE_HP` (constants).
- Produces:
  - `embark` from town: `phase → "expedition"`, expedition = `{ mapSeed, pos: grid.entry, energy: totalFoodQty × ENERGY_PER_FOOD, hp: PLAYER_BASE_HP, loadout: state.loadout, carry: [] }`, town `loadout` reset to `emptyLoadout()`. Event: `{ type: "embarked", mapSeed, biomeId, pos, energy }`.
  - `embark` while already on expedition: state unchanged + `{ type: "action-rejected", action: "embark", reason: "not-in-town" }`.
  - The `action-rejected` event shape `{ type, action, reason }` is the standard rejection event Tasks 4–5 share (and later milestones follow).
  - Note: `hp` starts at `PLAYER_BASE_HP`, which is still the M0 placeholder `0` — M4 fills the lever; embark just reads it.

- [ ] **Step 1: Write the failing test**

```ts
// test/reduce-embark.test.ts
import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { ENERGY_PER_FOOD } from "../src/data/constants";
import type { GameState } from "../src/engine/types";

function townState(): GameState {
  const loadout = emptyLoadout();
  loadout.food = [
    { defId: "bread", qty: 3 },
    { defId: "jerky", qty: 1 },
  ];
  loadout.equipment.transport = "horse";
  return { seed: "g", phase: "town", bank: [], loadout, expedition: null };
}

test("embark: enters expedition at the map's entry with energy from packed food", () => {
  const { state, events } = reduce(townState(), { type: "embark", mapSeed: "m2-map" });
  const grid = generateGrid("m2-map", rollBiome("m2-map"));
  expect(state.phase).toBe("expedition");
  expect(state.expedition).not.toBeNull();
  expect(state.expedition!.mapSeed).toBe("m2-map");
  expect(state.expedition!.pos).toEqual(grid.entry);
  expect(state.expedition!.energy).toBe(4 * ENERGY_PER_FOOD); // 3 bread + 1 jerky
  expect(state.expedition!.carry).toEqual([]);
  expect(events).toEqual([
    {
      type: "embarked",
      mapSeed: "m2-map",
      biomeId: grid.biomeId,
      pos: grid.entry,
      energy: 4 * ENERGY_PER_FOOD,
    },
  ]);
});

test("embark: moves the town loadout onto the expedition and leaves town's empty", () => {
  const { state } = reduce(townState(), { type: "embark", mapSeed: "m2-map" });
  expect(state.expedition!.loadout.food).toEqual([
    { defId: "bread", qty: 3 },
    { defId: "jerky", qty: 1 },
  ]);
  expect(state.expedition!.loadout.equipment.transport).toBe("horse");
  expect(state.loadout).toEqual(emptyLoadout());
});

test("embark: deterministic — same state + action twice gives identical results", () => {
  expect(reduce(townState(), { type: "embark", mapSeed: "m2-map" })).toEqual(
    reduce(townState(), { type: "embark", mapSeed: "m2-map" }),
  );
});

test("embark: rejected while already on expedition", () => {
  const first = reduce(townState(), { type: "embark", mapSeed: "m2-map" }).state;
  const { state, events } = reduce(first, { type: "embark", mapSeed: "other" });
  expect(state).toEqual(first);
  expect(events).toEqual([
    { type: "action-rejected", action: "embark", reason: "not-in-town" },
  ]);
});

test("embark: does not mutate the input state", () => {
  const input = townState();
  const before = structuredClone(input);
  reduce(input, { type: "embark", mapSeed: "m2-map" });
  expect(input).toEqual(before);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/reduce-embark.test.ts`
Expected: FAIL — embark is a no-op, so `state.phase` stays `"town"`.

- [ ] **Step 3: Implement the `embark` case**

In `src/engine/reduce.ts`, replace the file with:

```ts
import type { GameState, Action, GameEvent } from "./types";
import { generateGrid, rollBiome } from "./grid";
import { emptyLoadout } from "./loadout";
import { ENERGY_PER_FOOD, PLAYER_BASE_HP } from "../data/constants";

// Pure reducer. M2 fills embark/move; remaining cases are no-op stubs:
//   gather/scout/fight            → M3–M4
//   craft/pack/return/drop        → M5
// Adding a new Action variant without a case here is a compile error (assertNever).
export function reduce(
  state: GameState,
  action: Action,
): { state: GameState; events: GameEvent[] } {
  switch (action.type) {
    case "embark":
      return embark(state, action.mapSeed);
    case "craft":
    case "pack":
    case "move":
    case "gather":
    case "scout":
    case "fight":
    case "drop":
    case "return":
      return { state, events: [] };
    default:
      return assertNever(action);
  }
}

function rejected(
  state: GameState,
  action: Action["type"],
  reason: string,
): { state: GameState; events: GameEvent[] } {
  return { state, events: [{ type: "action-rejected", action, reason }] };
}

function embark(
  state: GameState,
  mapSeed: string,
): { state: GameState; events: GameEvent[] } {
  if (state.phase !== "town") return rejected(state, "embark", "not-in-town");
  const grid = generateGrid(mapSeed, rollBiome(mapSeed));
  const foodQty = state.loadout.food.reduce((sum, stack) => sum + stack.qty, 0);
  const energy = foodQty * ENERGY_PER_FOOD;
  return {
    state: {
      ...state,
      phase: "expedition",
      loadout: emptyLoadout(),
      expedition: {
        mapSeed,
        pos: grid.entry,
        energy,
        hp: PLAYER_BASE_HP, // placeholder 0 until M4 fills the lever
        loadout: state.loadout,
        carry: [],
      },
    },
    events: [
      { type: "embarked", mapSeed, biomeId: grid.biomeId, pos: grid.entry, energy },
    ],
  };
}

function assertNever(x: never): never {
  throw new Error(`Unhandled action: ${JSON.stringify(x)}`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test`
Expected: PASS — including `test/engine.test.ts` (its no-op test uses `return`, still a stub).

- [ ] **Step 5: Full gate + commit**

Run: `bun test && bun run typecheck && bun run lint`
Expected: all green.

```bash
git add src/engine/reduce.ts test/reduce-embark.test.ts
git commit -m "M2: embark — town loadout onto expedition, energy from packed food"
```

---

### Task 5: `reduce` case `move`

**Files:**
- Modify: `src/engine/reduce.ts` (fill the `move` case)
- Test: `test/reduce-move.test.ts`

**Interfaces:**
- Consumes: `stepToward`, `moveCost` (move.ts); `generateGrid`, `rollBiome` (grid.ts); `GRID_SIZE` (constants); the `rejected` helper and embark from Task 4.
- Produces `move` semantics (M6's `legalActions` will mirror these guards):
  - Not on expedition → reject `"not-on-expedition"`.
  - `stepToward` returns current pos (already at target) → reject `"no-step"`.
  - Step lands outside `[0, GRID_SIZE)` on either axis → reject `"out-of-bounds"`.
  - `moveCost` infinite → reject `"impassable"`.
  - `cost > energy` → reject `"exhausted"` (energy 0 stops all moves: every terrain costs > 0).
  - Otherwise: `pos = step`, `energy -= cost`, event `{ type: "moved", from, to, terrain, cost, energy }` (`energy` = remaining after the step).

- [ ] **Step 1: Write the failing test**

```ts
// test/reduce-move.test.ts
import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { moveCost } from "../src/engine/move";
import { GRID_SIZE } from "../src/data/constants";
import type { Terrain, BiomeId } from "../src/data/constants";
import type { GameState } from "../src/engine/types";
import type { Grid } from "../src/engine/grid";

// Deterministically find a mapSeed whose rolled biome matches.
function seedFor(biome: BiomeId): string {
  const seed = Array.from({ length: 200 }, (_, i) => `m2-scan-${i}`).find(
    (s) => rollBiome(s) === biome,
  );
  if (!seed) throw new Error(`no seed rolls ${biome} in scan range`);
  return seed;
}

// Find a tile of `terrain` with an in-bounds neighbour to stand on.
function findStep(grid: Grid, terrain: Terrain): { from: { x: number; y: number }; to: { x: number; y: number } } {
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (grid.terrain[y]![x] !== terrain) continue;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
          return { from: { x: nx, y: ny }, to: { x, y } };
        }
      }
    }
  }
  throw new Error(`no ${terrain} tile with an in-bounds neighbour`);
}

function expeditionState(
  mapSeed: string,
  pos: { x: number; y: number },
  energy: number,
  transport: string | null = null,
): GameState {
  const loadout = emptyLoadout();
  loadout.equipment.transport = transport;
  return {
    seed: "g",
    phase: "expedition",
    bank: [],
    loadout: emptyLoadout(),
    expedition: { mapSeed, pos, energy, hp: 0, loadout, carry: [] },
  };
}

test("move: steps one tile onto the target terrain and pays its cost", () => {
  const seed = seedFor("woodland");
  const grid = generateGrid(seed, "woodland");
  const { from, to } = findStep(grid, "mud");
  const cost = moveCost("mud", null);
  const { state, events } = reduce(expeditionState(seed, from, 10), { type: "move", to });
  expect(state.expedition!.pos).toEqual(to);
  expect(state.expedition!.energy).toBe(10 - cost);
  expect(events).toEqual([
    { type: "moved", from, to, terrain: "mud", cost, energy: 10 - cost },
  ]);
});

test("move: distant target still moves exactly one tile (8-dir diagonal)", () => {
  const seed = seedFor("woodland");
  const start = { x: 5, y: 5 };
  const { state } = reduce(expeditionState(seed, start, 1000), {
    type: "move",
    to: { x: 12, y: 12 },
  });
  // either moved to (6,6) or was rejected if (6,6) is impassable — assert on the event instead
  const grid = generateGrid(seed, "woodland");
  const terrain = grid.terrain[6]![6]!;
  if (Number.isFinite(moveCost(terrain, null))) {
    expect(state.expedition!.pos).toEqual({ x: 6, y: 6 });
  } else {
    expect(state.expedition!.pos).toEqual(start);
  }
});

test("move: transport lowers the cost of the same step (bead acceptance)", () => {
  const seed = seedFor("woodland");
  const grid = generateGrid(seed, "woodland");
  const { from, to } = findStep(grid, "plains");
  const onFoot = reduce(expeditionState(seed, from, 10, null), { type: "move", to });
  const onHorse = reduce(expeditionState(seed, from, 10, "horse"), { type: "move", to });
  expect(10 - onHorse.state.expedition!.energy).toBeLessThan(
    10 - onFoot.state.expedition!.energy,
  );
});

test("move: ice step drains more energy than plains step (bead acceptance)", () => {
  const tundraSeed = seedFor("tundra");
  const tundraGrid = generateGrid(tundraSeed, rollBiome(tundraSeed));
  const ice = findStep(tundraGrid, "ice");
  const iceSpent =
    10 - reduce(expeditionState(tundraSeed, ice.from, 10), { type: "move", to: ice.to }).state.expedition!.energy;

  const woodSeed = seedFor("woodland");
  const woodGrid = generateGrid(woodSeed, rollBiome(woodSeed));
  const plains = findStep(woodGrid, "plains");
  const plainsSpent =
    10 - reduce(expeditionState(woodSeed, plains.from, 10), { type: "move", to: plains.to }).state.expedition!.energy;

  expect(iceSpent).toBeGreaterThan(plainsSpent);
});

test("move: cost never reads the biome — plains costs the same on every map (D21 guardrail)", () => {
  const spentOn = (biome: BiomeId): number => {
    const seed = seedFor(biome);
    const grid = generateGrid(seed, rollBiome(seed));
    const { from, to } = findStep(grid, "plains");
    return 10 - reduce(expeditionState(seed, from, 10), { type: "move", to }).state.expedition!.energy;
  };
  expect(spentOn("woodland")).toBe(spentOn("desert"));
  expect(spentOn("woodland")).toBe(spentOn("tundra"));
});

test("move: impassable terrain is rejected and costs nothing", () => {
  const seed = seedFor("tundra"); // tundra has mountain weight 0.25
  const grid = generateGrid(seed, rollBiome(seed));
  const { from, to } = findStep(grid, "mountain");
  const { state, events } = reduce(expeditionState(seed, from, 10), { type: "move", to });
  expect(state.expedition!.pos).toEqual(from);
  expect(state.expedition!.energy).toBe(10);
  expect(events).toEqual([
    { type: "action-rejected", action: "move", reason: "impassable" },
  ]);
});

test("move: energy at 0 stops further moves (bead acceptance)", () => {
  const seed = seedFor("woodland");
  const grid = generateGrid(seed, rollBiome(seed));
  const { from, to } = findStep(grid, "plains");
  const { state, events } = reduce(expeditionState(seed, from, 0), { type: "move", to });
  expect(state.expedition!.pos).toEqual(from);
  expect(events).toEqual([
    { type: "action-rejected", action: "move", reason: "exhausted" },
  ]);
});

test("move: insufficient energy for the specific step is rejected", () => {
  const seed = seedFor("woodland");
  const grid = generateGrid(seed, rollBiome(seed));
  const { from, to } = findStep(grid, "mud"); // mud costs 1.5
  const { events } = reduce(expeditionState(seed, from, 1), { type: "move", to });
  expect(events).toEqual([
    { type: "action-rejected", action: "move", reason: "exhausted" },
  ]);
});

test("move: already at target is rejected as no-step", () => {
  const seed = seedFor("woodland");
  const { events } = reduce(expeditionState(seed, { x: 4, y: 4 }, 10), {
    type: "move",
    to: { x: 4, y: 4 },
  });
  expect(events).toEqual([
    { type: "action-rejected", action: "move", reason: "no-step" },
  ]);
});

test("move: step off the grid edge is rejected", () => {
  const seed = seedFor("woodland");
  const { events } = reduce(
    expeditionState(seed, { x: 0, y: GRID_SIZE - 1 }, 10),
    { type: "move", to: { x: 0, y: GRID_SIZE + 5 } },
  );
  expect(events).toEqual([
    { type: "action-rejected", action: "move", reason: "out-of-bounds" },
  ]);
});

test("move: rejected in town", () => {
  const town: GameState = {
    seed: "g",
    phase: "town",
    bank: [],
    loadout: emptyLoadout(),
    expedition: null,
  };
  const { state, events } = reduce(town, { type: "move", to: { x: 1, y: 1 } });
  expect(state).toEqual(town);
  expect(events).toEqual([
    { type: "action-rejected", action: "move", reason: "not-on-expedition" },
  ]);
});

test("move: does not mutate the input state", () => {
  const seed = seedFor("woodland");
  const grid = generateGrid(seed, rollBiome(seed));
  const { from, to } = findStep(grid, "plains");
  const input = expeditionState(seed, from, 10);
  const before = structuredClone(input);
  reduce(input, { type: "move", to });
  expect(input).toEqual(before);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/reduce-move.test.ts`
Expected: FAIL — move is a no-op (pos unchanged, no events).

- [ ] **Step 3: Implement the `move` case**

In `src/engine/reduce.ts`: add imports `stepToward, moveCost` from `"./move"` and `GRID_SIZE` from `"../data/constants"`; change the `case "move":` line to `return move(state, action.to);` (remove it from the no-op group); add:

```ts
function move(
  state: GameState,
  to: { x: number; y: number },
): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) {
    return rejected(state, "move", "not-on-expedition");
  }
  const from = expedition.pos;
  const step = stepToward(from, to);
  if (step.x === from.x && step.y === from.y) {
    return rejected(state, "move", "no-step");
  }
  if (step.x < 0 || step.x >= GRID_SIZE || step.y < 0 || step.y >= GRID_SIZE) {
    return rejected(state, "move", "out-of-bounds");
  }
  const grid = generateGrid(expedition.mapSeed, rollBiome(expedition.mapSeed));
  const terrain = grid.terrain[step.y]![step.x]!;
  const cost = moveCost(terrain, expedition.loadout.equipment.transport);
  if (!Number.isFinite(cost)) return rejected(state, "move", "impassable");
  if (cost > expedition.energy) return rejected(state, "move", "exhausted");
  const energy = expedition.energy - cost;
  return {
    state: {
      ...state,
      expedition: { ...expedition, pos: step, energy },
    },
    events: [{ type: "moved", from, to: step, terrain, cost, energy }],
  };
}
```

Also update the reducer's header comment (the stub list no longer includes `move`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test`
Expected: all green.

- [ ] **Step 5: Full gate + commit**

Run: `bun test && bun run typecheck && bun run lint`
Expected: all green.

```bash
git add src/engine/reduce.ts test/reduce-move.test.ts
git commit -m "M2: move — one 8-dir step, terrain×transport cost, energy gate"
```

---

### Task 6: M1 follow-ups — desert terrain variety + no POI on entry (data + one guard)

Two items from bead `idle-adventure-8eh` (M1 final review) scoped to M2. Both change generated maps → **one intentional snapshot regeneration**.

**Files:**
- Modify: `src/data/constants.ts` (desert `terrainWeights` only)
- Modify: `src/engine/grid.ts` (entry excluded from POI candidacy + the under-fill comment)
- Test: `test/grid.test.ts` (extend); `test/__snapshots__/render.test.ts.snap` (regenerated)

**Interfaces:**
- Consumes: existing grid internals (Task 4–5 of the M1 plan).
- Produces: `generateGrid` guarantees no POI on `grid.entry`; desert maps show terrain variety (mountain band reachable by center-heavy Perlin).

- [ ] **Step 1: Write the failing test (append to `test/grid.test.ts`)**

```ts
test("generateGrid: never places a POI on the entry tile", () => {
  for (let i = 0; i < 25; i++) {
    const seed = `entry-clash-${i}`;
    const grid = generateGrid(seed, rollBiome(seed));
    for (const poi of grid.pois) {
      expect(`${poi.x},${poi.y}`).not.toBe(`${grid.entry.x},${grid.entry.y}`);
    }
  }
});

test("generateGrid: desert maps contain terrain variety, not monoterrain (M1 review follow-up)", () => {
  // Aggregate across seeds: desert must generate at least SOME non-plains
  // terrain so terrain-cost routing has something to bite on.
  let mountain = 0;
  let river = 0;
  for (let i = 0; i < 10; i++) {
    for (const row of generateGrid(`desert-variety-${i}`, "desert").terrain) {
      for (const t of row) {
        if (t === "mountain") mountain++;
        if (t === "river") river++;
      }
    }
  }
  expect(mountain).toBeGreaterThan(0);
  expect(river).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/grid.test.ts`
Expected: the desert-variety test FAILS (current weights make the mountain band ≈unreachable). The entry-clash test may pass by luck — that's fine; it becomes the regression guard.

- [ ] **Step 3: Implement both fixes**

In `src/data/constants.ts`, change only the desert `terrainWeights` line:

```ts
    terrainWeights: { plains: 0.55, mountain: 0.3, river: 0.15 },
```

(Perlin values are center-heavy, so edge bands need wider weights to appear: mountain's band becomes [0.7, 1], river's [0, 0.15]. Node weights unchanged.)

In `src/engine/grid.ts`, inside `generateGrid`: move the `const entry = ...` line ABOVE the POI placement loop (the stateless hash RNG makes draw order irrelevant — moving it changes nothing), and add an entry-collision rejection plus the under-fill comment on the loop:

```ts
  // Seeded rejection sampling: walk a deterministic candidate stream, keep
  // candidates that clear POI_MIN_SPACING (Chebyshev — 8-dir movement) from
  // every accepted POI. Kind is drawn per accepted candidate from the biome.
  // NOTE: if the attempt budget exhausts, the grid returns FEWER than
  // POI_DENSITY POIs (astronomically unlikely at current levers) — callers
  // must not assume pois.length === POI_DENSITY.
```

and in the loop, after computing `x`/`y`:

```ts
    if (x === entry.x && y === entry.y) continue; // entry tile stays clear (M2: embark lands here)
```

- [ ] **Step 4: Regenerate snapshots and eyeball them**

Run: `bun test --update-snapshots test/render.test.ts`
Then run: `bun test`
Expected: all green with 3 regenerated snapshots. **Eyeball `test/__snapshots__/render.test.ts.snap`:** desert should now show `^` ridges and `~` pockets among the plains; woodland/tundra should look materially the same as before (entry-exclusion may shuffle a POI on some maps). Report a few desert rows as evidence.

- [ ] **Step 5: Full gate + commit**

Run: `bun test && bun run typecheck && bun run lint`
Expected: all green.

```bash
git add src/data/constants.ts src/engine/grid.ts test/grid.test.ts test/__snapshots__/render.test.ts.snap
git commit -m "M2: desert terrain variety + entry tile excluded from POIs (M1 review follow-ups)"
```

---

### Task 7: Acceptance check, docs, gates

**Files:**
- Modify: `docs/balance-levers.md` (energy group)
- No code changes expected.

**Interfaces:** none — verification and bookkeeping.

- [ ] **Step 1: Verify the bead's acceptance criteria, one by one**

1. *Ice costs more than plains* — `bun test test/move.test.ts test/reduce-move.test.ts` → the ice/plains tests PASS.
2. *Transport lowers cost* — moveCost + reduce-move transport tests PASS.
3. *Energy at 0 stops further moves* — reduce-move exhaustion tests PASS.
4. *Deterministic* — embark determinism test + move tests build on seeded grids only; `grep -rn "Math.random\|Date.now" src/engine/` → no hits.
5. *Move-cost computation never reads the biome* — the D21 guardrail test PASSES; additionally `grep -n "biome" src/engine/move.ts` → only the comment, no code reference; `moveCost`'s signature is `(terrain, transport)`.

- [ ] **Step 2: Update `docs/balance-levers.md`**

In the **Energy economy** group, replace the two bullets:

```markdown
- `TERRAIN_COST{plains, mud, ice, river, mountain}` — per-terrain multiplier; `Infinity` = impassable without gear (mountain, until gating gear exists)
- `TRANSPORT_MULTIPLIER{horse, mule, …}` — move-cost **divisor** (spec §10: base × terrain ÷ transport): >1 faster than foot (horse), <1 slower (mule — pays for future carry bonus); carry bonuses arrive with M3/M5
```

- [ ] **Step 3: Full gates**

Run: `bun test && bun run typecheck && bun run lint`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add docs/balance-levers.md
git commit -m "M2: document terrain-cost and transport-divisor semantics"
```

(The controller closes the bead and updates `idle-adventure-8eh` after the final whole-branch review.)

---

## Self-Review

- **Spec coverage:** embark sets energy from packed food ✓ (T4) · move steps one tile 8-dir toward target ✓ (T3/T5) · terrain cost multiplier ✓ (T1/T3) · transport reduces cost ✓ (T1/T3/T5) · gated/impassable tiles ✓ (mountain Infinity, T1/T5) · energy depletes and bottoms out ✓ (T5) · levers ENERGY_PER_FOOD/MOVE_BASE_COST/TERRAIN_COST/TRANSPORT_MULTIPLIER filled ✓ (T1) · D21 cost-path guardrail ✓ (T3 signature + T5 test + T7 grep) · 8eh follow-ups (desert variety, entry-POI) ✓ (T6).
- **Placeholder scan:** none — every step carries code or exact commands.
- **Type consistency:** `Coord` defined in move.ts, used internally; reduce uses plain `{x,y}` matching `Action`'s shape; `emptyLoadout` defined once (T2), consumed in T4/T5 tests; `rejected(state, action, reason)` defined in T4, reused in T5; event shapes `embarked`/`moved`/`action-rejected` consistent between T4 and T5 tests and implementations.
- **Noted judgment calls:** D22 (town loadout slot) recorded in decisions.md — the one contract change; hp starts at the M4-placeholder `PLAYER_BASE_HP = 0` (combat can't run yet, harmless); rejection reasons are strings not a closed union (M6 can tighten when `legalActions` lands); diagonal steps cost the same as orthogonal (1 action = 1 tile, per the plan's global constraints); `river: 3` is fordable-but-expensive rather than gated — gating stays mountain-only until gear exists.
