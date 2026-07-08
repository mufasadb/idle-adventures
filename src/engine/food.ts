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

// Eat whole food units to refill CURRENT energy toward maxEnergy, waste-free.
// Least-dense-first (m0a — resolves si7.7): repeatedly picks the lowest-FOOD_ENERGY
// unit whose boosted restore still fits under maxEnergy — so a dense unit at the
// front never blocks lower-density food behind it. Ties break by lowest index
// (matches prior forage-first ordering). tentMult multiplies restore-per-unit
// (TENT_FOOD_MULTIPLIER with a tent equipped). Pure — returns remaining food + new energy.
export function eatToRefill(
  food: ItemStack[],
  energy: number,
  maxEnergy: number,
  tentMult = 1,
): { food: ItemStack[]; energy: number } {
  const next = food.map((s) => ({ ...s }));
  let e = energy;
  // Least-dense-first (m0a): repeatedly eat the lowest-FOOD_ENERGY unit whose
  // boosted restore still fits under maxEnergy. Never blocks (a too-dense unit is
  // passed over, not a wall — resolves si7.7); stays waste-free; fresh forage is
  // the least dense so it's still eaten first. Ties break by lowest index.
  for (;;) {
    let bestIdx = -1;
    let bestDensity = Infinity;
    for (let i = 0; i < next.length; i++) {
      if (next[i]!.qty <= 0) continue;
      const density = foodEnergyOf(next[i]!.defId);
      if (e + density * tentMult > maxEnergy) continue; // doesn't fit — skip
      if (density < bestDensity) { bestDensity = density; bestIdx = i; }
    }
    if (bestIdx === -1) break; // nothing fits
    e += foodEnergyOf(next[bestIdx]!.defId) * tentMult;
    next[bestIdx]!.qty -= 1;
  }
  return { food: next.filter((s) => s.qty > 0), energy: e };
}
