# M6 — Headless Harness + AI-drivable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the engine drivable and inspectable headlessly — `play(seed, actions[]) → {state, events}`, phase-split legal-action introspection (`townActions`/`expeditionActions`/`legalActions`), a closed rejection-reason union, a CLI to drive the game by JSON, and a scripted full-loop test across ≥2 biomes.

**Architecture:** Fills the empty `src/sim/` folder. `play` folds the existing pure `reduce` over an action list from `newGame(seed)`. The legal-action helpers build phase-appropriate candidate actions and filter them through a **speculative `reduce`** (pure + cheap) — one source of truth for legality, so they can never drift from what `reduce` accepts (D29). `src/sim` may use `console`/`process` and import the engine; the engine-purity boundary (D17) restricts only `src/engine/**`.

**Tech Stack:** TypeScript · bun + `bun test` · ESLint (boundary on `src/engine/**` only).

## Global Constraints

- Engine (`src/engine/**`) stays pure: no DOM, no `Math.random`/`Date.now`, no imports from `render`/`sim`/`web`. `src/sim/**` is unrestricted (may use `console`/`process`, import the engine).
- `GameState` holds only the present. Items are `{defId, qty}`. RNG = `rand(seed, ...context)`.
- Test runner is `bun test`; tests import from `"bun:test"`. Full gates: `bun test`, `bun run typecheck`, `bun run lint`.
- Reducer rejections emit exactly `[{ type: "action-rejected", action, reason }]` and return `state` unchanged. `reason` becomes the closed `RejectionReason` union in Task 1.
- `play` and the legal-action helpers must be **pure** (deterministic from their inputs) so a run replays identically.

## Decisions this plan implements

- **D29** — legal-action introspection split by phase (`townActions` reads bank; `expeditionActions` reads map + active inventory; `legalActions` dispatches). All three filter candidates via speculative `reduce`. `play(seed, actions[])` is untouched by this (read-only inspectors).
- **D30** — `action-rejected.reason` is a closed `RejectionReason` union; `gather`'s `no-node` splits into `no-node` (empty tile) vs `already-cleared` (consumed node).
- Deferred (filed as beads, NOT in M6): on-map don/doff gear + manual potion; terrain-gating gear. `move` stays 8-directional; impassable terrain (mountain, `Infinity` cost) is already excluded by `reduce`.

## File Structure

- **Modify** `src/engine/types.ts` — add `RejectionReason` union; `action-rejected.reason: RejectionReason`.
- **Modify** `src/engine/reduce.ts` — type `rejected()` to `RejectionReason`; split `gather`'s `no-node`/`already-cleared`.
- **Modify** `test/reduce-gather.test.ts` — cleared-node rejection now `already-cleared`.
- **Create** `src/sim/play.ts` — `play(seed, actions[])`.
- **Create** `src/sim/legal.ts` — `townActions`, `expeditionActions`, `legalActions`.
- **Create** `src/sim/report.ts` — `summarize(state)` (compact JSON snapshot for the CLI).
- **Create** `src/sim/cli.ts` — the JSON-driven CLI.
- **Modify** `package.json` — add a `play` script.
- **Create** `test/play.test.ts`, `test/legal.test.ts`, `test/report.test.ts`, `test/harness-loop.test.ts`.

---

## Task 1: Closed `RejectionReason` union + gather `already-cleared` split (D30)

**Files:**
- Modify: `src/engine/types.ts`
- Modify: `src/engine/reduce.ts`
- Modify: `test/reduce-gather.test.ts`

**Interfaces:**
- Produces: `RejectionReason` (exported union) in `types.ts`; `action-rejected` event's `reason` is `RejectionReason`. `gather` emits `already-cleared` for a consumed node, `no-node` only for an empty tile.

- [ ] **Step 1: Add the `RejectionReason` union to `src/engine/types.ts`**

Add above the `GameEvent` union:

