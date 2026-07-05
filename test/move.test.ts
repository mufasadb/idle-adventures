// test/move.test.ts
import { test, expect } from "bun:test";
import { stepToward, moveCost } from "../src/engine/move";
import { MOVE_BASE_COST, TERRAIN_COST } from "../src/data/constants";

test("stepToward: steps one tile on each axis toward the target (8-dir)", () => {
  expect(stepToward({ x: 5, y: 5 }, { x: 8, y: 8 })).toEqual({ x: 6, y: 6 }); // diagonal
  expect(stepToward({ x: 5, y: 5 }, { x: 5, y: 0 })).toEqual({ x: 5, y: 4 }); // vertical
  expect(stepToward({ x: 5, y: 5 }, { x: 2, y: 5 })).toEqual({ x: 4, y: 5 }); // horizontal
  expect(stepToward({ x: 5, y: 5 }, { x: 6, y: 9 })).toEqual({ x: 6, y: 6 }); // mixed clamps to ±1
});

test("stepToward: already at target means no step", () => {
  expect(stepToward({ x: 3, y: 3 }, { x: 3, y: 3 })).toEqual({ x: 3, y: 3 });
});

test("moveCost: ice costs more than plains (bead acceptance)", () => {
  expect(moveCost("ice", null)).toBeGreaterThan(moveCost("plains", null));
});

test("moveCost: on foot equals base × terrain", () => {
  expect(moveCost("plains", null)).toBe(MOVE_BASE_COST * TERRAIN_COST.plains);
  expect(moveCost("mud", null)).toBe(MOVE_BASE_COST * TERRAIN_COST.mud);
});

test("moveCost: transport divides — horse lowers, mule raises (bead acceptance)", () => {
  expect(moveCost("plains", "horse")).toBeLessThan(moveCost("plains", null));
  expect(moveCost("plains", "mule")).toBeGreaterThan(moveCost("plains", null));
});

test("moveCost: unknown transport defId behaves as on foot", () => {
  expect(moveCost("plains", "rocket-skates")).toBe(moveCost("plains", null));
});

test("moveCost: mountain is impassable regardless of transport", () => {
  expect(moveCost("mountain", null)).toBe(Infinity);
  expect(moveCost("mountain", "horse")).toBe(Infinity);
});

test("moveCost: climbing-pick makes mountain finite (Infinity → gate cost)", () => {
  expect(moveCost("mountain", null)).toBe(Infinity);
  expect(moveCost("mountain", null, ["climbing-pick"])).toBe(4);
});

test("moveCost: raft cheapens river (uses the min of base and gate)", () => {
  expect(moveCost("river", null)).toBe(3);
  expect(moveCost("river", null, ["raft"])).toBe(1);
});

test("moveCost: a gate never raises cost — irrelevant tool is a no-op", () => {
  expect(moveCost("plains", null, ["climbing-pick", "raft"])).toBe(moveCost("plains", null));
  expect(moveCost("mud", null, ["raft"])).toBe(moveCost("mud", null));
});

test("moveCost: gate composes with transport (÷ multiplier still applies)", () => {
  expect(moveCost("mountain", "horse", ["climbing-pick"])).toBe(4 / 1.5);
});
