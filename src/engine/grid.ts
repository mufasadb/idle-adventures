// Deterministic map generation (M1). A biome is a generation profile only
// (D21): it is read here, at generation time, and never consulted again.
import {
  MAP_WIDTH,
  MAP_HEIGHT,
  NOISE_FREQUENCY,
  BARRIER_NOISE_FREQUENCY,
  BARRIER_THRESHOLD,
  BIOMES,
  BIOME_IDS,
  TERRAINS,
  POI_DENSITY,
  POI_MIN_SPACING,
  POI_PLACEMENT_ATTEMPTS,
  NODE_TYPES,
  MATERIAL_TIER,
  MATERIAL_TIER_WEIGHT,
  MAP_TIER_CREATURE_ADD,
  POI_DENSITY_BY_TIER,
  TERRAIN_WEIGHT_TIER_SHIFT,
  NODE_MAGNITUDE_WEIGHTS,
} from "../data/constants";
import type { Terrain, NodeType, BiomeId, Biome } from "../data/constants";
import { rand, weightedPick } from "./rng";
import { perlin2 } from "./noise";
import { costToReach, reachableTiles } from "./reach";
import { moveCost } from "./move";

export type Poi = {
  x: number;
  y: number;
  kind: NodeType;
  material: string | null; // yield defId, rolled from the biome's weighted table at generation (D25/D27) — gather never consults the biome
  creature: string | null; // monster defId, stamped from the biome at generation (M4, mirrors D25) — combat never consults the biome
  magnitude?: number; // node-variant level (2yn): 1 base, 2 mid, 3 rich. Multiplies
                      // GATHER_YIELD via NODE_MAGNITUDE_YIELD. Gatherable kinds only. Absent = 1.
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

// Roll a node's magnitude class from the tier's distribution (2yn). Numeric keys sorted
// for determinism, like rollMaterial. Returns 1 (base) when the table is {1:1}.
function rollMagnitude(table: Record<number, number>, roll: number): number {
  const order = Object.keys(table).map(Number).sort((a, b) => a - b).map(String);
  return Number(weightedPick(table as unknown as Record<string, number>, order, roll));
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

// Memoize generation: the reducer regenerates the grid on every move/gather
// with identical (mapSeed, biomeId), and generation now runs reachability passes
// (b91) that are wasteful to repeat. Pure (deterministic in the key), so caching
// is transparent; callers treat the grid as read-only. Bounded to cap memory
// across many distinct seeds in long sim runs.
const gridCache = new Map<string, Grid>();
const GRID_CACHE_CAP = 512;

// e3j connectivity: barrier walls must never seal a pocket off entirely.
// Flood-label walkable (finite on-foot cost) regions; carve a pass from each
// minor region to the largest along the closest tile pair (Chebyshev, stable
// row-major tie-break — deterministic with no extra RNG). Carved tiles become
// the biome's most-weighted walkable terrain, so a pass reads as native
// ground (tundra passes are ice, elsewhere plains), not a scar.
const walkableTerrain = (t: Terrain): boolean => Number.isFinite(moveCost(t, null, []));

function carveTerrainOf(biome: Biome): Terrain {
  let best: Terrain = "plains";
  let bw = -1;
  for (const t of TERRAINS) {
    const w = biome.terrainWeights[t] ?? 0;
    if (walkableTerrain(t) && w > bw) { bw = w; best = t; }
  }
  return best;
}

function walkableRegions(terrain: Terrain[][]): { x: number; y: number }[][] {
  const label: number[][] = terrain.map((row) => row.map(() => -1));
  const regions: { x: number; y: number }[][] = [];
  for (let sy = 0; sy < MAP_HEIGHT; sy++) {
    for (let sx = 0; sx < MAP_WIDTH; sx++) {
      if (!walkableTerrain(terrain[sy]![sx]!) || label[sy]![sx]! !== -1) continue;
      const id = regions.length;
      const tiles: { x: number; y: number }[] = [];
      const stack = [{ x: sx, y: sy }];
      label[sy]![sx] = id;
      while (stack.length) {
        const c = stack.pop()!;
        tiles.push(c);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = c.x + dx, ny = c.y + dy;
            if (nx < 0 || ny < 0 || nx >= MAP_WIDTH || ny >= MAP_HEIGHT) continue;
            if (!walkableTerrain(terrain[ny]![nx]!) || label[ny]![nx]! !== -1) continue;
            label[ny]![nx] = id;
            stack.push({ x: nx, y: ny });
          }
        }
      }
      regions.push(tiles);
    }
  }
  return regions;
}

