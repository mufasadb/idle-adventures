// Full-loop map-tier CLIMB harness (zpm.4, map-economy spec §④). The ORACLE that
// the loop actually closes: fresh game → run the T1 LOCAL map, kill a humanoid to
// earn a banked T2 map → embark the earned T2, kill a humanoid to earn a T3 →
// confirm the tier RISES and each step is REACHABLE through the REAL reducer
// surface (embark / move / fight / return / bank), not fightAt in isolation.
//
// Companion measurement (T1-vs-higher payoff) lives in map-tier-payoff.test.ts.
import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { localMap } from "../src/engine/town";
import { generateGrid, rollBiome, expeditionGrid } from "../src/engine/grid";
import type { Poi } from "../src/engine/grid";
import { rand } from "../src/engine/rng";
import { costToReach } from "../src/engine/reach";
import { MAP_WIDTH, MAP_HEIGHT } from "../src/data/constants";
import { emptyLoadout } from "../src/engine/loadout";
import {
  MAP_DROP_CHANCE, MAP_SCROLL_ID, MAX_ENERGY,
} from "../src/data/constants";
import type { GameState, GameEvent } from "../src/engine/types";

// Combat is not atomic (si7.1): first `fight` engages, each subsequent one runs an
// exchange. Loop to the terminal outcome, collecting every event.
function fightToEnd(state: GameState): { state: GameState; events: GameEvent[] } {
  let s = reduce(state, { type: "fight" });
  const all = [...s.events];
  let guard = 0;
  while (s.state.expedition?.combat && ++guard < 100) {
    s = reduce(s.state, { type: "fight" });
    all.push(...s.events);
  }
  return { state: s.state, events: all };
}

// A humanoid POI on the given (seed, tier) grid whose guaranteed-drop roll passes,
// that is REACHABLE on foot from the entry with a real energy budget. Returns the
// tile (its creature is a tier-1 humanoid the sword build beats every time).
function reachableHumanoid(
  gameSeed: string,
  mapSeed: string,
  tier: number,
): { poi: Poi; costToReach: number } | undefined {
  const biome = rollBiome(mapSeed);
  const grid = generateGrid(mapSeed, biome, tier);
  const reach = costToReach(grid.terrain, grid.entry);
  const humanoids = grid.pois.filter(
    (p) => p.kind === "monster" && (p.creature === "sand-raider" || p.creature === "forest-bandit"),
  );
  for (const poi of humanoids) {
    // Loot roll is keyed by the GAME seed (rollLoot uses state.seed), so the
    // guaranteed-drop check must use the same namespace the reducer will.
    const roll = rand(gameSeed, "loot", poi.creature!, poi.x, poi.y, MAP_SCROLL_ID);
    if (roll >= MAP_DROP_CHANCE) continue; // no guaranteed drop from this one
    const c = reach[poi.y]?.[poi.x];
    if (c === undefined || !Number.isFinite(c) || c > MAX_ENERGY) continue; // must be walkable on foot within budget
    return { poi, costToReach: c };
  }
  return undefined;
}

// Scan run-counts for a LOCAL (seed, runs) map whose T1 grid has a reachable,
// guaranteed-drop humanoid — the seed of the climb from a fresh start. Mirrors the
// seed-search idiom in reduce-map-drop.test.ts / reach-fraction.test.ts.
function localSeedWithHumanoid(seed: string): { runs: number; local: ReturnType<typeof localMap>; hit: { poi: Poi; costToReach: number } } {
  for (let runs = 0; runs < 400; runs++) {
    const local = localMap(seed, runs);
    const hit = reachableHumanoid(seed, local.mapSeed, 1);
    if (hit) return { runs, local, hit };
  }
  throw new Error(`no local map with a reachable humanoid in scan range for seed ${seed}`);
}

// Greedy stepwise pathing: `move` plans a DIRECT Bresenham line (line.ts) and
// rejects if any tile on it is impassable, so a far target across a barrier can't
// be reached in one move. Route around walls by stepping to the 8-neighbour that
// most reduces the (on-foot) cost-to-TARGET field — each single-tile hop is always
// a valid direct line. Deterministic (fixed neighbour scan order + cost tiebreak).
function stepToward(cost: number[][], from: { x: number; y: number }): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestCost = cost[from.y]?.[from.x] ?? Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = from.x + dx, ny = from.y + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_WIDTH || ny >= MAP_HEIGHT) continue;
      const c = cost[ny]?.[nx] ?? Infinity;
      if (c < bestCost) { bestCost = c; best = { x: nx, y: ny }; }
    }
  }
  return best;
}

