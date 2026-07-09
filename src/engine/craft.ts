// Direct, instant crafting (M5, D10): consume a recipe's inputs from the bank,
// produce its output. Pure — returns the new bank, never mutates.
//
// Recipe gates (ke3.1, crafting-depth §4.1): a recipe may also require a home
// `station` and/or a set of `tools`. This function stays pure and phase-agnostic —
// the CALLER decides what "available" means (town = bank∪equipped; field =
// equipped∪carry) and passes the pools in. Check order → reason:
//   no-recipe → missing-station → missing-tool → insufficient-materials.
import type { ItemStack } from "./types";
import type { StationId } from "../data/constants";
import { RECIPE } from "../data/constants";
import { subtractStacks, bankStacks } from "./bank";

export function craft(
  bank: ItemStack[],
  recipeId: string,
  availableTools: string[] = [], // defIds present in the caller's phase-scoped pool
  availableStations: StationId[] = [], // built home stations (never satisfiable in field)
):
  | { ok: true; bank: ItemStack[]; output: ItemStack }
  | { ok: false; reason: "no-recipe" | "missing-station" | "missing-tool" | "insufficient-materials" } {
  const recipe = RECIPE[recipeId];
  if (!recipe) return { ok: false, reason: "no-recipe" };
  const req = recipe.requires;
  if (req?.station && !availableStations.includes(req.station)) {
    return { ok: false, reason: "missing-station" };
  }
  // AND semantics (user decision): every listed tool defId must be present.
  if (req?.tools?.some((t) => !availableTools.includes(t))) {
    return { ok: false, reason: "missing-tool" };
  }
  const afterInputs = subtractStacks(bank, recipe.inputs);
  if (afterInputs === null) return { ok: false, reason: "insufficient-materials" };
  const output = { ...recipe.output };
  return { ok: true, bank: bankStacks(afterInputs, [output]), output };
}
