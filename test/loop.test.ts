import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { newGame } from "../src/engine/town";
import { generateGrid, rollBiome } from "../src/engine/grid";
import type { Grid, Poi } from "../src/engine/grid";
import { NODE_HARDNESS, TOOL_QUALITY } from "../src/data/constants";
import type { GameState } from "../src/engine/types";

// Find a map whose rolled biome has a mining POI, and return that POI.
function miningMap(): { seed: string; grid: Grid; poi: Poi } {
  for (let i = 0; i < 400; i++) {
    const seed = `loop-scan-${i}`;
    const grid = generateGrid(seed, rollBiome(seed));
    const poi = grid.pois.find((p) => p.kind === "mining");
    if (poi) return { seed, grid, poi };
  }
  throw new Error("no mining map in scan range");
}

// Drop the player onto `poi` in the active (just-embarked) expedition, with the
// embarked loadout, full energy. Movement is exercised in M6's scripted loop.
function standingOn(state: GameState, seed: string, poi: Poi, energy: number): GameState {
  return {
    ...state,
    phase: "expedition",
    expedition: {
      mapSeed: seed, pos: { x: poi.x, y: poi.y }, energy, hp: 30,
      loadout: state.expedition!.loadout, carry: [], cleared: [],
    },
  };
}

test("loop: crafting iron-pick makes the second run's mining measurably cheaper (bead acceptance)", () => {
  const { seed, poi } = miningMap();
  // --- Run 1: basic pick ---
  let state = newGame("loop");
  state = reduce(state, { type: "pack", slot: "tool", itemId: "pick" }).state;
  state = reduce(state, { type: "pack", slot: "backpack", itemId: "starter" }).state;
  state = reduce(state, { type: "pack", slot: "food", itemId: "ration" }).state;
  state = reduce(state, { type: "pack", slot: "food", itemId: "ration" }).state;
  state = reduce(state, { type: "embark", mapSeed: seed }).state;
  // stand on the mining node with plenty of energy, gather with the basic pick
  state = standingOn(state, seed, poi, 100);
  const gather1 = reduce(state, { type: "gather" });
  const cost1 = NODE_HARDNESS.mining / TOOL_QUALITY.pick!; // 6 / 1
  expect(gather1.events[0]).toMatchObject({ type: "gathered", cost: cost1 });
  state = gather1.state;
  // return the haul
  state = reduce(state, { type: "return" }).state;
  expect(state.phase).toBe("town");

  // --- Craft the upgrade. Top up the bank so the craft is guaranteed regardless
  // of which ore the node rolled (D27 weighting) — the point under test is the
  // cost drop, not the gather RNG. ---
  state = { ...state, bank: [...state.bank, { defId: "iron-ore", qty: 2 }, { defId: "oak-log", qty: 1 }] };
  const craft = reduce(state, { type: "craft", recipeId: "iron-pick" });
  expect(craft.events[0]).toMatchObject({ type: "crafted", output: { defId: "iron-pick", qty: 1 } });
  state = craft.state;

  // --- Run 2: iron-pick (quality 2) ---
  state = reduce(state, { type: "pack", slot: "tool", itemId: "iron-pick" }).state;
  state = reduce(state, { type: "pack", slot: "backpack", itemId: "starter" }).state;
  state = reduce(state, { type: "pack", slot: "food", itemId: "ration" }).state;
  state = reduce(state, { type: "pack", slot: "food", itemId: "ration" }).state;
  state = reduce(state, { type: "embark", mapSeed: seed }).state;
  state = standingOn(state, seed, poi, 100);
  const gather2 = reduce(state, { type: "gather" });
  const cost2 = NODE_HARDNESS.mining / TOOL_QUALITY["iron-pick"]!; // 6 / 2

  expect(cost2).toBeLessThan(cost1); // measurably cheaper
  expect(gather2.events[0]).toMatchObject({ type: "gathered", cost: cost2 });
});