```ts
// Closed set of every reason a reducer can reject an action (D30). Split out so
// callers (legalActions, the field UI, the AI) can switch exhaustively.
export type RejectionReason =
  | "not-in-town"
  | "not-on-expedition"
  | "no-step"
  | "out-of-bounds"
  | "impassable"
  | "exhausted"
  | "no-node"
  | "already-cleared"
  | "not-gatherable"
  | "missing-tool"
  | "carry-full"
  | "not-carried"
  | "no-monster"
  | "unaffordable"
  | "no-recipe"
  | "insufficient-materials"
  | "wrong-slot"
  | "insufficient"
  | "already-packed"
  | "no-slot";
```

Change the `action-rejected` event variant from `reason: string` to:

```ts
  | {
      type: "action-rejected";
      action: Action["type"];
      reason: RejectionReason;
    };
```

- [ ] **Step 2: Type `rejected()` and split gather in `src/engine/reduce.ts`**

Update the import to include the new type:

```ts
import type { GameState, Action, GameEvent, LoadoutSlot, RejectionReason } from "./types";
```

Change the `rejected` helper signature:

```ts
function rejected(
  state: GameState,
  action: Action["type"],
  reason: RejectionReason,
): { state: GameState; events: GameEvent[] } {
  return { state, events: [{ type: "action-rejected", action, reason }] };
}
```

In `gather`, replace the combined check:

```ts
  if (!poi || alreadyCleared) return rejected(state, "gather", "no-node");
```

with the split:

```ts
  if (!poi) return rejected(state, "gather", "no-node");
  if (alreadyCleared) return rejected(state, "gather", "already-cleared");
```

- [ ] **Step 3: Update the cleared-node gather test**

In `test/reduce-gather.test.ts`, the test `"gather: a cleared node cannot be gathered again (one-shot, D24)"` currently expects `reason: "no-node"`. Change that expectation to `already-cleared`:

```ts
  expect(events).toEqual([
    { type: "action-rejected", action: "gather", reason: "already-cleared" },
  ]);
```

Leave the `"gather: empty tile has no node"` test as `no-node` (it stands on an empty tile).

- [ ] **Step 4: Run the gather suite, then full gates**

Run: `bun test test/reduce-gather.test.ts`
Expected: PASS.

Run: `bun test && bun run typecheck && bun run lint`
Expected: all green. (Typecheck now enforces every `rejected(...)` reason is a `RejectionReason` member — a typo becomes a compile error.)

- [ ] **Step 5: Commit**

```bash
git add src/engine/types.ts src/engine/reduce.ts test/reduce-gather.test.ts
git commit -m "M6: closed RejectionReason union + gather already-cleared split (D30)"
```

---

## Task 2: `play(seed, actions[])`

**Files:**
- Create: `src/sim/play.ts`
- Test: `test/play.test.ts`

**Interfaces:**
- Consumes: `newGame` (`src/engine/town.ts`), `reduce` (`src/engine/reduce.ts`).
- Produces: `play(seed: string, actions: Action[]): { state: GameState; events: GameEvent[] }` — folds `reduce` from `newGame(seed)`, concatenating every action's events in order.

- [ ] **Step 1: Write the failing test**

Create `test/play.test.ts`:

```ts
import { test, expect } from "bun:test";
import { play } from "../src/sim/play";
import { newGame } from "../src/engine/town";

test("play: no actions returns the fresh game unchanged", () => {
  const { state, events } = play("s", []);
  expect(state).toEqual(newGame("s"));
  expect(events).toEqual([]);
});

test("play: folds reduce and concatenates events in order", () => {
  const { state, events } = play("s", [
    { type: "pack", slot: "tool", itemId: "pick" },
    { type: "pack", slot: "food", itemId: "ration" },
  ]);
  expect(state.loadout.equipment.tools).toEqual(["pick"]);
  expect(state.loadout.food).toEqual([{ defId: "ration", qty: 1 }]);
  expect(events).toEqual([
    { type: "packed", slot: "tool", defId: "pick" },
    { type: "packed", slot: "food", defId: "ration" },
  ]);
});

test("play: a rejected action leaves state unchanged but records the rejection", () => {
  const { state, events } = play("s", [{ type: "gather" }]); // gather illegal in town
  expect(state).toEqual(newGame("s"));
  expect(events).toEqual([
    { type: "action-rejected", action: "gather", reason: "not-on-expedition" },
  ]);
});

test("play: deterministic — same seed + actions replays identically", () => {
  const actions = [
    { type: "pack", slot: "tool", itemId: "pick" } as const,
    { type: "embark", mapSeed: "s:map:0" } as const,
  ];
  expect(play("s", actions)).toEqual(play("s", actions));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test test/play.test.ts`
