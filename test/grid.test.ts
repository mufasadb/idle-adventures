import { test, expect } from "bun:test";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { MAP_WIDTH, MAP_HEIGHT, BIOME_IDS, TERRAINS, POI_DENSITY, POI_MIN_SPACING, NODE_TYPES, BIOMES, FOOD_REACH_MIN } from "../src/data/constants";
import type { Terrain } from "../src/data/constants";
import { costToReach } from "../src/engine/reach";

const chebyshev = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

function terrainCounts(seed: string, biome: "woodland" | "desert" | "tundra") {
  const grid = generateGrid(seed, biome);
  const counts = Object.fromEntries(TERRAINS.map((t) => [t, 0])) as Record<Terrain, number>;
  for (const row of grid.terrain) for (const t of row) counts[t]++;
  return counts;
}

test("generateGrid: 20×60, row-major, fully terrained", () => {
  const grid = generateGrid("map-1", "woodland");
  expect(grid.terrain.length).toBe(MAP_HEIGHT);
  for (const row of grid.terrain) {
    expect(row.length).toBe(MAP_WIDTH);
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
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 1; x < MAP_WIDTH; x++) {
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

test("generateGrid: places POI_DENSITY POIs, in bounds, with valid kinds", () => {
  for (const seed of ["poi-a", "poi-b", "poi-c"]) {
    const grid = generateGrid(seed, "woodland");
    expect(grid.pois.length).toBe(POI_DENSITY);
    for (const poi of grid.pois) {
      expect(poi.x).toBeGreaterThanOrEqual(0);
      expect(poi.x).toBeLessThan(MAP_WIDTH);
      expect(poi.y).toBeGreaterThanOrEqual(0);
      expect(poi.y).toBeLessThan(MAP_HEIGHT);
      expect(NODE_TYPES).toContain(poi.kind);
    }
  }
});

test("generateGrid: POIs respect min spacing (pairwise Chebyshev)", () => {
  for (const seed of ["poi-a", "poi-b", "poi-c"]) {
    const { pois } = generateGrid(seed, "desert");
    for (let i = 0; i < pois.length; i++) {
      for (let j = i + 1; j < pois.length; j++) {
        expect(chebyshev(pois[i]!, pois[j]!)).toBeGreaterThanOrEqual(POI_MIN_SPACING);
      }
    }
  }
});

test("generateGrid: biome nodeTypeWeights shape the POI kind mix", () => {
  // Aggregate across seeds: desert (mining 0.4) must out-mine woodland (0.05).
  const count = (biome: "woodland" | "desert", kind: string) => {
    let n = 0;
    for (let i = 0; i < 10; i++) {
      for (const poi of generateGrid(`kind-mix-${i}`, biome).pois) {
        if (poi.kind === kind) n++;
      }
    }
    return n;
  };
  expect(count("desert", "mining")).toBeGreaterThan(count("woodland", "mining"));
  expect(count("woodland", "wood")).toBeGreaterThan(count("desert", "wood"));
});

test("generateGrid: never places a POI on the entry tile", () => {
  for (let i = 0; i < 25; i++) {
    const seed = `entry-clash-${i}`;
    const grid = generateGrid(seed, rollBiome(seed));
    for (const poi of grid.pois) {
      expect(`${poi.x},${poi.y}`).not.toBe(`${grid.entry.x},${grid.entry.y}`);
    }
  }
});

test("generateGrid: desert maps contain terrain variety, not monoterrain (M1 review follow-up)", () => {
  // Aggregate across seeds: desert must generate at least SOME non-plains
  // terrain so terrain-cost routing has something to bite on.
  let mountain = 0;
  let river = 0;
  for (let i = 0; i < 10; i++) {
    for (const row of generateGrid(`desert-variety-${i}`, "desert").terrain) {
      for (const t of row) {
        if (t === "mountain") mountain++;
        if (t === "river") river++;
      }
    }
  }
  expect(mountain).toBeGreaterThan(0);
  expect(river).toBeGreaterThan(0);
});

test("generateGrid: POIs carry a material rolled from the biome's weighted table (D25/D27)", () => {
  for (const biome of BIOME_IDS) {
    const grid = generateGrid(`material-stamp-${biome}`, biome);
    for (const poi of grid.pois) {
      if (poi.kind === "monster") {
        expect(poi.material).toBeNull();
      } else {
        expect(Object.keys(BIOMES[biome].materialTable[poi.kind]!)).toContain(poi.material!);
      }
    }
  }
});

test("generateGrid: monster POIs carry a creature from the biome's table (M4)", () => {
  for (const biome of BIOME_IDS) {
    const grid = generateGrid(`creature-stamp-${biome}`, biome);
    for (const poi of grid.pois) {
      if (poi.kind === "monster") {
        expect(Object.keys(BIOMES[biome].creatureTable)).toContain(poi.creature!);
      } else {
        expect(poi.creature).toBeNull();
      }
    }
  }
});

test("generateGrid: creature stamping is deterministic", () => {
  expect(generateGrid("creature-det", "desert")).toEqual(generateGrid("creature-det", "desert"));
});

test("generateGrid: POI materials are deterministic and drawn from the biome table (D27)", () => {
  const seed = "d27-seed";
  const biomeId = rollBiome(seed);
  const g1 = generateGrid(seed, biomeId);
  const g2 = generateGrid(seed, biomeId);
  expect(g1.pois).toEqual(g2.pois); // byte-identical
  for (const poi of g1.pois) {
    if (poi.kind === "monster") continue;
    const table = BIOMES[biomeId].materialTable[poi.kind]!;
    expect(Object.keys(table)).toContain(poi.material!);
  }
});

// --- Phase 3 (b91): barrier topology + reachability guard ---

test("generateGrid: barrier bias is deterministic — same seed yields identical POIs", () => {
  const a = generateGrid("topo-seed-1", rollBiome("topo-seed-1"));
  const b = generateGrid("topo-seed-1", rollBiome("topo-seed-1"));
  expect(b.pois).toEqual(a.pois);
});

test("generateGrid: reachability guard — every seed keeps >= FOOD_REACH_MIN forageable food on finite-reach tiles", () => {
  for (let i = 0; i < 120; i++) {
    const seed = `guard-${i}`;
    const g = generateGrid(seed, rollBiome(seed));
    const reach = costToReach(g.terrain, g.entry);
    const reachableFood = g.pois.filter(
      (p) => (p.kind === "herb" || p.kind === "animal") && Number.isFinite(reach[p.y]![p.x]!),
    ).length;
    const totalFood = g.pois.filter((p) => p.kind === "herb" || p.kind === "animal").length;
    // Guard only promises the minimum when the map actually has that much food.
    expect(reachableFood).toBeGreaterThanOrEqual(Math.min(FOOD_REACH_MIN, totalFood));
  }
// 120 seeds × costToReach over the 20×60 grid (e3j, was 20×20) exceeds bun's
// default 5s test timeout on the min-scan Dijkstra; bump it rather than shrink
// the sample size that gives the guard its statistical confidence.
}, 20000);

test("generateGrid: POI kind does NOT correlate with reach — monsters and food sit at the same average distance (57r/D73)", () => {
  let prizeSum = 0, prizeN = 0, foodSum = 0, foodN = 0;
  for (let i = 0; i < 120; i++) {
    const seed = `trend-${i}`;
    const g = generateGrid(seed, rollBiome(seed));
    const reach = costToReach(g.terrain, g.entry);
    for (const p of g.pois) {
      const c = reach[p.y]![p.x]!;
      const r = Number.isFinite(c) ? c : 1000; // treat walled-off as very far
      if (p.kind === "monster") { prizeSum += r; prizeN++; }
      else if (p.kind === "herb" || p.kind === "animal") { foodSum += r; foodN++; }
    }
  }
  // D73: placement is value-AGNOSTIC — kind is uncorrelated with position, so
  // across seeds monster and food average reach converge (measured ~1% apart).
  // The old pairing pinned monsters strictly farther; that segregation is retired.
  const avgPrize = prizeSum / prizeN, avgFood = foodSum / foodN;
  expect(Math.abs(avgPrize - avgFood) / avgFood).toBeLessThan(0.1);
}, 20000);
