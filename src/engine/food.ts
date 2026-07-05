// Just-in-time food consumption (Phase 2, pqp — supersedes D23). Food is no
// longer converted to energy wholly at embark; it's carried as inventory and
// eaten unit-by-unit as energy is spent, freeing each unit's slot as it goes.
// Uneaten food banks back on return (bank.ts), so there's no duplication.
//
// The model keeps `expedition.energy` meaning the TOTAL remaining energy (what
// the player sees), with a single invariant maintained after every spend:
//
//     energy >= heldFoodEnergy(food)
//
// i.e. your remaining total can never be less than the energy still sealed in
// uneaten food. When a spend pushes energy below that line, `digest` eats whole
// units off the front until the invariant holds again. The energy of a unit you
// bite into is already reflected in `energy` (the total); its leftover becomes
// free "liberated" surplus (energy − heldFoodEnergy) that does NOT bank back —
// you opened that ration. This is what makes the food↔loot squeeze temporal:
// heavy and cramped early, roomy late.
import { FOOD_ENERGY, ENERGY_PER_FOOD } from "../data/constants";
import type { ItemStack } from "./types";

export function foodEnergyOf(defId: string): number {
  return FOOD_ENERGY[defId] ?? ENERGY_PER_FOOD;
}

// Total energy still sealed in uneaten food units.
export function heldFoodEnergy(food: ItemStack[]): number {
  return food.reduce((sum, s) => sum + s.qty * foodEnergyOf(s.defId), 0);
}

// Eat whole food units off the FRONT until `energy >= heldFoodEnergy`. Pure —
// returns the remaining (uneaten) food. Each removed unit frees one inventory
// slot. Front-to-back mirrors the potion-quaff order (combat.ts).
export function digest(food: ItemStack[], energy: number): ItemStack[] {
  const next = food.map((s) => ({ ...s }));
  while (next.length > 0 && energy < heldFoodEnergy(next)) {
    next[0]!.qty -= 1;
    if (next[0]!.qty <= 0) next.shift();
  }
  return next;
}