Expected: FAIL — cannot find module `../src/sim/play`.

- [ ] **Step 3: Implement `src/sim/play.ts`**

```ts
// Headless driver (M6): replay a seed + action list into a final state and the
// concatenated event log. Pure — same seed + actions always reproduce the run.
// This is the unit-test and AI entry point; the interactive web view is a
// separate driver over the same reduce.
import type { GameState, Action, GameEvent } from "../engine/types";
import { reduce } from "../engine/reduce";
import { newGame } from "../engine/town";

export function play(
  seed: string,
  actions: Action[],
): { state: GameState; events: GameEvent[] } {
  let state = newGame(seed);
  const events: GameEvent[] = [];
  for (const action of actions) {
    const result = reduce(state, action);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test test/play.test.ts`
Expected: PASS.

- [ ] **Step 5: Full gates**

Run: `bun test && bun run typecheck && bun run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/sim/play.ts test/play.test.ts
git commit -m "M6: play(seed, actions[]) headless driver"
```

---

## Task 3: Legal-action introspection — `townActions` / `expeditionActions` / `legalActions` (D29)

**Files:**
- Create: `src/sim/legal.ts`
- Test: `test/legal.test.ts`

**Interfaces:**
- Consumes: `reduce`; `RECIPE` and `slotOf` (`src/engine/catalog.ts`); `candidateMaps` (`src/engine/town.ts`).
- Produces:
  - `townActions(state): Action[]` — bank-facing (`craft`, `pack`, `embark`); empty unless `state.phase === "town"`.
  - `expeditionActions(state): Action[]` — map + active-inventory (`move` to 8 neighbours, `gather`, `scout`, `fight`, `drop`, `return`); empty unless `state.phase === "expedition"`.
  - `legalActions(state): Action[]` — dispatches to the phase-appropriate helper.
  - All filter candidates through `reduce`: an action is legal iff `reduce(state, action)` emits no `action-rejected` event.

- [ ] **Step 1: Write the failing test**

Create `test/legal.test.ts`:

