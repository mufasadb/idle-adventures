import { test, expect } from "bun:test";
import { FOOD, FOOD_ENERGY, FRESH_TO_STALE, MATERIAL_TIER, BIOMES } from "../src/data/constants";
import { slotOf } from "../src/engine/catalog";

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
