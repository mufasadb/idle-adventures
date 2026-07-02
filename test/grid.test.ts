import { test, expect } from "bun:test";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { GRID_SIZE, BIOME_IDS, TERRAINS } from "../src/data/constants";
import type { Terrain } from "../src/data/constants";

function terrainCounts(seed: string, biome: "woodland" | "desert" | "tundra") {
  const grid = generateGrid(seed, biome);
  const counts = Object.fromEntries(TERRAINS.map((t) => [t, 0])) as Record<Terrain, number>;
  for (const row of grid.terrain) for (const t of row) counts[t]++;
  return counts;
}

test("generateGrid: 20×20, row-major, fully terrained", () => {
  const grid = generateGrid("map-1", "woodland");
  expect(grid.terrain.length).toBe(GRID_SIZE);
  for (const row of grid.terrain) {
    expect(row.length).toBe(GRID_SIZE);
    for (const t of row) expect(TERRAINS).toContain(t);
  }
});

test("generateGrid: same seed+biome is deeply identical (deterministic)", () => {
  expect(generateGrid("map-1", "tundra")).toEqual(generateGrid("map-1", "tundra"));
});

test("generateGrid: different seeds give different terrain", () => {
  expect(generateGrid("map-1", "woodland").terrain).not.toEqual(
    generateGrid("map-2", "woodland").terrain,
  );
});

test("generateGrid: biome weights shape the terrain mix", () => {
  const desert = terrainCounts("mix-check", "desert");
  const tundra = terrainCounts("mix-check", "tundra");
  const woodland = terrainCounts("mix-check", "woodland");
  expect(desert.ice).toBe(0); // zero-weight terrain never generates
  expect(woodland.ice).toBe(0);
  expect(tundra.ice).toBeGreaterThan(0);
  expect(desert.plains).toBeGreaterThan(woodland.plains); // 0.75 vs 0.4 weight
});

test("generateGrid: terrain regions are coherent, not per-tile static", () => {
  // With NOISE_FREQUENCY ≈ 0.15, neighbours usually match — count horizontal
  // adjacent same-terrain pairs; static noise would sit near the weight-derived
  // collision rate (~0.3–0.45), coherent regions should clear it comfortably.
  const grid = generateGrid("coherence", "woodland");
  let same = 0;
  let pairs = 0;
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 1; x < GRID_SIZE; x++) {
      pairs++;
      if (grid.terrain[y]![x] === grid.terrain[y]![x - 1]) same++;
    }
  }
  expect(same / pairs).toBeGreaterThan(0.6);
});

test("rollBiome: deterministic and lands on a real biome", () => {
  expect(rollBiome("map-1")).toBe(rollBiome("map-1"));
  expect(BIOME_IDS).toContain(rollBiome("map-1"));
});

test("rollBiome: different seeds can roll different biomes", () => {
  const rolled = new Set(
    Array.from({ length: 30 }, (_, i) => rollBiome(`candidate-${i}`)),
  );
  expect(rolled.size).toBe(BIOME_IDS.length); // 30 seeds should hit all 3
});
