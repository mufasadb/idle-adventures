import { test, expect } from "bun:test";
import { eatToRefill, foodEnergyOf, heldFoodEnergy } from "../src/engine/food";
import { MAX_ENERGY, TENT_FOOD_MULTIPLIER } from "../src/data/constants";
import type { ItemStack } from "../src/engine/types";

// Stamina model (dtv): eatToRefill eats whole food units off the FRONT to refill
// CURRENT energy toward maxEnergy, but only while a full unit's restore fits under
// max (never overfills / wastes). Pure — returns remaining food + new energy.

test("eatToRefill: waste-free — won't eat when a full unit would overfill", () => {
  const food: ItemStack[] = [{ defId: "ration", qty: 3 }];
  const { food: out, energy } = eatToRefill(food, 260, 300); // 260 + 80 = 340 > 300
  expect(energy).toBe(260);
  expect(out).toEqual([{ defId: "ration", qty: 3 }]); // untouched
});

test("eatToRefill: eats when there's room, one unit at a time toward max", () => {
  const food: ItemStack[] = [{ defId: "ration", qty: 3 }]; // ration restores 80
  const { food: out, energy } = eatToRefill(food, 100, 300); // room for 2 (100→180→260; 260+80=340>300 stop)
  expect(energy).toBe(260);
  expect(out).toEqual([{ defId: "ration", qty: 1 }]);
});

test("eatToRefill: never exceeds max", () => {
  const food: ItemStack[] = [{ defId: "ration", qty: 10 }];
  const { energy } = eatToRefill(food, 0, 300);
  expect(energy).toBeLessThanOrEqual(300);
  expect(energy).toBe(240); // 3 rations (240); a 4th (320) would overfill
});

test("eatToRefill: stops when food runs out", () => {
  const food: ItemStack[] = [{ defId: "ration", qty: 1 }];
  const { food: out, energy } = eatToRefill(food, 0, 300);
  expect(energy).toBe(80);
  expect(out).toEqual([]);
});

test("eatToRefill: tent multiplier boosts restore per unit (×1.5)", () => {
  const food: ItemStack[] = [{ defId: "ration", qty: 3 }];
  const { energy } = eatToRefill(food, 0, 300, TENT_FOOD_MULTIPLIER); // each unit restores 120
  expect(energy).toBe(240); // 2 units (120+120=240); a 3rd (360) overfills
});

test("eatToRefill: empty food is a no-op", () => {
  const { food: out, energy } = eatToRefill([], 150, 300);
  expect(energy).toBe(150);
  expect(out).toEqual([]);
});

test("eatToRefill: pure — does not mutate the input food array", () => {
  const food: ItemStack[] = [{ defId: "ration", qty: 3 }];
  const before = structuredClone(food);
  eatToRefill(food, 0, 300);
  expect(food).toEqual(before);
});

test("foodEnergyOf / heldFoodEnergy still report restore reserves", () => {
  expect(foodEnergyOf("ration")).toBe(80);
  expect(foodEnergyOf("trail-ration")).toBe(160);
  expect(heldFoodEnergy([{ defId: "ration", qty: 2 }, { defId: "trail-ration", qty: 1 }])).toBe(320);
});

test("eatToRefill: at max already, nothing is eaten", () => {
  const food: ItemStack[] = [{ defId: "ration", qty: 2 }];
  const { food: out, energy } = eatToRefill(food, MAX_ENERGY, MAX_ENERGY);
  expect(energy).toBe(MAX_ENERGY);
  expect(out).toEqual([{ defId: "ration", qty: 2 }]);
});
