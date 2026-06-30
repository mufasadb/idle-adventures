# M0 — Skeleton & Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the TS project skeleton with a lint-enforced engine-purity boundary, a typed no-op `reduce`/`render`, and a lever-scaffold file — so every later milestone has a typed, guarded home to build into.

**Architecture:** One flat-but-disciplined TypeScript package. Folders `engine`/`data`/`sim`/`render`/`web` mirror the eventual monorepo packages. The engine is pure: an ESLint flat-config boundary rule (scoped to `src/engine/**`) forbids importing from `render`/`sim`/`web` and forbids `Math.random`/`Date.now`/DOM globals. The guardrail is itself a passing test (`boundary.test.ts` lints a violating fixture via the ESLint Node API and asserts it errors).

**Tech Stack:** TypeScript (strict, ESM) · bun (package manager + runtime) · `bun test` (native runner) · ESLint flat config + `typescript-eslint`.

## Global Constraints

- Engine is pure: no DOM, no `Math.random`/`Date.now`, no imports from `render`/`sim`/`web`. RNG (later) = `hash(state.seed, context)`. — copied from spec §7, §12.
- `GameState` holds **only the present**; the action list lives in the driver, not in state. — spec §10.
- All items are `{defId, qty}` referencing a code-side catalog. No per-instance item state. — spec §10.
- No magic numbers in engine logic — read every tunable from `src/data/`. — spec §13.
- `reduce(state: GameState, action: Action): { state: GameState; events: Event[] }` — pure, seed in state. — spec §10.
- Acceptance for M0 (bead idle-adventure-868.1): `bun test` green on a trivial test; an `engine → render` import fails lint; `GameState`/`Action` types compile.

---

## File Structure

```
package.json              bun project manifest; scripts: test, typecheck, lint
tsconfig.json             strict ESM, noEmit (bun runs TS directly)
eslint.config.js          flat config; engine-purity rules scoped to src/engine/**
src/
  engine/
    types.ts              GameState, Expedition, Equipment, Loadout, Action, ItemStack, Event (from spec §10)
    reduce.ts             pure reduce stub: exhaustive switch, no-op, returns {state, []}
  data/
    constants.ts          named lever groups (shapes + placeholder values) from balance-levers.md
  render/
    render.ts             render(state): string no-op stub, returns ''
  sim/                    (empty in M0 — M6 headless harness lands here)
  web/                    (empty in M0 — M1/M5 Vite view lands here)
test/
  engine.test.ts          trivial: reduce on a no-op action returns unchanged state + []
  boundary.test.ts        lints an engine→render violation via ESLint API, asserts it errors
```

**Responsibilities:** `engine/types.ts` is the single source of truth for the engine contract (every later task imports from it). `engine/reduce.ts` is the only place actions are interpreted. `data/constants.ts` is the only place tunables live. `render/render.ts` is a dumb view. `eslint.config.js` encodes the one discipline we keep.

---

