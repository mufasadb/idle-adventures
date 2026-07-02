// Deterministic map generation (M1). A biome is a generation profile only
// (D21): it is read here, at generation time, and never consulted again.
import {
  GRID_SIZE,
  NOISE_FREQUENCY,
  BIOMES,
  BIOME_IDS,
  TERRAINS,
} from "../data/constants";
import type { Terrain, NodeType, BiomeId } from "../data/constants";
import { rand, weightedPick } from "./rng";
import { perlin2 } from "./noise";

export type Poi = { x: number; y: number; kind: NodeType };

export type Grid = {
  biomeId: BiomeId;
  terrain: Terrain[][]; // [y][x]
  pois: Poi[];
  entry: { x: number; y: number };
};

// Each candidate map rolls its biome from its own seed — embark carries only
// mapSeed, and anyone holding the seed can re-derive the biome (D21, M6 note).
export function rollBiome(mapSeed: string): BiomeId {
  const i = Math.floor(rand(mapSeed, "biome") * BIOME_IDS.length);
  return BIOME_IDS[i] ?? BIOME_IDS[0]!;
}

export function generateGrid(mapSeed: string, biomeId: BiomeId): Grid {
  const biome = BIOMES[biomeId];
  const terrain: Terrain[][] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    const row: Terrain[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      // Sample mid-tile (the +0.5) so integer lattice points — where Perlin
      // is always 0.5 — don't line up with the tile grid.
      const noise = perlin2(mapSeed, (x + 0.5) * NOISE_FREQUENCY, (y + 0.5) * NOISE_FREQUENCY);
      // The noise value walks the biome's cumulative weight bands in TERRAINS
      // (elevation) order: coherent noise regions become coherent terrain.
      row.push(weightedPick(biome.terrainWeights, TERRAINS, noise));
    }
    terrain.push(row);
  }
  const entry = { x: Math.floor(rand(mapSeed, "entry") * GRID_SIZE), y: GRID_SIZE - 1 };
  return { biomeId, terrain, pois: [], entry };
}
