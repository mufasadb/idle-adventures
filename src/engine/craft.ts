// Direct, instant crafting (M5, D10): consume a recipe's inputs from the bank,
// produce its output. Pure — returns the new bank, never mutates.
import type { ItemStack } from "./types";
import { RECIPE } from "../data/constants";
import { subtractStacks, bankStacks } from "./bank";

export function craft(
  bank: ItemStack[],
  recipeId: string,
):
  | { ok: true; bank: ItemStack[]; output: ItemStack }
  | { ok: false; reason: "no-recipe" | "insufficient-materials" } {
  const recipe = RECIPE[recipeId];
  if (!recipe) return { ok: false, reason: "no-recipe" };
  const afterInputs = subtractStacks(bank, recipe.inputs);
  if (afterInputs === null) return { ok: false, reason: "insufficient-materials" };
  const output = { ...recipe.output };
  return { ok: true, bank: bankStacks(afterInputs, [output]), output };
}
