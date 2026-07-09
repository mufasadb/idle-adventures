import { test, expect } from "bun:test";
import { foodEnergyOf, eatToRefill } from "../src/engine/food";
import { slotOf } from "../src/engine/catalog";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { FOOD_ENERGY, MAX_ENERGY } from "../src/data/constants";
import type { GameState, Action } from "../src/engine/types";

test("pemmican is a food, denser than trail-ration, under the base ceiling", () => {
  expect(slotOf("pemmican")).toBe("food");
  expect(foodEnergyOf("pemmican")).toBeGreaterThan(FOOD_ENERGY["trail-ration"]!);
  expect(foodEnergyOf("pemmican")).toBeLessThan(MAX_ENERGY); // must stay auto-eatable
});

test("ration stays at 80 (T1 sustainability floor)", () => {
  expect(FOOD_ENERGY.ration).toBe(80);
});

test("dense food is blocked at a full base ceiling but eats under a raised one", () => {
  const dense = foodEnergyOf("pemmican");
  // At MAX_ENERGY with only headroom for a smaller unit, pemmican at the front blocks:
  const blocked = eatToRefill([{ defId: "pemmican", qty: 1 }], MAX_ENERGY - 1, MAX_ENERGY, "pemmican");
  expect(blocked.food.length).toBe(1); // uneaten — would overfill
  // With a raised ceiling and low energy, it eats:
  const eaten = eatToRefill([{ defId: "pemmican", qty: 1 }], 100, 100 + dense, "pemmican");
  expect(eaten.food.length).toBe(0);
  expect(eaten.energy).toBe(100 + dense);
});

test("pemmican crafts from a hunt input + foraged berries", () => {
  const s: GameState = { seed: "f", phase: "town", bank: [{ defId: "drake-hide", qty: 1 }, { defId: "stale-berries", qty: 2 }], loadout: emptyLoadout(), expedition: null, runs: 0 };
  const r = reduce(s, { type: "craft", recipeId: "pemmican" } as Action);
  expect(r.events.some((e) => e.type === "action-rejected")).toBe(false);
  expect(r.state.bank.find((x) => x.defId === "pemmican")?.qty).toBe(1);
});
