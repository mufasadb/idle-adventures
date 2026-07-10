import { test, expect } from "bun:test";
import { moveCost, moveCostBreakdown, isDiagonalStep } from "../src/engine/move";
import { costToReach } from "../src/engine/reach";
import { DIAGONAL_MULTIPLIER, TERRAIN_COST, MAP_WIDTH, MAP_HEIGHT } from "../src/data/constants";
import type { Terrain } from "../src/data/constants";

// l2w: a diagonal step covers √2 tiles of distance, so it must cost √2× the
// orthogonal step, rounded DOWN. moveCost stays geometry-blind; callers that know
// the step is diagonal pass the flag.

test("moveCost: orthogonal is unchanged (identity default)", () => {
  expect(moveCost("plains", null, [])).toBe(TERRAIN_COST.plains); // 10
  expect(moveCost("ice", null, [])).toBe(TERRAIN_COST.ice); // 20
});

test("moveCost: diagonal is floor(orthogonal × √2)", () => {
  expect(moveCost("plains", null, [], true)).toBe(Math.floor(TERRAIN_COST.plains * DIAGONAL_MULTIPLIER)); // 14
  expect(moveCost("ice", null, [], true)).toBe(Math.floor(TERRAIN_COST.ice * DIAGONAL_MULTIPLIER)); // 28
  expect(moveCost("mud", null, [], true)).toBe(Math.floor(TERRAIN_COST.mud * DIAGONAL_MULTIPLIER)); // 21
});

test("moveCost: impassable stays impassable on the diagonal", () => {
  expect(moveCost("mountain", null, [], true)).toBe(Infinity);
});

test("moveCostBreakdown: reports the diagonal final", () => {
  const bd = moveCostBreakdown("plains", null, [], true);
  expect(bd.final).toBe(14);
  expect(bd.diagonal).toBe(true);
});

test("isDiagonalStep: both axes must change", () => {
  expect(isDiagonalStep({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(true);
  expect(isDiagonalStep({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(false);
  expect(isDiagonalStep({ x: 0, y: 0 }, { x: 0, y: 1 })).toBe(false);
});

test("costToReach: diagonals cost √2× — pathfinders share the rule", () => {
  // costToReach iterates the full MAP_HEIGHT×MAP_WIDTH, so the grid must be map-sized.
  const terrain: Terrain[][] = Array.from({ length: MAP_HEIGHT }, () => Array<Terrain>(MAP_WIDTH).fill("plains"));
  const cost = costToReach(terrain, { x: 0, y: 0 });
  const diag = Math.floor(TERRAIN_COST.plains * DIAGONAL_MULTIPLIER); // 14
  // (1,1) is one diagonal step from entry; (2,0) is two orthogonal steps
  expect(cost[1]![1]).toBe(diag); // 14, not 10 (the old free-shortcut value)
  expect(cost[0]![2]).toBe(TERRAIN_COST.plains * 2); // 20 (two orthogonal)
  // (2,2) is cheaper via two diagonals (28) than diag+2-ortho — reach honours it
  expect(cost[2]![2]).toBe(diag * 2); // 28
});
