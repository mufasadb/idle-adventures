import { test, expect } from "bun:test";
import { gatherCost } from "../src/engine/tools";
import type { Poi } from "../src/engine/grid";

// eot.1: gatherCost is the single source of truth for what a gather WOULD cost, so
// the route cost-preview (auto-gather action points) and the gather reducer never
// drift. cost = NODE_HARDNESS[kind] / toolQuality; null when the node can't be
// worked with the given tools (not gatherable / no tool / tool too weak).

const node = (over: Partial<Poi>): Poi => ({
  x: 0,
  y: 0,
  kind: "wood",
  material: "logwood",
  creature: null,
  ...over,
});

test("gatherCost: wood with a basic axe is hardness / quality", () => {
  expect(gatherCost(node({ kind: "wood", material: "logwood" }), ["axe"])).toBe(40); // 40 / 1
});

test("gatherCost: a better tool lowers the cost", () => {
  expect(gatherCost(node({ kind: "mining", material: "iron-ore" }), ["pick"])).toBe(60); // 60 / 1
  expect(gatherCost(node({ kind: "mining", material: "iron-ore" }), ["iron-pick"])).toBe(30); // 60 / 2
});

test("gatherCost: bare-hands herb needs no tool", () => {
  expect(gatherCost(node({ kind: "herb", material: "sage" }), [])).toBe(20); // 20 / 1
});

test("gatherCost: null when the required tool is missing", () => {
  expect(gatherCost(node({ kind: "mining", material: "iron-ore" }), [])).toBeNull();
});

test("gatherCost: null when the tool is too weak for the material tier", () => {
  expect(gatherCost(node({ kind: "mining", material: "coal" }), ["pick"])).toBeNull(); // coal = tier 2, pick = q1
  expect(gatherCost(node({ kind: "mining", material: "coal" }), ["steel-pick"])).toBe(20); // q3 works: 60 / 3
});

test("gatherCost: null for a monster or an empty node", () => {
  expect(gatherCost(node({ kind: "monster", material: null, creature: "goblin" }), ["axe"])).toBeNull();
  expect(gatherCost(node({ kind: "wood", material: null }), ["axe"])).toBeNull();
});
