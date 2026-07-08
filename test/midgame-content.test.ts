import { test, expect } from "bun:test";
import { FOOD, FOOD_ENERGY, FRESH_TO_STALE, MATERIAL_TIER, BIOMES } from "../src/data/constants";
import { slotOf } from "../src/engine/catalog";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import type { GameState, Action } from "../src/engine/types";

function craft(bank: { defId: string; qty: number }[], recipeId: string) {
  const s: GameState = { seed: "c", phase: "town", bank, loadout: emptyLoadout(), expedition: null, runs: 0 };
  return reduce(s, { type: "craft", recipeId } as Action);
}

test("apple is a fresh food that stales to bruised-apple", () => {
  expect(FOOD.includes("apple")).toBe(true);
  expect(slotOf("apple")).toBe("food");
  expect(FOOD_ENERGY.apple).toBe(40);
  expect(FRESH_TO_STALE.apple).toBe("bruised-apple");
});

test("new gather materials sit at their tier and biome", () => {
  expect(MATERIAL_TIER.salt).toBe(2);
  expect(MATERIAL_TIER.seal).toBe(2);
  expect(BIOMES.desert.materialTable.mining?.salt).toBe(2);
  expect(BIOMES.tundra.materialTable.herb?.thistle).toBe(2);
  expect(BIOMES.woodland.materialTable.herb?.thistle).toBe(1);
  // apple is the wood-node material defId (not "apple-tree") — gather checks
  // FOOD.includes(poi.material), so the material must equal the food defId.
  expect(BIOMES.woodland.materialTable.wood?.apple).toBe(2);
  expect(BIOMES.tundra.materialTable.animal?.seal).toBe(2);
});

test("mid-game tier foods exist with documented densities", () => {
  expect(FOOD_ENERGY["smoked-venison"]).toBe(200);
  expect(FOOD_ENERGY["blubber-stew"]).toBe(160);
  expect(FOOD.includes("smoked-venison")).toBe(true);
  expect(FOOD.includes("blubber-stew")).toBe(true);
});

test("mid-game recipes craft from their inputs", () => {
  const a = craft([{ defId: "rich-venison", qty: 1 }, { defId: "salt", qty: 1 }], "smoked-venison");
  expect(a.state.bank.find((x) => x.defId === "smoked-venison")?.qty).toBe(1);
  const b = craft([{ defId: "seal-blubber", qty: 1 }, { defId: "ice-moss", qty: 1 }], "blubber-stew");
  expect(b.state.bank.find((x) => x.defId === "blubber-stew")?.qty).toBe(1);
  const c = craft([{ defId: "bruised-apple", qty: 3 }], "apple-jam");
  expect(c.state.bank.find((x) => x.defId === "jam")?.qty).toBe(1);
  const d = craft([{ defId: "thistle", qty: 2 }, { defId: "djinn-ember", qty: 1 }], "elixir-of-power-thistle");
  expect(d.state.bank.find((x) => x.defId === "elixir-of-power")?.qty).toBe(1);
});
