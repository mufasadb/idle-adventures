# Monster Categories + Humanoid Map Drops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every monster gets a category; humanoids (one per biome) drop map scrolls that cost a carry slot to haul home, where they become held maps (`state.maps`).

**Architecture:** Pure-engine feature. A `category` field on `Monster` feeds a new `CATEGORY_LOOT_TABLE` merged into `rollLoot`. `fightAt` intercepts the `map-scroll` defId and mints a `MapItem` deterministically (namespaced seed → `rollBiome` derives the biome, uniform-random) into a new `Expedition.carriedMaps` field, which debits loot capacity and banks into `state.maps` at every run end. A `drop-map` action discards mid-run. Web + console surfaces read the new events/state.

**Tech Stack:** TypeScript, bun test, ESLint engine-purity boundary.

**Spec:** `docs/superpowers/specs/2026-07-06-monster-categories-humanoid-map-drops-design.md`
**Bead:** idle-adventure-8ec (claim before starting: `bd update idle-adventure-8ec --claim`)

## Global Constraints

- Engine purity: no DOM / `Math.random` / `Date.now` / render-sim-web imports under `src/engine/**` (lint + `test/boundary.test.ts` enforce).
- Items stay `{defId, qty}` — the minted `MapItem` lives in `Expedition.carriedMaps`, never in `carry`.
- No magic numbers in engine logic — `MAP_DROP_CHANCE = 0.5` is a named lever in `src/data/constants.ts`, documented in `docs/balance-levers.md`.
- All randomness via `rand(seed, ...context)` / seed-string namespacing (`src/engine/rng.ts`).
- Optional new state fields follow the existing old-saves pattern: `carriedMaps?: MapItem[]`, reads guard with `?? []`.
- Quality gates per task: `bun test`, `bun run typecheck`, `bun run lint`.
- Task tracking is beads (bd), NOT TodoWrite/TaskCreate.
- Commits: standing authority to commit to `main` (see CLAUDE.md Git & Sync Policy).

---

### Task 1: Monster `category` field + two new humanoids

**Files:**
- Modify: `src/data/constants.ts` (Monster type ~line 279, MONSTERS, creatureTables ~lines 50/61/72, LOOT_TABLE ~line 357)
- Test: `test/catalog.test.ts` (append)

**Interfaces:**
- Produces: `MonsterCategory` union type; `Monster.category: MonsterCategory` (required); monsters `forest-bandit` (woodland, tier 1) and `snow-marauder` (tundra, tier 2).

- [ ] **Step 1: Write the failing tests** — append to `test/catalog.test.ts`:

```ts
import { MONSTERS, BIOMES, LOOT_TABLE } from "../src/data/constants";

test("every monster has a category", () => {
  for (const [id, m] of Object.entries(MONSTERS)) {
    expect(["beast", "humanoid", "fae", "undead", "giant", "dragon"]).toContain(m.category);
  }
});

test("each biome spawns a humanoid — map-hunting is viable anywhere", () => {
  for (const [biomeId, biome] of Object.entries(BIOMES)) {
    const hasHumanoid = biome.creatureTable.some((c) => MONSTERS[c]?.category === "humanoid");
    expect(hasHumanoid).toBe(true);
  }
});

test("new humanoids have loot and ordinary tiers", () => {
  expect(MONSTERS["forest-bandit"]).toMatchObject({ tier: 1, category: "humanoid" });
  expect(MONSTERS["snow-marauder"]).toMatchObject({ tier: 2, category: "humanoid" });
  expect(LOOT_TABLE["forest-bandit"]).toEqual([{ defId: "raider-supplies", qty: 1 }]);
  expect(LOOT_TABLE["snow-marauder"]).toEqual([{ defId: "raider-supplies", qty: 1 }]);
});
```

