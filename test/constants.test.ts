import { test, expect } from "bun:test";
import { GRID_SIZE, TERRAIN_COST, BACKPACK_SLOTS } from "../src/data/constants";

test("constants: lever groups exist with the documented shape", () => {
  expect(typeof GRID_SIZE).toBe("number");
  expect(TERRAIN_COST).toHaveProperty("ice");
  expect(BACKPACK_SLOTS).toHaveProperty("starter");
});
