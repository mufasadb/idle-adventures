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
import { toolSpeedFor } from "./tools";

// ke3.3: the actual output count for a recipe given the caller's tool pool. For an
// outputScale recipe the qty is qtyPer × the best matching tool quality (the gate
// guarantees a capable tool is present; `?? 1` floors a mis-declared recipe).
// Ungated recipes return their fixed output.qty unchanged. Shared by craft() and
// the read-only surfaces (web/console) so displayed and crafted counts never drift.
export function recipeOutputQty(
  recipe: (typeof RECIPE)[string],
  availableTools: string[],
): number {
  return recipe.outputScale
    ? recipe.outputScale.qtyPer * (toolSpeedFor(availableTools, recipe.outputScale.capability) ?? 1)
    : recipe.output.qty;
}

export function craft(
  bank: ItemStack[],
  recipeId: string,
  availableTools: string[] = [], // defIds present in the caller's phase-scoped pool
  availableStations: StationId[] = [], // built home stations (never satisfiable in field)
):
  | { ok: true; bank: ItemStack[]; output: ItemStack }
  | { ok: false; reason: "no-recipe" | "missing-station" | "missing-tool" | "already-built" | "insufficient-materials" } {
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
  // ke3.2: a station you've already built can't be rebuilt (checked before mats so
  // the message is clear even when you no longer hold the inputs).
  if (recipe.buildsStation && availableStations.includes(recipe.buildsStation)) {
    return { ok: false, reason: "already-built" };
  }
  const afterInputs = subtractStacks(bank, recipe.inputs);
  if (afterInputs === null) return { ok: false, reason: "insufficient-materials" };
  // ke3.3: yield-mod — the gating tool's quality scales the output count.
  const output = { ...recipe.output, qty: recipeOutputQty(recipe, availableTools) };
  // ke3.2: a station output is base infra, not a stack — leave it un-banked; the
  // caller (craftAction) routes it into state.stations. Inputs are still consumed.
  const newBank = recipe.buildsStation ? afterInputs : bankStacks(afterInputs, [output]);
  return { ok: true, bank: newBank, output };
}
