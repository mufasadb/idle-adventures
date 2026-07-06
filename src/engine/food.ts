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

// Eat whole food units off the FRONT to refill CURRENT energy toward maxEnergy,
// but only while a full unit's restore fits (never overfills / wastes). tentMult
// multiplies restore-per-unit (TENT_FOOD_MULTIPLIER with a tent equipped). Pure —
// returns the remaining food + new energy. Front-to-back mirrors the potion-quaff
// order (combat.ts).
export function eatToRefill(
  food: ItemStack[],
  energy: number,
  maxEnergy: number,
  tentMult = 1,
): { food: ItemStack[]; energy: number } {
  const next = food.map((s) => ({ ...s }));
  let e = energy;
  while (next.length > 0) {
    const restore = foodEnergyOf(next[0]!.defId) * tentMult;
    if (e + restore > maxEnergy) break; // would waste — stop
    e += restore;
    next[0]!.qty -= 1;
    if (next[0]!.qty <= 0) next.shift();
  }
  return { food: next, energy: e };
}