(Adapt imports to the file's existing import block — `MONSTERS`/`LOOT_TABLE` may already be imported.)

- [ ] **Step 2: Run to verify failure**

Run: `bun test test/catalog.test.ts`
Expected: FAIL — `category` undefined, `forest-bandit` missing. Also `bun run typecheck` still passes (no type change yet).

- [ ] **Step 3: Implement in `src/data/constants.ts`**

Type change (~line 279):

```ts
export type MonsterCategory = "beast" | "humanoid" | "fae" | "undead" | "giant" | "dragon";
export type Monster = { tier: number; dmgType: DmgType; armourType: ArmourType; category: MonsterCategory; tags: string[] };
```

Add `category` to every existing entry — beast: `forest-boar`, `snow-wolf`, `werewolf`, `giant-scorpion`; humanoid: `sand-raider`; fae: `fae-sprite`, `frost-fae`; undead: `dust-vampire`; giant: `ice-troll`; dragon: `ancient-wyrm`. Add the two new monsters (ordinary difficulty — not a tougher tier, per spec §2):

```ts
"forest-bandit": { tier: 1, dmgType: "melee", armourType: "light", category: "humanoid", tags: [] },
"snow-marauder": { tier: 2, dmgType: "ranged", armourType: "light", category: "humanoid", tags: [] },
```

Comment the category field once at the type: categories are the "hunt this kind for that resource" legibility layer (beasts → hides, humanoids → maps, fae → potion dust) and key `CATEGORY_LOOT_TABLE` (Task 2) — no combat effect.

Spawn tables: append `"forest-bandit"` to the woodland `creatureTable` (~line 50) and `"snow-marauder"` to tundra (~line 72). **Note:** tundra's comment says the wyrm is ~1-in-4 monster POIs — appending makes it 1-in-5 and shifts creature indices on existing seeds; update that comment.

LOOT_TABLE (~line 357):

```ts
"forest-bandit": [{ defId: "raider-supplies", qty: 1 }],
"snow-marauder": [{ defId: "raider-supplies", qty: 1 }],
```

- [ ] **Step 4: Run gates; review snapshot fallout**

Run: `bun test && bun run typecheck && bun run lint`
Expected: catalog tests PASS. Generation-dependent tests/snapshots (grid/render/play/engine) may fail because creatureTable indices shifted. Review each diff — if it's only creature identity shifting on procedurally scanned maps, update snapshots with `bun test --update-snapshots` and re-run green. Any other failure is a real bug: stop and fix.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(8ec): monster category field + forest-bandit & snow-marauder humanoids"
```

---

### Task 2: `CATEGORY_LOOT_TABLE` + `MAP_DROP_CHANCE`, merged in `rollLoot`

**Files:**
- Modify: `src/data/constants.ts` (after LOOT_TABLE), `src/engine/combat.ts:55-70` (`rollLoot`), `docs/balance-levers.md` (maps section, near line 44)
- Test: `test/combat.test.ts` (append)

**Interfaces:**
- Consumes: `Monster.category`, `MonsterCategory` (Task 1).
- Produces: `MAP_SCROLL_ID = "map-scroll"`, `MAP_DROP_CHANCE = 0.5`, `CATEGORY_LOOT_TABLE: Record<MonsterCategory, ItemStackSpec[]>`; `rollLoot` (same signature) now also rolls category entries. Interim state: humanoid victories drop `map-scroll` as a plain material stack until Task 3 intercepts it.

- [ ] **Step 1: Write the failing tests** — append to `test/combat.test.ts`:

```ts
import { rollLoot } from "../src/engine/combat";
import { rand } from "../src/engine/rng";
import { MAP_DROP_CHANCE, MAP_SCROLL_ID } from "../src/data/constants";

test("rollLoot merges category loot: humanoids roll a map-scroll at MAP_DROP_CHANCE", () => {
  // find tiles where the deterministic roll passes and fails
  const hit = { x: 1, y: 1 };
  let miss = { x: 2, y: 2 };
  let seedHit = "", seedMiss = "";
  for (let i = 0; i < 200 && (!seedHit || !seedMiss); i++) {
    const s = `cat-loot-${i}`;
    const roll = rand(s, "loot", "sand-raider", hit.x, hit.y, MAP_SCROLL_ID);
    if (roll < MAP_DROP_CHANCE && !seedHit) seedHit = s;
    if (roll >= MAP_DROP_CHANCE && !seedMiss) { seedMiss = s; miss = hit; }
  }
  const lootHit = rollLoot(seedHit, "sand-raider", hit);
  expect(lootHit).toContainEqual({ defId: MAP_SCROLL_ID, qty: 1 });
  expect(lootHit).toContainEqual({ defId: "raider-supplies", qty: 1 }); // monster table still applies
  const lootMiss = rollLoot(seedMiss, "sand-raider", miss);
  expect(lootMiss.some((s) => s.defId === MAP_SCROLL_ID)).toBe(false);
});

test("non-humanoid categories add no loot (empty category tables)", () => {
  const loot = rollLoot("beast-seed", "forest-boar", { x: 3, y: 3 });
  expect(loot).toEqual([{ defId: "boar-hide", qty: 2 }]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test test/combat.test.ts`
Expected: FAIL — `MAP_DROP_CHANCE`/`MAP_SCROLL_ID`/category merge missing.

- [ ] **Step 3: Implement**

`src/data/constants.ts`, directly after `LOOT_TABLE`:

```ts
// Category-level loot (8ec): rolled IN ADDITION to the monster's own LOOT_TABLE
// entries, so loot can hang off a specific monster, a whole category, or both.
// Humanoids are the map category: a regular-but-not-guaranteed map-scroll drop
// (MAP_DROP_CHANCE lever). fightAt intercepts MAP_SCROLL_ID — it never enters
// carry as a material (spec §4).
export const MAP_SCROLL_ID = "map-scroll";
export const MAP_DROP_CHANCE = 0.5; // lever: humanoid map-drop rate (docs/balance-levers.md)
export const CATEGORY_LOOT_TABLE: Record<MonsterCategory, ItemStackSpec[]> = {
  beast: [],
  humanoid: [{ defId: MAP_SCROLL_ID, qty: 1, chance: MAP_DROP_CHANCE }],
  fae: [],
  undead: [],
  giant: [],
  dragon: [],
};
```

`src/engine/combat.ts` — in `rollLoot`, replace the entries loop source (add `CATEGORY_LOOT_TABLE` to the existing constants import):

```ts
  const entries = [
    ...(LOOT_TABLE[creature] ?? []),
    ...(CATEGORY_LOOT_TABLE[MONSTERS[creature]?.category ?? "beast"] ?? []),
  ];
  for (const entry of entries) {
    // (existing chance/rand logic unchanged — the rand key already includes defId,
    // so monster + category entries stay independent)
```

Guard note: `MONSTERS[creature]?.category ?? "beast"` keeps unknown test creatures harmless (beast table is empty).

`docs/balance-levers.md` — in the held-maps bullet area (~line 44), add:

```md
- `MAP_DROP_CHANCE` (0.5, 8ec) — humanoid-kill map-scroll drop rate (`CATEGORY_LOOT_TABLE.humanoid`). Regular but not guaranteed: humanoids reliably mean maps over a few kills without every kill printing one. 1.0 = guaranteed if map supply feels starved; the carry-slot cost is the real limiter.
```

- [ ] **Step 4: Run gates**

Run: `bun test && bun run typecheck && bun run lint`
Expected: PASS. (`test/reduce-fight.test.ts` fights `forest-boar` — unaffected. If any fight test targets a humanoid, its carry expectation now includes a possible `map-scroll` stack; that's the documented interim state — adjust the expectation using `rollLoot`'s output as those tests already do.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(8ec): CATEGORY_LOOT_TABLE + MAP_DROP_CHANCE lever, merged in rollLoot"
```

---

### Task 3: Map mint in `fightAt` + `carriedMaps` slot debit

**Files:**
- Modify: `src/engine/types.ts` (Expedition ~line 28, GameEvent union ~line 145), `src/engine/carry.ts` (new helper), `src/engine/town.ts:35` (export `previewHints`), `src/engine/reduce.ts` (gather ~line 243, `fightAt` ~lines 305-360, embark expedition literal ~line 90)
- Test: Create `test/reduce-map-drop.test.ts`

**Interfaces:**
- Consumes: `MAP_SCROLL_ID`, `rollLoot` merge (Task 2), `rollBiome` (`src/engine/grid.ts`), `MapItem` (`src/engine/types.ts:43`).
- Produces: `Expedition.carriedMaps?: MapItem[]`; `freeLootStacks(loadout, carriedMaps)` in carry.ts; GameEvent `{ type: "map-dropped"; at; mapSeed; biomeId; hints: string[]; carried: boolean }`; exported `previewHints(mapSeed, biomeId)`; mint seed format `` `${expedition.mapSeed}:drop:${x},${y}` ``.

- [ ] **Step 1: Write the failing tests** — create `test/reduce-map-drop.test.ts`:

```ts
import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { generateGrid, rollBiome } from "../src/engine/grid";
import type { Grid, Poi } from "../src/engine/grid";
import { rand } from "../src/engine/rng";
import { MAP_DROP_CHANCE, MAP_SCROLL_ID, PLAYER_BASE_HP, BASE_CARRY_SLOTS, STACK_CAP } from "../src/data/constants";
import type { GameState, Loadout, MapItem } from "../src/engine/types";

// Find a map with a humanoid the base sword build beats, where the map-scroll
// roll PASSES (drop=true) or FAILS (drop=false) on the game seed "g".
function humanoidFight(drop: boolean): { seed: string; poi: Poi } {
  for (let i = 0; i < 2000; i++) {
    const seed = `8ec-scan-${i}`;
    const grid = generateGrid(seed, rollBiome(seed));
    const poi = grid.pois.find((p) => p.kind === "monster" && (p.creature === "sand-raider" || p.creature === "forest-bandit"));
    if (!poi) continue;
    const roll = rand("g", "loot", poi.creature!, poi.x, poi.y, MAP_SCROLL_ID);
    if ((roll < MAP_DROP_CHANCE) === drop) return { seed, poi };
  }
  throw new Error("no suitable humanoid map in scan range");
}

function atMonster(seed: string, poi: Poi, mutate?: (s: GameState) => void): GameState {
  const loadout = emptyLoadout();
  loadout.equipment.weapon = "sword";
  const state: GameState = {
    seed: "g",
    phase: "expedition",
    bank: [],
    loadout: emptyLoadout(),
    runs: 3,
    expedition: { mapSeed: seed, pos: { x: poi.x, y: poi.y }, energy: 50, hp: PLAYER_BASE_HP, loadout, carry: [], cleared: [] },
  };
  mutate?.(state);
  return state;
}

test("humanoid victory mints a carried map: deterministic seed, biome from rollBiome, vintage=runs", () => {
  const { seed, poi } = humanoidFight(true);
  const { state, events } = reduce(atMonster(seed, poi), { type: "fight" });
  const expectedSeed = `${seed}:drop:${poi.x},${poi.y}`;
  const maps = state.expedition!.carriedMaps ?? [];
  expect(maps).toEqual([{ mapSeed: expectedSeed, biomeId: rollBiome(expectedSeed), vintage: 3 }]);
  expect(events).toContainEqual({
    type: "map-dropped", at: { x: poi.x, y: poi.y }, mapSeed: expectedSeed,
    biomeId: rollBiome(expectedSeed), hints: [], carried: true,
  });
  // the scroll never enters carry as a material
  expect(state.expedition!.carry.some((s) => s.defId === MAP_SCROLL_ID)).toBe(false);
  const fought = events.find((e) => e.type === "fought") as { loot: { defId: string }[] };
  expect(fought.loot.some((s) => s.defId === MAP_SCROLL_ID)).toBe(false);
});

test("no roll, no map", () => {
  const { seed, poi } = humanoidFight(false);
  const { state, events } = reduce(atMonster(seed, poi), { type: "fight" });
  expect(state.expedition!.carriedMaps ?? []).toEqual([]);
  expect(events.some((e) => e.type === "map-dropped")).toBe(false);
});

test("full pack: map left behind (carried:false), fight unaffected", () => {
  const { seed, poi } = humanoidFight(true);
  const before = atMonster(seed, poi, (s) => {
    // fill every free slot with distinct full stacks, leaving room for the
    // fight's material loot merge but no free stack for the map
    const free = BASE_CARRY_SLOTS; // no consumables/tools packed in this terse state
    s.expedition!.carry = Array.from({ length: free - 1 }, (_, i) => ({ defId: `filler-${i}`, qty: STACK_CAP }));
  });
  const { state, events } = reduce(before, { type: "fight" });
  const dropped = events.find((e) => e.type === "map-dropped") as { carried: boolean } | undefined;
  expect(dropped?.carried).toBe(false);
  expect(state.expedition!.carriedMaps ?? []).toEqual([]);
  expect(events.some((e) => e.type === "fought")).toBe(true);
});

test("carried maps debit gather/loot capacity by one stack each", () => {
  const { seed, poi } = humanoidFight(true);
  const held: MapItem[] = Array.from({ length: BASE_CARRY_SLOTS }, (_, i) => ({ mapSeed: `m${i}`, biomeId: "desert", vintage: 0 }));
  const before = atMonster(seed, poi, (s) => { s.expedition!.carriedMaps = held; });
  // all slots eaten by maps → the fight's material loot can't fit → carry-full rejection
  const { events } = reduce(before, { type: "fight" });
  expect(events).toContainEqual(expect.objectContaining({ type: "action-rejected", reason: "carry-full" }));
});
```

Note: the loot-fit test relies on sand-raider/forest-bandit having material loot (`raider-supplies`, Task 1). The `filler-*` defIds are fine — carry accounting is defId-agnostic.

- [ ] **Step 2: Run to verify failure**

Run: `bun test test/reduce-map-drop.test.ts`
Expected: FAIL — `carriedMaps` never set, `map-dropped` never emitted, no capacity debit.

- [ ] **Step 3: Implement**

`src/engine/types.ts` — Expedition (~line 28), after `autoEat`:

```ts
  carriedMaps?: MapItem[]; // map-scroll drops carried home (8ec): each costs ONE carry slot for the run; banked into GameState.maps at run end. Optional/absent = [] (old saves, terse test states); reads guard with `?? []`.
```

(`MapItem` is declared below `Expedition` — move the `MapItem` type declaration above `Expedition` so the reference is in scope.)

GameEvent union (~line 145), after `pocketed-map`:

```ts
  | { type: "map-dropped"; at: { x: number; y: number }; mapSeed: string; biomeId: BiomeId; hints: string[]; carried: boolean } // humanoid kill minted a map (8ec); carried=false → pack full, left behind
```

`src/engine/carry.ts` — after `freeCarryStacks`:

```ts
// Loot capacity after carried maps take their slots (8ec): each carried map
// costs one slot for the run. Gather + fightAt size their stack budget here.
export function freeLootStacks(loadout: Loadout, carriedMaps: { mapSeed: string }[] | undefined): number {
  return freeCarryStacks(loadout) - (carriedMaps ?? []).length;
}
```

`src/engine/town.ts:35` — `function previewHints` → `export function previewHints` (spec §4: the drop event shows the same preview the town offer would).

`src/engine/reduce.ts`:
- Import `freeLootStacks` (from carry), `previewHints` (from town), `MAP_SCROLL_ID` (from constants), and `MapItem` type if needed.
- Gather (~line 242): `const maxStacks = freeLootStacks(expedition.loadout, expedition.carriedMaps);` replacing its `freeCarryStacks(...)` call (keep variable name `maxStacks`).
- Embark expedition literal (~line 90): add `carriedMaps: [],` beside `carry: []`.
- `fightAt` (~line 318): split the roll and mint on victory:

```ts
  const rolled = rollLoot(state.seed, creature, at);
  const mapDrops = rolled.filter((s) => s.defId === MAP_SCROLL_ID);
  const loot = rolled.filter((s) => s.defId !== MAP_SCROLL_ID);
  // Pre-fight fit check covers MATERIAL loot only — the map is an optional
  // pickup (left behind if the pack is full), never a reason to refuse a fight.
  const maxStacks = freeLootStacks(expedition.loadout, expedition.carriedMaps);
```

(the existing fit-check loop and `resolveCombat` call stand unchanged; `fought.loot` now naturally excludes the scroll since `loot` is materials-only). Then in the victory return path, before building the state:

```ts
  const carriedMaps = expedition.carriedMaps ?? [];
  let mapsAfter = carriedMaps;
  const mapEvents: GameEvent[] = [];
  if (mapDrops.length > 0) {
    // Mint (8ec): seed is namespaced by run-map + tile, so the drop is replayable
    // (D14) and the biome falls out of rollBiome — uniform, and embark re-derives
    // it from the seed exactly like an offered map (D21).
    const mapSeed = `${expedition.mapSeed}:drop:${at.x},${at.y}`;
    const biomeId = rollBiome(mapSeed);
    const carried = carryWithLoot.length + carriedMaps.length < freeCarryStacks(expedition.loadout);
    if (carried) mapsAfter = [...carriedMaps, { mapSeed, biomeId, vintage: state.runs ?? 0 }];
    mapEvents.push({ type: "map-dropped", at: { x: at.x, y: at.y }, mapSeed, biomeId, hints: previewHints(mapSeed, biomeId), carried });
  }
```

In the victory `return`, add `carriedMaps: mapsAfter` to the expedition object and change `events: [fought]` → `events: [fought, ...mapEvents]`. The defeat path is untouched (mint is victory-only; `mapDrops` is simply unused there).

Purity check: `previewHints` lives in `src/engine/town.ts` — engine-internal, boundary-safe.

- [ ] **Step 4: Run gates**

Run: `bun test && bun run typecheck && bun run lint`
Expected: PASS, including the new file and `test/boundary.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(8ec): fightAt mints carried maps from humanoid kills; maps debit carry slots"
```

---

### Task 4: `drop-map` action

**Files:**
- Modify: `src/engine/types.ts` (Action union ~line 71, RejectionReason ~line 86, GameEvent), `src/engine/reduce.ts` (switch ~line 26, new handler), `src/sim/legal.ts` (`expeditionActions` ~line 60)
- Test: `test/reduce-map-drop.test.ts` (append), `test/legal.test.ts` (append)

**Interfaces:**
- Consumes: `Expedition.carriedMaps` (Task 3).
- Produces: Action `{ type: "drop-map"; mapSeed: string }`; RejectionReason `"map-not-carried"`; GameEvent `{ type: "map-discarded"; mapSeed: string }`.

- [ ] **Step 1: Write the failing tests** — append to `test/reduce-map-drop.test.ts`:

```ts
test("drop-map discards a carried map, freeing its slot; unknown seed rejects", () => {
  const { seed, poi } = humanoidFight(true);
  const before = atMonster(seed, poi, (s) => {
    s.expedition!.carriedMaps = [{ mapSeed: "held-1", biomeId: "desert", vintage: 0 }];
  });
  const { state, events } = reduce(before, { type: "drop-map", mapSeed: "held-1" });
  expect(state.expedition!.carriedMaps).toEqual([]);
  expect(events).toEqual([{ type: "map-discarded", mapSeed: "held-1" }]);
  const rej = reduce(state, { type: "drop-map", mapSeed: "held-1" });
  expect(rej.events).toContainEqual(expect.objectContaining({ type: "action-rejected", action: "drop-map", reason: "map-not-carried" }));
});

test("drop-map in town rejects", () => {
  const town: GameState = { seed: "g", phase: "town", bank: [], loadout: emptyLoadout(), expedition: null };
  const { events } = reduce(town, { type: "drop-map", mapSeed: "x" });
  expect(events).toContainEqual(expect.objectContaining({ reason: "not-on-expedition" }));
});
```

Append to `test/legal.test.ts` (match its existing state-building style):

```ts
test("legal: drop-map offered per carried map on expedition", () => {
  // build any legal expedition state the file already constructs, then:
  // state.expedition.carriedMaps = [{ mapSeed: "lm-1", biomeId: "desert", vintage: 0 }];
  const actions = legalActions(state);
  expect(actions).toContainEqual({ type: "drop-map", mapSeed: "lm-1" });
});
```

(Reuse the file's existing expedition fixture — copy its setup verbatim rather than inventing a new one.)

- [ ] **Step 2: Run to verify failure**

Run: `bun test test/reduce-map-drop.test.ts test/legal.test.ts`
Expected: FAIL — typecheck error on the unknown action type is also acceptable failure evidence.

- [ ] **Step 3: Implement**

`src/engine/types.ts`: add `| { type: "drop-map"; mapSeed: string } // discard a carried map mid-run (8ec) — frees its slot; the map is gone` to Action (after `drop`); add `| "map-not-carried"` to RejectionReason; add `| { type: "map-discarded"; mapSeed: string }` to GameEvent.

`src/engine/reduce.ts` switch: `case "drop-map": return dropMap(state, action.mapSeed);` and:

```ts
// Discard a carried map (8ec): frees its slot for the rest of the run. No
// re-pickup — paper burns. Mirrors `drop` for loot stacks.
function dropMap(state: GameState, mapSeed: string): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) return rejected(state, "drop-map", "not-on-expedition");
  const held = expedition.carriedMaps ?? [];
  if (!held.some((m) => m.mapSeed === mapSeed)) return rejected(state, "drop-map", "map-not-carried");
  return {
    state: { ...state, expedition: { ...expedition, carriedMaps: held.filter((m) => m.mapSeed !== mapSeed) } },
    events: [{ type: "map-discarded", mapSeed }],
  };
}
```

`src/sim/legal.ts` `expeditionActions`, beside the `drop` loop:

```ts
  // drop each carried map (8ec)
  for (const m of state.expedition.carriedMaps ?? []) candidates.push({ type: "drop-map", mapSeed: m.mapSeed });
```

- [ ] **Step 4: Run gates**

Run: `bun test && bun run typecheck && bun run lint`
Expected: PASS. (If reduce or legal has an exhaustive switch over Action types elsewhere — e.g. `accepts` or rejection rendering — typecheck will point at it; handle the new case there too.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(8ec): drop-map action — discard a carried map mid-run"
```

---

### Task 5: Run-end banking — carried maps land in `state.maps`

**Files:**
- Modify: `src/engine/bank.ts` (`endExpedition` return, ~line 48)
- Test: `test/bank.test.ts` (append)

**Interfaces:**
- Consumes: `Expedition.carriedMaps` (Task 3); `endExpedition(state, expedition): GameState` (existing — all run-end paths already flow through it: return at reduce.ts:148, defeat soft-fail at reduce.ts:341).
- Produces: `endExpedition` also merges `carriedMaps` into `GameState.maps`.

- [ ] **Step 1: Write the failing test** — append to `test/bank.test.ts` (match its fixture style):

```ts
test("endExpedition banks carried maps into state.maps (D26: they follow the carry's fate)", () => {
  // build the file's existing minimal state+expedition fixture, then:
  const withMaps = {
    ...expedition,
    carriedMaps: [{ mapSeed: "run:drop:1,2", biomeId: "tundra" as const, vintage: 2 }],
  };
  const stateWithHeld = { ...state, maps: [{ mapSeed: "pocketed-1", biomeId: "desert" as const, vintage: 0 }] };
  const ended = endExpedition(stateWithHeld, withMaps);
  expect(ended.maps).toEqual([
    { mapSeed: "pocketed-1", biomeId: "desert", vintage: 0 },
    { mapSeed: "run:drop:1,2", biomeId: "tundra", vintage: 2 },
  ]);
  expect(ended.phase).toBe("town");
});
```

Also add an integration assertion to `test/reduce-map-drop.test.ts`: fight a humanoid to a carried map, then `reduce(state, { type: "return" })` and expect the map in `state.maps` — and that `reduce(town, { type: "embark", mapSeed })` on that banked map is accepted (held-map path) and removes it from `maps`.

```ts
test("carried map banks on return and is embarkable+spent like a pocketed map", () => {
  const { seed, poi } = humanoidFight(true);
  const won = reduce(atMonster(seed, poi), { type: "fight" }).state;
  const home = reduce(won, { type: "return" }).state;
  const minted = `${seed}:drop:${poi.x},${poi.y}`;
  expect(home.phase).toBe("town");
  expect((home.maps ?? []).some((m) => m.mapSeed === minted)).toBe(true);
  const out = reduce(home, { type: "embark", mapSeed: minted });
  expect(out.state.phase).toBe("expedition");
  expect((out.state.maps ?? []).some((m) => m.mapSeed === minted)).toBe(false); // spent
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test test/bank.test.ts test/reduce-map-drop.test.ts`
Expected: FAIL — `ended.maps` missing the carried map.

- [ ] **Step 3: Implement** — in `endExpedition`'s returned object (`src/engine/bank.ts`), after `bank:`:

```ts
    maps: [...(state.maps ?? []), ...(expedition.carriedMaps ?? [])], // carried map drops bank as held maps (8ec) — same fate as the carry in every run-end path incl. defeat's soft fail (D26)
```

- [ ] **Step 4: Run gates**

Run: `bun test && bun run typecheck && bun run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(8ec): run-end banks carried maps into state.maps"
```

---

### Task 6: Console surface — carried maps in the playtest view

**Files:**
- Modify: `src/sim/playtest.ts` (`printExpedition`, ~line 128)
- Test: none new (surface-only; `bun test` guards regressions) — verify by running the CLI

**Interfaces:**
- Consumes: `Expedition.carriedMaps` (Task 3). `legalActions` already lists `drop-map` (Task 4), and the LEGAL ACTIONS dump prints it automatically.

- [ ] **Step 1: Implement** — in `printExpedition`, alongside the carry/inventory output add:

```ts
  const carriedMaps = st.expedition?.carriedMaps ?? [];
  if (carriedMaps.length > 0) {
    console.log(`Carried maps (1 slot each; banked as held maps when the run ends):`);
    for (const m of carriedMaps) console.log(`  • ${m.biomeId} map  →  drop-map mapSeed="${m.mapSeed}" to free the slot`);
  }
```

Place it where the file prints carry so headless agents see slots and maps together (si7.4 parity).

- [ ] **Step 2: Verify by running**

Run: `bun test && bun run typecheck && bun run lint`, then exercise the CLI (`bun src/sim/cli.ts --help` or however `src/sim/cli.ts` is invoked — check its header) far enough to print an expedition, or rely on the reduce tests + a quick manual state print.
Expected: gates PASS; no crash on absent `carriedMaps` (old saves).

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(8ec): console shows carried maps (si7.4 parity)"
```

---

### Task 7: Web surface — drop events, carried-map chips, slot display

**Files:**
- Modify: `src/web/main.ts` (event lines ~line 95, `realSlots`/`inventoryGrid` ~lines 191-222, expedition panel ~line 456, click wiring near the `data-drop` handler)
- Test: none new (DOM surface) — verify in browser

**Interfaces:**
- Consumes: `map-dropped` / `map-discarded` events (Tasks 3-4), `Expedition.carriedMaps`, `drop-map` action. Town "Your maps" shelf already renders `state.maps` — banked drops appear there with no change.

- [ ] **Step 1: Implement**

Event lines (beside `case "pocketed-map"`):

```ts
    case "map-dropped": return e.carried
      ? `🗺️ looted a ${name(e.biomeId)} map (takes 1 slot — banks home with you)`
      : `🗺️ a ${name(e.biomeId)} map dropped — pack full, left behind`;
    case "map-discarded": return `🗺️ discarded a carried map`;
```

Slot display: give `realSlots` a third parameter `maps: MapItem[] = []` and push `slotBox("map", `🗺️ ${name(m.biomeId)} map`, "map")` per carried map (follow the existing `slotBox("loot", ...)` call shape at ~line 200); thread it through `inventoryGrid(loadout, carry, cap, maps)` and pass `exp.carriedMaps ?? []` at the expedition call site (~line 436).

Expedition panel (beside the carry drop list ~line 456):

```ts
      ${(exp.carriedMaps ?? []).length ? `<div class="bank" style="margin-top:.5rem">${(exp.carriedMaps ?? []).map((m) => `<div class="bankitem"><span class="chip">🗺️ ${name(m.biomeId)} map</span><button data-drop-map="${m.mapSeed}">drop</button></div>`).join("")}</div>` : ""}
```

Wiring (beside the `data-drop` handler):

```ts
  app.querySelectorAll<HTMLElement>("[data-drop-map]").forEach((el) => el.onclick = () => apply({ type: "drop-map", mapSeed: el.dataset.dropMap! }));
```

Import `MapItem` type if needed. If `name()` doesn't cover biome ids (check how `case "pocketed-map"` renders — it already calls `name(e.biomeId)`), reuse whatever it does.

- [ ] **Step 2: Verify in browser**

Run gates (`bun test && bun run typecheck && bun run lint`), then serve the web app (check `package.json` scripts for the dev command) and play: embark, kill a humanoid (desert = sand-raider), observe the map-dropped line + chip + slot box, drop it, return with one and see it on the town shelf, embark it.
Expected: full loop works; slot count visibly includes the map.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(8ec): web surfaces carried maps — drop events, chips, slot display"
```

---

### Task 8: Close out

- [ ] **Step 1: Full gates** — `bun test && bun run typecheck && bun run lint` → all PASS.
- [ ] **Step 2: Beads** — `bd close idle-adventure-8ec --reason="Monster categories + humanoid map drops shipped: category field, CATEGORY_LOOT_TABLE, carried maps w/ slot cost, drop-map, run-end banking, web+console surfaces"`. Also note on si7.1 (`bd update idle-adventure-si7.1 --notes="8ec landed: humanoids drop maps — combat has a logistics payoff"`) — leave si7.1 open (combat variety/stakes is broader).
- [ ] **Step 3: Sync** — per Git & Sync Policy: `git push` and `bd dolt push`.
- [ ] **Step 4: Hand off** — summarize; suggest a blind-playtest run to check the "hunt humanoids for maps" read lands with agents.
