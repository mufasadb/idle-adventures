import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import type { GameState } from "../src/engine/types";
import { emptyLoadout } from "../src/engine/loadout";

const baseState: GameState = { seed: "seed-1", phase: "town", bank: [], loadout: emptyLoadout(), expedition: null };

test("reduce: an illegal action returns unchanged state with a rejection event", () => {
  const { state, events } = reduce(baseState, { type: "return" }); // return in town is illegal
  expect(state).toEqual(baseState);
  expect(events).toEqual([
    { type: "action-rejected", action: "return", reason: "not-on-expedition" },
  ]);
});

test("reduce: does not mutate the input state object", () => {
  const input: GameState = { seed: "seed-1", phase: "town", bank: [], loadout: emptyLoadout(), expedition: null };
  reduce(input, { type: "return" });
  expect(input).toEqual(baseState);
});
