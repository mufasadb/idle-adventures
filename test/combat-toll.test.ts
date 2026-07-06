import { test, expect } from "bun:test";
import { resolveCombat, damageTaken } from "../src/engine/combat";
import { emptyLoadout } from "../src/engine/loadout";
import {
  PLAYER_BASE_HP,
  CHIP_DAMAGE_MIN,
  MONSTER_TIER_DMG_CURVE,
} from "../src/data/constants";
import type { Loadout } from "../src/engine/types";

function kit(weapon: string | null, armour: Partial<Record<"helmet" | "chest" | "legs" | "boots" | "gloves", string>> = {}, potions: { defId: string; qty: number }[] = []): Loadout {
  const l = emptyLoadout();
  l.equipment.weapon = weapon;
  for (const [slot, defId] of Object.entries(armour)) (l.equipment as Record<string, unknown>)[slot] = defId;
  l.potions = potions;
  return l;
}

// Toll bands (spec §2): bare kit vs tier-1 — good ≤ ~13%, neutral 20–30%, bad ≥ 40%.
test("toll: good matchup tier-1 is cheap (sword vs fae-sprite, robe hide)", () => {
  const r = resolveCombat(kit("sword"), PLAYER_BASE_HP, "fae-sprite");
  expect(r.victory).toBe(true);
  expect(r.hpLost / PLAYER_BASE_HP).toBeLessThanOrEqual(0.14);
});

test("toll: neutral tier-1 costs real HP (sword vs forest-boar)", () => {
  const r = resolveCombat(kit("sword"), PLAYER_BASE_HP, "forest-boar");
  expect(r.victory).toBe(true);
  expect(r.hpLost / PLAYER_BASE_HP).toBeGreaterThanOrEqual(0.2);
  expect(r.hpLost / PLAYER_BASE_HP).toBeLessThanOrEqual(0.34);
});

test("toll: bad matchup tier-1 hurts but is survivable (unarmed vs forest-boar)", () => {
  const r = resolveCombat(kit(null), PLAYER_BASE_HP, "forest-boar");
  expect(r.victory).toBe(true);
  expect(r.hpLost / PLAYER_BASE_HP).toBeGreaterThanOrEqual(0.4);
});

// % mitigation (spec §1): armour reduces, never floors.
test("mitigation: full iron plate cuts a tier-3 melee hit ~50%, never to chip", () => {
  const plate = { helmet: "plate-helmet", chest: "plate-chest", legs: "plate-legs", boots: "plate-boots", gloves: "plate-gloves" };
  const dmgIn = damageTaken(kit("sword", plate), "ice-troll");
  const bare = MONSTER_TIER_DMG_CURVE[3]!;
  expect(dmgIn).toBeGreaterThan(CHIP_DAMAGE_MIN);
  expect(dmgIn / bare).toBeGreaterThanOrEqual(0.4);
  expect(dmgIn / bare).toBeLessThanOrEqual(0.6);
});

test("mitigation: full mithril plate caps ~60-70% reduction, never chip-locks", () => {
  const mithril = { helmet: "mithril-plate-helmet", chest: "mithril-plate-chest", legs: "mithril-plate-legs", boots: "mithril-plate-boots", gloves: "mithril-plate-gloves" };
  const dmgIn = damageTaken(kit("mithril-sword", mithril), "ice-troll");
  const bare = MONSTER_TIER_DMG_CURVE[3]!;
  expect(dmgIn).toBeGreaterThan(CHIP_DAMAGE_MIN);
  expect(1 - dmgIn / bare).toBeGreaterThanOrEqual(0.6);
  expect(1 - dmgIn / bare).toBeLessThanOrEqual(0.75);
});

// D34 gate recalibrated (spec §2 pinned invariant): 3 greater-potions win, 2 die.
const MITHRIL = { helmet: "mithril-plate-helmet", chest: "mithril-plate-chest", legs: "mithril-plate-legs", boots: "mithril-plate-boots", gloves: "mithril-plate-gloves" };
test("Wyrm gate: full mithril + mithril-sword + 3 greater-potions wins", () => {
  const r = resolveCombat(kit("mithril-sword", MITHRIL, [{ defId: "greater-potion", qty: 3 }]), PLAYER_BASE_HP, "ancient-wyrm");
  expect(r.victory).toBe(true);
});

test("Wyrm gate: the same kit with 2 greater-potions dies", () => {
  const r = resolveCombat(kit("mithril-sword", MITHRIL, [{ defId: "greater-potion", qty: 2 }]), PLAYER_BASE_HP, "ancient-wyrm");
  expect(r.victory).toBe(false);
});

// Farmability (spec §2 pinned invariant): wyrmfang's dragon affinity tames the repeat kill.
test("Wyrm farm: wyrmfang + mithril beats the Wyrm without potions", () => {
  const r = resolveCombat(kit("wyrmfang", MITHRIL), PLAYER_BASE_HP, "ancient-wyrm");
  expect(r.victory).toBe(true);
  expect(r.hpLost).toBeLessThanOrEqual(27);
});