// Drive the real reducer: embark → walk to a reachable humanoid → fight it out →
// (return) → assert a map minted at the expected tier. Uses a hand-built town
// state so the sword build always wins the tier-1 humanoid (the drop's the point,
// not the fight). Returns the earned map's tier and the post-return state.
function runAndEarnMap(
  town: GameState,
  mapSeed: string,
  sourceTier: number,
): { earnedTier: number; home: GameState; minted: string } {
  const embarked = reduce(town, { type: "embark", mapSeed });
  expect(embarked.state.phase).toBe("expedition");
  expect(embarked.state.expedition!.mapTier ?? 1).toBe(sourceTier);
  // Designate rations to auto-eat waste-free so the walk out never runs dry (mco).
  let state = reduce(embarked.state, { type: "set-auto-eat-food", defId: "ration" }).state;

  const hit = reachableHumanoid(town.seed, mapSeed, sourceTier);
  expect(hit).toBeDefined();
  const target = hit!.poi;
  const minted = `${mapSeed}:drop:${target.x},${target.y}`;
  const grid = expeditionGrid({ mapSeed, mapTier: sourceTier });
  const toTarget = costToReach(grid.terrain, target); // cost from every tile TO target (computed once, reused per step)

  // Walk toward the humanoid one reachable tile at a time (stepToward routes around
  // barriers). A walk-in can engage — including the TARGET humanoid itself as the
  // route steps onto its tile — so accumulate EVERY event across the whole run: the
  // map-dropped may fire mid-walk. Fight any engagement to resolution before moving.
  const allEvents: GameEvent[] = [];
  const gotMap = () => allEvents.some((e) => e.type === "map-dropped" && (e as { mapSeed: string }).mapSeed === minted);
  const pushFight = (s: GameState): GameState => {
    const r = fightToEnd(s);
    allEvents.push(...r.events);
    return r.state;
  };
  if (state.expedition!.combat) state = pushFight(state);
  let guard = 0;
  while (
    state.expedition &&
    !(state.expedition.pos.x === target.x && state.expedition.pos.y === target.y) &&
    !gotMap() &&
    ++guard < 400
  ) {
    if (state.expedition.combat) { state = pushFight(state); continue; }
    const before = state.expedition.pos;
    const next = stepToward(toTarget, before);
    if (!next) break; // no route (shouldn't happen — POIs are on the connected component)
    const r = reduce(state, { type: "move", to: next });
    allEvents.push(...r.events);
    if (r.events.some((e) => e.type === "action-rejected")) break; // exhausted / blocked
    state = r.state;
    if (state.expedition?.combat) state = pushFight(state);
    if (state.expedition && state.expedition.pos.x === before.x && state.expedition.pos.y === before.y && !state.expedition.combat) break; // wedged
  }
  expect(state.expedition).not.toBeNull();

  // If we're standing on the humanoid and haven't yet dropped its map, fight it.
  if (
    state.expedition &&
    state.expedition.pos.x === target.x && state.expedition.pos.y === target.y &&
    !allEvents.some((e) => e.type === "map-dropped" && (e as { mapSeed: string }).mapSeed === minted)
  ) {
    state = pushFight(state);
  }

  const drop = allEvents.find(
    (e) => e.type === "map-dropped" && (e as { mapSeed: string }).mapSeed === minted,
  ) as { tier: number; carried: boolean } | undefined;
  expect(drop).toBeDefined();
  expect(drop!.carried).toBe(true); // map-pocket had room (base cap 1, empty at run start)
  const earnedTier = drop!.tier;

  // Return home; the carried map banks into state.maps at run-end.
  const home = reduce(state, { type: "return" }).state;
  expect(home.phase).toBe("town");
  expect((home.maps ?? []).some((m) => m.mapSeed === minted && (m.tier ?? 1) === earnedTier)).toBe(true);
  return { earnedTier, home, minted };
}

