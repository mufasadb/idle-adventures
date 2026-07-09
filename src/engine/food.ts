// Stamina food model (dtv — supersedes the just-in-time digest, pqp). Energy is
// now CURRENT stamina on a max/current bar; food is a reserve you EAT to refill
// toward max. `expedition.energy` is current stamina; move/gather drain it and an
// optional waste-free auto-eat refills it from the packed food reserve. Uneaten
// food banks back on return (bank.ts) — no duplication.
import { FOOD_ENERGY, ENERGY_PER_FOOD } from "../data/constants";
import type { ItemStack } from "./types";

// Energy RESTORED by eating one unit of this food (before any tent multiplier).
export function foodEnergyOf(defId: string): number {
  return FOOD_ENERGY[defId] ?? ENERGY_PER_FOOD;
}

// Total energy still sealed in the uneaten food reserve (display: how much reach
// is left to eat back). Not a spend cap anymore — just the reserve size.
export function heldFoodEnergy(food: ItemStack[]): number {
  return food.reduce((sum, s) => sum + s.qty * foodEnergyOf(s.defId), 0);
}

// Eat whole units of the DESIGNATED food to refill CURRENT energy toward maxEnergy,
// waste-free (mco — supersedes least-dense-first, D48). Only units whose defId ===
// `targetDefId` are eaten, and only while a unit's boosted restore still fits under
// maxEnergy (never overfills). tentMult multiplies restore-per-unit (TENT_FOOD_MULTIPLIER
// with a tent equipped). Pure — returns remaining food + new energy. Scoping to one
// food replaces the old least-dense-first selection: the player designates which
// food auto-eats (Expedition.autoEatFood), so there's no cross-food ordering to pick.
export function eatToRefill(
  food: ItemStack[],
  energy: number,
  maxEnergy: number,
  targetDefId: string,
  tentMult = 1,
): { food: ItemStack[]; energy: number } {
  const next = food.map((s) => ({ ...s }));
  let e = energy;
  const restore = foodEnergyOf(targetDefId) * tentMult;
  if (restore > 0) {
    for (const s of next) {
      if (s.defId !== targetDefId) continue;
      while (s.qty > 0 && e + restore <= maxEnergy) { e += restore; s.qty -= 1; }
    }
  }
  return { food: next.filter((s) => s.qty > 0), energy: e };
}