```ts
import { test, expect } from "bun:test";
import { townActions, expeditionActions, legalActions } from "../src/sim/legal";
import { reduce } from "../src/engine/reduce";
import { newGame, candidateMaps } from "../src/engine/town";
import { play } from "../src/sim/play";
import type { Action, GameState } from "../src/engine/types";

const accepts = (state: GameState, action: Action) =>
  reduce(state, action).events.every((e) => e.type !== "action-rejected");

test("townActions: offers pack + embark on a fresh game, never move/gather", () => {
  const state = newGame("s");
  const actions = townActions(state);
  expect(actions.length).toBeGreaterThan(0);
  // every offered action is genuinely accepted by reduce (D29: no drift)
  for (const a of actions) expect(accepts(state, a)).toBe(true);
  // packing a starter item is offered
  expect(actions).toContainEqual({ type: "pack", slot: "tool", itemId: "pick" });
  // embark on each candidate map is offered
  for (const m of candidateMaps("s")) {
    expect(actions).toContainEqual({ type: "embark", mapSeed: m.mapSeed });
  }
  // no expedition-only actions leak in
  expect(actions.some((a) => a.type === "move" || a.type === "gather" || a.type === "return")).toBe(false);
});

test("townActions: empty when not in town", () => {
  const onMap = play("s", [
    { type: "pack", slot: "food", itemId: "ration" },
    { type: "embark", mapSeed: "s:map:0" },
  ]).state;
  expect(townActions(onMap)).toEqual([]);
});

test("expeditionActions: offers return (always) + some moves, never craft/pack", () => {
  const onMap = play("s", [
    { type: "pack", slot: "food", itemId: "ration" },
    { type: "pack", slot: "food", itemId: "ration" },
    { type: "embark", mapSeed: "s:map:0" },
  ]).state;
  const actions = expeditionActions(onMap);
  for (const a of actions) expect(accepts(onMap, a)).toBe(true);
  expect(actions).toContainEqual({ type: "return" }); // always legal (bead note a)
  expect(actions.some((a) => a.type === "move")).toBe(true); // at least one legal neighbour
  expect(actions.some((a) => a.type === "craft" || a.type === "pack")).toBe(false);
});

test("expeditionActions: return is offered even at zero energy (never a dead end)", () => {
  // embark with no food → 0 energy; moves may all be unaffordable, but return stands
  const zero = play("s", [{ type: "embark", mapSeed: "s:map:0" }]).state;
  expect(zero.expedition!.energy).toBe(0);
  expect(expeditionActions(zero)).toContainEqual({ type: "return" });
});

test("expeditionActions: empty when not on expedition", () => {
  expect(expeditionActions(newGame("s"))).toEqual([]);
});

test("legalActions: dispatches by phase", () => {
  const town = newGame("s");
  expect(legalActions(town)).toEqual(townActions(town));
  const onMap = play("s", [
    { type: "pack", slot: "food", itemId: "ration" },
    { type: "embark", mapSeed: "s:map:0" },
  ]).state;
  expect(legalActions(onMap)).toEqual(expeditionActions(onMap));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test test/legal.test.ts`
Expected: FAIL — cannot find module `../src/sim/legal`.

- [ ] **Step 3: Implement `src/sim/legal.ts`**

```ts
// Legal-action introspection (M6, D29). Split by phase to mirror the UX: town
// reads your bank, the expedition reads the map + what you carried in. Both build
// phase-appropriate CANDIDATE actions, then keep only those reduce accepts — one
// source of truth for legality, so this can never drift from the reducer (and
// future terrain-gating gear is reflected for free).
import type { Action, GameState } from "../engine/types";
import { reduce } from "../engine/reduce";
import { RECIPE } from "../data/constants";
import { slotOf } from "../engine/catalog";
import { candidateMaps } from "../engine/town";

// An action is legal iff reducing it emits no rejection. reduce is pure + cheap.
function accepts(state: GameState, action: Action): boolean {
  return reduce(state, action).events.every((e) => e.type !== "action-rejected");
}

export function townActions(state: GameState): Action[] {
  if (state.phase !== "town") return [];
  const candidates: Action[] = [];
  // craft: every recipe (reduce filters the unaffordable ones)
  for (const recipeId of Object.keys(RECIPE)) {
    candidates.push({ type: "craft", recipeId });
  }
  // pack: every bank item into the slot its defId belongs to
  for (const stack of state.bank) {
    const slot = slotOf(stack.defId);
    if (slot !== null) candidates.push({ type: "pack", slot, itemId: stack.defId });
  }
  // embark: each candidate map the town is offering
  for (const map of candidateMaps(state.seed)) {
    candidates.push({ type: "embark", mapSeed: map.mapSeed });
  }
  return candidates.filter((a) => accepts(state, a));
}

export function expeditionActions(state: GameState): Action[] {
  if (state.phase !== "expedition" || !state.expedition) return [];
  const { pos, carry } = state.expedition;
  const candidates: Action[] = [];
  // move: the 8 neighbouring tiles as step targets (reduce filters
  // out-of-bounds / impassable / exhausted)
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      candidates.push({ type: "move", to: { x: pos.x + dx, y: pos.y + dy } });
    }
  }
  // tile-contextual actions
  candidates.push({ type: "gather" });
  candidates.push({ type: "scout" });
  candidates.push({ type: "fight" });
  // drop each carried stack
  for (const stack of carry) candidates.push({ type: "drop", itemId: stack.defId });
  // return is always legal — a 0-energy run is never a dead end (bead note a)
  candidates.push({ type: "return" });
  return candidates.filter((a) => accepts(state, a));
}

export function legalActions(state: GameState): Action[] {
  return state.phase === "town" ? townActions(state) : expeditionActions(state);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test test/legal.test.ts`
