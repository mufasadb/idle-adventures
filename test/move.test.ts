// test/move.test.ts
import { test, expect } from "bun:test";
import { stepToward, moveCost } from "../src/engine/move";
import { TERRAIN_COST, MIN_STEP } from "../src/data/constants";

test("stepToward: steps one tile on each axis toward the target (8-dir)", () => {
  expect(stepToward({ x: 5, y: 5 }, { x: 8, y: 8 })).toEqual({ x: 6, y: 6 }); // diagonal
  expect(stepToward({ x: 5, y: 5 }, { x: 5, y: 0 })).toEqual({ x: 5, y: 4 }); // vertical
  expect(stepToward({ x: 5, y: 5 }, { x: 2, y: 5 })).toEqual({ x: 4, y: 5 }); // horizontal
  expect(stepToward({ x: 5, y: 5 }, { x: 6, y: 9 })).toEqual({ x: 6, y: 6 }); // mixed clamps to ±1
});

test("stepToward: already at target means no step", () => {
  expect(stepToward({ x: 3, y: 3 }, { x: 3, y: 3 })).toEqual({ x: 3, y: 3 });
});

test("moveCost: on foot equals the terrain's absolute step energy", () => {
  expect(moveCost("plains", null)).toBe(TERRAIN_COST.plains); // 10
  expect(moveCost("mud", null)).toBe(TERRAIN_COST.mud); // 15
  expect(moveCost("river", null)).toBe(TERRAIN_COST.river); // 30
});

test("moveCost: ice costs more than plains", () => {
  expect(moveCost("ice", null)).toBeGreaterThan(moveCost("plains", null));
});

test("moveCost: mountain is impassable without a tool, regardless of transport", () => {
  expect(moveCost("mountain", null)).toBe(Infinity);
  expect(moveCost("mountain", "horse")).toBe(Infinity);
});

test("moveCost: climbing-pick ENABLES mountain (Infinity → finite enable value)", () => {
  expect(moveCost("mountain", null, ["climbing-pick"])).toBe(40);
});

test("moveCost: raft discounts river (subtractive)", () => {
  expect(moveCost("river", null, ["raft"])).toBe(30 - 20); // 10
});

test("moveCost: waders discount mud", () => {
  expect(moveCost("mud", null, ["waders"])).toBe(15 - 5); // 10
});

test("moveCost: ice-cleats make ice faster than plains (glide, floored at MIN_STEP)", () => {
  const iced = moveCost("ice", null, ["ice-cleats"]); // 20 - 15 = 5
  expect(iced).toBe(Math.max(MIN_STEP, 5));
  expect(iced).toBeLessThan(moveCost("plains", null)); // faster than plains
});

test("moveCost: a discount never drops a step below MIN_STEP", () => {
  expect(moveCost("ice", null, ["ice-cleats", "ice-cleats"])).toBe(MIN_STEP);
});

test("moveCost: an irrelevant tool is a no-op", () => {
  expect(moveCost("plains", null, ["raft", "climbing-pick"])).toBe(moveCost("plains", null));
});

test("moveCost: transport is per-terrain — horse is fast on plains, no help on river", () => {
  expect(moveCost("plains", "horse")).toBe(TERRAIN_COST.plains / 2); // horse plains ÷2
  expect(moveCost("river", "horse")).toBe(TERRAIN_COST.river); // no help on river (÷1)
});

test("moveCost: wagon answers ice (÷2 on ice)", () => {
  expect(moveCost("ice", "wagon")).toBe(TERRAIN_COST.ice / 2);
});

test("moveCost: unknown transport behaves as on foot", () => {
  expect(moveCost("plains", "rocket-skates")).toBe(moveCost("plains", null));
});

test("moveCost: gate + transport compose (enable then divide)", () => {
  expect(moveCost("mountain", "horse", ["climbing-pick"])).toBe(40); // horse ÷1 on mountain
});
