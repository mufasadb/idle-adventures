import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { ENERGY_PER_FOOD, BASE_ENERGY_FLOOR } from "../src/data/constants";
import type { GameState } from "../src/engine/types";

function townState(): GameState {
  const loadout = emptyLoadout();
  loadout.food = [
    { defId: "bread", qty: 3 },
    { defId: "jerky", qty: 1 },
  ];
  loadout.equipment.transport = "horse";
  // D28: embark debits the plan from the bank, so it must hold the packed items.
  const bank = [
    { defId: "bread", qty: 3 },
    { defId: "jerky", qty: 1 },
    { defId: "horse", qty: 1 },
  ];
  return { seed: "g", phase: "town", bank, loadout, expedition: null };
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

test("embark: debits the packed loadout from the bank (D28)", () => {
  const loadout = emptyLoadout();
  loadout.equipment.weapon = "sword";
  loadout.food = [{ defId: "ration", qty: 3 }];
  const state: GameState = {
    seed: "e", phase: "town",
    bank: [{ defId: "sword", qty: 1 }, { defId: "ration", qty: 5 }, { defId: "iron-ore", qty: 9 }],
    loadout, expedition: null,
  };
  const { state: next } = reduce(state, { type: "embark", mapSeed: "map-1" });
  // sword + 3 rations removed; the untouched iron-ore and 2 leftover rations remain
  expect(next.bank).toEqual([{ defId: "ration", qty: 2 }, { defId: "iron-ore", qty: 9 }]);
  expect(next.expedition!.energy).toBe(3 * ENERGY_PER_FOOD);
  expect(next.expedition!.loadout.equipment.weapon).toBe("sword");
});

test("embark: unaffordable plan is rejected (safety net)", () => {
  const loadout = emptyLoadout();
  loadout.food = [{ defId: "ration", qty: 3 }];
  const state: GameState = {
    seed: "e", phase: "town", bank: [{ defId: "ration", qty: 1 }], loadout, expedition: null,
  };
  const { events } = reduce(state, { type: "embark", mapSeed: "map-1" });
  expect(events).toEqual([{ type: "action-rejected", action: "embark", reason: "unaffordable" }]);
});

test("embark: zero-food embark falls back to the base energy floor (qrl)", () => {
  const state: GameState = {
    seed: "e", phase: "town", bank: [], loadout: emptyLoadout(), expedition: null,
  };
  const { state: next, events } = reduce(state, { type: "embark", mapSeed: "map-1" });
  expect(next.phase).toBe("expedition");
  expect(next.expedition!.energy).toBe(BASE_ENERGY_FLOOR); // no dead-loop — ~5 actions to recover
  expect(events[0]!.type).toBe("embarked");
});