Expected: PASS.

- [ ] **Step 5: Full gates**

Run: `bun test && bun run typecheck && bun run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/sim/legal.ts test/legal.test.ts
git commit -m "M6: phase-split legalActions via speculative reduce (D29)"
```

---

## Task 4: CLI + `summarize` report

**Files:**
- Create: `src/sim/report.ts`
- Create: `src/sim/cli.ts`
- Modify: `package.json`
- Test: `test/report.test.ts`

**Interfaces:**
- Consumes: `play` (Task 2), `legalActions` (Task 3).
- Produces: `summarize(state): object` — a compact JSON-serializable snapshot (phase, pos/energy/hp when on expedition, bank, carry, loadout summary). `cli.ts` prints the event log, `summarize(finalState)`, and `legalActions(finalState)`.

- [ ] **Step 1: Write the failing test for `summarize`**

Create `test/report.test.ts`:

```ts
import { test, expect } from "bun:test";
import { summarize } from "../src/sim/report";
import { newGame } from "../src/engine/town";
import { play } from "../src/sim/play";

test("summarize: town snapshot shows phase and bank, no expedition block", () => {
  const s = summarize(newGame("s"));
  expect(s.phase).toBe("town");
  expect(s.bank).toEqual(newGame("s").bank);
  expect(s.expedition).toBeNull();
});

test("summarize: expedition snapshot shows pos/energy/hp/carry", () => {
  const state = play("s", [
    { type: "pack", slot: "food", itemId: "ration" },
    { type: "embark", mapSeed: "s:map:0" },
  ]).state;
  const s = summarize(state);
  expect(s.phase).toBe("expedition");
  expect(s.expedition).not.toBeNull();
  expect(typeof s.expedition!.energy).toBe("number");
  expect(s.expedition!.pos).toEqual(state.expedition!.pos);
  expect(s.expedition!.carry).toEqual([]);
});

test("summarize: is JSON-serializable", () => {
  expect(() => JSON.stringify(summarize(newGame("s")))).not.toThrow();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test test/report.test.ts`
Expected: FAIL — cannot find module `../src/sim/report`.

- [ ] **Step 3: Implement `src/sim/report.ts`**

```ts
// Compact, JSON-serializable snapshot of a GameState for the CLI (M6). Read-only.
import type { GameState, ItemStack } from "../engine/types";

type ExpeditionSummary = {
  mapSeed: string;
  pos: { x: number; y: number };
  energy: number;
  hp: number;
  carry: ItemStack[];
  cleared: number;
};

export function summarize(state: GameState): {
  phase: GameState["phase"];
  bank: ItemStack[];
  loadout: GameState["loadout"];
  expedition: ExpeditionSummary | null;
} {
  const e = state.expedition;
  return {
    phase: state.phase,
    bank: state.bank,
    loadout: state.loadout,
    expedition: e
      ? {
          mapSeed: e.mapSeed,
          pos: e.pos,
          energy: e.energy,
          hp: e.hp,
          carry: e.carry,
          cleared: e.cleared.length,
        }
      : null,
  };
}
```

- [ ] **Step 4: Run the report test to verify it passes**