function carveConnectivity(terrain: Terrain[][], biome: Biome): void {
  const carve = carveTerrainOf(biome);
  // Each pass merges the second-largest region into the largest, so the
  // region count strictly decreases — guaranteed termination.
  for (;;) {
    const regions = walkableRegions(terrain).sort((a, b) => b.length - a.length);
    if (regions.length <= 1) return;
    const main = regions[0]!, minor = regions[1]!;
    let from = minor[0]!, to = main[0]!, best = Infinity;
    for (const a of minor) {
      for (const b of main) {
        const d = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
        if (d < best) { best = d; from = a; to = b; }
      }
    }
    let cx = from.x, cy = from.y;
    while (cx !== to.x || cy !== to.y) {
      cx += Math.sign(to.x - cx);
      cy += Math.sign(to.y - cy);
      if (!walkableTerrain(terrain[cy]![cx]!)) terrain[cy]![cx] = carve;
    }
  }
}

// Transform a biome's generation profile for a map tier (2yn). IDENTITY at mapTier 1:
// every lever below is absent/1 at tier 1, so the returned biome deep-equals the base
// and T1 generation is byte-identical. Never touches RNG — only the weight tables.
export function tierProfile(biome: Biome, mapTier: number): Biome {
  if (mapTier <= 1) return biome;
  // (a) materialTable weights × per-material tier multiplier
  const materialTable: Biome["materialTable"] = {};
  for (const kind of Object.keys(biome.materialTable) as (keyof Biome["materialTable"])[]) {
    const base = biome.materialTable[kind]!;
    const scaled: Record<string, number> = {};
    for (const defId of Object.keys(base)) {
      scaled[defId] = base[defId]! * (MATERIAL_TIER_WEIGHT[defId]?.[mapTier] ?? 1);
    }
    materialTable[kind] = scaled;
  }
  // (b) creatureTable = boss-free base + additive boss layer (weights sum on collision)
  const creatureTable: Record<string, number> = { ...biome.creatureTable };
  for (const [defId, w] of Object.entries(MAP_TIER_CREATURE_ADD[mapTier] ?? {})) {
    creatureTable[defId] = (creatureTable[defId] ?? 0) + w;
  }
  // (c) terrainWeights × per-terrain tier shift
  const shift = TERRAIN_WEIGHT_TIER_SHIFT[mapTier] ?? {};
  const terrainWeights: Biome["terrainWeights"] = { ...biome.terrainWeights };
  for (const t of Object.keys(terrainWeights) as Terrain[]) {
    terrainWeights[t] = terrainWeights[t]! * (shift[t] ?? 1);
  }
  return { ...biome, materialTable, creatureTable, terrainWeights };
}

export function generateGrid(mapSeed: string, biomeId: BiomeId, mapTier = 1, _affixes?: string[]): Grid {
  const key = `${mapSeed.length}:${mapSeed}:${biomeId}:${mapTier}`;
  const hit = gridCache.get(key);
  if (hit) return hit;
  const grid = buildGrid(mapSeed, biomeId, mapTier);
  if (gridCache.size >= GRID_CACHE_CAP) gridCache.clear();
  gridCache.set(key, grid);
  return grid;
}

