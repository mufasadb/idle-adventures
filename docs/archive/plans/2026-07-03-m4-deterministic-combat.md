# M4 — Deterministic Combat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Bead:** `idle-adventure-868.5` (M4). Design sources: spec §5 (deterministic combat, D11/D12), plan doc M4 section, bead notes (creature stamping recipe, D24 cleared reuse, GameEvent union, addToCarry loot), D21/D23/D24/D25, and new decision **D26** (run-end banking) recorded here.

**Goal:** `fight` resolves attrition deterministically — weapon×matrix×hidden-affinity damage out, per-piece-mitigated damage in with a chip floor, auto-potions at a threshold, soft-fail on HP 0 that ends the run keeping carry — and `scout` (spyglass-gated) reveals nearby monster stats plus an exact fight forecast.

**Architecture:** A pure `src/engine/combat.ts` owns the math: `playerDamage` (weapon damage × `DMG_ARMOUR_MATRIX[weaponType][monsterArmour]` × affinity ×2 on any `(monsterTag, itemTag)` match), `mitigation` (Σ `piece.defense ÷ matrix[monsterDmgType][piece.armourType]` — division is the only orientation where plate cuts ranged more than magic), and `resolveCombat` (player-strikes-first loop; incoming per round = `max(CHIP_DAMAGE_MIN, monsterDmg − mitigation)` so HP always drains; auto-quaff when HP ≤ threshold×base). No RNG anywhere: fixed loot tables + a deterministic loop. Monsters are stamped onto POIs at generation (`Poi.creature`, uniform pick from the biome's `creatureTable` under a NEW rand label — keyed stateless RNG ⇒ existing draws untouched ⇒ snapshots stable). Defeat is a soft fail: **D26** — run end (defeat now, `return` in M5) banks carry + durables (equipment, tools, transport, backpack, unspent potions) and discards food (D23), via a shared `endExpedition` helper M5 will reuse.

**Tech Stack:** TypeScript · bun (`bun test`) · no new dependencies.

## Global Constraints

- Engine purity (lint-enforced): no DOM, no `Math.random`/`Date.now`, no imports from `render`/`sim`/`web` under `src/engine/**`.
- No magic numbers — every tunable is a lever in `src/data/constants.ts`.
- D21: the biome is consulted only inside `generateGrid` (creature stamping mirrors D25 material stamping); combat rules never read `BIOMES`.
- D23/D24: loot lands via `addToCarry` under the same ballast accounting; defeated monsters join `Expedition.cleared`.
- `fight` costs no energy (HP is combat's budget — D15); `scout` costs `SCOUT_ENERGY_COST`.
- Determinism without RNG: `resolveCombat` is a pure function of (loadout, hp, monsterId); loot tables are fixed.
- `reduce` never mutates input; rejections = unchanged state + `action-rejected`; `GameEvent` stays a closed union (add `fought`/`scouted`/`run-ended`).
- Render snapshots must NOT churn (new rand label only; render doesn't read `creature`).
- Gates: `bun test` · `bun run typecheck` · `bun run lint`. Commit-as-you-go (established authority).

## File Structure

- Modify `src/data/constants.ts` — combat levers + catalogs (`MONSTERS`, `WEAPONS`, `ARMOUR`, `AFFINITIES`, `LOOT_TABLE`, tier curves, potion/chip/scout levers, `PLAYER_BASE_HP`), `DmgType`/`ArmourType` types, `creatureTable` fills.
- Modify `src/engine/grid.ts` — `Poi.creature` stamped at generation.
- Create `src/engine/combat.ts` — `playerDamage`, `mitigation`, `resolveCombat`.
- Create `src/engine/bank.ts` — `bankStacks` (merge, uncapped), `endExpedition` (D26).
- Modify `src/engine/types.ts` — `GameEvent` variants `fought`/`scouted`/`run-ended`.
- Modify `src/engine/reduce.ts` — `fight` and `scout` cases.
- Modify `docs/decisions.md` (D26), `docs/balance-levers.md` (Task 7).
- Tests: `test/combat.test.ts`, `test/bank.test.ts`, `test/reduce-fight.test.ts`, `test/reduce-scout.test.ts` (new); extend `test/constants.test.ts`, `test/grid.test.ts`.

---

### Task 1: Combat levers + catalogs

**Files:**
- Modify: `src/data/constants.ts`
- Test: `test/constants.test.ts` (extend)

**Interfaces:**
- Produces (consumed by Tasks 2–6):
  - `type DmgType = "melee" | "ranged" | "magic"`; `type ArmourType = "plate" | "light" | "robe"` — and `DMG_ARMOUR_MATRIX` retyped `Record<DmgType, Record<ArmourType, number>>` (same values, drop `as const`).
  - `PLAYER_BASE_HP = 30` (embark already reads it).
  - `CHIP_DAMAGE_MIN = 1` — floor on damage BOTH directions (HP always drains; fights always end).
  - `POTION_HEAL = 10`; `AUTO_POTION_THRESHOLD = 0.5` (fraction of base HP).
  - `UNARMED_DAMAGE = 1`.
  - `MONSTER_TIER_HP_CURVE: Record<number, number> = { 1: 6, 2: 12, 3: 24 }`; `MONSTER_TIER_DMG_CURVE: Record<number, number> = { 1: 2, 2: 4, 3: 7 }`.
  - `AFFINITY_MULTIPLIER = 2`; `AFFINITIES: { monsterTag: string; itemTag: string }[] = [ {monsterTag:"werewolf", itemTag:"silver"}, {monsterTag:"fae", itemTag:"iron"}, {monsterTag:"vampire", itemTag:"garlic-coated"} ]` — the hidden, discoverable layer.
  - `type Monster = { tier: number; dmgType: DmgType; armourType: ArmourType; tags: string[] }`
  - `MONSTERS: Record<string, Monster>`:
    - `werewolf { tier:2, melee, light, ["werewolf","beast"] }` · `"fae-sprite" { 1, magic, robe, ["fae"] }` · `"forest-boar" { 1, melee, light, ["beast"] }`
    - `"giant-scorpion" { 2, melee, plate, ["beast"] }` · `"dust-vampire" { 3, magic, robe, ["vampire"] }` · `"sand-raider" { 1, ranged, light, [] }`
    - `"frost-fae" { 2, magic, robe, ["fae"] }` · `"snow-wolf" { 1, melee, light, ["beast"] }` · `"ice-troll" { 3, melee, plate, ["troll"] }`
  - `type Weapon = { dmgType: DmgType; damage: number; tags: string[] }`
  - `WEAPONS: Record<string, Weapon> = { sword: {melee,3,[]}, "iron-sword": {melee,3,["iron"]}, "silver-sword": {melee,3,["silver"]}, bow: {ranged,3,[]}, "fire-staff": {magic,3,[]} }` (object syntax, keys named).
  - `ARMOUR: Record<string, { armourType: ArmourType; defense: number }>` — 15 entries: `plate-helmet 2, plate-chest 3, plate-legs 2, plate-boots 1, plate-gloves 1` (all plate); `light-helmet 1, light-chest 2, light-legs 1, light-boots 1, light-gloves 1` (light); `robe-hood 1, robe-chest 1, robe-legs 1, robe-boots 1, robe-gloves 1` (robe). (Subsumes the flat `ARMOUR_DEFENSE` placeholder — DELETE `ARMOUR_DEFENSE`; nothing imports it.)
  - `LOOT_TABLE: Record<string, { defId: string; qty: number }[]>` — fixed drops: werewolf `[{werewolf-pelt,2}]`; fae-sprite `[{fae-dust,2}]`; forest-boar `[{boar-hide,2}]`; giant-scorpion `[{scorpion-carapace,2}]`; dust-vampire `[{vampire-ash,2}]`; sand-raider `[{raider-supplies,1}]`; frost-fae `[{fae-dust,2}]` (shared with fae-sprite — deliberate recipe overlap); snow-wolf `[{wolf-pelt,2}]` (shared with tundra animal nodes — deliberate); ice-troll `[{troll-hide,2}]`.
  - `SCOUT_ENERGY_COST = 1`; `SCOUT_RADIUS = 3` (Chebyshev); `SCOUT_TOOL = "spyglass"`.
  - `BIOMES[*].creatureTable` filled: woodland `["werewolf","fae-sprite","forest-boar"]`; desert `["giant-scorpion","dust-vampire","sand-raider"]`; tundra `["frost-fae","snow-wolf","ice-troll"]`. (Uniform pick — weights can become a table shape change later if needed.)

- [ ] **Step 1: Extend the constants test (failing)** — append (merging new names into the constants import):

```ts
test("constants: M4 combat levers are filled", () => {
  expect(PLAYER_BASE_HP).toBeGreaterThan(0);
  expect(CHIP_DAMAGE_MIN).toBeGreaterThan(0); // HP always drains; fights always terminate
  expect(POTION_HEAL).toBeGreaterThan(0);
  expect(AUTO_POTION_THRESHOLD).toBeGreaterThan(0);
  expect(AUTO_POTION_THRESHOLD).toBeLessThanOrEqual(1);
  expect(UNARMED_DAMAGE).toBeGreaterThan(0);
  expect(AFFINITY_MULTIPLIER).toBeGreaterThan(1);
  expect(SCOUT_ENERGY_COST).toBeGreaterThanOrEqual(0);
  expect(SCOUT_RADIUS).toBeGreaterThan(0);
});

test("constants: monster catalog is internally consistent", () => {
  for (const [id, monster] of Object.entries(MONSTERS)) {
    expect(MONSTER_TIER_HP_CURVE[monster.tier]).toBeGreaterThan(0);
    expect(MONSTER_TIER_DMG_CURVE[monster.tier]).toBeGreaterThan(0);
    expect(["melee", "ranged", "magic"]).toContain(monster.dmgType);
    expect(["plate", "light", "robe"]).toContain(monster.armourType);
    expect(LOOT_TABLE[id]).toBeDefined(); // every monster drops something
    for (const stack of LOOT_TABLE[id]!) expect(stack.qty).toBeGreaterThan(0);
  }
  for (const [, weapon] of Object.entries(WEAPONS)) {
    expect(weapon.damage).toBeGreaterThan(0);
  }
  for (const [, piece] of Object.entries(ARMOUR)) {
    expect(piece.defense).toBeGreaterThan(0);
  }
});

test("constants: every biome's creatureTable is 2-3 real monsters", () => {
  for (const id of BIOME_IDS) {
    const table = BIOMES[id].creatureTable;
    expect(table.length).toBeGreaterThanOrEqual(2);
    expect(table.length).toBeLessThanOrEqual(3);
    for (const creature of table) expect(MONSTERS[creature]).toBeDefined();
  }
});

test("constants: the acceptance affinity pairing exists (silver ↔ werewolf)", () => {
  expect(WEAPONS["silver-sword"]!.tags).toContain("silver");
  expect(MONSTERS.werewolf!.tags).toContain("werewolf");
  expect(
    AFFINITIES.some((a) => a.monsterTag === "werewolf" && a.itemTag === "silver"),
  ).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails** — `bun test test/constants.test.ts` → FAIL (`CHIP_DAMAGE_MIN` etc. not exported; `PLAYER_BASE_HP` is 0).

- [ ] **Step 3: Fill the combat group** in `src/data/constants.ts`: add `DmgType`/`ArmourType` exports above the matrix; retype the matrix; replace the combat group with all levers/catalogs from the Interfaces block (each with a one-line comment on what pulling it does; keep the existing matrix values); DELETE `ARMOUR_DEFENSE`; fill the three `creatureTable`s. Every value verbatim from Interfaces.

- [ ] **Step 4: Run tests** — `bun test` → all green (embark tests don't assert hp; nothing else consumed these).

- [ ] **Step 5: Gate + commit**

```bash
git add src/data/constants.ts test/constants.test.ts
git commit -m "M4: combat levers + monster/weapon/armour catalogs; PLAYER_BASE_HP=30"
```

---

### Task 2: Creature stamping (`Poi.creature`)

**Files:**
- Modify: `src/engine/grid.ts`
- Test: `test/grid.test.ts` (extend)

**Interfaces:**
- Produces: `Poi.creature: string | null` — monster POIs get a uniform pick from `BIOMES[biomeId].creatureTable` via `rand(mapSeed, "poi-creature", attempt)`; non-monster POIs (and monsters when the table is empty) get `null`. **New rand label ⇒ every existing draw (terrain, kinds, materials, entry) is byte-identical ⇒ snapshots must not change.**

- [ ] **Step 1: Failing test (append to `test/grid.test.ts`)**

```ts
test("generateGrid: monster POIs carry a creature from the biome's table (M4)", () => {
  for (const biome of BIOME_IDS) {
    const grid = generateGrid(`creature-stamp-${biome}`, biome);
    for (const poi of grid.pois) {
      if (poi.kind === "monster") {
        expect(BIOMES[biome].creatureTable).toContain(poi.creature!);
      } else {
        expect(poi.creature).toBeNull();
      }
    }
  }
});

test("generateGrid: creature stamping is deterministic", () => {
  expect(generateGrid("creature-det", "desert")).toEqual(generateGrid("creature-det", "desert"));
});
```

- [ ] **Step 2: Run to verify it fails** — `bun test test/grid.test.ts` → FAIL (`creature` undefined).

- [ ] **Step 3: Implement** — in `src/engine/grid.ts`: add `creature: string | null` to `Poi` (comment: `// monster defId, stamped from the biome at generation (M4, mirrors D25) — combat never consults the biome`); in the POI loop after `kind` is picked:

```ts
    const creature =
      kind === "monster" && biome.creatureTable.length > 0
        ? biome.creatureTable[
            Math.floor(rand(mapSeed, "poi-creature", attempt) * biome.creatureTable.length)
          ]!
        : null;
    pois.push({ x, y, kind, material: biome.materialTable[kind] ?? null, creature });
```

- [ ] **Step 4: Run tests** — `bun test` → all green INCLUDING the three render snapshots unchanged (the new label doesn't perturb existing draws). If a snapshot fails, STOP — that's a determinism regression, not a snapshot to update.

- [ ] **Step 5: Gate + commit**

```bash
git add src/engine/grid.ts test/grid.test.ts
git commit -m "M4: stamp Poi.creature from biome creatureTable at generation (snapshot-safe)"
```

---

### Task 3: Combat math (`src/engine/combat.ts`)

**Files:**
- Create: `src/engine/combat.ts`
- Test: `test/combat.test.ts`

**Interfaces:**
- Consumes: combat levers/catalogs (Task 1); `Loadout`, `ItemStack` types; `emptyLoadout` in tests.
- Produces:
  - `playerDamage(loadout: Loadout, monsterId: string): number` — `weapon.damage × DMG_ARMOUR_MATRIX[weapon.dmgType][monster.armourType]` (or `UNARMED_DAMAGE` bare-handed) `× AFFINITY_MULTIPLIER` if ANY `AFFINITIES` pair matches (monster.tags ∋ monsterTag ∧ weapon.tags ∋ itemTag); floored at `CHIP_DAMAGE_MIN`.
  - `mitigation(loadout: Loadout, dmgType: DmgType): number` — Σ over armour slots (helmet/chest/legs/boots/gloves): `ARMOUR[pieceId].defense ÷ DMG_ARMOUR_MATRIX[dmgType][piece.armourType]`; unknown/empty pieces contribute 0.
  - `resolveCombat(loadout: Loadout, hp: number, monsterId: string): CombatResult` where `CombatResult = { victory: boolean; hpAfter: number; hpLost: number; potionsUsed: number; potionsAfter: ItemStack[]; loot: ItemStack[] }`. Loop: player strikes first (monster at 0 HP dies before retaliating that round); incoming per round = `max(CHIP_DAMAGE_MIN, monsterDmg − mitigation)`; after surviving a hit, if `hp ≤ AUTO_POTION_THRESHOLD × PLAYER_BASE_HP` and potions remain → quaff (`hp = min(PLAYER_BASE_HP, hp + POTION_HEAL)`), consume 1 (from stacks in order). Defeat clamps `hpAfter` to 0 and yields `loot: []`; victory yields fresh copies of `LOOT_TABLE[monsterId]`.

- [ ] **Step 1: Failing test**

```ts
// test/combat.test.ts
import { test, expect } from "bun:test";
import { playerDamage, mitigation, resolveCombat } from "../src/engine/combat";
import { emptyLoadout } from "../src/engine/loadout";
import {
  DMG_ARMOUR_MATRIX,
  WEAPONS,
  AFFINITY_MULTIPLIER,
  UNARMED_DAMAGE,
  MONSTER_TIER_HP_CURVE,
  MONSTER_TIER_DMG_CURVE,
  MONSTERS,
  LOOT_TABLE,
  PLAYER_BASE_HP,
  CHIP_DAMAGE_MIN,
} from "../src/data/constants";
import type { Loadout } from "../src/engine/types";

function armed(weapon: string | null, extra: Partial<{ potions: { defId: string; qty: number }[] }> = {}): Loadout {
  const loadout = emptyLoadout();
  loadout.equipment.weapon = weapon;
  loadout.potions = extra.potions ?? [];
  return loadout;
}

test("playerDamage: silver vs werewolf ×2 (bead acceptance)", () => {
  expect(playerDamage(armed("silver-sword"), "werewolf")).toBe(
    playerDamage(armed("sword"), "werewolf") * AFFINITY_MULTIPLIER,
  );
});

test("playerDamage: affinity needs BOTH tags — silver does nothing to a boar", () => {
  expect(playerDamage(armed("silver-sword"), "forest-boar")).toBe(
    playerDamage(armed("sword"), "forest-boar"),
  );
});

test("playerDamage: weapon type reads the monster's armour through the matrix", () => {
  // giant-scorpion is plate: magic (1.5×) should out-damage ranged (0.5×)
  expect(playerDamage(armed("fire-staff"), "giant-scorpion")).toBeGreaterThan(
    playerDamage(armed("bow"), "giant-scorpion"),
  );
});

test("playerDamage: bare hands deal UNARMED_DAMAGE", () => {
  expect(playerDamage(armed(null), "forest-boar")).toBe(
    Math.max(CHIP_DAMAGE_MIN, UNARMED_DAMAGE),
  );
});

test("mitigation: plate cuts ranged more than magic (bead acceptance)", () => {
  const loadout = emptyLoadout();
  loadout.equipment.helmet = "plate-helmet";
  loadout.equipment.chest = "plate-chest";
  expect(mitigation(loadout, "ranged")).toBeGreaterThan(mitigation(loadout, "magic"));
});

test("mitigation: mixed armour sums per piece", () => {
  const loadout = emptyLoadout();
  loadout.equipment.chest = "plate-chest";
  loadout.equipment.legs = "robe-legs";
  const plateOnly = emptyLoadout();
  plateOnly.equipment.chest = "plate-chest";
  expect(mitigation(loadout, "melee")).toBeGreaterThan(mitigation(plateOnly, "melee"));
});

test("resolveCombat: HP always drains even well-geared (chip floor)", () => {
  const tank = emptyLoadout();
  tank.equipment.weapon = "sword";
  tank.equipment.helmet = "plate-helmet";
  tank.equipment.chest = "plate-chest";
  tank.equipment.legs = "plate-legs";
  tank.equipment.boots = "plate-boots";
  tank.equipment.gloves = "plate-gloves";
  const result = resolveCombat(tank, PLAYER_BASE_HP, "forest-boar");
  expect(result.victory).toBe(true);
  expect(result.hpLost).toBeGreaterThan(0);
});

test("resolveCombat: victory yields the monster's fixed loot", () => {
  const result = resolveCombat(armed("sword"), PLAYER_BASE_HP, "werewolf");
  expect(result.victory).toBe(true);
  expect(result.loot).toEqual(LOOT_TABLE.werewolf!);
  expect(result.loot).not.toBe(LOOT_TABLE.werewolf); // fresh copies, no aliasing
});

test("resolveCombat: silver sword beats the werewolf cheaper than a plain sword", () => {
  const plain = resolveCombat(armed("sword"), PLAYER_BASE_HP, "werewolf");
  const silver = resolveCombat(armed("silver-sword"), PLAYER_BASE_HP, "werewolf");
  expect(silver.hpLost).toBeLessThan(plain.hpLost);
});

test("resolveCombat: auto-potions quaff at the threshold and are consumed in stack order", () => {
  const loadout = armed("sword", { potions: [{ defId: "healing-potion", qty: 2 }] });
  const noPotions = resolveCombat(armed("sword"), 12, "ice-troll"); // tier 3 hits hard
  const withPotions = resolveCombat(loadout, 12, "ice-troll");
  expect(withPotions.potionsUsed).toBeGreaterThan(0);
  expect(withPotions.potionsAfter.reduce((s, p) => s + p.qty, 0)).toBe(2 - withPotions.potionsUsed);
  // potions keep you alive longer / end better than without
  expect(withPotions.hpAfter).toBeGreaterThanOrEqual(noPotions.hpAfter);
});

test("resolveCombat: defeat clamps to 0, yields no loot", () => {
  const result = resolveCombat(armed(null), 3, "ice-troll");
  expect(result.victory).toBe(false);
  expect(result.hpAfter).toBe(0);
  expect(result.hpLost).toBe(3);
  expect(result.loot).toEqual([]);
});

test("resolveCombat: pure and deterministic", () => {
  const loadout = armed("sword", { potions: [{ defId: "healing-potion", qty: 1 }] });
  const before = structuredClone(loadout);
  const a = resolveCombat(loadout, PLAYER_BASE_HP, "frost-fae");
  expect(loadout).toEqual(before);
  expect(a).toEqual(resolveCombat(loadout, PLAYER_BASE_HP, "frost-fae"));
});

test("tier curves: bigger tiers are tougher (sanity)", () => {
  expect(MONSTER_TIER_HP_CURVE[3]!).toBeGreaterThan(MONSTER_TIER_HP_CURVE[1]!);
  expect(MONSTER_TIER_DMG_CURVE[3]!).toBeGreaterThan(MONSTER_TIER_DMG_CURVE[1]!);
  expect(MONSTERS["ice-troll"]!.tier).toBe(3);
});
```

- [ ] **Step 2: Run to verify it fails** — module not found.

- [ ] **Step 3: Implement**

```ts
// src/engine/combat.ts
// Deterministic combat (M4, D11). Pure math — no RNG: the outcome is a
// function of (loadout, hp, monsterId). Spyglass "pre-computes the exact
// outcome" by literally calling this.
import {
  DMG_ARMOUR_MATRIX,
  PLAYER_BASE_HP,
  MONSTERS,
  WEAPONS,
  ARMOUR,
  AFFINITIES,
  AFFINITY_MULTIPLIER,
  MONSTER_TIER_HP_CURVE,
  MONSTER_TIER_DMG_CURVE,
  LOOT_TABLE,
  POTION_HEAL,
  AUTO_POTION_THRESHOLD,
  UNARMED_DAMAGE,
  CHIP_DAMAGE_MIN,
} from "../data/constants";
import type { DmgType } from "../data/constants";
import type { Loadout, ItemStack } from "./types";

export type CombatResult = {
  victory: boolean;
  hpAfter: number;
  hpLost: number;
  potionsUsed: number;
  potionsAfter: ItemStack[];
  loot: ItemStack[]; // empty on defeat
};

const ARMOUR_SLOTS = ["helmet", "chest", "legs", "boots", "gloves"] as const;

// Damage per player strike: weapon × visible matrix (vs the monster's hide
// class) × hidden affinity (×AFFINITY_MULTIPLIER on any tag pairing).
export function playerDamage(loadout: Loadout, monsterId: string): number {
  const monster = MONSTERS[monsterId];
  if (!monster) throw new Error(`unknown monster: ${monsterId}`);
  const weaponId = loadout.equipment.weapon;
  const weapon = weaponId === null ? undefined : WEAPONS[weaponId];
  const base = weapon
    ? weapon.damage * DMG_ARMOUR_MATRIX[weapon.dmgType][monster.armourType]
    : UNARMED_DAMAGE;
  const tags = weapon?.tags ?? [];
  const affine = AFFINITIES.some(
    (a) => monster.tags.includes(a.monsterTag) && tags.includes(a.itemTag),
  );
  return Math.max(CHIP_DAMAGE_MIN, base * (affine ? AFFINITY_MULTIPLIER : 1));
}

// Per-piece mitigation: defense ÷ matrix[dmgType][pieceArmour]. Division is
// what makes plate strong where its matrix damage-multiplier is low (ranged
// 0.5 → ×2 effective defense) and weak vs magic (1.5 → ×0.67).
export function mitigation(loadout: Loadout, dmgType: DmgType): number {
  let total = 0;
  for (const slot of ARMOUR_SLOTS) {
    const pieceId = loadout.equipment[slot];
    if (pieceId === null) continue;
    const piece = ARMOUR[pieceId];
    if (!piece) continue;
    total += piece.defense / DMG_ARMOUR_MATRIX[dmgType][piece.armourType];
  }
  return total;
}

export function resolveCombat(
  loadout: Loadout,
  hp: number,
  monsterId: string,
): CombatResult {
  const monster = MONSTERS[monsterId];
  if (!monster) throw new Error(`unknown monster: ${monsterId}`);
  const dmgOut = playerDamage(loadout, monsterId);
  const dmgIn = Math.max(
    CHIP_DAMAGE_MIN,
    MONSTER_TIER_DMG_CURVE[monster.tier]! - mitigation(loadout, monster.dmgType),
  );
  let current = hp;
  let monsterHp = MONSTER_TIER_HP_CURVE[monster.tier]!;
  let potionsLeft = loadout.potions.reduce((sum, p) => sum + p.qty, 0);
  let potionsUsed = 0;
  // Player strikes first. dmgOut ≥ CHIP_DAMAGE_MIN > 0 guarantees termination.
  for (;;) {
    monsterHp -= dmgOut;
    if (monsterHp <= 0) break; // victory — monster dies before retaliating
    current -= dmgIn;
    if (current <= 0) {
      current = 0; // soft-fail floor
      break;
    }
    if (current <= AUTO_POTION_THRESHOLD * PLAYER_BASE_HP && potionsLeft > 0) {
      current = Math.min(PLAYER_BASE_HP, current + POTION_HEAL);
      potionsLeft -= 1;
      potionsUsed += 1;
    }
  }
  const victory = monsterHp <= 0;
  let toConsume = potionsUsed;
  const potionsAfter: ItemStack[] = [];
  for (const stack of loadout.potions) {
    const take = Math.min(stack.qty, toConsume);
    toConsume -= take;
    if (stack.qty - take > 0) potionsAfter.push({ defId: stack.defId, qty: stack.qty - take });
  }
  return {
    victory,
    hpAfter: current,
    hpLost: hp - current,
    potionsUsed,
    potionsAfter,
    loot: victory ? (LOOT_TABLE[monsterId] ?? []).map((s) => ({ ...s })) : [],
  };
}
```

- [ ] **Step 4: Run tests** — `bun test test/combat.test.ts` → PASS; then full `bun test`.

- [ ] **Step 5: Gate + commit**

```bash
git add src/engine/combat.ts test/combat.test.ts
git commit -m "M4: combat math — matrix both ways, hidden affinities, auto-potions, chip floor"
```

---

### Task 4: Run-end banking (`src/engine/bank.ts`, D26)

**Files:**
- Create: `src/engine/bank.ts`
- Test: `test/bank.test.ts`
- Modify: `docs/decisions.md` (D26 row)

**Interfaces:**
- Consumes: `GameState`, `Expedition`, `ItemStack`, `emptyLoadout`.
- Produces:
  - `bankStacks(bank: ItemStack[], stacks: ItemStack[]): ItemStack[]` — pure merge by defId, NO stack cap (town has no carry limits).
  - `endExpedition(state: GameState, expedition: Expedition): GameState` — **D26**: returns a town-phase state banking carry + durables (each non-null equipment piece, every tool, transport, backpack as qty-1 stacks) + remaining potions; **food is discarded** (eaten at embark, D23); `expedition: null`, town `loadout` fresh empty. Used by `fight` (defeat) now and `return` (M5).

- [ ] **Step 1: Failing test**

```ts
// test/bank.test.ts
import { test, expect } from "bun:test";
import { bankStacks, endExpedition } from "../src/engine/bank";
import { emptyLoadout } from "../src/engine/loadout";
import type { GameState } from "../src/engine/types";

test("bankStacks: merges by defId without a cap", () => {
  expect(
    bankStacks(
      [{ defId: "iron-ore", qty: 9 }],
      [{ defId: "iron-ore", qty: 8 }, { defId: "oak-log", qty: 2 }],
    ),
  ).toEqual([
    { defId: "iron-ore", qty: 17 },
    { defId: "oak-log", qty: 2 },
  ]);
});

test("bankStacks: pure", () => {
  const bank = [{ defId: "iron-ore", qty: 1 }];
  bankStacks(bank, [{ defId: "iron-ore", qty: 1 }]);
  expect(bank).toEqual([{ defId: "iron-ore", qty: 1 }]);
});

test("endExpedition: banks carry + durables + potions, discards food (D26)", () => {
  const loadout = emptyLoadout();
  loadout.equipment.weapon = "sword";
  loadout.equipment.chest = "plate-chest";
  loadout.equipment.tools = ["pick", "spyglass"];
  loadout.equipment.transport = "horse";
  loadout.equipment.backpack = "starter";
  loadout.food = [{ defId: "bread", qty: 2 }]; // ballast — must vanish
  loadout.potions = [{ defId: "healing-potion", qty: 1 }];
  const state: GameState = {
    seed: "g",
    phase: "expedition",
    bank: [{ defId: "sword", qty: 1 }],
    loadout: emptyLoadout(),
    expedition: {
      mapSeed: "m",
      pos: { x: 1, y: 1 },
      energy: 5,
      hp: 0,
      loadout,
      carry: [{ defId: "silver-ore", qty: 3 }],
      cleared: [{ x: 1, y: 1 }],
    },
  };
  const ended = endExpedition(state, state.expedition!);
  expect(ended.phase).toBe("town");
  expect(ended.expedition).toBeNull();
  expect(ended.loadout).toEqual(emptyLoadout());
  expect(ended.bank).toEqual([
    { defId: "sword", qty: 2 }, // pre-existing 1 + the equipped one
    { defId: "silver-ore", qty: 3 },
    { defId: "plate-chest", qty: 1 },
    { defId: "pick", qty: 1 },
    { defId: "spyglass", qty: 1 },
    { defId: "horse", qty: 1 },
    { defId: "starter", qty: 1 },
    { defId: "healing-potion", qty: 1 },
  ]);
  expect(ended.bank.some((s) => s.defId === "bread")).toBe(false);
  expect(state.phase).toBe("expedition"); // pure — input untouched
});
```

- [ ] **Step 2: Run to verify it fails** — module not found.

- [ ] **Step 3: Implement**

```ts
// src/engine/bank.ts
// Run-end banking (D26): carry + durable loadout (equipment, tools,
// transport, backpack) + unspent potions go home; food does NOT — it was
// converted to energy at embark and its stacks were pure ballast (D23).
// Used by fight's soft-fail (M4) and return (M5).
import type { GameState, Expedition, ItemStack } from "./types";
import { emptyLoadout } from "./loadout";

export function bankStacks(bank: ItemStack[], stacks: ItemStack[]): ItemStack[] {
  const next = bank.map((s) => ({ ...s }));
  for (const stack of stacks) {
    const existing = next.find((s) => s.defId === stack.defId);
    if (existing) existing.qty += stack.qty;
    else next.push({ ...stack });
  }
  return next;
}

export function endExpedition(state: GameState, expedition: Expedition): GameState {
  const { equipment } = expedition.loadout;
  const durables: ItemStack[] = [];
  for (const piece of [
    equipment.weapon,
    equipment.helmet,
    equipment.chest,
    equipment.legs,
    equipment.boots,
    equipment.gloves,
  ]) {
    if (piece !== null) durables.push({ defId: piece, qty: 1 });
  }
  for (const tool of equipment.tools) durables.push({ defId: tool, qty: 1 });
  if (equipment.transport !== null) durables.push({ defId: equipment.transport, qty: 1 });
  if (equipment.backpack !== null) durables.push({ defId: equipment.backpack, qty: 1 });
  return {
    ...state,
    phase: "town",
    bank: bankStacks(state.bank, [
      ...expedition.carry,
      ...durables,
      ...expedition.loadout.potions,
    ]),
    loadout: emptyLoadout(),
    expedition: null,
  };
}
```

- [ ] **Step 4: Record D26** — append to `docs/decisions.md` after D25:

```markdown
| D26 | Run end — `return` (M5) or combat soft-fail (M4) — banks carry + durable loadout (equipment pieces, tools, transport, backpack) + unspent potions via one shared `endExpedition`; **food is never banked back** (2026-07-03) | Gear must survive runs or crafting is pointless; food was converted to energy at embark and its stacks were pure slot ballast (D23), so banking it would duplicate energy. One helper = no drift between the two run-end paths |
```

- [ ] **Step 5: Run tests, gate + commit**

```bash
git add src/engine/bank.ts test/bank.test.ts docs/decisions.md
git commit -m "M4: D26 run-end banking — endExpedition banks carry+durables, discards food"
```

---

### Task 5: `reduce` case `fight`

**Files:**
- Modify: `src/engine/reduce.ts`, `src/engine/types.ts` (GameEvent variants `fought` + `run-ended`)
- Test: `test/reduce-fight.test.ts`

**Interfaces:**
- Consumes: `resolveCombat` (T3), `endExpedition` (T4), `addToCarry`/`slotCap` (M3), `rejected`, grid regen.
- Produces `fight` semantics (guard order):
  1. Not on expedition → `"not-on-expedition"`.
  2. No POI at pos / kind ≠ monster / pos cleared / `creature` null → `"no-monster"`.
  3. Pre-fight loot fit check (player agency: drop first, then fight): fold `LOOT_TABLE[creature] ?? []` through `addToCarry` with `maxStacks = slotCap(backpack) − food.length − potions.length`; any null → `"carry-full"`.
  4. `resolveCombat(expedition.loadout, expedition.hp, creature)`:
     - **Victory:** hp→`hpAfter`, potions→`potionsAfter`, carry→loot-added carry, `cleared` += pos. Events: `[fought]`.
     - **Defeat (soft fail):** `endExpedition` on an expedition whose potions are `potionsAfter` (quaffed potions are gone) — carry KEPT (banked), no loot. Events: `[fought, run-ended]`.
  - `GameEvent` gains:
    - `{ type: "fought"; at: {x,y}; creature: string; victory: boolean; hpLost: number; potionsUsed: number; loot: ItemStack[]; hp: number }` (hp = after; loot `[]` on defeat) — add `ItemStack` usage (already in types.ts).
    - `{ type: "run-ended"; reason: string }` (`"defeated"` now; M5 adds `"returned"`).
  - `fight` costs no energy (D15: HP is combat's budget).

- [ ] **Step 1: Failing test**

```ts
// test/reduce-fight.test.ts
import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { generateGrid, rollBiome } from "../src/engine/grid";
import type { Grid, Poi } from "../src/engine/grid";
import { resolveCombat } from "../src/engine/combat";
import { LOOT_TABLE, PLAYER_BASE_HP, BASE_CARRY_SLOTS } from "../src/data/constants";
import type { GameState, Loadout } from "../src/engine/types";

function mapWithMonster(creature?: string): { seed: string; grid: Grid; poi: Poi } {
  for (let i = 0; i < 500; i++) {
    const seed = `m4-scan-${i}`;
    const grid = generateGrid(seed, rollBiome(seed));
    const poi = grid.pois.find(
      (p) => p.kind === "monster" && (creature === undefined || p.creature === creature),
    );
    if (poi) return { seed, grid, poi };
  }
  throw new Error(`no map with monster ${creature ?? "(any)"} in scan range`);
}

function atMonster(seed: string, poi: Poi, mutate?: (loadout: Loadout) => void, hp = PLAYER_BASE_HP): GameState {
  const loadout = emptyLoadout();
  loadout.equipment.weapon = "sword";
  mutate?.(loadout);
  return {
    seed: "g",
    phase: "expedition",
    bank: [],
    loadout: emptyLoadout(),
    expedition: {
      mapSeed: seed,
      pos: { x: poi.x, y: poi.y },
      energy: 50,
      hp,
      loadout,
      carry: [],
      cleared: [],
    },
  };
}

test("fight: victory drains HP, consumes the monster, loots into carry", () => {
  const { seed, poi } = mapWithMonster("forest-boar"); // tier 1 — a sword wins this
  const before = atMonster(seed, poi);
  const expected = resolveCombat(before.expedition!.loadout, PLAYER_BASE_HP, poi.creature!);
  expect(expected.victory).toBe(true);
  const { state, events } = reduce(before, { type: "fight" });
  expect(state.phase).toBe("expedition");
  expect(state.expedition!.hp).toBe(expected.hpAfter);
  expect(state.expedition!.carry).toEqual(expected.loot);
  expect(state.expedition!.cleared).toEqual([{ x: poi.x, y: poi.y }]);
  expect(state.expedition!.energy).toBe(50); // fight costs no energy
  expect(events).toEqual([
    {
      type: "fought",
      at: { x: poi.x, y: poi.y },
      creature: poi.creature!,
      victory: true,
      hpLost: expected.hpLost,
      potionsUsed: 0,
      loot: expected.loot,
      hp: expected.hpAfter,
    },
  ]);
});

test("fight: a cleared monster is gone", () => {
  const { seed, poi } = mapWithMonster("forest-boar"); // must WIN the first fight to test re-fighting
  const won = reduce(atMonster(seed, poi), { type: "fight" }).state;
  const { events } = reduce(won, { type: "fight" });
  expect(events).toEqual([
    { type: "action-rejected", action: "fight", reason: "no-monster" },
  ]);
});

test("fight: HP 0 soft-fails — run ends, carry is KEPT in the bank (bead acceptance)", () => {
  const { seed, poi } = mapWithMonster("ice-troll"); // tier 3
  const before = atMonster(seed, poi, (l) => { l.equipment.weapon = null; }, 3); // naked, 3 hp
  before.expedition!.carry = [{ defId: "silver-ore", qty: 3 }];
  const { state, events } = reduce(before, { type: "fight" });
  expect(state.phase).toBe("town");
  expect(state.expedition).toBeNull();
  expect(state.bank.some((s) => s.defId === "silver-ore" && s.qty === 3)).toBe(true);
  expect(events.map((e) => e.type)).toEqual(["fought", "run-ended"]);
  expect(events[0]).toMatchObject({ victory: false, loot: [] });
  expect(events[1]).toEqual({ type: "run-ended", reason: "defeated" });
});

test("fight: pre-fight carry check — full slots reject before any HP is spent", () => {
  const { seed, poi } = mapWithMonster();
  const before = atMonster(seed, poi, (l) => {
    l.food = Array.from({ length: BASE_CARRY_SLOTS }, (_, i) => ({ defId: `r-${i}`, qty: 1 }));
  });
  const { state, events } = reduce(before, { type: "fight" });
  expect(state).toEqual(before);
  expect(events).toEqual([
    { type: "action-rejected", action: "fight", reason: "carry-full" },
  ]);
});

test("fight: empty tile / non-monster tile rejects", () => {
  const { seed, grid, poi } = mapWithMonster();
  const state = atMonster(seed, poi);
  let empty: { x: number; y: number } | null = null;
  outer: for (let y = 0; y < grid.terrain.length; y++) {
    for (let x = 0; x < grid.terrain.length; x++) {
      if (!grid.pois.some((p) => p.x === x && p.y === y)) { empty = { x, y }; break outer; }
    }
  }
  state.expedition!.pos = empty!;
  const { events } = reduce(state, { type: "fight" });
  expect(events).toEqual([
    { type: "action-rejected", action: "fight", reason: "no-monster" },
  ]);
});

test("fight: rejected in town", () => {
  const town: GameState = { seed: "g", phase: "town", bank: [], loadout: emptyLoadout(), expedition: null };
  const { events } = reduce(town, { type: "fight" });
  expect(events).toEqual([
    { type: "action-rejected", action: "fight", reason: "not-on-expedition" },
  ]);
});

test("fight: same seed same outcome; input not mutated (bead acceptance)", () => {
  const { seed, poi } = mapWithMonster();
  const a = atMonster(seed, poi);
  const before = structuredClone(a);
  const r1 = reduce(a, { type: "fight" });
  expect(a).toEqual(before);
  expect(r1).toEqual(reduce(atMonster(seed, poi), { type: "fight" }));
});
```

- [ ] **Step 2: Run to verify it fails** — fight is a no-op stub.

- [ ] **Step 3: Implement** — types.ts: add the two `GameEvent` variants from Interfaces. reduce.ts: import `resolveCombat` from `"./combat"`, `endExpedition` from `"./bank"`, `LOOT_TABLE` into the constants import; `case "fight": return fight(state);` and:

```ts
function fight(state: GameState): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) {
    return rejected(state, "fight", "not-on-expedition");
  }
  const { pos } = expedition;
  const grid = generateGrid(expedition.mapSeed, rollBiome(expedition.mapSeed));
  const poi = grid.pois.find((p) => p.x === pos.x && p.y === pos.y);
  const alreadyCleared = expedition.cleared.some((c) => c.x === pos.x && c.y === pos.y);
  if (!poi || poi.kind !== "monster" || alreadyCleared || poi.creature === null) {
    return rejected(state, "fight", "no-monster");
  }
  const creature = poi.creature;
  // Pre-fight fit check: rejecting is free, so the player can drop and retry
  // instead of losing loot (or HP) to a full pack.
  const maxStacks =
    slotCap(expedition.loadout.equipment.backpack) -
    expedition.loadout.food.length -
    expedition.loadout.potions.length;
  let carryWithLoot: typeof expedition.carry | null = expedition.carry;
  for (const stack of LOOT_TABLE[creature] ?? []) {
    carryWithLoot = addToCarry(carryWithLoot, stack.defId, stack.qty, maxStacks);
    if (carryWithLoot === null) return rejected(state, "fight", "carry-full");
  }
  const result = resolveCombat(expedition.loadout, expedition.hp, creature);
  const fought: GameEvent = {
    type: "fought",
    at: { x: pos.x, y: pos.y },
    creature,
    victory: result.victory,
    hpLost: result.hpLost,
    potionsUsed: result.potionsUsed,
    loot: result.loot,
    hp: result.hpAfter,
  };
  if (!result.victory) {
    // Soft fail (D26): run ends, carry is kept — banked with the durables.
    const ended = endExpedition(state, {
      ...expedition,
      loadout: { ...expedition.loadout, potions: result.potionsAfter },
    });
    return { state: ended, events: [fought, { type: "run-ended", reason: "defeated" }] };
  }
  return {
    state: {
      ...state,
      expedition: {
        ...expedition,
        hp: result.hpAfter,
        loadout: { ...expedition.loadout, potions: result.potionsAfter },
        carry: carryWithLoot,
        cleared: [...expedition.cleared, { x: pos.x, y: pos.y }],
      },
    },
    events: [fought],
  };
}
```

- [ ] **Step 4: Run tests** — `bun test` → all green.

- [ ] **Step 5: Gate + commit**

```bash
git add src/engine/reduce.ts src/engine/types.ts test/reduce-fight.test.ts
git commit -m "M4: fight — deterministic attrition, soft-fail banks carry (D26)"
```

---

### Task 6: `reduce` case `scout`

**Files:**
- Modify: `src/engine/reduce.ts`, `src/engine/types.ts` (GameEvent variant `scouted`)
- Test: `test/reduce-scout.test.ts`

**Interfaces:**
- Produces `scout` semantics:
  1. Not on expedition → `"not-on-expedition"`.
  2. `SCOUT_TOOL` not in `equipment.tools` → `"missing-tool"`.
  3. `SCOUT_ENERGY_COST > energy` → `"exhausted"`.
  4. Success: energy −= cost. For every un-cleared monster POI with a creature within Chebyshev `SCOUT_RADIUS` of pos: report stats + an exact forecast (`resolveCombat` with the CURRENT loadout/hp — the spyglass "pre-computes the exact outcome"). Empty list is a valid result.
  - `GameEvent` gains: `{ type: "scouted"; at: {x,y}; cost: number; energy: number; monsters: { at: {x,y}; creature: string; tier: number; hp: number; dmg: number; dmgType: DmgType; forecast: { victory: boolean; hpLost: number; potionsUsed: number } }[] }` — monster `tags` deliberately NOT revealed (affinities stay discoverable; they surface only implicitly through the forecast numbers).

- [ ] **Step 1: Failing test**

```ts
// test/reduce-scout.test.ts
import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { generateGrid, rollBiome } from "../src/engine/grid";
import type { Grid, Poi } from "../src/engine/grid";
import { resolveCombat } from "../src/engine/combat";
import {
  MONSTERS,
  MONSTER_TIER_HP_CURVE,
  SCOUT_ENERGY_COST,
  SCOUT_RADIUS,
  SCOUT_TOOL,
  PLAYER_BASE_HP,
} from "../src/data/constants";
import type { GameState } from "../src/engine/types";

function mapWithMonster(): { seed: string; grid: Grid; poi: Poi } {
  for (let i = 0; i < 500; i++) {
    const seed = `m4-scout-${i}`;
    const grid = generateGrid(seed, rollBiome(seed));
    const poi = grid.pois.find((p) => p.kind === "monster");
    if (poi) return { seed, grid, poi };
  }
  throw new Error("no monster map in scan range");
}

function nearMonster(seed: string, poi: Poi, tools: string[], energy = 20): GameState {
  const loadout = emptyLoadout();
  loadout.equipment.weapon = "sword";
  loadout.equipment.tools = tools;
  return {
    seed: "g",
    phase: "expedition",
    bank: [],
    loadout: emptyLoadout(),
    expedition: {
      mapSeed: seed,
      pos: { x: poi.x, y: poi.y }, // standing on it — distance 0 ≤ radius
      energy,
      hp: PLAYER_BASE_HP,
      loadout,
      carry: [],
      cleared: [],
    },
  };
}

test("scout: without a spyglass there is no information (bead acceptance)", () => {
  const { seed, poi } = mapWithMonster();
  const { events } = reduce(nearMonster(seed, poi, []), { type: "scout" });
  expect(events).toEqual([
    { type: "action-rejected", action: "scout", reason: "missing-tool" },
  ]);
});

test("scout: with a spyglass, nearby monsters come back with stats + exact forecast", () => {
  const { seed, grid, poi } = mapWithMonster();
  const before = nearMonster(seed, poi, [SCOUT_TOOL]);
  const { state, events } = reduce(before, { type: "scout" });
  expect(state.expedition!.energy).toBe(20 - SCOUT_ENERGY_COST);
  expect(events.length).toBe(1);
  const event = events[0]! as Extract<
    (typeof events)[number],
    { type: "scouted" }
  >;
  expect(event.type).toBe("scouted");
  expect(event.cost).toBe(SCOUT_ENERGY_COST);
  const reported = event.monsters.find((m) => m.at.x === poi.x && m.at.y === poi.y)!;
  expect(reported.creature).toBe(poi.creature!);
  expect(reported.hp).toBe(MONSTER_TIER_HP_CURVE[MONSTERS[poi.creature!]!.tier]!);
  const expected = resolveCombat(before.expedition!.loadout, PLAYER_BASE_HP, poi.creature!);
  expect(reported.forecast).toEqual({
    victory: expected.victory,
    hpLost: expected.hpLost,
    potionsUsed: expected.potionsUsed,
  });
  // hidden layer stays hidden: no tags on the wire
  expect("tags" in reported).toBe(false);
  // every reported monster is within the radius
  for (const m of event.monsters) {
    const d = Math.max(Math.abs(m.at.x - poi.x), Math.abs(m.at.y - poi.y));
    expect(d).toBeLessThanOrEqual(SCOUT_RADIUS);
  }
  // and every reportable monster in radius IS reported
  const inRadius = grid.pois.filter(
    (p) =>
      p.kind === "monster" &&
      p.creature !== null &&
      Math.max(Math.abs(p.x - poi.x), Math.abs(p.y - poi.y)) <= SCOUT_RADIUS,
  );
  expect(event.monsters.length).toBe(inRadius.length);
});

test("scout: cleared monsters are not reported", () => {
  const { seed, poi } = mapWithMonster();
  const state = nearMonster(seed, poi, [SCOUT_TOOL]);
  state.expedition!.cleared = [{ x: poi.x, y: poi.y }];
  const { events } = reduce(state, { type: "scout" });
  const event = events[0]! as { type: string; monsters: { at: { x: number; y: number } }[] };
  expect(event.monsters.some((m) => m.at.x === poi.x && m.at.y === poi.y)).toBe(false);
});

test("scout: energy gate", () => {
  const { seed, poi } = mapWithMonster();
  const { events } = reduce(nearMonster(seed, poi, [SCOUT_TOOL], 0), { type: "scout" });
  expect(events).toEqual([
    { type: "action-rejected", action: "scout", reason: "exhausted" },
  ]);
});

test("scout: rejected in town; deterministic; no mutation", () => {
  const town: GameState = { seed: "g", phase: "town", bank: [], loadout: emptyLoadout(), expedition: null };
  expect(reduce(town, { type: "scout" }).events).toEqual([
    { type: "action-rejected", action: "scout", reason: "not-on-expedition" },
  ]);
  const { seed, poi } = mapWithMonster();
  const a = nearMonster(seed, poi, [SCOUT_TOOL]);
  const before = structuredClone(a);
  const r1 = reduce(a, { type: "scout" });
  expect(a).toEqual(before);
  expect(r1).toEqual(reduce(nearMonster(seed, poi, [SCOUT_TOOL]), { type: "scout" }));
});
```

- [ ] **Step 2: Run to verify it fails** — scout is a no-op stub.

- [ ] **Step 3: Implement** — types.ts: add the `scouted` variant (import `DmgType` type into types.ts's constants import). reduce.ts: add `MONSTERS, MONSTER_TIER_HP_CURVE, MONSTER_TIER_DMG_CURVE, SCOUT_ENERGY_COST, SCOUT_RADIUS, SCOUT_TOOL` to imports; `case "scout": return scout(state);` and:

```ts
function scout(state: GameState): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) {
    return rejected(state, "scout", "not-on-expedition");
  }
  if (!expedition.loadout.equipment.tools.includes(SCOUT_TOOL)) {
    return rejected(state, "scout", "missing-tool");
  }
  if (SCOUT_ENERGY_COST > expedition.energy) {
    return rejected(state, "scout", "exhausted");
  }
  const { pos } = expedition;
  const grid = generateGrid(expedition.mapSeed, rollBiome(expedition.mapSeed));
  const monsters = grid.pois
    .filter(
      (p) =>
        p.kind === "monster" &&
        p.creature !== null &&
        Math.max(Math.abs(p.x - pos.x), Math.abs(p.y - pos.y)) <= SCOUT_RADIUS &&
        !expedition.cleared.some((c) => c.x === p.x && c.y === p.y),
    )
    .map((p) => {
      const monster = MONSTERS[p.creature!]!;
      const forecast = resolveCombat(expedition.loadout, expedition.hp, p.creature!);
      return {
        at: { x: p.x, y: p.y },
        creature: p.creature!,
        tier: monster.tier,
        hp: MONSTER_TIER_HP_CURVE[monster.tier]!,
        dmg: MONSTER_TIER_DMG_CURVE[monster.tier]!,
        dmgType: monster.dmgType,
        // tags deliberately withheld: affinities are discoverable, and the
        // forecast already prices them in without naming them.
        forecast: {
          victory: forecast.victory,
          hpLost: forecast.hpLost,
          potionsUsed: forecast.potionsUsed,
        },
      };
    });
  const energy = expedition.energy - SCOUT_ENERGY_COST;
  return {
    state: { ...state, expedition: { ...expedition, energy } },
    events: [
      { type: "scouted", at: { x: pos.x, y: pos.y }, cost: SCOUT_ENERGY_COST, energy, monsters },
    ],
  };
}
```

Also update the reducer's header comment: remaining stubs `craft/pack/return → M5`.

- [ ] **Step 4: Run tests** — `bun test` → all green.

- [ ] **Step 5: Gate + commit**

```bash
git add src/engine/reduce.ts src/engine/types.ts test/reduce-scout.test.ts
git commit -m "M4: scout — spyglass-gated stats + exact fight forecast, tags withheld"
```

---

### Task 7: Acceptance check, docs, gates

**Files:**
- Modify: `docs/balance-levers.md` (combat group)

- [ ] **Step 1: Verify the bead's acceptance criteria**

1. *Silver vs werewolf ×2* — combat.test playerDamage test PASSES.
2. *Plate cuts ranged more than magic* — mitigation test PASSES.
3. *HP 0 soft-fails keeping carry* — reduce-fight soft-fail test PASSES (carry banked, phase town).
4. *Scout changes available info* — without spyglass: rejection; with: stats + forecast. PASSES.
5. *Same seed same outcome* — determinism tests in combat/fight/scout suites; `grep -rn "Math.random\|Date.now" src/engine/` → no hits.
6. D21 spot-check: `grep -n "BIOMES" src/engine/combat.ts src/engine/reduce.ts src/engine/bank.ts` → no hits (creature comes stamped on the POI). Capture outputs.

- [ ] **Step 2: Update `docs/balance-levers.md`** — replace the Combat group:

```markdown
**Combat**
- `PLAYER_BASE_HP` · `DMG_ARMOUR_MATRIX[dmgType][armourType]` — read BOTH ways: damage multiplier vs the monster's hide class going out, mitigation divisor per armour piece coming in (`defense ÷ matrix`) · `ARMOUR{pieceDefId} → {armourType, defense}` · `WEAPONS{defId} → {dmgType, damage, tags}` · `UNARMED_DAMAGE`
- `AFFINITIES[{monsterTag, itemTag}]` + `AFFINITY_MULTIPLIER` — the hidden discoverable layer (silver↔werewolf, iron↔fae, garlic↔vampire); scout forecasts price it in without naming it
- `POTION_HEAL` · `AUTO_POTION_THRESHOLD` (fraction of base HP) · `CHIP_DAMAGE_MIN` — the "HP always drains" floor, both directions
- `MONSTER_TIER_HP_CURVE` / `MONSTER_TIER_DMG_CURVE` · `MONSTERS{defId} → {tier, dmgType, armourType, tags}` · `LOOT_TABLE{monster}` (fixed drops — determinism needs no RNG) · `BIOMES{id}.creatureTable` (uniform pick, stamped at generation)
- `SCOUT_ENERGY_COST` · `SCOUT_RADIUS` · `SCOUT_TOOL`
```

- [ ] **Step 3: Full gates** — `bun test && bun run typecheck && bun run lint` → all green; snapshots unchanged all milestone.

- [ ] **Step 4: Commit**

```bash
git add docs/balance-levers.md
git commit -m "M4: document combat levers"
```

(The controller closes the bead after the final whole-branch review.)

---

## Self-Review

- **Spec coverage:** per-piece armour aggregation ✓ (T3 mitigation) · hidden affinities ✓ (T1 AFFINITIES + T3) · auto-potions at threshold ✓ (T3) · HP drain always ✓ (chip floor) · soft-fail keeps carry ✓ (T4 D26 + T5) · scout reveals stats with spyglass ✓ (T6) · deterministic loot ✓ (fixed tables) · monsters from biome creatureTable at generation only ✓ (T2, D21-safe) · combat GameEvent variants ✓ (T5/T6) · levers filled ✓ (T1).
- **Placeholder scan:** none.
- **Type consistency:** `DmgType`/`ArmourType` defined once (T1); `CombatResult` defined in combat.ts (T3), consumed in T5/T6; `endExpedition(state, expedition)` signature identical T4/T5; event shapes match between types.ts and test assertions; `Poi.creature` (T2) consumed T5/T6.
- **Noted judgment calls:** monsters get an `armourType` so the visible matrix works both ways (weapon choice matters); pre-fight carry check gives agency instead of losing loot; scout forecast uses current loadout+hp and withholds tags (anti-wiki); potions consumed from stacks in order; `ARMOUR_DEFENSE` placeholder deleted in favor of the `ARMOUR` catalog; scout on the monster's own tile counts (distance 0); fight costs no energy (D15); tier-3 monsters are deliberately lethal to an ungeared player (the crafting pull).
