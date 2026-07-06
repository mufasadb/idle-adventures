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

test("full mithril plate meaningfully outclimbs iron on tier-3s (the climb pays off)", () => {
  // si7.1: % mitigation (MITIGATION_K/(K+D)) REPLACES the old flat subtraction
  // — armour reduces the toll but never floors it to near-zero, so "near-immune"
  // is no longer the contract (that was the M7 F1 collapse this model retires).
  // Mithril (D=15 vs melee) still nearly halves iron's per-hit dmgIn again
  // (ice-troll: iron dmgIn=7 vs mithril dmgIn=4 — a real, load-bearing upgrade)
  // and both fights stay winnable.
  for (const mid of ["dust-vampire", "ice-troll"]) {
    const mithril = resolveCombat(fullPlate("mithril-plate-"), 30, mid);
    const iron = resolveCombat(fullPlate("plate-"), 30, mid);
    expect(mithril.victory).toBe(true);
    expect(iron.victory).toBe(true);
    // …and it's a REAL upgrade: iron plate still loses meaningfully more HP to
    // the same tier-3 than mithril does (percentage model, not a chip floor).
    expect(iron.hpLost).toBeGreaterThan(mithril.hpLost);
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
