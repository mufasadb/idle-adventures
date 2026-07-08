import { test, expect } from "bun:test";
import {
  MAP_TIER_MAX, MATERIAL_TIER_WEIGHT, NODE_MAGNITUDE_WEIGHTS,
  NODE_MAGNITUDE_YIELD, MAP_TIER_CREATURE_ADD,
} from "../src/data/constants";

test("map-tier levers: T1 is identity (hygiene)", () => {
  expect(MAP_TIER_MAX).toBe(5);
  // Every material's tier-1 multiplier is 1 (or absent → treated as 1).
  for (const m of Object.keys(MATERIAL_TIER_WEIGHT)) {
    expect(MATERIAL_TIER_WEIGHT[m]![1] ?? 1).toBe(1);
  }
  // Magnitude at T1 is always the base class.
  expect(NODE_MAGNITUDE_WEIGHTS[1]).toEqual({ 1: 1 });
  expect(NODE_MAGNITUDE_YIELD[1]).toBe(1);
  // No boss additive layer at T1 (bosses gated to T2+).
  expect(MAP_TIER_CREATURE_ADD[1]).toBeUndefined();
});
