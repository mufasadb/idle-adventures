import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { RECIPE } from "../src/data/constants";
import type { GameState } from "../src/engine/types";

function town(bank: { defId: string; qty: number }[]): GameState {
  return { seed: "c", phase: "town", bank, loadout: emptyLoadout(), expedition: null };
}

// ke3.2 station tests inject throwaway recipes so the mechanism is exercised without
// committing station CONTENT (that lands in ke3.5/6/7). Cleaned up around assertions.
function withRecipes(recipes: Record<string, (typeof RECIPE)[string]>, fn: () => void): void {
  const map = RECIPE as Record<string, (typeof RECIPE)[string]>;
  for (const [id, r] of Object.entries(recipes)) map[id] = r;
  try {
    fn();
  } finally {
    for (const id of Object.keys(recipes)) delete map[id];
  }
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

// --- ke3.2: stations (non-bank state.stations + buildsStation) ---------------

test("craft: building a station adds it to state.stations, output NOT banked, inputs consumed (ke3.2)", () => {
  withRecipes(
    { "test-anvil": { inputs: [{ defId: "iron-ore", qty: 2 }], output: { defId: "anvil", qty: 1 }, buildsStation: "anvil" } },
    () => {
      const { state, events } = reduce(town([{ defId: "iron-ore", qty: 3 }]), { type: "craft", recipeId: "test-anvil" });
      expect(state.stations).toEqual(["anvil"]);
      // inputs consumed, station output never enters the bank
      expect(state.bank).toEqual([{ defId: "iron-ore", qty: 1 }]);
      expect(state.bank.find((s) => s.defId === "anvil")).toBeUndefined();
      // crafted event stays well-formed (output present, clarification #2)
      expect(events).toEqual([{ type: "crafted", recipeId: "test-anvil", output: { defId: "anvil", qty: 1 } }]);
    },
  );
});

test("craft: re-building an already-built station is rejected 'already-built', state unchanged; idempotent (ke3.2)", () => {
  withRecipes(
    { "test-anvil": { inputs: [{ defId: "iron-ore", qty: 2 }], output: { defId: "anvil", qty: 1 }, buildsStation: "anvil" } },
    () => {
      const built: GameState = { ...town([{ defId: "iron-ore", qty: 3 }]), stations: ["anvil"] };
      const { state, events } = reduce(built, { type: "craft", recipeId: "test-anvil" });
      expect(events).toEqual([{ type: "action-rejected", action: "craft", reason: "already-built" }]);
      expect(state.stations).toEqual(["anvil"]); // no dupes, mats untouched
      expect(state.bank).toEqual([{ defId: "iron-ore", qty: 3 }]);
    },
  );
});

test("craft: a station-gated recipe rejects 'missing-station' before build and succeeds after (ke3.2)", () => {
  withRecipes(
    {
      "test-anvil": { inputs: [{ defId: "iron-ore", qty: 2 }], output: { defId: "anvil", qty: 1 }, buildsStation: "anvil" },
      "test-plate": { inputs: [{ defId: "iron-ore", qty: 1 }], output: { defId: "plate-helmet", qty: 1 }, requires: { station: "anvil" } },
    },
    () => {
      // before: no anvil → gated recipe rejected
      const before = reduce(town([{ defId: "iron-ore", qty: 5 }]), { type: "craft", recipeId: "test-plate" });
      expect(before.events).toEqual([{ type: "action-rejected", action: "craft", reason: "missing-station" }]);
      // build the anvil, then the gated recipe crafts
      const after = reduce(before.state, { type: "craft", recipeId: "test-anvil" });
      const crafted = reduce(after.state, { type: "craft", recipeId: "test-plate" });
      expect(crafted.state.bank.find((s) => s.defId === "plate-helmet")?.qty).toBe(1);
    },
  );
});

test("craft: stations never touch carry/loadout math (ke3.2)", () => {
  withRecipes(
    { "test-desk": { inputs: [{ defId: "forest-herb", qty: 2 }], output: { defId: "alchemical-desk", qty: 1 }, buildsStation: "alchemical-desk" } },
    () => {
      const { state } = reduce(town([{ defId: "forest-herb", qty: 3 }]), { type: "craft", recipeId: "test-desk" });
      // the station is base infra, not a loadout item — loadout untouched
      expect(state.loadout).toEqual(emptyLoadout());
      expect(state.stations).toEqual(["alchemical-desk"]);
    },
  );
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
