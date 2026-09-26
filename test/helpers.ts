// Shared test fixtures (2i0). The suite had ~8 hand-copied "scan seeds until a POI
// matches" loops that drifted in tries-count and error text. scanForPoi consolidates
// them. Each caller keeps its OWN seed prefix — the specific seed a test lands on (and
// thus the exact monster/node it fights or gathers) is load-bearing for that test's
// assertions, so prefixes must never change.
import { generateGrid, rollBiome } from "../src/engine/grid";
import type { Poi, Grid } from "../src/engine/grid";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import type { Action, GameEvent, GameState, ItemStack } from "../src/engine/types";
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

// ---------------------------------------------------------------------------
// Hand-built state fixtures + small drivers, previously copy-pasted across test
// files. Anything whose seed/prefix differed per file takes it as a parameter —
// those values are load-bearing, never unify them.
// ---------------------------------------------------------------------------

// A bare town state. `seed` defaults to "c" (the most common copy); files that
// used another seed pass it explicitly. `runs`/`stations` keys are only present
// when given (the copies differed on whether those keys exist at all).
export function town(
  bank: ItemStack[],
  stations?: GameState["stations"],
  opts: { seed?: string; tools?: string[]; runs?: number } = {},
): GameState {
  const loadout = emptyLoadout();
  if (opts.tools) loadout.equipment.tools = opts.tools;
  return {
    seed: opts.seed ?? "c",
    phase: "town",
    bank,
    loadout,
    expedition: null,
    ...(opts.runs !== undefined ? { runs: opts.runs } : {}),
    ...(stations ? { stations } : {}),
  };
}

// Standing on `poi` of map `seed` mid-expedition, ready to gather. Defaults
// (energy 100, hp 0) are reduce-gather's original ones; override per call.
export function standingOn(
  seed: string,
  poi: Poi,
  opts: { tools?: string[]; energy?: number; food?: ItemStack[]; hp?: number } = {},
): GameState {
  const loadout = emptyLoadout();
  loadout.equipment.tools = opts.tools ?? [];
  loadout.food = opts.food ?? [];
  return {
    seed: "g",
    phase: "expedition",
    bank: [],
    loadout: emptyLoadout(),
    expedition: {
      mapSeed: seed,
      pos: { x: poi.x, y: poi.y },
      energy: opts.energy ?? 100,
      hp: opts.hp ?? 0,
      loadout,
      carry: [],
      cleared: [],
    },
  };
}

// Walk `${prefix}-0`, `-1`, … (at `mapTier`) until a monster POI — of `creature`,
// or any monster when omitted — appears. Each caller keeps its own prefix.
export function mapWithMonster(
  prefix: string,
  creature?: string,
  opts: { mapTier?: number; tries?: number } = {},
): { seed: string; grid: Grid; poi: Poi } {
  const tries = opts.tries ?? 500;
  for (let i = 0; i < tries; i++) {
    const seed = `${prefix}-${i}`;
    const grid = generateGrid(seed, rollBiome(seed), opts.mapTier ?? 1);
    const poi = grid.pois.find(
      (p) => p.kind === "monster" && (creature === undefined || p.creature === creature),
    );
    if (poi) return { seed, grid, poi };
  }
  throw new Error(`mapWithMonster(${prefix}): no ${creature ?? "monster"} in ${tries} seeds`);
}

// Loop `fight` until the engagement resolves (guarded), collecting every event.
export function fightToEnd(state: GameState): { state: GameState; events: GameEvent[] } {
  let s = reduce(state, { type: "fight" });
  const all = [...s.events];
  let guard = 0;
  while (s.state.expedition?.combat && ++guard < 100) {
    s = reduce(s.state, { type: "fight" });
    all.push(...s.events);
  }
  return { state: s.state, events: all };
}

// True when the reducer accepts `action` (no action-rejected event).
export const accepts = (state: GameState, action: Action): boolean =>
  reduce(state, action).events.every((e) => e.type !== "action-rejected");

// Chebyshev (8-neighbour) distance.
export const cheb = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
