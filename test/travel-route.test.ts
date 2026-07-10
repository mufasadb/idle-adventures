import { test, expect } from "bun:test";
import { travel } from "../src/sim/play";
import { routeTo } from "../src/sim/route";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { costToReach } from "../src/engine/reach";
import { emptyLoadout } from "../src/engine/loadout";
import { MAP_WIDTH, MAP_HEIGHT } from "../src/data/constants";
import type { GameState } from "../src/engine/types";

// h61: headless agents hand-route around walls (55 rejected moves). A sim-layer
// `travel` directive routes to a tile via Dijkstra so a console agent reaches far
// nodes / combat in one directive. Engine stays pure single-step.

function expeditionAt(mapSeed: string, pos: { x: number; y: number }, tools: string[] = ["pick", "knife"]): GameState {
  const loadout = emptyLoadout();
  loadout.equipment.tools = tools;
  loadout.equipment.weapon = "sword";
  return {
    seed: "trv", phase: "expedition", bank: [], loadout: emptyLoadout(),
    expedition: { mapSeed, pos, energy: 100000, hp: 30, loadout, carry: [], cleared: [] },
  };
}

// pick a real map + a far, reachable, non-POI tile
function farReachableTile(mapSeed: string): { x: number; y: number } {
  const biomeId = rollBiome(mapSeed);
  const grid = generateGrid(mapSeed, biomeId, 1);
  const cost = costToReach(grid.terrain, grid.entry);
  const poi = new Set(grid.pois.map((p) => `${p.x},${p.y}`));
  let best = grid.entry, bestCost = -1;
  for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) {
    const c = cost[y]![x]!;
    if (Number.isFinite(c) && c > bestCost && !poi.has(`${x},${y}`)) { bestCost = c; best = { x, y }; }
  }
  return best;
}

test("routeTo: returns an adjacent-step path to a reachable tile, null when unreachable", () => {
  const mapSeed = "trv:map:0:1";
  const biomeId = rollBiome(mapSeed);
  const grid = generateGrid(mapSeed, biomeId, 1);
  const target = farReachableTile(mapSeed);
  const path = routeTo(grid.terrain, grid.entry, target, null, [], new Set());
  expect(path).not.toBeNull();
  expect(path![path!.length - 1]).toEqual(target); // ends at the target
  // every step is to an adjacent tile (king-move)
  let prev = grid.entry;
  for (const wp of path!) {
    expect(Math.max(Math.abs(wp.x - prev.x), Math.abs(wp.y - prev.y))).toBe(1);
    prev = wp;
  }
});

test("travel: walks the whole route to a far tile in one directive", () => {
  const mapSeed = "trv:map:0:1";
  const target = farReachableTile(mapSeed);
  const s = expeditionAt(mapSeed, generateGrid(mapSeed, rollBiome(mapSeed), 1).entry);
  const r = travel(s, target);
  expect(r.state.expedition!.pos).toEqual(target); // arrived
  expect(r.events.filter((e) => e.type === "moved").length).toBeGreaterThan(1); // actually walked
});

test("travel: stops when it walks into a monster (reaches combat)", () => {
  // find a map with a monster reachable on foot, route to it, expect engagement
  for (let i = 0; i < 30; i++) {
    const mapSeed = `trv:map:0:${i}`;
    const biomeId = rollBiome(mapSeed);
    const grid = generateGrid(mapSeed, biomeId, 1);
    const cost = costToReach(grid.terrain, grid.entry);
    const mon = grid.pois.find((p) => p.kind === "monster" && p.creature && Number.isFinite(cost[p.y]![p.x]!));
    if (!mon) continue;
    const s = expeditionAt(mapSeed, grid.entry);
    const r = travel(s, { x: mon.x, y: mon.y });
    expect(r.state.expedition!.combat).toBeDefined(); // walked in and engaged
    return;
  }
  throw new Error("no reachable monster found in 30 maps (test setup)");
});
