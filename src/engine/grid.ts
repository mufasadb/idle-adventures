// Deterministic map generation (M1). A biome is a generation profile only
// (D21): it is read here, at generation time, and never consulted again.
import {
  MAP_WIDTH,
  MAP_HEIGHT,
  NOISE_FREQUENCY,
  BARRIER_NOISE_FREQUENCY,
  BARRIER_THRESHOLD,
  WATER_NOISE_FREQUENCY,
  BIOMES,
  BIOME_IDS,
  RARE_BIOMES,
  TERRAINS,
  POI_DENSITY,
  POI_MIN_SPACING,
  POI_PLACEMENT_ATTEMPTS,
  NODE_TYPES,
  MATERIAL_MAP_TIER_WEIGHT,
  CREATURE_MAP_TIER_WEIGHT,
  MAP_TIER_CREATURE_ADD,
  POI_DENSITY_BY_TIER,
  TERRAIN_WEIGHT_TIER_SHIFT,
  NODE_MAGNITUDE_WEIGHTS,
  AFFIX_EFFECTS,
  WATER_TERRAINS,
  FISH_DEEP_DEPTH,
} from "../data/constants";
import type { Terrain, NodeType, BiomeId, Biome, FishWater } from "../data/constants";
import { rand, weightedPick } from "./rng";
import { perlin2 } from "./noise";
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
  // Fishing (si7.6.2), both [y][x]. depth: Chebyshev tiles from the nearest land for a
  // water tile (1 = touching the shore), 0 on land. catches: the defId one cast of this
  // water tile yields, pre-rolled from the biome's fishTable (null = unfishable). Optional
  // so hand-built test grids stay terse (absent = no fishing anywhere).
  depth?: number[][];
  catches?: (string | null)[][];
};

// Which fishTable row a water tile reads (si7.6.2). Depth only splits standing bodies.
export function fishWaterOf(terrain: Terrain, depth: number): FishWater | null {
  if (terrain === "river" || terrain === "shallows") return terrain;
  if (terrain === "lake") return depth >= FISH_DEEP_DEPTH ? "deep-lake" : "lake";
  if (terrain === "sea") return depth >= FISH_DEEP_DEPTH ? "deep-sea" : "sea";
  return null;
}

// Multi-source BFS (8-neighbour) outward from every land tile: each water tile's depth
// is its Chebyshev distance to the shore. A map edge is not a shore.
function waterDepth(terrain: Terrain[][]): number[][] {
  const depth = terrain.map((row) => row.map(() => 0));
  let frontier: { x: number; y: number }[] = [];
  for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) {
    if (WATER_TERRAINS.includes(terrain[y]![x]!)) depth[y]![x] = -1;
    else frontier.push({ x, y });
  }
  for (let d = 1; frontier.length > 0; d++) {
    const next: { x: number; y: number }[] = [];
    for (const c of frontier) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = c.x + dx, y = c.y + dy;
        if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT || depth[y]![x] !== -1) continue;
        depth[y]![x] = d;
        next.push({ x, y });
      }
    }
    frontier = next;
  }
  // An all-water map (no land at all) would leave -1s; treat them as deep.
  return depth.map((row) => row.map((d) => (d === -1 ? FISH_DEEP_DEPTH : d)));
}

// Each candidate map rolls its biome from its own seed — embark carries only
// mapSeed, and anyone holding the seed can re-derive the biome (D21, M6 note).
// D91: rare biomes (RARE_BIOMES) sit OUT of the uniform base roll and roll in on their
// own chance at/above their minTier — so the base pick for any seed is unchanged and a
// T1 map can never be a rare biome. `mapTier` defaults to 1 (the town's local map).
const BASE_BIOMES = BIOME_IDS.filter((id) => !RARE_BIOMES[id]);
export function rollBiome(mapSeed: string, mapTier = 1): BiomeId {
  for (const id of [...BIOME_IDS].sort()) {
    const rare = RARE_BIOMES[id];
    if (rare && mapTier >= rare.minTier && rand(mapSeed, "biome-rare", id) < rare.chance) return id;
  }
  const i = Math.floor(rand(mapSeed, "biome") * BASE_BIOMES.length);
  return BASE_BIOMES[i] ?? BASE_BIOMES[0]!;
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
      const t = terrain[cy]![cx]!;
      // A pass through standing water is a wadeable FORD, not dry land (si7.6.5).
      if (!walkableTerrain(t)) terrain[cy]![cx] = t === "lake" || t === "sea" ? "shallows" : carve;
    }
  }
}