// A stocked-but-simple town at a given rotation (runs): sword equipped so every
// tier-1 humanoid dies, a backpack + horse + rations so the walk out never runs
// dry. The loadout is packed from the bank via real `pack` actions (embark debits
// the bank at commit — D28), so it settles affordably. Bank carries nothing map-
// related, so the map-pocket base cap (1) is the only gate on carrying a drop.
function climbTown(seed: string, runs: number, maps: GameState["maps"] = []): GameState {
  let state: GameState = {
    seed,
    phase: "town",
    bank: [
      { defId: "sword", qty: 1 },
      { defId: "leather", qty: 1 },
      { defId: "horse", qty: 1 },
      { defId: "ration", qty: 8 },
    ],
    loadout: emptyLoadout(),
    expedition: null,
    runs,
    maps,
  };
  const packs = [
    { type: "pack", slot: "weapon", itemId: "sword" },
    { type: "pack", slot: "backpack", itemId: "leather" },
    { type: "pack", slot: "transport", itemId: "horse" },
    ...Array.from({ length: 8 }, () => ({ type: "pack", slot: "food", itemId: "ration" })),
  ] as const;
  for (const p of packs) {
    const r = reduce(state, p as Parameters<typeof reduce>[1]);
    expect(r.events.some((e) => e.type === "action-rejected")).toBe(false);
    state = r.state;
  }
  return state;
}

test("climb harness: fresh game → local T1 earns T2 → embark T2 earns T3 (tiers rise, reachable)", () => {
  const seed = "climb";
  const { runs: localRuns, local } = localSeedWithHumanoid(seed);

  // A stocked town at the rotation whose LOCAL map has a reachable humanoid. Its
  // offered local map is T1 (spec §④ guarantee) — assert before running it.
  const town = climbTown(seed, localRuns);
  const embarkedLocal = reduce(town, { type: "embark", mapSeed: local.mapSeed });
  expect(embarkedLocal.state.expedition!.mapTier ?? 1).toBe(1);

  // Step 1: run the T1 LOCAL map → earn a T2 map, banked home. Local is NOT consumed,
  // so state.maps holds exactly the one drop.
  const step1 = runAndEarnMap(town, local.mapSeed, 1);
  expect(step1.earnedTier).toBe(2);
  expect((step1.home.maps ?? []).length).toBe(1);

  // Step 2: embark an EARNED T2 map. Its T2 grid must have a reachable, guaranteed-
  // drop humanoid too. Whether one specific minted seed has that is a generation
  // fact (not a loop failure), so keep earning T2 maps off the rotating local map
  // until we hold one whose T2 grid qualifies — a deterministic, bounded scan that
  // exercises the climb's second leg for real rather than flaking on a drop seed.
  let heldMaps = step1.home.maps ?? [];
  let curRuns = step1.home.runs ?? localRuns;
  let t2MapSeed = reachableHumanoid(seed, step1.minted, 2) ? step1.minted : undefined;
  let scan = 0;
  while (t2MapSeed === undefined && scan < 80) {
    curRuns += 1;
    const nl = localMap(seed, curRuns);
    if (reachableHumanoid(seed, nl.mapSeed, 1)) {
      const legTown = climbTown(seed, curRuns, heldMaps);
      const earned = runAndEarnMap(legTown, nl.mapSeed, 1);
      heldMaps = earned.home.maps ?? [];
      curRuns = earned.home.runs ?? curRuns;
      if (reachableHumanoid(seed, earned.minted, 2)) t2MapSeed = earned.minted;
    }
    scan++;
  }
  expect(t2MapSeed).toBeDefined();
  const t2Map = heldMaps.find((m) => m.mapSeed === t2MapSeed)!;
  expect(t2Map.tier).toBe(2);

  // Confirm the T2 grid actually generated at tier 2 (difficulty axis is live).
  const t2Grid = expeditionGrid({ mapSeed: t2MapSeed!, mapTier: 2 });
  expect(t2Grid.pois.length).toBeGreaterThan(0);

  // Embark the earned T2 (spent from state.maps at commit) → earn a T3.
  const t2Town = climbTown(seed, curRuns, heldMaps);
  const step2 = runAndEarnMap(t2Town, t2MapSeed!, 2);
  expect(step2.earnedTier).toBe(3); // TIER ROSE: a T2 source minted a T3

  // The climb is closed: from a fresh game we reached a banked T3 via real runs.
  expect((step2.home.maps ?? []).some((m) => (m.tier ?? 1) === 3)).toBe(true);
}, 20000); // full-loop harness: seed scans + per-step Dijkstra pathing over 20×60 — bump the 5s default