function buildGrid(mapSeed: string, biomeId: BiomeId, mapTier: number): Grid {
  const biome = tierProfile(BIOMES[biomeId], mapTier);
  const terrain: Terrain[][] = [];
  for (let y = 0; y < MAP_HEIGHT; y++) {
    const row: Terrain[] = [];
    for (let x = 0; x < MAP_WIDTH; x++) {
      // Sample mid-tile (the +0.5) so integer lattice points — where Perlin
      // is always 0.5 — don't line up with the tile grid.
      const noise = perlin2(mapSeed, (x + 0.5) * NOISE_FREQUENCY, (y + 0.5) * NOISE_FREQUENCY);
      // Barrier layer (e3j): a low-frequency field carves long walls; the seed is
      // namespaced so the two fields are independent.
      const barrier = perlin2(`${mapSeed}:barrier`, (x + 0.5) * BARRIER_NOISE_FREQUENCY, (y + 0.5) * BARRIER_NOISE_FREQUENCY);
      row.push(
        barrier > BARRIER_THRESHOLD
          ? biome.barrierTerrain
          : weightedPick(biome.terrainWeights, TERRAINS, noise),
      );
    }
    terrain.push(row);
  }
  carveConnectivity(terrain, biome);
  // Entry (b91): embark lands on the bottom row. Pick the x that opens onto the
  // LARGEST on-foot reachable region, so a bare loadout is never boxed into a
  // dead corner pocket (the food reachability guarantee starts here). Ties break
  // toward a seeded preferred x for determinism + variety.
  // Constraint (e3j final review): the entry tile itself MUST be walkable — you
  // must be able to return to it. Skip impassable bottom-row candidates; without
  // this, a bottom-row wall tile adjacent to the one walkable component can tie
  // (or beat) every real candidate and strand the player on a tile they can leave
  // but never re-enter.
  const preferred = Math.floor(rand(mapSeed, "entry") * MAP_WIDTH);
  let entry = { x: preferred, y: MAP_HEIGHT - 1 };
  let bestReach = -1;
  for (let x = 0; x < MAP_WIDTH; x++) {
    if (!walkableTerrain(terrain[MAP_HEIGHT - 1]![x]!)) continue;
    const cand = { x, y: MAP_HEIGHT - 1 };
    const n = reachableTiles(terrain, cand);
    if (n > bestReach || (n === bestReach && Math.abs(x - preferred) < Math.abs(entry.x - preferred))) {
      bestReach = n;
      entry = cand;
    }
  }
  // Fallback: the ENTIRE bottom row was unwalkable. Carve the preferred-x tile to
  // native walkable terrain and re-run connectivity so it joins the main
  // component, then use it as entry.
  if (bestReach === -1) {
    entry = { x: preferred, y: MAP_HEIGHT - 1 };
    terrain[entry.y]![entry.x] = carveTerrainOf(biome);
    carveConnectivity(terrain, biome);
  }
  // Phase 3 (b91): place POIs in two steps so we can bias value against terrain.
  // (a) Collect accepted POSITIONS via seeded rejection sampling — walk a
  //     deterministic candidate stream, keep candidates that clear POI_MIN_SPACING
  //     (Chebyshev, 8-dir) from every accepted position and avoid the entry tile.
  //     NOTE: if the attempt budget exhausts, FEWER than POI_DENSITY positions
  //     result (astronomically unlikely) — callers must not assume the count.
  const poiCount = POI_DENSITY_BY_TIER[mapTier] ?? POI_DENSITY;
  const positions: { x: number; y: number }[] = [];
  for (
    let attempt = 0;
    attempt < POI_PLACEMENT_ATTEMPTS && positions.length < poiCount;
    attempt++
  ) {
    const x = Math.floor(rand(mapSeed, "poi-x", attempt) * MAP_WIDTH);
    const y = Math.floor(rand(mapSeed, "poi-y", attempt) * MAP_HEIGHT);
    if (x === entry.x && y === entry.y) continue; // entry tile stays clear (M2: embark lands here)
    // Walls carry no nodes (e3j final review): reject unwalkable candidates so
    // the value-vs-reach pairing never strands its highest-value specs on
    // impassable terrain (mountain-top content can return deliberately with a
    // future cartography/climbing pass). 2000 attempts on ~1000 walkable tiles
    // cannot starve the POI_DENSITY budget.
    if (!walkableTerrain(terrain[y]![x]!)) continue;
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
    const creatureKeys = Object.keys(biome.creatureTable).sort(); // deterministic order, like rollMaterial
    const creature =
      kind === "monster" && creatureKeys.length > 0
        ? weightedPick(biome.creatureTable, creatureKeys, rand(mapSeed, "poi-creature", i))
        : null;
    const material =
      kind === "monster"
        ? null
        : rollMaterial(biome.materialTable[kind], rand(mapSeed, "poi-material", i));
    const magnitude =
      kind === "monster"
        ? undefined
        : rollMagnitude(NODE_MAGNITUDE_WEIGHTS[mapTier] ?? { 1: 1 }, rand(mapSeed, "poi-magnitude", i));
    return { kind, material, creature, magnitude };
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
    return { x: p.x, y: p.y, kind: s.kind, material: s.material, creature: s.creature,
             ...(s.magnitude && s.magnitude > 1 ? { magnitude: s.magnitude } : {}) };
  });
  return { biomeId, terrain, pois, entry };
}
