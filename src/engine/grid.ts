// Deterministic map generation (M1). A biome is a generation profile only
// (D21): it is read here, at generation time, and never consulted again.
import {
  GRID_SIZE,
  NOISE_FREQUENCY,
  BIOMES,
  BIOME_IDS,
  TERRAINS,
  POI_DENSITY,
  POI_MIN_SPACING,
  POI_PLACEMENT_ATTEMPTS,
  NODE_TYPES,
} from "../data/constants";
import type { Terrain, NodeType, BiomeId } from "../data/constants";
import { rand, weightedPick } from "./rng";
import { perlin2 } from "./noise";

export type Poi = {
  x: number;
  y: number;
  kind: NodeType;
  material: string | null; // yield defId, rolled from the biome's weighted table at generation (D25/D27) — gather never consults the biome
  creature: string | null; // monster defId, stamped from the biome at generation (M4, mirrors D25) — combat never consults the biome
};

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

// Roll a POI's material from the biome's weighted table (D27). Keys are sorted
// for a deterministic order independent of literal insertion order.
function rollMaterial(
  table: Record<string, number> | undefined,
  roll: number,
): string | null {
  if (!table) return null;
  const order = Object.keys(table).sort();
  if (order.length === 0) return null;
  return weightedPick(table, order, roll);
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
  // NOTE: entry passability isn't guaranteed — the bottom-row roll can land
  // on mountain. Harmless while move cost reads the DESTINATION tile only;
  // revisit when M5's candidate-map previews pick embark targets.
  const entry = { x: Math.floor(rand(mapSeed, "entry") * GRID_SIZE), y: GRID_SIZE - 1 };
  // Seeded rejection sampling: walk a deterministic candidate stream, keep
  // candidates that clear POI_MIN_SPACING (Chebyshev — 8-dir movement) from
  // every accepted POI. Kind is drawn per accepted candidate from the biome.
  // NOTE: if the attempt budget exhausts, the grid returns FEWER than
  // POI_DENSITY POIs (astronomically unlikely at current levers) — callers
  // must not assume pois.length === POI_DENSITY.
  const pois: Poi[] = [];
  for (
    let attempt = 0;
    attempt < POI_PLACEMENT_ATTEMPTS && pois.length < POI_DENSITY;
    attempt++
  ) {
    const x = Math.floor(rand(mapSeed, "poi-x", attempt) * GRID_SIZE);
    const y = Math.floor(rand(mapSeed, "poi-y", attempt) * GRID_SIZE);
    if (x === entry.x && y === entry.y) continue; // entry tile stays clear (M2: embark lands here)
    const clear = pois.every(
      (p) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) >= POI_MIN_SPACING,
    );
    if (!clear) continue;
    const kind = weightedPick(
      biome.nodeTypeWeights,
      NODE_TYPES,
      rand(mapSeed, "poi-kind", attempt),
    );
    const creature =
      kind === "monster" && biome.creatureTable.length > 0
        ? biome.creatureTable[
            Math.floor(rand(mapSeed, "poi-creature", attempt) * biome.creatureTable.length)
          ]!
        : null;
    const material =
      kind === "monster"
        ? null
        : rollMaterial(biome.materialTable[kind], rand(mapSeed, "poi-material", attempt));
    pois.push({ x, y, kind, material, creature });
  }
  return { biomeId, terrain, pois, entry };
}
