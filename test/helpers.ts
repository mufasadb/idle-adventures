// Shared test fixtures (2i0). The suite had ~8 hand-copied "scan seeds until a POI
// matches" loops that drifted in tries-count and error text. scanForPoi consolidates
// them. Each caller keeps its OWN seed prefix — the specific seed a test lands on (and
// thus the exact monster/node it fights or gathers) is load-bearing for that test's
// assertions, so prefixes must never change.
import { generateGrid, rollBiome } from "../src/engine/grid";
import type { Poi, Grid } from "../src/engine/grid";
import { MONSTERS, MAP_WIDTH, MAP_HEIGHT } from "../src/data/constants";

// Walk `${prefix}-0`, `-1`, … generating each map until a POI matches `match`;
// returns the seed + (memoized) grid + the matched poi. Throws if none in `tries`.
export function scanForPoi(
  prefix: string,
  match: (p: Poi, grid: Grid) => boolean,
  tries = 400,
): { seed: string; grid: Grid; poi: Poi } {
  for (let i = 0; i < tries; i++) {
    const seed = `${prefix}-${i}`;
    const grid = generateGrid(seed, rollBiome(seed));
    const poi = grid.pois.find((p) => match(p, grid));
    if (poi) return { seed, grid, poi };
  }
  throw new Error(`scanForPoi(${prefix}): no match in ${tries} seeds`);
}

export const isTier1Monster = (p: Poi): boolean =>
  p.kind === "monster" && p.creature !== null && MONSTERS[p.creature]?.tier === 1;

// Not on the map edge — some tests need a monster with walkable tiles all around it.
export const isInterior = (p: Poi): boolean =>
  p.x > 0 && p.x < MAP_WIDTH - 1 && p.y > 0 && p.y < MAP_HEIGHT - 1;
