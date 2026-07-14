import { test, expect } from "bun:test";
import { scanForPoi } from "./helpers";
import { reduce } from "../src/engine/reduce";
import { newGame, candidateMaps } from "../src/engine/town";
import type { Grid, Poi } from "../src/engine/grid";
import { NODE_HARDNESS, TOOL_QUALITY, MATERIAL_TIER } from "../src/data/constants";
import type { GameState } from "../src/engine/types";

// Find a map whose rolled biome has a mining POI that a basic (tier-1) pick can
// actually work — run 1 gathers with the plain `pick`, so a T2+ material (e.g.
// coal, rolled more often now that POI_DENSITY is higher, e3j) would reject
// tool-too-weak before the cost-drop assertion ever runs.
const miningMap = (): { seed: string; grid: Grid; poi: Poi } => scanForPoi("loop-scan", (p) => p.kind === "mining" && (MATERIAL_TIER[p.material ?? ""] ?? 1) === 1);

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
  state = reduce(state, { type: "embark", mapSeed: candidateMaps("loop", state.runs ?? 0)[0]!.mapSeed }).state;
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
  state = reduce(state, { type: "embark", mapSeed: candidateMaps("loop", state.runs ?? 0)[0]!.mapSeed }).state;
  state = standingOn(state, seed, poi, 100);
  const gather2 = reduce(state, { type: "gather" });
  const cost2 = NODE_HARDNESS.mining / TOOL_QUALITY["iron-pick"]!; // 6 / 2

  expect(cost2).toBeLessThan(cost1); // measurably cheaper
  expect(gather2.events[0]).toMatchObject({ type: "gathered", cost: cost2 });
});