Run: `bun test test/report.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `src/sim/cli.ts`**

```ts
// JSON-driven CLI (M6): replay a seed + action list and print the result, so a
// human or an AI can drive the game headlessly by editing the action array.
//   bun run play <seed> '[{"type":"pack","slot":"food","itemId":"ration"}]'
// Because it is just play() underneath, advance the game by appending one action
// to the JSON array and re-running.
import { play } from "./play";
import { legalActions } from "./legal";
import { summarize } from "./report";
import type { Action } from "../engine/types";

const [seed, actionsArg] = process.argv.slice(2);
if (!seed) {
  console.error('usage: bun run play <seed> \'[actions json]\'');
  process.exit(1);
}
const actions: Action[] = actionsArg ? (JSON.parse(actionsArg) as Action[]) : [];
const { state, events } = play(seed, actions);

console.log("=== events ===");
for (const e of events) console.log(JSON.stringify(e));
console.log("=== state ===");
console.log(JSON.stringify(summarize(state), null, 2));
console.log("=== legalActions ===");
for (const a of legalActions(state)) console.log(JSON.stringify(a));
```

- [ ] **Step 6: Add the `play` script to `package.json`**

In the `scripts` block, add:

```json
    "play": "bun run src/sim/cli.ts",
```

- [ ] **Step 7: Smoke-test the CLI**

Run: `bun run play s '[{"type":"pack","slot":"food","itemId":"ration"},{"type":"embark","mapSeed":"s:map:0"}]'`
Expected: prints an `=== events ===` block (a `packed` then an `embarked` event), a `=== state ===` JSON snapshot with `"phase": "expedition"`, and a `=== legalActions ===` list that includes `{"type":"return"}`.

- [ ] **Step 8: Full gates**

Run: `bun test && bun run typecheck && bun run lint`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add src/sim/report.ts src/sim/cli.ts test/report.test.ts package.json
git commit -m "M6: JSON-driven CLI + summarize report"
```

---

## Task 5: Scripted full-loop test across ≥2 biomes (the acceptance)

**Files:**
- Test: `test/harness-loop.test.ts`

**Interfaces:**
- Consumes: `play`, `legalActions`, `newGame`, `generateGrid`, `rollBiome`.
- Produces: a test proving a JSON action stream drives a complete town→expedition→return→craft loop headlessly on two different biomes, and that `legalActions` never offers an action `reduce` rejects.

**Approach:** A greedy reference driver (in the test) plays a loop *through `legalActions` and the action stream* — the "AI plays via JSON actions" proof. It embarks, walks toward the nearest reachable gatherable POI (issuing `move` toward it), gathers, then returns. It reads the grid (as any UI would) to know where POIs are. Running it on seeds that embark into two different biomes proves biome variety.

- [ ] **Step 1: Write the test**

Create `test/harness-loop.test.ts`:

