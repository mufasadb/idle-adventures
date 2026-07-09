import { test, expect } from "bun:test";
import { craft } from "../src/engine/craft";
import { RECIPE, ARMOUR, WEAPONS, TOOL_CAPABILITY, BACKPACK_SLOTS, TRANSPORT_MULTIPLIER, FOOD, POTION, BATTLE_ITEM, PANNIERS, AMMO, INKS } from "../src/data/constants";
import { slotOf } from "../src/engine/catalog";

// ke3.1 recipe-gate tests inject a throwaway recipe into the RECIPE catalog so the
// gate MECHANISM is exercised without committing gated CONTENT (that lands in the
// later crafting-depth beads). Registered + deleted around the assertions so the
// "every output is real" invariant below never sees the fixture.
function withRecipe<T>(id: string, recipe: (typeof RECIPE)[string], fn: () => T): T {
  (RECIPE as Record<string, (typeof RECIPE)[string]>)[id] = recipe;
  try {
    return fn();
  } finally {
    delete (RECIPE as Record<string, (typeof RECIPE)[string]>)[id];
  }
}

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

// --- ke3.1: recipe gates (station + tools) ----------------------------------

test("craft gate: missing station is rejected before anything else (ke3.1)", () => {
  withRecipe(
    "test-anvil-plate",
    { inputs: [{ defId: "iron-ore", qty: 2 }], output: { defId: "iron-ore", qty: 1 }, requires: { station: "anvil" } },
    () => {
      // materials present, station absent → missing-station
      const r = craft([{ defId: "iron-ore", qty: 5 }], "test-anvil-plate", [], []);
      expect(r).toEqual({ ok: false, reason: "missing-station" });
    },
  );
});

test("craft gate: missing tool is rejected once the station is satisfied (ke3.1)", () => {
  withRecipe(
    "test-fletch",
    { inputs: [{ defId: "oak-log", qty: 1 }], output: { defId: "oak-log", qty: 1 }, requires: { station: "anvil", tools: ["fletcher's-knife"] } },
    () => {
      // station present, tool absent → missing-tool (station check already passed)
      const r = craft([{ defId: "oak-log", qty: 3 }], "test-fletch", [], ["anvil"]);
      expect(r).toEqual({ ok: false, reason: "missing-tool" });
    },
  );
});

test("craft gate: station+tool satisfied but materials short → insufficient-materials (order) (ke3.1)", () => {
  withRecipe(
    "test-gated",
    { inputs: [{ defId: "iron-ore", qty: 3 }], output: { defId: "iron-ore", qty: 1 }, requires: { station: "anvil", tools: ["blacksmith's-hammer"] } },
    () => {
      const r = craft([{ defId: "iron-ore", qty: 1 }], "test-gated", ["blacksmith's-hammer"], ["anvil"]);
      expect(r).toEqual({ ok: false, reason: "insufficient-materials" });
    },
  );
});

test("craft gate: all gates met → crafts (ke3.1)", () => {
  withRecipe(
    "test-gated-ok",
    { inputs: [{ defId: "iron-ore", qty: 2 }], output: { defId: "steel-sword", qty: 1 }, requires: { station: "anvil", tools: ["blacksmith's-hammer"] } },
    () => {
      const r = craft([{ defId: "iron-ore", qty: 3 }], "test-gated-ok", ["blacksmith's-hammer"], ["anvil"]);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.output).toEqual({ defId: "steel-sword", qty: 1 });
    },
  );
});

test("craft gate: tools-only recipe (no station) requires every listed tool — AND semantics (ke3.1)", () => {
  withRecipe(
    "test-two-tools",
    { inputs: [{ defId: "oak-log", qty: 1 }], output: { defId: "oak-log", qty: 1 }, requires: { tools: ["fletcher's-knife", "cooking-pot"] } },
    () => {
      // only one of two tools present → still missing-tool
      expect(craft([{ defId: "oak-log", qty: 2 }], "test-two-tools", ["fletcher's-knife"]).ok).toBe(false);
      expect(craft([{ defId: "oak-log", qty: 2 }], "test-two-tools", ["fletcher's-knife", "cooking-pot"]).ok).toBe(true);
    },
  );
});

test("craft: ungated recipes ignore the tool/station pools (existing behaviour) (ke3.1)", () => {
  // iron-pick has no `requires` → craftable with empty pools, exactly as before.
  const r = craft([{ defId: "iron-ore", qty: 5 }, { defId: "oak-log", qty: 2 }], "iron-pick", [], []);
  expect(r.ok).toBe(true);
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
    // ke3.2: a station-building recipe's output is base infra (a StationId), not an
    // equippable/consumable defId — legal iff the recipe declares buildsStation.
    const isStation = recipe.buildsStation !== undefined && recipe.output.defId === recipe.buildsStation;
    expect(known(recipe.output.defId) || isIntermediate(recipe.output.defId) || isStation).toBe(true);
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
