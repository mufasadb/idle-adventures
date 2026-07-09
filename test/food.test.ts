import { test, expect } from "bun:test";
import { eatToRefill, foodEnergyOf, heldFoodEnergy } from "../src/engine/food";
import { MAX_ENERGY, TENT_FOOD_MULTIPLIER } from "../src/data/constants";
import type { ItemStack } from "../src/engine/types";

// Stamina model (dtv/mco): eatToRefill eats whole units of the DESIGNATED food to
// refill CURRENT energy toward maxEnergy, but only while a full unit's restore fits
// under max (never overfills / wastes). Pure — returns remaining food + new energy.

test("eatToRefill: waste-free — won't eat when a full unit would overfill", () => {
  const food: ItemStack[] = [{ defId: "ration", qty: 3 }];
  const { food: out, energy } = eatToRefill(food, 260, 300, "ration"); // 260 + 80 = 340 > 300
  expect(energy).toBe(260);
  expect(out).toEqual([{ defId: "ration", qty: 3 }]); // untouched
});

test("eatToRefill: eats when there's room, one unit at a time toward max", () => {
  const food: ItemStack[] = [{ defId: "ration", qty: 3 }]; // ration restores 80
  const { food: out, energy } = eatToRefill(food, 100, 300, "ration"); // room for 2 (100→180→260; 260+80=340>300 stop)
  expect(energy).toBe(260);
  expect(out).toEqual([{ defId: "ration", qty: 1 }]);
});

test("eatToRefill: never exceeds max", () => {
  const food: ItemStack[] = [{ defId: "ration", qty: 10 }];
  const { energy } = eatToRefill(food, 0, 300, "ration");
  expect(energy).toBeLessThanOrEqual(300);
  expect(energy).toBe(240); // 3 rations (240); a 4th (320) would overfill
});

test("eatToRefill: stops when food runs out", () => {
  const food: ItemStack[] = [{ defId: "ration", qty: 1 }];
  const { food: out, energy } = eatToRefill(food, 0, 300, "ration");
  expect(energy).toBe(80);
  expect(out).toEqual([]);
});

test("eatToRefill: tent multiplier boosts restore per unit (×1.5)", () => {
  const food: ItemStack[] = [{ defId: "ration", qty: 3 }];
  const { energy } = eatToRefill(food, 0, 300, "ration", TENT_FOOD_MULTIPLIER); // each unit restores 120
  expect(energy).toBe(240); // 2 units (120+120=240); a 3rd (360) overfills
});

test("eatToRefill: empty food is a no-op", () => {
  const { food: out, energy } = eatToRefill([], 150, 300, "ration");
  expect(energy).toBe(150);
  expect(out).toEqual([]);
});

test("eatToRefill: pure — does not mutate the input food array", () => {
  const food: ItemStack[] = [{ defId: "ration", qty: 3 }];
  const before = structuredClone(food);
  eatToRefill(food, 0, 300, "ration");
  expect(food).toEqual(before);
});

test("foodEnergyOf / heldFoodEnergy still report restore reserves", () => {
  expect(foodEnergyOf("ration")).toBe(80);
  expect(foodEnergyOf("trail-ration")).toBe(130);
  expect(heldFoodEnergy([{ defId: "ration", qty: 2 }, { defId: "trail-ration", qty: 1 }])).toBe(290);
});

test("eatToRefill: at max already, nothing is eaten", () => {
  const food: ItemStack[] = [{ defId: "ration", qty: 2 }];
  const { food: out, energy } = eatToRefill(food, MAX_ENERGY, MAX_ENERGY, "ration");
  expect(energy).toBe(MAX_ENERGY);
  expect(out).toEqual([{ defId: "ration", qty: 2 }]);
});

test("eatToRefill eats ONLY the designated food, leaving others as reserve (mco)", () => {
  // pemmican(240) + ration(80), designate "ration": only ration is eaten; pemmican
  // is never touched even though it would fit (0+240≤300). Supersedes least-dense-first.
  const r = eatToRefill([{ defId: "pemmican", qty: 1 }, { defId: "ration", qty: 1 }], 0, 300, "ration");
  expect(r.energy).toBe(80);                                          // ate the ration only
  expect(r.food.find((s) => s.defId === "ration")).toBeUndefined();  // ration consumed
  expect(r.food.find((s) => s.defId === "pemmican")?.qty).toBe(1);   // pemmican untouched reserve
});

test("eatToRefill designating a food you don't hold is a no-op (mco)", () => {
  const r = eatToRefill([{ defId: "ration", qty: 2 }], 0, 300, "pemmican"); // no pemmican held
  expect(r.energy).toBe(0);
  expect(r.food).toEqual([{ defId: "ration", qty: 2 }]);
});

test("auto-eat stays waste-free (never overfills past max)", () => {
  const r = eatToRefill([{ defId: "ration", qty: 5 }], 260, 300, "ration"); // 260+80=340>300 → can't fit even one
  expect(r.energy).toBe(260);
  expect(r.food[0]!.qty).toBe(5);
});

test("auto-eat with a single food type is unchanged (order-invariant)", () => {
  const r = eatToRefill([{ defId: "ration", qty: 4 }], 0, 300, "ration"); // 80×3=240 ≤300, 4th 320>300
  expect(r.energy).toBe(240);
  expect(r.food[0]!.qty).toBe(1);
});