```ts
import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { legalActions } from "../src/sim/legal";
import { play } from "../src/sim/play";
import { newGame } from "../src/engine/town";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { GRID_SIZE } from "../src/data/constants";
import type { Action, GameState } from "../src/engine/types";
import type { BiomeId } from "../src/data/constants";

const accepts = (s: GameState, a: Action) =>
  reduce(s, a).events.every((e) => e.type !== "action-rejected");

// Greedy driver: pack a mining loadout, embark on `mapSeed`, walk to the nearest
// gatherable POI and gather, then return. Returns the full run + banked material
// count. Every action goes through reduce; legalActions is asserted en route.
function runLoop(seed: string, mapSeed: string): { state: GameState; gathered: boolean } {
  let state = newGame(seed);
  const pack = (a: Action) => { state = reduce(state, a).state; };
  pack({ type: "pack", slot: "tool", itemId: "pick" });
  pack({ type: "pack", slot: "tool", itemId: "axe" });
  pack({ type: "pack", slot: "tool", itemId: "knife" });
  pack({ type: "pack", slot: "backpack", itemId: "starter" });
  for (let i = 0; i < 4; i++) pack({ type: "pack", slot: "food", itemId: "ration" }); // 40 energy
  state = reduce(state, { type: "embark", mapSeed }).state;
  expect(state.phase).toBe("expedition");

  const grid = generateGrid(mapSeed, rollBiome(mapSeed));
  const gatherable = grid.pois.filter((p) => p.kind !== "monster" && p.material !== null);

  let gathered = false;
  // up to GRID_SIZE*2 steps: move toward the nearest uncleared gatherable POI,
  // gather when standing on one.
  for (let step = 0; step < GRID_SIZE * 2 && state.expedition; step++) {
    const legal = legalActions(state);
    for (const a of legal) expect(accepts(state, a)).toBe(true); // D29: no drift
    const here = state.expedition.pos;
    const onNode = gatherable.some(
      (p) => p.x === here.x && p.y === here.y &&
        !state.expedition!.cleared.some((c) => c.x === p.x && c.y === p.y),
    );
    if (onNode && legal.some((a) => a.type === "gather")) {
      state = reduce(state, { type: "gather" }).state;
      gathered = true;
      break;
    }
    // nearest uncleared gatherable POI
    const targets = gatherable.filter(
      (p) => !state.expedition!.cleared.some((c) => c.x === p.x && c.y === p.y),
    );
    if (targets.length === 0) break;
    targets.sort(
      (a, b) =>
        Math.max(Math.abs(a.x - here.x), Math.abs(a.y - here.y)) -
        Math.max(Math.abs(b.x - here.x), Math.abs(b.y - here.y)),
    );
    const move: Action = { type: "move", to: { x: targets[0]!.x, y: targets[0]!.y } };
    if (!accepts(state, move)) break; // blocked (impassable/exhausted)
    const before = here;
    state = reduce(state, move).state;
    const after = state.expedition!.pos;
    if (after.x === before.x && after.y === before.y) break; // no progress
  }

  state = reduce(state, { type: "return" }).state;
  expect(state.phase).toBe("town");
  return { state, gathered };
}

// Find CANDIDATE map seeds (derived like candidateMaps: `${seed}:map:${i}`) whose
// biome differs, so we prove the harness on ≥2 biomes.
function twoBiomeMaps(): { mapSeed: string; biome: BiomeId }[] {
  const byBiome = new Map<BiomeId, string>();
  for (let i = 0; i < 60 && byBiome.size < 2; i++) {
    const mapSeed = `hl:map:${i}`;
    const biome = rollBiome(mapSeed);
    if (!byBiome.has(biome)) byBiome.set(biome, mapSeed);
  }
  return [...byBiome.entries()].map(([biome, mapSeed]) => ({ mapSeed, biome }));
}

test("harness: a JSON action stream drives a full loop on two different biomes", () => {
  const maps = twoBiomeMaps();
  expect(maps.length).toBe(2);
  expect(maps[0]!.biome).not.toBe(maps[1]!.biome);
  for (const { mapSeed } of maps) {
    const { state, gathered } = runLoop("hl", mapSeed);
    expect(state.phase).toBe("town");
    expect(gathered).toBe(true); // walked to a node and gathered
    // banked at least one non-starter material (loot came home)
    const starter = new Set(["starter", "pick", "axe", "knife", "sword", "ration", "potion"]);
    expect(state.bank.some((s) => !starter.has(s.defId) && s.qty > 0)).toBe(true);
  }
});

test("harness: play() reproduces a hand-authored full loop headlessly", () => {
  // A fixed JSON action list (town → embark → return) drives play with no UI.
  const actions: Action[] = [
    { type: "pack", slot: "food", itemId: "ration" },
    { type: "pack", slot: "food", itemId: "ration" },
    { type: "embark", mapSeed: "hl:map:0" },
    { type: "return" },
  ];
  const { state, events } = play("hl", actions);
  expect(state.phase).toBe("town");
  expect(events.some((e) => e.type === "embarked")).toBe(true);
  expect(events.some((e) => e.type === "run-ended" && e.reason === "returned")).toBe(true);
});
```

- [ ] **Step 2: Run the harness loop test**

