import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import type { GameState } from "../src/engine/types";

const baseState: GameState = { seed: "seed-1", phase: "town", bank: [], expedition: null };

test("reduce: a no-op-yielding action returns unchanged state and no events", () => {
  const { state, events } = reduce(baseState, { type: "return" });
  expect(state).toEqual(baseState);
  expect(events).toEqual([]);
});

test("reduce: does not mutate the input state object", () => {
  const input: GameState = { seed: "seed-1", phase: "town", bank: [], expedition: null };
  reduce(input, { type: "return" });
  expect(input).toEqual(baseState);
});
