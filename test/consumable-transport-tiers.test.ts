import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { resolveCombat } from "../src/engine/combat";
import { moveCost } from "../src/engine/move";
import { slotCap } from "../src/engine/carry";
import { emptyLoadout } from "../src/engine/loadout";
import { candidateMaps } from "../src/engine/town";
import type { GameState } from "../src/engine/types";

const OFFER_T = candidateMaps("t", 0)[0]!.mapSeed; // an offered map for seed "t" (9u9.3)

// Consumable/transport/backpack tiers (2026-07-04). Better consumables give more
// per item — progression EARNS efficiency against the firm carry squeeze.

function town(bank: { defId: string; qty: number }[]): GameState {
  return { seed: "t", phase: "town", bank, loadout: emptyLoadout(), expedition: null };
}

test("eat: trail-ration RESTORES 2× a ration (per-food lever now = restore, ff7/dtv)", () => {
  // Stamina model (dtv): FOOD_ENERGY is restore-per-unit, not embark energy. Both
  // embark at MAX_ENERGY; the tier edge shows when you EAT. Drain first so a full
  // unit fits (no waste), then manually eat one and read the refill.
  const withRation = reduce(
    { ...town([{ defId: "ration", qty: 3 }]), loadout: { ...emptyLoadout(), food: [{ defId: "ration", qty: 3 }] } },
    { type: "embark", mapSeed: OFFER_T },
  ).state;
  const withTrail = reduce(
    { ...town([{ defId: "trail-ration", qty: 3 }]), loadout: { ...emptyLoadout(), food: [{ defId: "trail-ration", qty: 3 }] } },
    { type: "embark", mapSeed: OFFER_T },
  ).state;
  // both start at max
  expect(withRation.expedition!.energy).toBe(300);
  expect(withTrail.expedition!.energy).toBe(300);
  // drain to 0, then manually eat one unit. Manual eat (m0a) jumps energy TO
  // foodEnergy (no tent → ×1), so the tier edge shows as the landing value.
  const drainedR = { ...withRation, expedition: { ...withRation.expedition!, energy: 0 } };
  const drainedT = { ...withTrail, expedition: { ...withTrail.expedition!, energy: 0 } };
  const ateR = reduce(drainedR, { type: "eat" }).state;
  const ateT = reduce(drainedT, { type: "eat" }).state;
  expect(ateR.expedition!.energy).toBe(80);  // jumped TO 80 (ration density)
  expect(ateT.expedition!.energy).toBe(130); // jumped TO 130 — same slot, denser (si7.2 compression)
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

test("move: transport is terrain-specific — wagon wins on ice, horse wins on open ground (svz)", () => {
  expect(moveCost("ice", "wagon")).toBeLessThan(moveCost("ice", "horse")); // wagon halves ice; horse gets no ice help
  expect(moveCost("plains", "horse")).toBeLessThan(moveCost("plains", "wagon")); // horse ÷2 vs wagon ÷1.5 on plains
});

test("backpack: large-pack (16) tops the leather (12) / starter (8) ladder", () => {
  expect(slotCap("large-pack")).toBe(16);
  expect(slotCap("large-pack")).toBeGreaterThan(slotCap("leather"));
  expect(slotCap("leather")).toBeGreaterThan(slotCap("small-backpack"));
});