Run: `bun test test/harness-loop.test.ts`
Expected: PASS. If `twoBiomeMaps()` ever returns fewer than 2 within 60 seeds (astronomically unlikely with 3 biomes), widen the scan bound.

- [ ] **Step 3: Full gates**

Run: `bun test && bun run typecheck && bun run lint`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add test/harness-loop.test.ts
git commit -m "M6: scripted full-loop harness test across two biomes"
```

---

## Task 6: Play it live, docs, close

**Files:**
- Modify: `docs/superpowers/plans/2026-06-30-poc-core-loop-plan.md` (optional: note M6 done)

- [ ] **Step 1: Drive a real loop through the CLI**

Play the game headlessly by appending actions to the JSON array and re-running `bun run play`. Start with the town menu:

Run: `bun run play demo '[]'`
Read the `=== legalActions ===` block, pick a `pack`/`embark` action, append it, and re-run. Continue onto the map — inspect `legalActions`, `move` toward a POI, `gather`, `fight`/`scout` as offered, then `return`, then `craft` an upgrade. Capture the event log and state snapshots to show the loop working end-to-end (this is the M6 "an AI plays via JSON actions" acceptance, played live).

- [ ] **Step 2: Confirm the acceptance**

Verify against the bead: (a) a JSON action list drove a full loop headlessly (Task 5 + the live CLI run); (b) `legalActions` never offered an action `reduce` rejected (asserted in Tasks 3 + 5). Both hold.

- [ ] **Step 3: Full gates one last time**

Run: `bun test && bun run typecheck && bun run lint`
Expected: all green.

- [ ] **Step 4: Close the bead**

```bash
bd close idle-adventure-868.7 --reason="M6 complete: play(seed,actions), phase-split legalActions via speculative reduce (D29), closed RejectionReason union + already-cleared split (D30), JSON CLI; scripted full loop across 2 biomes green; drove a live loop via the CLI"
```

Report: changed files, `bun test` result, that M7 (Play & judge) is now unblocked, and the captured live-play transcript.

---

## Self-Review

**Spec coverage (M6 bead + plan §M6):**
- `play(seed, actions[]) → {state, events}` — Task 2. ✓
- `legalActions(state)` — Task 3; phase-split `townActions`/`expeditionActions` (D29). ✓
- Scripted full-loop test — Task 5; ≥2 biomes (bead note). ✓
- AI plays a full loop via JSON, no UI — Task 5 greedy driver + Task 6 live CLI. ✓
- `legalActions` matches `reduce` — guaranteed by construction (speculative filter) + asserted in Tasks 3, 5. ✓
- Bead note (a) return always-legal — Task 3 (candidate always pushed; zero-energy test). ✓
- Bead note (b) tighten rejection reasons to a closed union — Task 1 (D30). ✓
- Bead note (c) legalActions via speculative reduce — Task 3. ✓
- Bead note (d) don't assume `pois.length === POI_DENSITY` — the greedy driver iterates `grid.pois` directly, never indexes by density. ✓
- Bead note (e) split gather `no-node`/`already-cleared` — Task 1. ✓
- Contract note: embark stays `{type:'embark', mapSeed}`, biome re-derived from seed — unchanged; `candidateMaps`/`rollBiome` used. ✓

**Placeholder scan:** none — every step has full code or an exact command with expected output. Task 6's live play is an interactive demonstration by design, gated by Task 5's automated proof.

**Type consistency:** `RejectionReason` (Task 1) is used by `rejected()` and the `action-rejected` event; `accepts()` (Tasks 3, 5) uses the same "no `action-rejected` event" predicate; `play` returns `{state, events}` consumed identically by Tasks 3–5; `summarize` (Task 4) returns a JSON-safe shape; `legalActions`/`townActions`/`expeditionActions` all return `Action[]`. `slotOf` returns `LoadoutSlot | null` — the `null` guard in `townActions` matches.

**Deferred (already filed as beads):** on-map don/doff gear + manual potion; terrain-gating gear. Not in this plan.
