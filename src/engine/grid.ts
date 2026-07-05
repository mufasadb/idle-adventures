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
  MATERIAL_TIER,
} from "../data/constants";
import type { Terrain, NodeType, BiomeId } from "../data/constants";
import { rand, weightedPick } from "./rng";
import { perlin2 } from "./noise";
import { costToReach, reachableTiles } from "./reach";

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

// Memoize generation: the reducer regenerates the grid on every move/gather/scout
// with identical (mapSeed, biomeId), and generation now runs reachability passes
// (b91) that are wasteful to repeat. Pure (deterministic in the key), so caching
// is transparent; callers treat the grid as read-only. Bounded to cap memory
// across many distinct seeds in long sim runs.
const gridCache = new Map<string, Grid>();
const GRID_CACHE_CAP = 512;

export function generateGrid(mapSeed: string, biomeId: BiomeId): Grid {
  const key = `${mapSeed.length}:${mapSeed}:${biomeId}`;
  const hit = gridCache.get(key);
  if (hit) return hit;
  const grid = buildGrid(mapSeed, biomeId);
  if (gridCache.size >= GRID_CACHE_CAP) gridCache.clear();
  gridCache.set(key, grid);
  return grid;
}

function buildGrid(mapSeed: string, biomeId: BiomeId): Grid {
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
  // Entry (b91): embark lands on the bottom row. Pick the x that opens onto the
  // LARGEST on-foot reachable region, so a bare loadout is never boxed into a
  // dead corner pocket (the food reachability guarantee starts here). Ties break
  // toward a seeded preferred x for determinism + variety.
  const preferred = Math.floor(rand(mapSeed, "entry") * GRID_SIZE);
  let entry = { x: preferred, y: GRID_SIZE - 1 };
  let bestReach = -1;
  for (let x = 0; x < GRID_SIZE; x++) {
    const cand = { x, y: GRID_SIZE - 1 };
    const n = reachableTiles(terrain, cand);
    if (n > bestReach || (n === bestReach && Math.abs(x - preferred) < Math.abs(entry.x - preferred))) {
      bestReach = n;
      entry = cand;
    }
  }
  // Phase 3 (b91): place POIs in two steps so we can bias value against terrain.
  // (a) Collect accepted POSITIONS via seeded rejection sampling — walk a
  //     deterministic candidate stream, keep candidates that clear POI_MIN_SPACING
  //     (Chebyshev, 8-dir) from every accepted position and avoid the entry tile.
  //     NOTE: if the attempt budget exhausts, FEWER than POI_DENSITY positions
  //     result (astronomically unlikely) — callers must not assume the count.
  const positions: { x: number; y: number }[] = [];
  for (
    let attempt = 0;
    attempt < POI_PLACEMENT_ATTEMPTS && positions.length < POI_DENSITY;
    attempt++
  ) {
    const x = Math.floor(rand(mapSeed, "poi-x", attempt) * GRID_SIZE);
    const y = Math.floor(rand(mapSeed, "poi-y", attempt) * GRID_SIZE);
    if (x === entry.x && y === entry.y) continue; // entry tile stays clear (M2: embark lands here)
    const clear = positions.every(
      (p) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) >= POI_MIN_SPACING,
    );
    if (!clear) continue;
    positions.push({ x, y });
  }
  // (b) Roll a SPEC (kind/creature/material) per accepted position, indexed by
  //     acceptance order — decoupled from position so we can reassign by value.
  const specs = positions.map((_, i) => {
    const kind = weightedPick(biome.nodeTypeWeights, NODE_TYPES, rand(mapSeed, "poi-kind", i));
    const creature =
      kind === "monster" && biome.creatureTable.length > 0
        ? biome.creatureTable[
            Math.floor(rand(mapSeed, "poi-creature", i) * biome.creatureTable.length)
          ]!
        : null;
    const material =
      kind === "monster"
        ? null
        : rollMaterial(biome.materialTable[kind], rand(mapSeed, "poi-material", i));
    return { kind, material, creature };
  });
  // (c) Value score: monster (combat reward) > higher-tier material > basic forage.
  const value = (s: { kind: NodeType; material: string | null }): number => {
    if (s.kind === "monster") return 3;
    if (s.material && (MATERIAL_TIER[s.material] ?? 1) >= 2) return 2;
    return 1;
  };
  // (d) Continuous pairing: sort specs by value desc, positions by on-foot
  //     cost-to-reach desc, pair index-for-index — highest-value spec lands on
  //     the hardest-to-reach position, food/basic drifts to the reachable core.
  //     This also protects the food reachability guard: low-value forage takes
  //     the LOWEST cost-to-reach (most reachable) tiles by construction.
  const reach = costToReach(terrain, entry); // on-foot, no gear — the baseline
  const reachCost = positions.map((p) => reach[p.y]![p.x]!);
  const specOrder = specs.map((_, i) => i).sort((a, b) => {
    const d = value(specs[b]!) - value(specs[a]!);
    return d !== 0 ? d : a - b; // stable index tiebreak → deterministic
  });
  const posOrder = positions.map((_, i) => i).sort((a, b) => {
    const ca = reachCost[a]!, cb = reachCost[b]!;
    if (ca === cb) return a - b;
    return ca < cb ? 1 : -1; // descending, Infinity-safe (no arithmetic)
  });
  const pois: Poi[] = specOrder.map((si, k) => {
    const p = positions[posOrder[k]!]!;
    const s = specs[si]!;
    return { x: p.x, y: p.y, kind: s.kind, material: s.material, creature: s.creature };
  });
  return { biomeId, terrain, pois, entry };
}
