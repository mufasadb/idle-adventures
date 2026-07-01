import { test, expect } from "bun:test";
import type { GameState, Action } from "../src/engine/types";

test("types: a minimal GameState and Action are constructible", () => {
  const state: GameState = { seed: "s", phase: "town", bank: [], expedition: null };
  const action: Action = { type: "return" };
  expect(state.phase).toBe("town");
  expect(action.type).toBe("return");
});
