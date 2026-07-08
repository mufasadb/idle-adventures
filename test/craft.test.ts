import { test, expect } from "bun:test";
import { craft } from "../src/engine/craft";
import { RECIPE, ARMOUR, WEAPONS, TOOL_CAPABILITY, BACKPACK_SLOTS, TRANSPORT_MULTIPLIER, FOOD, POTION, BATTLE_ITEM, PANNIERS, AMMO, INKS } from "../src/data/constants";
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

test("recipes: every output is a real equippable/consumable defId — or a crafted intermediate another recipe consumes", () => {
  const known = (d: string) =>
    d in WEAPONS || d in ARMOUR || d in TOOL_CAPABILITY || d in BACKPACK_SLOTS ||
    d in TRANSPORT_MULTIPLIER || FOOD.includes(d) || POTION.includes(d) || BATTLE_ITEM.includes(d) || PANNIERS.includes(d) || AMMO.includes(d) ||
    d in INKS; // cartography inks (cxq): bank materials consumed by the `ink` action, not a recipe
  // Crafted intermediates (D45 ranged-combat spec, 2026-07-07): `bowstring` is the
  // first recipe OUTPUT that is itself a material — legal iff some other recipe
  // consumes it (otherwise it'd be a dead-end craft).
  const isIntermediate = (d: string) =>
    Object.values(RECIPE).some((r) => r.inputs.some((i) => i.defId === d));
  for (const [id, recipe] of Object.entries(RECIPE)) {
    expect(known(recipe.output.defId) || isIntermediate(recipe.output.defId)).toBe(true);
    expect(recipe.output.qty).toBeGreaterThan(0);
    expect(recipe.inputs.length).toBeGreaterThan(0);
    // recipe id conventionally matches its output for gear — optionally with a
    // "-variant" suffix for an alternate recipe (e.g. large-pack-troll, a combat
    // shortcut to the same pack; peu 2026-07-05).
    if (slotOf(recipe.output.defId) !== "food" && slotOf(recipe.output.defId) !== "potion") {
      expect(id === recipe.output.defId || id.startsWith(recipe.output.defId + "-")).toBe(true);
    }
  }
});
