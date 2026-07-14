import { test, expect } from "bun:test";
import { toolSpeedFor, gateSatisfied, materialGate } from "../src/engine/tools";
import { TOOL_SPEED } from "../src/data/constants";

test("toolSpeedFor: bare-hands capability needs no tool", () => {
  expect(toolSpeedFor([], null)).toBe(1);
  expect(toolSpeedFor(["pick"], null)).toBe(1);
});

test("toolSpeedFor: missing tool gives null", () => {
  expect(toolSpeedFor([], "pick")).toBeNull();
  expect(toolSpeedFor(["axe", "spyglass"], "pick")).toBeNull();
});

test("toolSpeedFor: matching tool returns its speed (absent = 1)", () => {
  expect(toolSpeedFor(["pick"], "pick")).toBe(1); // base pick has no TOOL_SPEED entry = 1
  expect(toolSpeedFor(["axe", "pick"], "pick")).toBe(1);
  expect(toolSpeedFor(["iron-pick"], "pick")).toBe(TOOL_SPEED["iron-pick"]!);
});

test("toolSpeedFor: picks the best (fastest) capable tool", () => {
  expect(toolSpeedFor(["pick", "steel-pick"], "pick")).toBe(TOOL_SPEED["steel-pick"]!);
});

test("toolSpeedFor: unknown equipped defIds are ignored", () => {
  expect(toolSpeedFor(["spyglass"], "pick")).toBeNull();
});

// D78: ACCESS gates are a separate axis from SPEED.
test("gateSatisfied: ungated material is always workable", () => {
  expect(materialGate("iron-ore")).toBeNull();
  expect(gateSatisfied("iron-ore", [])).toBe(true);
});

test("gateSatisfied: gated material needs one of its any-of tools", () => {
  expect(materialGate("coal")).toEqual(["iron-pick", "steel-pick"]);
  expect(gateSatisfied("coal", ["pick"])).toBe(false); // base pick works the node kind but not the gate
  expect(gateSatisfied("coal", ["iron-pick"])).toBe(true);
  expect(gateSatisfied("coal", ["steel-pick"])).toBe(true);
});

test("gateSatisfied: mithril needs the steel pick specifically", () => {
  expect(materialGate("mithril-ore")).toEqual(["steel-pick"]);
  expect(gateSatisfied("mithril-ore", ["iron-pick"])).toBe(false);
  expect(gateSatisfied("mithril-ore", ["steel-pick"])).toBe(true);
});
