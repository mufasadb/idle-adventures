import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { RECIPE, FOOD, FOOD_ENERGY, FIELD_CRAFT_ENERGY } from "../src/data/constants";
import { slotOf } from "../src/engine/catalog";
import type { GameState, ItemStack } from "../src/engine/types";

// ke3.5 proof slice: the food/cooking loop end-to-end on the real player surface.

function town(bank: ItemStack[], stations?: GameState["stations"]): GameState {
  return { seed: "c", phase: "town", bank, loadout: emptyLoadout(), expedition: null, ...(stations ? { stations } : {}) };
}

function field(opts: { tools?: string[]; carry?: ItemStack[]; energy?: number; food?: ItemStack[] } = {}): GameState {
  const loadout = emptyLoadout();
  loadout.equipment.tools = opts.tools ?? [];
  loadout.food = opts.food ?? [];
  return {
    seed: "fc", phase: "expedition", bank: [], loadout: emptyLoadout(),
    expedition: { mapSeed: "cook", pos: { x: 10, y: 30 }, energy: opts.energy ?? 200, hp: 30, maxEnergy: 300, loadout, carry: opts.carry ?? [], cleared: [] },
  };
}

// --- the balance invariant (clarification): cooking must NET positive stamina ---

test("cooking: every field FOOD recipe clears (raw food restore + FIELD_CRAFT_ENERGY) (ke3.5)", () => {
  for (const r of Object.values(RECIPE)) {
    if (!r.field || !FOOD.includes(r.output.defId)) continue;
    const rawFoodIn = r.inputs.reduce((sum, i) => sum + (FOOD.includes(i.defId) ? (FOOD_ENERGY[i.defId] ?? 0) * i.qty : 0), 0);
    const cooked = (FOOD_ENERGY[r.output.defId] ?? 0) * r.output.qty;
    // else field-cooking would be a stamina LOSS vs just eating the inputs raw
    expect(cooked).toBeGreaterThanOrEqual(rawFoodIn + FIELD_CRAFT_ENERGY);
  }
});

// --- (a) field cooking: fresh forage → denser keeper -------------------------

test("field cook: berries → cooked-berries, denser + a keeper (ke3.5)", () => {
  const { state, events } = reduce(
    field({ tools: ["fire-kit"], carry: [{ defId: "berries", qty: 2 }, { defId: "oak-log", qty: 1 }] }),
    { type: "craft", recipeId: "cooked-berries" },
  );
  expect(events.some((e) => e.type === "crafted")).toBe(true);
  const food = state.expedition!.loadout.food;
  expect(food.find((s) => s.defId === "cooked-berries")?.qty).toBe(1);
  expect(FOOD_ENERGY["cooked-berries"]!).toBeGreaterThan(FOOD_ENERGY.berries! * 2); // denser than the raw
});

// --- (c) cooking-pot stew: the AND-gate premium field food -------------------

test("field cook: stew needs BOTH fire-kit AND cooking-pot (AND-gate) (ke3.5)", () => {
  const carry: ItemStack[] = [{ defId: "rich-venison", qty: 1 }, { defId: "berries", qty: 2 }, { defId: "oak-log", qty: 1 }];
  // only the fire-kit → missing-tool (cooking-pot absent)
  const partial = reduce(field({ tools: ["fire-kit"], carry }), { type: "craft", recipeId: "stew" });
  expect(partial.events).toEqual([{ type: "action-rejected", action: "craft", reason: "missing-tool" }]);
  // both tools → crafts the stew
  const full = reduce(field({ tools: ["fire-kit", "cooking-pot"], carry }), { type: "craft", recipeId: "stew" });
  expect(full.state.expedition!.loadout.food.find((s) => s.defId === "stew")?.qty).toBe(1);
});

test("cooking-pot is a town-crafted, carriable tool (ke3.5)", () => {
  expect(slotOf("cooking-pot")).toBe("tool");
  const { state } = reduce(town([{ defId: "iron-ore", qty: 2 }]), { type: "craft", recipeId: "cooking-pot" });
  expect(state.bank.find((s) => s.defId === "cooking-pot")?.qty).toBe(1);
});

// --- (b) smokehouse station gate on the existing smoked-venison --------------

test("smokehouse: smoked-venison rejects missing-station before build, crafts after (ke3.5)", () => {
  const bank: ItemStack[] = [{ defId: "rich-venison", qty: 1 }, { defId: "salt", qty: 1 }];
  const before = reduce(town(bank), { type: "craft", recipeId: "smoked-venison" });
  expect(before.events).toEqual([{ type: "action-rejected", action: "craft", reason: "missing-station" }]);
  // build the smokehouse (station output isn't banked), then smoke the venison
  const built = reduce(town([{ defId: "oak-log", qty: 3 }, { defId: "iron-ore", qty: 2 }, ...bank]), { type: "craft", recipeId: "smokehouse" });
  expect(built.state.stations).toEqual(["smokehouse"]);
  expect(built.state.bank.find((s) => s.defId === "smokehouse")).toBeUndefined();
  const smoked = reduce(built.state, { type: "craft", recipeId: "smoked-venison" });
  expect(smoked.state.bank.find((s) => s.defId === "smoked-venison")?.qty).toBe(1);
});

// --- (d) fletcher probe: still reachable (from ke3.3) ------------------------

test("fletcher probe: fletchers-knife gates arrow-shaft, scales with quality (ke3.5)", () => {
  // sanity: the fletching thread the proof slice references is intact
  expect(RECIPE["arrow-shaft"]!.requires?.tools).toEqual(["fletchers-knife"]);
  expect(RECIPE["arrow-shaft"]!.outputScale?.capability).toBe("fletch");
});

// --- the home-vs-field split, made concrete ---------------------------------

test("cooking loop: same meat, two paths — field roast (150) vs home-smoked (200) (ke3.5)", () => {
  // rich-venison → cooked-venison in the FIELD (fire-kit), or the denser smoked
  // version at HOME (smokehouse). The home-deep vs field-slice split, on one input.
  expect(FOOD_ENERGY["cooked-venison"]!).toBeLessThan(FOOD_ENERGY["smoked-venison"]!);
  expect(RECIPE["cooked-venison"]!.field).toBe(true);
  expect(RECIPE["smoked-venison"]!.requires?.station).toBe("smokehouse");
});
