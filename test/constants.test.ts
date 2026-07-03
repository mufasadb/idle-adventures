// test/constants.test.ts
import { test, expect } from "bun:test";
import {
  GRID_SIZE,
  TERRAIN_COST,
  BACKPACK_SLOTS,
  TERRAINS,
  NODE_TYPES,
  BIOME_IDS,
  BIOMES,
  POI_DENSITY,
  POI_MIN_SPACING,
  NOISE_FREQUENCY,
  ENERGY_PER_FOOD,
  MOVE_BASE_COST,
  TRANSPORT_MULTIPLIER,
  BASE_CARRY_SLOTS,
  STACK_CAP,
  NODE_HARDNESS,
  NODE_TOOL,
  TOOL_QUALITY,
  TOOL_CAPABILITY,
  GATHER_YIELD,
} from "../src/data/constants";

test("constants: lever groups exist with the documented shape", () => {
  expect(typeof GRID_SIZE).toBe("number");
  expect(TERRAIN_COST).toHaveProperty("ice");
  expect(BACKPACK_SLOTS).toHaveProperty("starter");
});

test("constants: M1 map levers are filled", () => {
  expect(GRID_SIZE).toBe(20);
  expect(POI_DENSITY).toBeGreaterThan(0);
  expect(POI_MIN_SPACING).toBeGreaterThanOrEqual(3);
  expect(NOISE_FREQUENCY).toBeGreaterThan(0);
});

test("constants: every biome is a complete generation profile", () => {
  expect(BIOME_IDS).toEqual(["woodland", "desert", "tundra"]);
  for (const id of BIOME_IDS) {
    const biome = BIOMES[id];
    const terrainTotal = TERRAINS.reduce(
      (sum, t) => sum + (biome.terrainWeights[t] ?? 0),
      0,
    );
    const nodeTotal = NODE_TYPES.reduce(
      (sum, n) => sum + (biome.nodeTypeWeights[n] ?? 0),
      0,
    );
    expect(terrainTotal).toBeGreaterThan(0);
    expect(nodeTotal).toBeGreaterThan(0);
    // creatureTable/materialTable stay empty until M4/M5 — but the slots exist
    expect(Array.isArray(biome.creatureTable)).toBe(true);
    expect(typeof biome.materialTable).toBe("object");
  }
});

test("constants: biomes are visibly distinct profiles", () => {
  expect(BIOMES.tundra.terrainWeights.ice ?? 0).toBeGreaterThan(0);
  expect(BIOMES.woodland.terrainWeights.ice ?? 0).toBe(0);
  expect(BIOMES.desert.terrainWeights.ice ?? 0).toBe(0);
  expect(BIOMES.desert.nodeTypeWeights.mining ?? 0).toBeGreaterThan(
    BIOMES.woodland.nodeTypeWeights.mining ?? 0,
  );
});

test("constants: M2 energy levers are filled", () => {
  expect(ENERGY_PER_FOOD).toBeGreaterThan(0);
  expect(MOVE_BASE_COST).toBeGreaterThan(0);
  expect(TERRAIN_COST.ice).toBeGreaterThan(TERRAIN_COST.plains); // bead acceptance: ice > plains
  expect(Number.isFinite(TERRAIN_COST.mountain)).toBe(false); // impassable without gear
  expect(TRANSPORT_MULTIPLIER.horse).toBeGreaterThan(1); // horse cheapens movement (divisor)
});

test("constants: M3 carry + gathering levers are filled", () => {
  expect(BASE_CARRY_SLOTS).toBeGreaterThan(0);
  expect(BACKPACK_SLOTS.starter).toBeGreaterThan(BASE_CARRY_SLOTS);
  expect(STACK_CAP).toBeGreaterThan(0);
  expect(NODE_TOOL.mining).toBe("pick"); // bead acceptance hinges on this gate
  expect(NODE_TOOL.herb).toBeNull(); // herbs gather bare-handed
  for (const kind of ["mining", "wood", "herb", "animal"] as const) {
    expect(NODE_HARDNESS[kind]).toBeGreaterThan(0);
    expect(GATHER_YIELD[kind]).toBeGreaterThan(0);
  }
  for (const tool of Object.keys(TOOL_QUALITY)) {
    expect(TOOL_CAPABILITY[tool]).toBeDefined(); // every tool declares its capability
  }
});

test("constants: every biome yields a material for every gatherable node type", () => {
  for (const id of BIOME_IDS) {
    for (const kind of ["mining", "wood", "herb", "animal"] as const) {
      expect(BIOMES[id].materialTable[kind]).toBeTruthy();
    }
  }
});

test("constants: biome materials are distinct so cross-biome recipes have pulls", () => {
  const all = BIOME_IDS.flatMap((id) =>
    (["mining", "wood", "herb", "animal"] as const).map(
      (kind) => BIOMES[id].materialTable[kind],
    ),
  );
  expect(new Set(all).size).toBe(all.length); // 12 unique material defIds
});
