import { test, expect } from "bun:test";
import { ARMOUR, WEAPONS, MATERIAL_TIER, RECIPE } from "../src/data/constants";
import { resolveCombat } from "../src/engine/combat";
import { emptyLoadout } from "../src/engine/loadout";
import type { Loadout } from "../src/engine/types";

// Gear tiers (2026-07-04): defense/damage scale by tier; the top (mithril plate)
// trivializes combat BY DESIGN — but it sits behind the longest gather-gated
// climb, so it's earned, not given. Early single-type armour still creates a
// real matrix matchup.

test("armour defense scales by tier: iron < steel < mithril (plate)", () => {
  expect(ARMOUR["steel-plate-chest"]!.defense).toBeGreaterThan(ARMOUR["plate-chest"]!.defense);
  expect(ARMOUR["mithril-plate-chest"]!.defense).toBeGreaterThan(ARMOUR["steel-plate-chest"]!.defense);
  // light/robe get one T2 bump on their sample pieces
  expect(ARMOUR["studded-chest"]!.defense).toBeGreaterThan(ARMOUR["light-chest"]!.defense);
  expect(ARMOUR["enchanted-chest"]!.defense).toBeGreaterThan(ARMOUR["robe-chest"]!.defense);
});

test("weapon damage scales modestly: 3 -> 4 -> 6", () => {
  expect(WEAPONS["sword"]!.damage).toBe(3);
  expect(WEAPONS["steel-sword"]!.damage).toBe(4);
  expect(WEAPONS["mithril-sword"]!.damage).toBe(6);
  expect(WEAPONS["composite-bow"]!.damage).toBe(4);
  expect(WEAPONS["inferno-staff"]!.damage).toBe(4);
});

const fullPlate = (p: "plate-" | "steel-plate-" | "mithril-plate-"): Loadout => {
  const l = emptyLoadout();
  l.equipment.helmet = `${p}helmet`;
  l.equipment.chest = `${p}chest`;
  l.equipment.legs = `${p}legs`;
  l.equipment.boots = `${p}boots`;
  l.equipment.gloves = `${p}gloves`;
  l.equipment.weapon = "mithril-sword";
  return l;
};

test("full mithril plate trivializes even tier-3 monsters (intended F1, now earned)", () => {
  for (const mid of ["dust-vampire", "ice-troll"]) {
    const r = resolveCombat(fullPlate("mithril-plate-"), 30, mid);
    expect(r.victory).toBe(true);
    expect(r.hpLost).toBeLessThanOrEqual(3); // near-immune at the top of the climb
  }
});

test("armour TYPE still matters early: plate beats robe vs a ranged attacker", () => {
  const plate = emptyLoadout();
  plate.equipment.chest = "plate-chest"; // plate halves ranged
  const robe = emptyLoadout();
  robe.equipment.chest = "robe-chest"; // robe takes ranged at 1.5x
  const vsPlate = resolveCombat(plate, 30, "sand-raider"); // tier-1 ranged
  const vsRobe = resolveCombat(robe, 30, "sand-raider");
  expect(vsPlate.hpLost).toBeLessThan(vsRobe.hpLost); // the matrix choice is real before you're maxed
});

test("top-tier gear is gated: its recipe inputs are high-tier materials", () => {
  // mithril plate needs mithril-ore (T3 → steel-pick); steel plate needs coal (T2 → iron-pick)
  expect(RECIPE["mithril-plate-chest"]!.inputs.some((i) => MATERIAL_TIER[i.defId] === 3)).toBe(true);
  expect(RECIPE["steel-plate-chest"]!.inputs.some((i) => MATERIAL_TIER[i.defId] === 2)).toBe(true);
});
