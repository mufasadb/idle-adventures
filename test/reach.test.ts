import { test, expect } from "bun:test";
import { costToReach } from "../src/engine/reach";
import { GRID_SIZE, TERRAIN_COST } from "../src/data/constants";
import type { Terrain } from "../src/data/constants";

// costToReach expects a full GRID_SIZE grid, so build a plains field and drop
// features into it for tiny, readable cases.
function plainsGrid(): Terrain[][] {
  return Array.from({ length: GRID_SIZE }, () => Array<Terrain>(GRID_SIZE).fill("plains"));
}

test("costToReach: entry is 0, neighbors cost one plains step", () => {
  const g = plainsGrid();
  const cost = costToReach(g, { x: 5, y: 5 });
  expect(cost[5]![5]).toBe(0);
  expect(cost[5]![6]).toBe(TERRAIN_COST.plains); // one plains step (8-dir; diagonal same cost here)
});

test("costToReach: a full mountain wall makes the far side Infinity on foot", () => {
  const g = plainsGrid();
  for (let y = 0; y < GRID_SIZE; y++) g[y]![10] = "mountain"; // vertical wall at x=10
  const cost = costToReach(g, { x: 0, y: 0 });
  expect(Number.isFinite(cost[0]![9]!)).toBe(true); // near side reachable
  expect(cost[0]![11]).toBe(Infinity); // far side walled off on foot
});

test("costToReach: climbing-pick opens the wall (far side finite)", () => {
  const g = plainsGrid();
  for (let y = 0; y < GRID_SIZE; y++) g[y]![10] = "mountain";
  const cost = costToReach(g, { x: 0, y: 0 }, null, ["climbing-pick"]);
  expect(Number.isFinite(cost[0]![11]!)).toBe(true);
});
