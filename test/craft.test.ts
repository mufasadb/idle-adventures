import { test, expect } from "bun:test";
import { craft } from "../src/engine/craft";
import { RECIPE, ARMOUR, WEAPONS, TOOL_CAPABILITY, BACKPACK_SLOTS, TRANSPORT_MULTIPLIER, FOOD, POTION } from "../src/data/constants";
import { slotOf } from "../src/engine/catalog";

test("craft: consumes inputs and yields output (bead acceptance)", () => {
  const bank = [{ defId: "iron-ore", qty: 5 }, { defId: "oak-log", qty: 2 }];
  const r = craft(bank, "iron-pick");
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.output).toEqual({ defId: "iron-pick", qty: 1 });
  expect(r.bank).toEqual([{ defId: "iron-ore", qty: 3 }, { defId: "oak-log", qty: 1 }, { defId: "iron-pick", qty: 1 }]);
});

test("craft: insufficient materials is rejected, bank untouched", () => {
  const bank = [{ defId: "iron-ore", qty: 1 }];
  const r = craft(bank, "iron-pick");
  expect(r).toEqual({ ok: false, reason: "insufficient-materials" });
});

test("craft: unknown recipe is rejected", () => {
  expect(craft([], "no-such-recipe")).toEqual({ ok: false, reason: "no-recipe" });
});

test("craft: does not mutate the input bank", () => {
  const bank = [{ defId: "iron-ore", qty: 5 }, { defId: "oak-log", qty: 2 }];
  const before = structuredClone(bank);
  craft(bank, "iron-pick");
  expect(bank).toEqual(before);
});

test("recipes: every output is a real equippable/consumable defId", () => {
  const known = (d: string) =>
    d in WEAPONS || d in ARMOUR || d in TOOL_CAPABILITY || d in BACKPACK_SLOTS ||
    d in TRANSPORT_MULTIPLIER || FOOD.includes(d) || POTION.includes(d);
  for (const [id, recipe] of Object.entries(RECIPE)) {
    expect(known(recipe.output.defId)).toBe(true);
    expect(recipe.output.qty).toBeGreaterThan(0);
    expect(recipe.inputs.length).toBeGreaterThan(0);
    // recipe id conventionally matches its output for gear
    if (slotOf(recipe.output.defId) !== "food" && slotOf(recipe.output.defId) !== "potion") {
      expect(id).toBe(recipe.output.defId);
    }
  }
});
