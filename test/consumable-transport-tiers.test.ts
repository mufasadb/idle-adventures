import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { resolveCombat } from "../src/engine/combat";
import { moveCost } from "../src/engine/move";
import { slotCap } from "../src/engine/carry";
import { emptyLoadout } from "../src/engine/loadout";
import type { GameState } from "../src/engine/types";

// Consumable/transport/backpack tiers (2026-07-04). Better consumables give more
// per item — progression EARNS efficiency against the firm carry squeeze.

function town(bank: { defId: string; qty: number }[]): GameState {
  return { seed: "t", phase: "town", bank, loadout: emptyLoadout(), expedition: null };
}

test("embark: trail-ration yields 20 energy/item vs ration's 10 (per-food lever)", () => {
  const withRation = reduce(
    { ...town([{ defId: "ration", qty: 2 }]), loadout: { ...emptyLoadout(), food: [{ defId: "ration", qty: 2 }] } },
    { type: "embark", mapSeed: "t:map:0" },
  ).state;
  const withTrail = reduce(
    { ...town([{ defId: "trail-ration", qty: 2 }]), loadout: { ...emptyLoadout(), food: [{ defId: "trail-ration", qty: 2 }] } },
    { type: "embark", mapSeed: "t:map:0" },
  ).state;
  expect(withRation.expedition!.energy).toBe(20); // 2 × 10
  expect(withTrail.expedition!.energy).toBe(40); // 2 × 20 — same 1 slot, double energy
});

test("combat: a greater-potion heals 20 where a potion heals 10", () => {
  // iron plate makes the tier-3 fight winnable so the heal difference actually
  // shows (ungeared vs a tier-3 is lethal after the 2026-07-05 rebalance).
  const base = emptyLoadout();
  base.equipment.weapon = "sword";
  base.equipment.helmet = "plate-helmet";
  base.equipment.chest = "plate-chest";
  base.equipment.legs = "plate-legs";
  base.equipment.boots = "plate-boots";
  base.equipment.gloves = "plate-gloves";
  const withPotions = { ...base, potions: [{ defId: "potion", qty: 2 }] };
  const withGreater = { ...base, potions: [{ defId: "greater-potion", qty: 2 }] };
  const a = resolveCombat(withPotions, 30, "ice-troll");
  const b = resolveCombat(withGreater, 30, "ice-troll");
  expect(b.hpAfter).toBeGreaterThan(a.hpAfter); // greater potions sustain more per quaff
});

test("move: a wagon halves cost (÷2.0) — cheaper than a horse (÷1.5)", () => {
  expect(moveCost("ice", "wagon")).toBeLessThan(moveCost("ice", "horse"));
  expect(moveCost("plains", "wagon")).toBe(moveCost("plains", null) / 2);
});

test("backpack: large-pack (8) tops the leather (6) / starter (4) ladder", () => {
  expect(slotCap("large-pack")).toBe(8);
  expect(slotCap("large-pack")).toBeGreaterThan(slotCap("leather"));
});
