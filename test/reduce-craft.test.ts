import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import type { GameState } from "../src/engine/types";

function town(bank: { defId: string; qty: number }[]): GameState {
  return { seed: "c", phase: "town", bank, loadout: emptyLoadout(), expedition: null };
}

test("craft: town-side, consumes inputs and banks the output (bead acceptance)", () => {
  const { state, events } = reduce(
    town([{ defId: "iron-ore", qty: 3 }, { defId: "oak-log", qty: 1 }]),
    { type: "craft", recipeId: "iron-pick" },
  );
  expect(state.bank).toEqual([
    { defId: "iron-ore", qty: 1 },
    { defId: "iron-pick", qty: 1 },
  ]);
  expect(events).toEqual([
    { type: "crafted", recipeId: "iron-pick", output: { defId: "iron-pick", qty: 1 } },
  ]);
});

test("craft: insufficient materials is rejected", () => {
  const { state, events } = reduce(town([{ defId: "iron-ore", qty: 1 }]), {
    type: "craft",
    recipeId: "iron-pick",
  });
  expect(state.bank).toEqual([{ defId: "iron-ore", qty: 1 }]);
  expect(events).toEqual([
    { type: "action-rejected", action: "craft", reason: "insufficient-materials" },
  ]);
});

test("craft: rejected outside town", () => {
  const expeditionState: GameState = {
    ...town([{ defId: "iron-ore", qty: 3 }, { defId: "oak-log", qty: 1 }]),
    phase: "expedition",
  };
  const { events } = reduce(expeditionState, { type: "craft", recipeId: "iron-pick" });
  expect(events).toEqual([
    { type: "action-rejected", action: "craft", reason: "not-in-town" },
  ]);
});
