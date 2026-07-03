import { test, expect } from "bun:test";
import { playerDamage, mitigation, resolveCombat } from "../src/engine/combat";
import { emptyLoadout } from "../src/engine/loadout";
import {
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
