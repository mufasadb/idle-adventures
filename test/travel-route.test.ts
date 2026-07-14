import { test, expect } from "bun:test";
import { route } from "../src/sim/play";
import { routeTo } from "../src/sim/route";
import { lineTiles } from "../src/engine/line";
import { gatherCost } from "../src/engine/tools";
import { moveCost } from "../src/engine/move";
import { generateGrid, rollBiome } from "../src/engine/grid";
import type { Grid } from "../src/engine/grid";
import { costToReach } from "../src/engine/reach";
import { emptyLoadout } from "../src/engine/loadout";
import { MAP_WIDTH, MAP_HEIGHT } from "../src/data/constants";
import type { GameState } from "../src/engine/types";

// eot: routing is the PLAYER's job. The `route {waypoints}` directive draws a
// straight (lineTiles) leg per waypoint — no auto-routing around walls — executing
// each tile through reduce, auto-gathering nodes it crosses (gated by autoGather).
// routeTo/Dijkstra stays PARKED for the balance-reference player (harvest.ts), no
// longer the agent-facing directive.

const walkable = (grid: Grid, x: number, y: number) =>
  x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT && Number.isFinite(moveCost(grid.terrain[y]![x]!, null, []));
const isMonster = (grid: Grid, x: number, y: number) =>
  grid.pois.some((p) => p.x === x && p.y === y && p.kind === "monster" && p.creature !== null);

// A straight ray from `from` in direction (dx,dy): the run of clear, POI-free,
// non-monster tiles, and the first blocked tile beyond (if any). Used to build
// deterministic straight-line geometry on real generated maps.
function ray(grid: Grid, from: { x: number; y: number }, dx: number, dy: number) {
  const clear: { x: number; y: number }[] = [];
  let x = from.x + dx, y = from.y + dy;
  while (walkable(grid, x, y) && !isMonster(grid, x, y) && !grid.pois.some((p) => p.x === x && p.y === y)) {
    clear.push({ x, y });
    x += dx; y += dy;
  }
  const blockedBeyond = x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT && !walkable(grid, x, y) ? { x, y } : null;
  return { clear, blockedBeyond };
}

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

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

test("route: a single straight leg walks a clear line to the waypoint", () => {
  for (let i = 0; i < 30; i++) {
    const mapSeed = `trv:map:0:${i}`;
    const grid = generateGrid(mapSeed, rollBiome(mapSeed), 1);
    for (const [dx, dy] of DIRS) {
      const { clear } = ray(grid, grid.entry, dx, dy);
      if (clear.length < 3) continue;
      const target = clear[clear.length - 1]!;
      const s = expeditionAt(mapSeed, grid.entry);
      const r = route(s, [target]);
      expect(r.state.expedition!.pos).toEqual(target); // arrived along the straight line
      expect(r.events.filter((e) => e.type === "moved").length).toBe(clear.length);
      return;
    }
  }
  throw new Error("no clear straight ray found (test setup)");
});

test("route: a straight leg STOPS at a wall on the line (no auto-routing around it)", () => {
  for (let i = 0; i < 40; i++) {
    const mapSeed = `trv:map:0:${i}`;
    const grid = generateGrid(mapSeed, rollBiome(mapSeed), 1);
    for (const [dx, dy] of DIRS) {
      const { clear, blockedBeyond } = ray(grid, grid.entry, dx, dy);
      if (!blockedBeyond || clear.length < 1) continue;
      const s = expeditionAt(mapSeed, grid.entry);
      const r = route(s, [blockedBeyond]); // aim THROUGH the wall
      expect(r.state.expedition!.pos).toEqual(clear[clear.length - 1]); // stopped at the last clear tile
      expect(r.events.some((e) => e.type === "action-rejected" && e.reason === "impassable")).toBe(true);
      return;
    }
  }
  throw new Error("no wall-terminated ray found (test setup)");
});

test("route: multiple waypoints execute their legs in order", () => {
  for (let i = 0; i < 30; i++) {
    const mapSeed = `trv:map:0:${i}`;
    const grid = generateGrid(mapSeed, rollBiome(mapSeed), 1);
    // leg 1 along one ray, then leg 2 along a ray from that midpoint
    for (const [dx, dy] of DIRS) {
      const legA = ray(grid, grid.entry, dx, dy);
      if (legA.clear.length < 2) continue;
      const mid = legA.clear[1]!; // a couple tiles out
      for (const [ex, ey] of DIRS) {
        if (ex === dx && ey === dy) continue;
        const legB = ray(grid, mid, ex, ey);
        if (legB.clear.length < 2) continue;
        const end = legB.clear[1]!;
        const s = expeditionAt(mapSeed, grid.entry);
        const r = route(s, [mid, end]);
        expect(r.state.expedition!.pos).toEqual(end); // walked both legs
        return;
      }
    }
  }
  throw new Error("no two-leg geometry found (test setup)");
});

test("route: auto-gathers a node it crosses when autoGather is on, skips it when off", () => {
  const tools = ["pick", "axe", "knife"];
  for (let i = 0; i < 120; i++) {
    const mapSeed = `trv:map:0:${i}`;
    const grid = generateGrid(mapSeed, rollBiome(mapSeed), 1);
    // a node whose straight line from entry is clear AND workable with basic tools
    const node = grid.pois.find((p) => {
      if (p.kind === "monster" || p.material === null) return false;
      if (gatherCost(p, tools) === null) return false; // tier-1, tool present
      const line = lineTiles(grid.entry, p);
      return line.slice(0, -1).every((t) => walkable(grid, t.x, t.y) && !isMonster(grid, t.x, t.y));
    });
    if (!node) continue;
    const cleared = (s: GameState) => s.expedition!.cleared.some((c) => c.x === node.x && c.y === node.y);

    const on = route(expeditionAt(mapSeed, grid.entry, tools), [{ x: node.x, y: node.y }]);
    expect(cleared(on.state)).toBe(true); // auto-gathered on the way (default ON)

    const offStart = { ...expeditionAt(mapSeed, grid.entry, tools) };
    offStart.expedition = { ...offStart.expedition!, autoGather: false };
    const off = route(offStart, [{ x: node.x, y: node.y }]);
    expect(cleared(off.state)).toBe(false); // walked over it untouched
    expect(off.state.expedition!.pos).toEqual({ x: node.x, y: node.y }); // but did arrive
    return;
  }
  throw new Error("no straight-line-clear workable node found (test setup)");
});
