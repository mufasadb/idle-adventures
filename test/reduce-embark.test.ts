import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { ENERGY_PER_FOOD } from "../src/data/constants";
import type { GameState } from "../src/engine/types";

function townState(): GameState {
  const loadout = emptyLoadout();
  loadout.food = [
    { defId: "bread", qty: 3 },
    { defId: "jerky", qty: 1 },
  ];
  loadout.equipment.transport = "horse";
  return { seed: "g", phase: "town", bank: [], loadout, expedition: null };
}

test("embark: enters expedition at the map's entry with energy from packed food", () => {
  const { state, events } = reduce(townState(), { type: "embark", mapSeed: "m2-map" });
  const grid = generateGrid("m2-map", rollBiome("m2-map"));
  expect(state.phase).toBe("expedition");
  expect(state.expedition).not.toBeNull();
  expect(state.expedition!.mapSeed).toBe("m2-map");
  expect(state.expedition!.pos).toEqual(grid.entry);
  expect(state.expedition!.energy).toBe(4 * ENERGY_PER_FOOD); // 3 bread + 1 jerky
  expect(state.expedition!.carry).toEqual([]);
  expect(state.expedition!.cleared).toEqual([]);
  expect(events).toEqual([
    {
      type: "embarked",
      mapSeed: "m2-map",
      biomeId: grid.biomeId,
      pos: grid.entry,
      energy: 4 * ENERGY_PER_FOOD,
    },
  ]);
});

test("embark: moves the town loadout onto the expedition and leaves town's empty", () => {
  const { state } = reduce(townState(), { type: "embark", mapSeed: "m2-map" });
  expect(state.expedition!.loadout.food).toEqual([
    { defId: "bread", qty: 3 },
    { defId: "jerky", qty: 1 },
  ]);
  expect(state.expedition!.loadout.equipment.transport).toBe("horse");
  expect(state.loadout).toEqual(emptyLoadout());
});

test("embark: deterministic — same state + action twice gives identical results", () => {
  expect(reduce(townState(), { type: "embark", mapSeed: "m2-map" })).toEqual(
    reduce(townState(), { type: "embark", mapSeed: "m2-map" }),
  );
});

test("embark: rejected while already on expedition", () => {
  const first = reduce(townState(), { type: "embark", mapSeed: "m2-map" }).state;
  const { state, events } = reduce(first, { type: "embark", mapSeed: "other" });
  expect(state).toEqual(first);
  expect(events).toEqual([
    { type: "action-rejected", action: "embark", reason: "not-in-town" },
  ]);
});

test("embark: does not mutate the input state", () => {
  const input = townState();
  const before = structuredClone(input);
  reduce(input, { type: "embark", mapSeed: "m2-map" });
  expect(input).toEqual(before);
});
