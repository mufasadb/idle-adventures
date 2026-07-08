import { test, expect } from "bun:test";
import {
  MAP_TIER_MAX, MATERIAL_TIER_WEIGHT, NODE_MAGNITUDE_WEIGHTS,
  NODE_MAGNITUDE_YIELD, MAP_TIER_CREATURE_ADD,
  BIOMES,
} from "../src/data/constants";
import { generateGrid, tierProfile, rollBiome } from "../src/engine/grid";

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

test("generateGrid: mapTier 1 equals the default (identity at T1)", () => {
  for (const seed of ["mt-a", "mt-b", "mt-c"]) {
    const b = rollBiome(seed);
    expect(generateGrid(seed, b, 1)).toEqual(generateGrid(seed, b));
  }
});

test("tierProfile: T1 returns the base biome unchanged", () => {
  for (const id of ["woodland", "desert", "tundra"] as const) {
    expect(tierProfile(BIOMES[id], 1)).toEqual(BIOMES[id]);
  }
});

test("boss gate: wyrm never on a T1 grid, present by T3 (tundra)", () => {
  let sawWyrmT1 = false, sawWyrmT3 = false;
  for (let i = 0; i < 300; i++) {
    const seed = `bg-${i}`;
    if (rollBiome(seed) !== "tundra") continue;
    if (generateGrid(seed, "tundra", 1).pois.some((p) => p.creature === "ancient-wyrm")) sawWyrmT1 = true;
    if (generateGrid(seed, "tundra", 3).pois.some((p) => p.creature === "ancient-wyrm")) sawWyrmT3 = true;
  }
  expect(sawWyrmT1).toBe(false);
  expect(sawWyrmT3).toBe(true);
}, 30000);

test("miniboss gate: ice-troll absent at T1, present by T2 (tundra)", () => {
  let t1 = false, t2 = false;
  for (let i = 0; i < 300; i++) {
    const seed = `mb-${i}`;
    if (rollBiome(seed) !== "tundra") continue;
    if (generateGrid(seed, "tundra", 1).pois.some((p) => p.creature === "ice-troll")) t1 = true;
    if (generateGrid(seed, "tundra", 2).pois.some((p) => p.creature === "ice-troll")) t2 = true;
  }
  expect(t1).toBe(false);
  expect(t2).toBe(true);
}, 30000);
