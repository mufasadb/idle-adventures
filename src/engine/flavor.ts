// Return flavor beat (xwp): pure selection of a cosmetic line shown on a
// VOLUNTARY return (reduce.returnHome). Reframes the loop as value-extraction
// under fatigue — see the RETURN_FLAVOR levers in ../data/constants. Kept out of
// reduce.ts (already large) as a small, independently testable unit.
import type { ItemStack } from "./types";
import { rand } from "./rng";
import {
  RETURN_FLAVOR,
  RETURN_FRESH_FRACTION,
  RETURN_TIER_HIGH,
  RETURN_COOKED_FOODS,
  MAP_TIER_MAX,
  type ReturnFlavorBucket,
} from "../data/constants";

type FlavorInput = {
  energy: number;
  maxEnergy: number;
  mapTier: number;
  food: ItemStack[];
};

// Which bucket a voluntary return falls into. Priority: exhaustion (energy 0)
// dominates everything; otherwise the "fresh" band splits on whether you left
// with prepared food to spare (disdain) or not (boredom).
export function returnFlavorBucket({ energy, maxEnergy, mapTier, food }: FlavorInput): ReturnFlavorBucket {
  if (energy <= 0) {
    if (mapTier >= MAP_TIER_MAX) return "spent-epic";
    if (mapTier >= RETURN_TIER_HIGH) return "spent-high";
    return "spent-low";
  }
  if (energy <= maxEnergy * RETURN_FRESH_FRACTION) return "weary";
  const hasCooked = food.some((s) => s.qty > 0 && RETURN_COOKED_FOODS.includes(s.defId));
  return hasCooked ? "beneath" : "bored";
}

// Resolve the bucket, then pick a deterministic variant from its pool. Seeded on
// the map + run count so the same return always reads the same, but successive
// runs vary. Returns the copy string for the surfaces to render verbatim.
export function pickReturnFlavor(args: FlavorInput & { seed: string; runs: number }): string {
  const pool = RETURN_FLAVOR[returnFlavorBucket(args)];
  const idx = Math.floor(rand(args.seed, "return", args.runs) * pool.length);
  return pool[idx];
}
