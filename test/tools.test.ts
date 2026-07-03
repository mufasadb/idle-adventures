import { test, expect } from "bun:test";
import { toolQualityFor } from "../src/engine/tools";
import { TOOL_QUALITY } from "../src/data/constants";

test("toolQualityFor: bare-hands capability needs no tool", () => {
  expect(toolQualityFor([], null)).toBe(1);
  expect(toolQualityFor(["pick"], null)).toBe(1);
});

test("toolQualityFor: missing tool gives null", () => {
  expect(toolQualityFor([], "pick")).toBeNull();
  expect(toolQualityFor(["axe", "spyglass"], "pick")).toBeNull();
});

test("toolQualityFor: matching tool returns its quality", () => {
  expect(toolQualityFor(["pick"], "pick")).toBe(TOOL_QUALITY.pick!);
  expect(toolQualityFor(["axe", "pick"], "pick")).toBe(TOOL_QUALITY.pick!);
});

test("toolQualityFor: unknown equipped defIds are ignored", () => {
  expect(toolQualityFor(["spyglass"], "pick")).toBeNull();
});
