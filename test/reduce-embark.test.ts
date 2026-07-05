import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { ENERGY_PER_FOOD, BASE_ENERGY_FLOOR } from "../src/data/constants";
import { candidateMaps } from "../src/engine/town";
import type { GameState } from "../src/engine/types";

const OFFER_G = candidateMaps("g", 0)[0]!.mapSeed; // townState()'s first offered map
const OFFER_E = candidateMaps("e", 0)[0]!.mapSeed; // seed-"e" states' first offered map

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
  const { state, events } = reduce(townState(), { type: "embark", mapSeed: OFFER_G });
  const grid = generateGrid(OFFER_G, rollBiome(OFFER_G));
  expect(state.phase).toBe("expedition");
  expect(state.expedition).not.toBeNull();
  expect(state.expedition!.mapSeed).toBe(OFFER_G);
  expect(state.expedition!.pos).toEqual(grid.entry);
  expect(state.expedition!.energy).toBe(4 * ENERGY_PER_FOOD); // 3 bread + 1 jerky
  expect(state.expedition!.carry).toEqual([]);
  expect(state.expedition!.cleared).toEqual([]);
  expect(events).toEqual([
    {
      type: "embarked",
      mapSeed: OFFER_G,
      biomeId: grid.biomeId,
      pos: grid.entry,
      energy: 4 * ENERGY_PER_FOOD,
    },
  ]);
});

test("embark: moves the town loadout onto the expedition and leaves town's empty", () => {
  const { state } = reduce(townState(), { type: "embark", mapSeed: OFFER_G });
  expect(state.expedition!.loadout.food).toEqual([
    { defId: "bread", qty: 3 },
    { defId: "jerky", qty: 1 },
  ]);
  expect(state.expedition!.loadout.equipment.transport).toBe("horse");
  expect(state.loadout).toEqual(emptyLoadout());
});

test("embark: deterministic — same state + action twice gives identical results", () => {
  expect(reduce(townState(), { type: "embark", mapSeed: OFFER_G })).toEqual(
    reduce(townState(), { type: "embark", mapSeed: OFFER_G }),
  );
});

test("embark: rejected while already on expedition", () => {
  const first = reduce(townState(), { type: "embark", mapSeed: OFFER_G }).state;
  const { state, events } = reduce(first, { type: "embark", mapSeed: "other" });
  expect(state).toEqual(first);
  expect(events).toEqual([
    { type: "action-rejected", action: "embark", reason: "not-in-town" },
  ]);
});

test("embark: does not mutate the input state", () => {
  const input = townState();
  const before = structuredClone(input);
  reduce(input, { type: "embark", mapSeed: OFFER_G });
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
  const { state: next } = reduce(state, { type: "embark", mapSeed: OFFER_E });
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
  const { events } = reduce(state, { type: "embark", mapSeed: OFFER_E });
  expect(events).toEqual([{ type: "action-rejected", action: "embark", reason: "unaffordable" }]);
});

test("embark: zero-food embark falls back to the base energy floor (qrl)", () => {
  const state: GameState = {
    seed: "e", phase: "town", bank: [], loadout: emptyLoadout(), expedition: null,
  };
  const { state: next, events } = reduce(state, { type: "embark", mapSeed: OFFER_E });
  expect(next.phase).toBe("expedition");
  expect(next.expedition!.energy).toBe(BASE_ENERGY_FLOOR); // no dead-loop — ~5 actions to recover
  expect(events[0]!.type).toBe("embarked");
});

test("embark: an off-offer seed is rejected (no seed re-farming, 9u9.3)", () => {
  const { state, events } = reduce(townState(), { type: "embark", mapSeed: "not-a-real-offer" });
  expect(state.phase).toBe("town"); // no phase change, costs nothing
  expect(events).toEqual([
    { type: "action-rejected", action: "embark", reason: "not-offered" },
  ]);
});

test("embark: the offer rotates with runs — last visit's seed is no longer valid", () => {
  const prevSeed = candidateMaps("g", 0)[0]!.mapSeed;
  const s1: GameState = { ...townState(), runs: 1 };
  const offeredNow = candidateMaps("g", 1).map((m) => m.mapSeed);
  if (!offeredNow.includes(prevSeed)) {
    expect(reduce(s1, { type: "embark", mapSeed: prevSeed }).events).toEqual([
      { type: "action-rejected", action: "embark", reason: "not-offered" },
    ]);
  }
  expect(reduce(s1, { type: "embark", mapSeed: offeredNow[0]! }).events[0]!.type).toBe("embarked");
});