// Transform a biome's generation profile for a map tier (2yn). IDENTITY at mapTier 1:
// every lever below is absent/1 at tier 1, so the returned biome deep-equals the base
// and T1 generation is byte-identical. Never touches RNG — only the weight tables.
export function tierProfile(biome: Biome, biomeId: BiomeId, mapTier: number): Biome {
  if (mapTier <= 1) return biome;
  // (a) materialTable weights × per-material tier multiplier
  const materialTable: Biome["materialTable"] = {};
  for (const kind of Object.keys(biome.materialTable) as (keyof Biome["materialTable"])[]) {
    const base = biome.materialTable[kind]!;
    const scaled: Record<string, number> = {};
    for (const defId of Object.keys(base)) {
      scaled[defId] = base[defId]! * (MATERIAL_MAP_TIER_WEIGHT[defId]?.[mapTier] ?? 1);
    }
    materialTable[kind] = scaled;
  }
  // (b) creatureTable: base weights × per-creature tier multiplier (D84 — T1 trash
  // scales OUT, T2/T3 scale IN, rosters overlap), THEN the additive biome-scoped boss
  // layer (weights sum on collision). Identity at T1 (multiplier absent = ×1).
  const creatureTable: Record<string, number> = {};
  for (const defId of Object.keys(biome.creatureTable)) {
    creatureTable[defId] = biome.creatureTable[defId]! * (CREATURE_MAP_TIER_WEIGHT[defId]?.[mapTier] ?? 1);
  }
  for (const [defId, w] of Object.entries(MAP_TIER_CREATURE_ADD[biomeId]?.[mapTier] ?? {})) {
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

// Transform a biome's generation profile for cartography affixes (cxq). IDENTITY
// at zero affixes: returns the biome unchanged, so an un-inked map is byte-
// identical (base snapshots don't move). Multiplies material/node-kind weights
// AFTER tierProfile — one modifier pipeline, two inputs (tier, then affixes).
// Never touches RNG: a bias over the same random stream, deterministic. A
// materialWeightMul only bites where the defId already exists in that biome
// (you can't ink coal onto a biome that never had any).
export function affixProfile(biome: Biome, affixes: string[]): Biome {
  if (affixes.length === 0) return biome;
  const materialTable: Biome["materialTable"] = {};
  for (const kind of Object.keys(biome.materialTable) as (keyof Biome["materialTable"])[]) {
    materialTable[kind] = { ...biome.materialTable[kind]! };
  }
  const nodeTypeWeights: Biome["nodeTypeWeights"] = { ...biome.nodeTypeWeights };
  for (const a of affixes) {
    const eff = AFFIX_EFFECTS[a];
    if (!eff) continue;
    for (const [defId, mul] of Object.entries(eff.materialWeightMul ?? {})) {
      for (const kind of Object.keys(materialTable) as (keyof Biome["materialTable"])[]) {
        const tbl = materialTable[kind]!;
        if (defId in tbl) tbl[defId] = tbl[defId]! * mul;
      }
    }
    for (const [nt, mul] of Object.entries(eff.nodeTypeWeightMul ?? {})) {
      const k = nt as NodeType;
      if (nodeTypeWeights[k] !== undefined) nodeTypeWeights[k] = nodeTypeWeights[k]! * mul;
    }
  }
  return { ...biome, materialTable, nodeTypeWeights };
}

// Single derivation of an in-run map grid from expedition identity (kuv): every
// in-run VIEW and ENGINE site MUST derive the grid through this helper, so a new
// generation discriminator (mapTier, affixes) can never desync view↔engine
// again. Town-side / offer-preview (localMap) stays separate.
// D93: a map's biome is FROZEN when it's minted (MapItem.biomeId) and carried onto the
// run at embark (Expedition.biomeId) — later lever changes (e.g. a new rare biome)
// never turn a held desert map into a swamp. Only old saves re-derive it.
export function expeditionGrid(exp: { mapSeed: string; mapTier?: number; affixes?: string[]; biomeId?: BiomeId }): Grid {
  return generateGrid(exp.mapSeed, exp.biomeId ?? rollBiome(exp.mapSeed, exp.mapTier ?? 1), exp.mapTier ?? 1, exp.affixes ?? []);
}

export function generateGrid(mapSeed: string, biomeId: BiomeId, mapTier = 1, affixes: string[] = []): Grid {
  const key = `${mapSeed.length}:${mapSeed}:${biomeId}:${mapTier}:${[...affixes].sort().join(",")}`;
  const hit = gridCache.get(key);
  if (hit) return hit;
  const grid = buildGrid(mapSeed, biomeId, mapTier, affixes);
  if (gridCache.size >= GRID_CACHE_CAP) gridCache.clear();
  gridCache.set(key, grid);
  return grid;
}

function buildGrid(mapSeed: string, biomeId: BiomeId, mapTier: number, affixes: string[]): Grid {
  const biome = affixProfile(tierProfile(BIOMES[biomeId], biomeId, mapTier), affixes);
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
      let t: Terrain = barrier > BARRIER_THRESHOLD
        ? biome.barrierTerrain
        : weightedPick(biome.terrainWeights, TERRAINS, noise);
      // Standing water (si7.6.5): its own namespaced field, so it never shifts the
      // terrain/barrier samples above — a biome without `water` is byte-identical.
      // The body floods everything; the shallows ring spares mountains (a shore wall
      // stays a wall).
      if (biome.water) {
        const w = perlin2(`${mapSeed}:water`, (x + 0.5) * WATER_NOISE_FREQUENCY, (y + 0.5) * WATER_NOISE_FREQUENCY);
        if (w > biome.water.lakeThreshold) t = biome.water.body;
        else if (w > biome.water.lakeThreshold - biome.water.shallowsBand && t !== "mountain") t = "shallows";
      }
      row.push(t);
    }
    terrain.push(row);
  }
  carveConnectivity(terrain, biome);
  // Entry (D84): embark lands at the CENTRE of the square (was the b91 south-edge
  // search). carveConnectivity guarantees ONE walkable component, so every walkable
  // tile reaches all others — pick the walkable tile NEAREST the geometric centre
  // (Chebyshev), preferring the exact centre. From here the run's opening move is a
  // 360° "which direction do I spend my energy?" choice instead of "how far north".
  // Deterministic: ties break to the lowest (y, x) in scan order. Removing the old
  // rand("entry") call can't shift other RNG — rand is a stateless namespaced hash.
  const cx = Math.floor(MAP_WIDTH / 2), cy = Math.floor(MAP_HEIGHT / 2);
  let entry: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) {
    if (!walkableTerrain(terrain[y]![x]!)) continue;
    const d = Math.max(Math.abs(x - cx), Math.abs(y - cy));
    if (d < bestD) { bestD = d; entry = { x, y }; }
  }
  // Fallback (astronomically unlikely — carve guarantees a walkable component):
  // no walkable tile at all → carve the centre to native terrain and re-unify.
  if (!entry) {
    entry = { x: cx, y: cy };
    terrain[cy]![cx] = carveTerrainOf(biome);
    carveConnectivity(terrain, biome);
  }
  // Phase 3 (b91): place POIs in two steps — positions, then specs — paired by
  // index (step c; value-agnostic since D57r/D73).
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
    // no POI is ever stranded on impassable terrain (mountain-top content can
    // return deliberately with a future cartography/climbing pass). The attempt
    // budget (POI_PLACEMENT_ATTEMPTS) comfortably exceeds the walkable-tile count,
    // so this cannot starve the POI_DENSITY budget.
    if (!walkableTerrain(terrain[y]![x]!)) continue;
    const clear = positions.every(
      (p) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) >= POI_MIN_SPACING,
    );
    if (!clear) continue;
    positions.push({ x, y });
  }
  // (b) Roll a SPEC (kind/creature/material) per accepted position, indexed by
  //     acceptance order — rolled independently of the position's terrain/reach.
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
  // (c) 57r/D73: POI placement is value-AGNOSTIC — each spec keeps the position it
  //     was accepted on (uniform rejection-sampled tiles), independent of its value
  //     or distance from entry. Specs are rolled per index (step b) with no spatial
  //     bias, so spec[i] → position[i] scatters monsters, rich nodes, and forage
  //     evenly across the reach gradient. The old value-vs-reach pairing (monsters→
  //     far, forage→core) is retired: value variation now rides the MAP TIER
  //     (POI_DENSITY_BY_TIER + NODE_MAGNITUDE_WEIGHTS), never tile position.
  //     Food-reachability is deliberately NOT guarded by placement anymore — forage
  //     SUFFICIENCY is a density concern (biome nodeTypeWeights), accepted to "run
  //     dry rarely at scale" rather than "never" (user call, 2026-07-13). Every POI
  //     still sits on a walkable, connectivity-carved tile, so all remain reachable.
  const pois: Poi[] = positions.map((p, i) => {
    const s = specs[i]!;
    return { x: p.x, y: p.y, kind: s.kind, material: s.material, creature: s.creature,
             ...(s.magnitude && s.magnitude > 1 ? { magnitude: s.magnitude } : {}) };
  });
  // Fishing (si7.6.2): pre-roll each water tile's catch from the biome's fishTable, on
  // its own namespaced rand stream so nothing above shifts.
  const depth = waterDepth(terrain);
  const catches = terrain.map((row, y) => row.map((t, x) => {
    const water = fishWaterOf(t, depth[y]![x]!);
    return water ? rollMaterial(biome.fishTable?.[water], rand(mapSeed, "fish", x, y)) : null;
  }));
  return { biomeId, terrain, pois, entry, depth, catches };
}
