import { test, expect } from "bun:test";
import type { GameState, Action } from "../src/engine/types";
import { emptyLoadout } from "../src/engine/loadout";

test("types: a minimal GameState and Action are constructible", () => {
  const state: GameState = {
    seed: "s",
    phase: "town",
    bank: [],
    loadout: emptyLoadout(),
    expedition: null,
    runs: 0,
  };
  const action: Action = { type: "return" };
  expect(state.phase).toBe("town");
  expect(action.type).toBe("return");
});

test("emptyLoadout: returns a fresh object each call (no shared aliasing)", () => {
  const a = emptyLoadout();
  const b = emptyLoadout();
  expect(a).toEqual(b);
  expect(a).not.toBe(b);
  expect(a.equipment).not.toBe(b.equipment);
});