## Task 1: Project init + sanity test

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `test/engine.test.ts` (temporary sanity test, replaced in Task 3)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: working `bun test` and `bun run typecheck` scripts; ESM TS module resolution.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "idle-adventure",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "bun test",
    "typecheck": "tsc --noEmit",
    "lint": "eslint ."
  },
  "devDependencies": {
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "types": ["bun"]
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Install dev deps**

Run: `bun add -d typescript @types/bun`
Expected: `bun.lock` created; `node_modules/` populated; exit 0.

- [ ] **Step 4: Write a temporary sanity test**

`test/engine.test.ts`:

```ts
import { test, expect } from "bun:test";

test("sanity: bun test runs", () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 5: Run the test to verify the harness works**

Run: `bun test`
Expected: PASS — `1 pass, 0 fail`.

- [ ] **Step 6: Verify typecheck runs clean**

Run: `bun run typecheck`
Expected: no output, exit 0.

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json bun.lock test/engine.test.ts
git commit -m "M0: bun + TS project skeleton with sanity test"
```

---

## Task 2: Engine types

**Files:**
- Create: `src/engine/types.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (exact, imported by every later task):
  - `type ItemStack = { defId: string; qty: number }`
  - `type GameState = { seed: string; phase: 'town' | 'expedition'; bank: ItemStack[]; expedition: Expedition | null }`
  - `type Action = { type: 'craft'; recipeId: string } | { type: 'pack'; slot: LoadoutSlot; itemId: string } | { type: 'embark'; mapSeed: string } | { type: 'move'; to: { x: number; y: number } } | { type: 'gather' } | { type: 'scout' } | { type: 'fight' } | { type: 'drop'; itemId: string } | { type: 'return' }`
  - `type GameEvent` (the events array element — named `GameEvent` to avoid colliding with the DOM `Event` global)
  - `type LoadoutSlot`

- [ ] **Step 1: Write the failing test**

`test/types.test.ts`:

```ts
import { test, expect } from "bun:test";
import type { GameState, Action } from "../src/engine/types";

test("types: a minimal GameState and Action are constructible", () => {
  const state: GameState = { seed: "s", phase: "town", bank: [], expedition: null };
  const action: Action = { type: "return" };
  expect(state.phase).toBe("town");
  expect(action.type).toBe("return");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test test/types.test.ts`
Expected: FAIL — cannot resolve `../src/engine/types`.

- [ ] **Step 3: Write `src/engine/types.ts`**

```ts
// The engine contract — single source of truth for state, actions, events.
// Lifted from the design spec §10. Pure data; no behaviour here.

export type ItemStack = { defId: string; qty: number }; // fungible; gear referenced by defId too

export type Equipment = {
  weapon: string | null; // defId → { dmgType: melee|ranged|magic, tags:[silver|...] } in the catalog
  helmet: string | null;
  chest: string | null;
  legs: string | null;
  boots: string | null;
  gloves: string | null; // each piece's defId → { armourType: plate|light|robe, defense }
  tools: string[]; // pick, axe, fishing rod, spyglass — capabilities
  transport: string | null;
  backpack: string | null;
};

export type Loadout = {
  equipment: Equipment;
  food: ItemStack[];
  potions: ItemStack[];
};

export type Expedition = {
  mapSeed: string;
  pos: { x: number; y: number };
  energy: number; // from packed food; spent on move/gather
  hp: number; // drained by combat, refilled by potions
  loadout: Loadout;
  carry: ItemStack[]; // capped by backpack slots
  // grid regenerated from mapSeed on demand, not stored
};

export type GameState = {
  seed: string;
  phase: "town" | "expedition";
  bank: ItemStack[]; // materials + crafted gear (persists across runs)
  expedition: Expedition | null;
};

// Loadout slots an action can target when packing.
export type LoadoutSlot =
  | "weapon"
  | "helmet"
  | "chest"
  | "legs"
  | "boots"
  | "gloves"
  | "tool"
  | "transport"
  | "backpack"
  | "food"
  | "potion";

export type Action =
  | { type: "craft"; recipeId: string }
  | { type: "pack"; slot: LoadoutSlot; itemId: string }
  | { type: "embark"; mapSeed: string }
  | { type: "move"; to: { x: number; y: number } } // steps ONE tile toward target
  | { type: "gather" }
  | { type: "scout" }
  | { type: "fight" }
  | { type: "drop"; itemId: string }
  | { type: "return" };

// Events are a render byproduct emitted by reduce. Named GameEvent (not Event)
// to avoid colliding with the DOM Event global, which engine code must not use.
// Concrete variants are added per-milestone as systems land (see notes in beads).
export type GameEvent = { type: string; [key: string]: unknown };
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test test/types.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: clean, exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/engine/types.ts test/types.test.ts
git commit -m "M0: engine contract types (spec §10)"
```

---

## Task 3: reduce + render stubs + trivial engine test

**Files:**
- Create: `src/engine/reduce.ts`
- Create: `src/render/render.ts`
- Modify: `test/engine.test.ts` (replace the Task 1 sanity test)

**Interfaces:**
- Consumes: `GameState`, `Action`, `GameEvent` from `src/engine/types.ts`.
- Produces:
  - `reduce(state: GameState, action: Action): { state: GameState; events: GameEvent[] }`
  - `render(state: GameState): string`

- [ ] **Step 1: Write the failing test (replace `test/engine.test.ts` entirely)**

```ts
import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import type { GameState } from "../src/engine/types";

const baseState: GameState = { seed: "seed-1", phase: "town", bank: [], expedition: null };

test("reduce: a no-op-yielding action returns unchanged state and no events", () => {
  const { state, events } = reduce(baseState, { type: "return" });
  expect(state).toEqual(baseState);
  expect(events).toEqual([]);
});

test("reduce: does not mutate the input state object", () => {
  const input: GameState = { seed: "seed-1", phase: "town", bank: [], expedition: null };
  reduce(input, { type: "return" });
  expect(input).toEqual(baseState);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test test/engine.test.ts`
Expected: FAIL — cannot resolve `../src/engine/reduce`.

- [ ] **Step 3: Write `src/engine/reduce.ts`**

```ts
import type { GameState, Action, GameEvent } from "./types";

// Pure reducer. M0 stub: every action is a no-op that returns state unchanged.
// The exhaustive switch is the skeleton later milestones fill in:
//   move/gather/scout/fight    → M2–M4
//   craft/pack/embark/return/drop → M2, M5
// Adding a new Action variant without a case here is a compile error (assertNever).
export function reduce(
  state: GameState,
  action: Action,
): { state: GameState; events: GameEvent[] } {
  switch (action.type) {
    case "craft":
    case "pack":
    case "embark":
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

function assertNever(x: never): never {
  throw new Error(`Unhandled action: ${JSON.stringify(x)}`);
}
```

- [ ] **Step 4: Write `src/render/render.ts`**

```ts
import type { GameState } from "../engine/types";

// Dumb view: state → string. M0 stub returns empty.
// M1 replaces this with the 20×20 grid serialization (text for snapshots, CSS grid for web).
export function render(_state: GameState): string {
  return "";
}
```

- [ ] **Step 5: Run to verify the test passes**

Run: `bun test test/engine.test.ts`
Expected: PASS — both tests green.

- [ ] **Step 6: Typecheck**

Run: `bun run typecheck`
Expected: clean, exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/engine/reduce.ts src/render/render.ts test/engine.test.ts
git commit -m "M0: typed no-op reduce + render stubs"
```

---

## Task 4: Lever scaffold

**Files:**
- Create: `src/data/constants.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: named, `as const` lever groups (shapes + placeholder values). Real feel-pass numbers land per-milestone (M1 fills map/POI levers, M2 energy, etc.).

- [ ] **Step 1: Write the failing test**

`test/constants.test.ts`:

```ts
import { test, expect } from "bun:test";
import { GRID_SIZE, TERRAIN_COST, BACKPACK_SLOTS } from "../src/data/constants";

test("constants: lever groups exist with the documented shape", () => {
  expect(typeof GRID_SIZE).toBe("number");
  expect(TERRAIN_COST).toHaveProperty("ice");
  expect(BACKPACK_SLOTS).toHaveProperty("starter");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test test/constants.test.ts`
Expected: FAIL — cannot resolve `../src/data/constants`.

- [ ] **Step 3: Write `src/data/constants.ts`**

```ts
// Balance levers. POC ships feel-pass values, not balanced ones.
// Discipline: engine logic NEVER hardcodes a number — it reads a lever from here.
// M0 defines the NAMES and SHAPES with placeholder values; each milestone fills in
// the real numbers for its system. See docs/balance-levers.md.

// --- Map & forecast (filled in M1) ---
export const GRID_SIZE = 20; // tiles per side (placeholder — see M1)
export const POI_DENSITY = 0; // POIs per map (placeholder — see M1)
export const POI_MIN_SPACING = 0; // min tiles between POIs (placeholder — see M1)
export const NOISE_THRESHOLDS = {} as Record<string, number>; // terrain cutoffs (placeholder — M1)
export const CANDIDATE_MAP_COUNT = 3; // town map choices (spec §11)
export const PREVIEW_FIDELITY = 0; // how much a preview reveals (placeholder — M5)

// --- Energy economy (filled in M2) ---
export const ENERGY_PER_FOOD = 0; // energy per packed food item (placeholder — M2)
export const MOVE_BASE_COST = 0; // energy per tile on neutral ground (placeholder — M2)
export const TERRAIN_COST = {
  plains: 0,
  mud: 0,
  ice: 0,
  river: 0,
  mountain: 0,
} as const; // per-terrain multiplier (placeholder — M2)
export const TRANSPORT_MULTIPLIER = {} as Record<string, number>; // move-cost reduction (placeholder — M2)

// --- Carry (filled in M3) ---
export const BACKPACK_SLOTS = { starter: 0 } as Record<string, number>; // slots per backpack tier (placeholder — M3)
export const STACK_CAP = 0; // max qty per stack (placeholder — M3)

// --- Gathering (filled in M3) ---
export const NODE_HARDNESS = {} as Record<string, number>; // by node type/tier (placeholder — M3)
export const TOOL_QUALITY = {} as Record<string, number>; // by tool (placeholder — M3)
export const GATHER_YIELD = {} as Record<string, number>; // by node (placeholder — M3)

// --- Combat (filled in M4) ---
export const PLAYER_BASE_HP = 0; // (placeholder — M4)
export const DMG_ARMOUR_MATRIX = {
  melee: { plate: 1.0, light: 1.25, robe: 1.5 },
  ranged: { plate: 0.5, light: 1.0, robe: 1.5 },
  magic: { plate: 1.5, light: 1.0, robe: 0.5 },
} as const; // visible dmg×armour matrix (values from spec §5 — the one table settled now)
export const ARMOUR_DEFENSE = {} as Record<string, number>; // by piece/tier (placeholder — M4)
export const AFFINITY_MULTIPLIER = 1; // hidden affinity effect, e.g. silver↔werewolf (placeholder — M4)
export const POTION_HEAL = 0; // (placeholder — M4)
export const AUTO_POTION_THRESHOLD = 0; // HP fraction to auto-quaff (placeholder — M4)
export const MONSTER_TIER_HP_CURVE = {} as Record<string, number>; // (placeholder — M4)
export const MONSTER_TIER_DMG_CURVE = {} as Record<string, number>; // (placeholder — M4)
export const LOOT_TABLE = {} as Record<string, ItemStackSpec[]>; // by monster (placeholder — M4)

// --- Crafting (filled in M5) ---
export const RECIPE = {} as Record<string, { inputs: ItemStackSpec[]; output: ItemStackSpec }>; // (placeholder — M5)

type ItemStackSpec = { defId: string; qty: number };
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test test/constants.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: clean, exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/data/constants.ts test/constants.test.ts
git commit -m "M0: lever scaffold (names + shapes, placeholder values)"
```

---

## Task 5: ESLint flat config + engine-purity boundary, proven by test

**Files:**
- Create: `eslint.config.js`
- Create: `test/boundary.test.ts`

**Interfaces:**
- Consumes: the `src/engine/**` glob, the ESLint Node API (`ESLint` from `eslint`).
- Produces: a lint setup where (a) `bun run lint` passes on the real `src` tree, and (b) any engine→render/sim/web import or `Math.random`/`Date.now`/DOM-global use under `src/engine/**` raises an error.

- [ ] **Step 1: Install ESLint + TS plugin**

Run: `bun add -d eslint @eslint/js typescript-eslint`
Expected: deps added; exit 0.

- [ ] **Step 2: Create `eslint.config.js`**

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";

// Restricted-import patterns for the engine boundary. Engine code must not reach
// into render/sim/web — by path (../render/...) or by any specifier containing those segments.
const engineForbiddenZones = [
  { group: ["**/render/**", "**/render", "*/render/*"], message: "engine must not import from render (purity boundary)" },
  { group: ["**/sim/**", "**/sim", "*/sim/*"], message: "engine must not import from sim (purity boundary)" },
  { group: ["**/web/**", "**/web", "*/web/*"], message: "engine must not import from web (purity boundary)" },
];

export default tseslint.config(
  { ignores: ["node_modules/**", "bun.lock"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Engine-purity boundary — the one discipline we keep (spec §7, §12; decision D17).
    files: ["src/engine/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: engineForbiddenZones }],
      "no-restricted-globals": [
        "error",
        { name: "document", message: "engine is pure: no DOM" },
        { name: "window", message: "engine is pure: no DOM" },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "engine is deterministic: use hash(state.seed, ctx)" },
        { object: "Date", property: "now", message: "engine is deterministic: no wall-clock" },
      ],
    },
  },
);
```

- [ ] **Step 3: Verify lint passes on the real tree**

Run: `bun run lint`
Expected: no errors, exit 0. (If `typescript-eslint` flags unused `_state`/`_x`, confirm they're prefixed with `_`; the tsconfig already allows that via convention — adjust the rule or prefix as needed so real code is clean.)

- [ ] **Step 4: Write the failing boundary test**

`test/boundary.test.ts`:

```ts
import { test, expect } from "bun:test";
import { ESLint } from "eslint";

// Proves the engine-purity guardrail without committing a violating file:
// lintText with a src/engine/** filePath applies the engine-scoped rules.
const eslint = new ESLint();

async function lintAsEngineFile(code: string) {
  const results = await eslint.lintText(code, { filePath: "src/engine/__fixture__.ts" });
  return results[0]?.messages ?? [];
}

test("boundary: engine importing from render is a lint error", async () => {
  const messages = await lintAsEngineFile(`import { render } from "../render/render";\nexport const x = render;\n`);
  const restricted = messages.filter((m) => m.ruleId === "no-restricted-imports");
  expect(restricted.length).toBeGreaterThan(0);
});

test("boundary: engine using Math.random is a lint error", async () => {
  const messages = await lintAsEngineFile(`export const r = Math.random();\n`);
  const restricted = messages.filter((m) => m.ruleId === "no-restricted-properties");
  expect(restricted.length).toBeGreaterThan(0);
});

test("boundary: engine using Date.now is a lint error", async () => {
  const messages = await lintAsEngineFile(`export const t = Date.now();\n`);
  const restricted = messages.filter((m) => m.ruleId === "no-restricted-properties");
  expect(restricted.length).toBeGreaterThan(0);
});

test("boundary: a clean engine module passes", async () => {
  const messages = await lintAsEngineFile(`export const ok = 1 + 1;\n`);
  const errors = messages.filter((m) => m.severity === 2);
  expect(errors.length).toBe(0);
});
```

- [ ] **Step 5: Run to verify the boundary test passes**

Run: `bun test test/boundary.test.ts`
Expected: PASS — all four cases green. (If a case fails, the rule glob/patterns are wrong — fix `eslint.config.js`, not the test.)

- [ ] **Step 6: Run the full suite + typecheck + lint together**

Run: `bun test && bun run typecheck && bun run lint`
Expected: all green, exit 0 — this is the M0 acceptance gate.

- [ ] **Step 7: Commit**

```bash
git add eslint.config.js test/boundary.test.ts bun.lock package.json
git commit -m "M0: ESLint engine-purity boundary, proven by boundary.test.ts"
```

---

## Task 6: Doc trail + bead notes

**Files:**
- Modify: `docs/decisions.md` (add D20)
- Modify: `docs/superpowers/plans/2026-06-30-poc-core-loop-plan.md` (`pnpm test` → `bun test`)
- Beads: update acceptance wording on `idle-adventure-868.1`; note stub-owners on downstream beads.

**Interfaces:**
- Consumes: the decisions already made this session.
- Produces: a coherent doc + bead trail so the next agent sees why bun and where each stub gets filled.

- [ ] **Step 1: Add D20 to `docs/decisions.md`** (append a row to the decision table)

```
| D20 | Tooling: bun (package manager + runtime) + `bun test` (native runner); ESLint flat config for the engine-purity boundary | pnpm not present on the machine; bun is already installed and fast. Native `bun test` gives jest-compatible snapshots with zero extra deps. Supersedes the spec's "Vitest"/`pnpm` wording for the POC; the boundary discipline (D17) is unchanged |
```

- [ ] **Step 2: Fix the stale `pnpm test` reference in the plan**

In `docs/superpowers/plans/2026-06-30-poc-core-loop-plan.md`, M0 acceptance line: change `pnpm test` → `bun test`.

- [ ] **Step 3: Update the M0 bead acceptance wording**

```bash
bd update idle-adventure-868.1 --notes="Tooling settled (D20): bun + bun test + ESLint flat config. Acceptance reads 'bun test' (was pnpm test). Guardrail proven by test/boundary.test.ts via the ESLint Node API."
```

- [ ] **Step 4: Note stub-owners on downstream beads** (so every M0 stub has a documented home — per the session instruction)

```bash
# render stub → M1 fills it with the 20×20 grid serialization
bd update idle-adventure-868.2 --notes="Replaces the M0 render() no-op stub (src/render/render.ts) with the 20×20 grid text+CSS serialization. Fills map/POI levers in src/data/constants.ts (GRID_SIZE, POI_DENSITY, POI_MIN_SPACING, NOISE_THRESHOLDS)."
# reduce move/embark + energy levers → M2
bd update idle-adventure-868.3 --notes="Fills reduce() cases embark/move (src/engine/reduce.ts) and the energy levers (ENERGY_PER_FOOD, MOVE_BASE_COST, TERRAIN_COST, TRANSPORT_MULTIPLIER)."
# reduce gather/drop + carry/gather levers → M3
bd update idle-adventure-868.4 --notes="Fills reduce() cases gather/drop and the carry+gathering levers (BACKPACK_SLOTS, STACK_CAP, NODE_HARDNESS, TOOL_QUALITY, GATHER_YIELD)."
# reduce scout/fight + combat levers + GameEvent variants → M4
bd update idle-adventure-868.5 --notes="Fills reduce() cases scout/fight, the combat levers (PLAYER_BASE_HP, ARMOUR_DEFENSE, AFFINITY_MULTIPLIER, POTION_HEAL, AUTO_POTION_THRESHOLD, MONSTER_TIER_*_CURVE, LOOT_TABLE), and adds concrete GameEvent variants for combat (the M0 GameEvent type is an open placeholder)."
# reduce craft/pack/return + crafting levers → M5
bd update idle-adventure-868.6 --notes="Fills reduce() cases craft/pack/return and the crafting/preview levers (RECIPE, PREVIEW_FIDELITY, CANDIDATE_MAP_COUNT). Closes the loop."
# sim/ harness → M6
bd update idle-adventure-868.7 --notes="Fills the empty src/sim/ folder: play(seed, actions[]) harness + legalActions(state)."
```

- [ ] **Step 5: Commit the doc changes**

```bash
git add docs/decisions.md docs/superpowers/plans/2026-06-30-poc-core-loop-plan.md
git commit -m "M0: record D20 (bun tooling); fix pnpm->bun; note stub owners"
```

- [ ] **Step 6: Close the M0 bead** (only after the Task 5 acceptance gate was green)

```bash
bd close idle-adventure-868.1
```

---

## Self-Review

**Spec coverage (M0 acceptance, bead 868.1):**
- `bun test` green on a trivial test → Task 1 (sanity) + Task 3 (reduce no-op). ✓
- `engine → render` import fails lint → Task 5 boundary rule + `boundary.test.ts`. ✓
- `GameState`/`Action` types compile → Task 2 + `bun run typecheck`. ✓
- ESLint engine-purity boundary (spec §7/§12, D17) → Task 5. ✓
- Lever scaffold, no magic numbers (spec §13, D18) → Task 4. ✓
- Folders mirror future packages (spec §12) → File Structure (engine/data/sim/render/web). ✓
- Typed no-op reduce + render (plan M0) → Task 3. ✓

**Stub ownership (session instruction):** render no-op → M1 (868.2); reduce cases → M2–M5 (868.3–.6); empty `sim/` → M6 (868.7); empty `web/` → M1/M5 (rendered noted under .2/.6); open `GameEvent` type → M4 (868.5). All noted on beads in Task 6. No orphan stub needs a new bead. ✓

**Placeholder scan:** every code step contains complete, runnable content; no TODO/TBD left as work. The "placeholder" lever *values* are intentional and documented (named-placeholders decision), each tagged with the milestone that fills it. ✓

**Type consistency:** `reduce` signature `(GameState, Action) → { state, events: GameEvent[] }` consistent across Task 2 (definition), Task 3 (impl), and tests. `GameEvent` (not `Event`) used everywhere to avoid the DOM global. `LoadoutSlot` defined in Task 2, referenced by `Action`'s `pack` variant. ✓
