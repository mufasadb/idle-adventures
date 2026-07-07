import { test, expect } from "bun:test";
import { playerDamage, mitigation, resolveCombat, rollLoot } from "../src/engine/combat";
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
  // Premise update (D45 ranged-combat spec, 2026-07-07): a bow now needs ammo
  // held or it degrades to UNARMED_DAMAGE — arm it with arrows so this still
  // measures the matrix, not the empty quiver.
  const bow = armed("bow");
  bow.ammo = [{ defId: "arrows", qty: 5 }];
  // giant-scorpion is plate: magic (1.5×) should out-damage ranged (0.5×)
  expect(playerDamage(armed("fire-staff"), "giant-scorpion")).toBeGreaterThan(
    playerDamage(bow, "giant-scorpion"),
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

test("rollLoot: a fixed-drop monster yields fresh copies of its table", () => {
  const loot = rollLoot("s", "werewolf", { x: 1, y: 2 });
  expect(loot).toEqual(LOOT_TABLE.werewolf!);
  expect(loot).not.toBe(LOOT_TABLE.werewolf); // fresh copies, no aliasing
});

test("rollLoot: chance drops roll deterministically (Wyrm's dragonheart @0.2)", () => {
  // Same (seed, creature, tile) → identical outcome; the guaranteed wyrm-scale
  // is always present, the dragonheart appears only when its roll lands.
  const at = { x: 4, y: 7 };
  const loot = rollLoot("boss-seed", "ancient-wyrm", at);
  expect(rollLoot("boss-seed", "ancient-wyrm", at)).toEqual(loot); // deterministic
  expect(loot.some((l) => l.defId === "wyrm-scale" && l.qty === 3)).toBe(true); // always
  // Sweep tiles: ~1-in-5 include the rare, and every drop is 0 or 1 dragonheart.
  let withHeart = 0;
  for (let x = 0; x < 200; x++) {
    const roll = rollLoot("boss-seed", "ancient-wyrm", { x, y: 0 });
    const hearts = roll.filter((l) => l.defId === "dragonheart");
    expect(hearts.length).toBeLessThanOrEqual(1);
    if (hearts.length) withHeart++;
  }
  expect(withHeart).toBeGreaterThan(20); // ≈40/200; loose band around 20%
  expect(withHeart).toBeLessThan(60);
});

test("resolveCombat: silver sword beats the werewolf cheaper than a plain sword", () => {
  const plain = resolveCombat(armed("sword"), PLAYER_BASE_HP, "werewolf");
  const silver = resolveCombat(armed("silver-sword"), PLAYER_BASE_HP, "werewolf");
  expect(silver.hpLost).toBeLessThan(plain.hpLost);
});

test("resolveCombat: auto-potions quaff at the threshold and are consumed in stack order", () => {
  // Re-picked (si7.1 task 3 review): the OLD ice-troll bare-kit scenario went
  // vacuous once the steepened tier-3 curve made both hpAfter clamp to 0
  // (0 >= 0 always passes, potions or not). werewolf (tier 2, HP curve 16,
  // dmgOut=3.75/hit sword, dmgIn=8/hit unarmoured) is the real case: it's a
  // LOSS bare-kit and a WIN with potions —
  //
  //   no potions: R1 mHp 16→12.25, hp 30→22 · R2 mHp→8.5, hp→14 (≤15 threshold
  //   but no potions to quaff) · R3 mHp→4.75, hp→6 · R4 mHp→1 (still >0), hp
  //   6-8=-2→clamped 0 → defeated (loss).
  //
  //   3 potions: R1 same, hp→22 · R2 mHp→8.5, hp 22-8=14 ≤15 threshold → quaff
  //   (10 heal) → hp 24, potionsUsed=1 · R3 mHp→4.75, hp 24-8=16 · R4 mHp→1
  //   (still >0), hp 16-8=8 ≤15 → quaff → hp 18, potionsUsed=1 · R5 dmgDealt
  //   3.75 vs monsterHp 1 → monster dies (victory), no retaliation, hp stays
  //   18. Net: potionsUsed=2, victory flips false→true, hpAfter 0→18.
  const noPotions = resolveCombat(armed("sword"), PLAYER_BASE_HP, "werewolf");
  const withPotions = resolveCombat(armed("sword", { potions: [{ defId: "healing-potion", qty: 3 }] }), PLAYER_BASE_HP, "werewolf");
  expect(noPotions.victory).toBe(false);
  expect(noPotions.hpAfter).toBe(0);
  expect(withPotions.victory).toBe(true);
  expect(withPotions.potionsUsed).toBe(2);
  expect(withPotions.potionsAfter.reduce((s, p) => s + p.qty, 0)).toBe(3 - withPotions.potionsUsed);
  expect(withPotions.hpAfter).toBe(18);
  // potions are what turned this loss into a win — a real assertion, not 0≥0.
  expect(withPotions.hpAfter).toBeGreaterThan(noPotions.hpAfter);
});

test("resolveCombat: defeat clamps to 0", () => {
  const result = resolveCombat(armed(null), 3, "ice-troll");
  expect(result.victory).toBe(false);
  expect(result.hpAfter).toBe(0);
  expect(result.hpLost).toBe(3);
});

test("resolveCombat: pure and deterministic", () => {
  const loadout = armed("sword", { potions: [{ defId: "healing-potion", qty: 1 }] });
  const before = structuredClone(loadout);
  const a = resolveCombat(loadout, PLAYER_BASE_HP, "frost-fae");
  expect(loadout).toEqual(before);
  expect(a).toEqual(resolveCombat(loadout, PLAYER_BASE_HP, "frost-fae"));
});

test("battle items (bzd): elixir adds damage, warding adds mitigation, both consumed", () => {
  // A survivable fight so the buff's effect on HP lost shows. si7.1: bare-kit
  // sword vs werewolf (tier 2) no longer survives under the steepened curves
  // (4 retaliations × 8 dmg = 32 > 30 HP) — forest-boar (tier 1, neutral
  // matchup) is the bare-kit-survivable fight the old werewolf case relied on.
  const plain = resolveCombat(armed("sword"), PLAYER_BASE_HP, "forest-boar");
  expect(plain.victory).toBe(true);
  // elixir-of-power (+2 dmg) ends the fight sooner → less HP lost
  const withElixir = armed("sword");
  withElixir.battleItems = [{ defId: "elixir-of-power", qty: 1 }];
  const elixir = resolveCombat(withElixir, PLAYER_BASE_HP, "forest-boar");
  expect(elixir.hpLost).toBeLessThan(plain.hpLost);
  // warding-draught (+3 mitigation) softens every incoming hit → less HP lost
  const withWard = armed("sword");
  withWard.battleItems = [{ defId: "warding-draught", qty: 1 }];
  const ward = resolveCombat(withWard, PLAYER_BASE_HP, "forest-boar");
  expect(ward.hpLost).toBeLessThan(plain.hpLost);
  // consumed at fight start — nothing carries over
  expect(elixir.battleItemsAfter).toEqual([]);
  expect(ward.battleItemsAfter).toEqual([]);
});

test("tier curves: bigger tiers are tougher (sanity)", () => {
  expect(MONSTER_TIER_HP_CURVE[3]!).toBeGreaterThan(MONSTER_TIER_HP_CURVE[1]!);
  expect(MONSTER_TIER_DMG_CURVE[3]!).toBeGreaterThan(MONSTER_TIER_DMG_CURVE[1]!);
  expect(MONSTERS["ice-troll"]!.tier).toBe(3);
});

// --- explainMatchup (9u9.2): post-fight RPS/affinity lesson facts ---
import { explainMatchup } from "../src/engine/combat";

function loadoutWith(patch: Partial<ReturnType<typeof emptyLoadout>["equipment"]>) {
  const l = emptyLoadout();
  Object.assign(l.equipment, patch);
  return l;
}

test("explainMatchup: right-type weapon beats the hide (>1), wrong-type glances (<1)", () => {
  // fire-staff (magic) vs ice-troll (plate): magic→plate = 1.5 (>1)
  expect(explainMatchup(loadoutWith({ weapon: "fire-staff" }), "ice-troll").weaponVsHide).toBeGreaterThan(1);
  // bow (ranged) vs ice-troll (plate): ranged→plate = 0.5 (<1)
  expect(explainMatchup(loadoutWith({ weapon: "bow" }), "ice-troll").weaponVsHide).toBeLessThan(1);
});

test("explainMatchup: affinity pairing fires", () => {
  // silver-sword (silver) vs werewolf (werewolf tag) → affinity
  expect(explainMatchup(loadoutWith({ weapon: "silver-sword" }), "werewolf").affinityFired).toBe(true);
  expect(explainMatchup(loadoutWith({ weapon: "sword" }), "werewolf").affinityFired).toBe(false);
});

test("explainMatchup: armour class vs incoming damage type classifies", () => {
  // sand-raider = ranged; plate→ranged matrix 0.5 (<1) → resisted
  expect(explainMatchup(loadoutWith({ chest: "plate-chest" }), "sand-raider").armourVsAttack).toBe("resisted");
  // dust-vampire = magic; plate→magic 1.5 (>1) → exposed
  expect(explainMatchup(loadoutWith({ chest: "plate-chest" }), "dust-vampire").armourVsAttack).toBe("exposed");
  // no armour → neutral
  expect(explainMatchup(emptyLoadout(), "sand-raider").armourVsAttack).toBe("neutral");
});

// --- Category loot (8ec) ---
import { rand } from "../src/engine/rng";
import { MAP_DROP_CHANCE, MAP_SCROLL_ID } from "../src/data/constants";

test("rollLoot merges category loot: humanoids roll a map-scroll at MAP_DROP_CHANCE", () => {
  const at = { x: 1, y: 1 };
  let seedHit = "", seedMiss = "";
  for (let i = 0; i < 200 && (!seedHit || !seedMiss); i++) {
    const s = `cat-loot-${i}`;
    const roll = rand(s, "loot", "sand-raider", at.x, at.y, MAP_SCROLL_ID);
    if (roll < MAP_DROP_CHANCE && !seedHit) seedHit = s;
    if (roll >= MAP_DROP_CHANCE && !seedMiss) seedMiss = s;
  }
  const lootHit = rollLoot(seedHit, "sand-raider", at);
  expect(lootHit).toContainEqual({ defId: MAP_SCROLL_ID, qty: 1 });
  expect(lootHit).toContainEqual({ defId: "raider-supplies", qty: 1 }); // monster table still applies
  const lootMiss = rollLoot(seedMiss, "sand-raider", at);
  expect(lootMiss.some((s) => s.defId === MAP_SCROLL_ID)).toBe(false);
});

test("non-humanoid categories add no loot (empty category tables)", () => {
  const loot = rollLoot("beast-seed", "forest-boar", { x: 3, y: 3 });
  expect(loot).toEqual([{ defId: "boar-hide", qty: 2 }]);
});
