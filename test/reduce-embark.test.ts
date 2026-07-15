import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { MAX_ENERGY } from "../src/data/constants";
import { localMap, newGame } from "../src/engine/town";
import type { GameState, MapItem } from "../src/engine/types";

const OFFER_G = localMap("g", 0).mapSeed; // townState()'s local map
const OFFER_E = localMap("e", 0).mapSeed; // seed-"e" states' local map

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

test("embark: enters expedition at the map's entry at MAX_ENERGY (stamina model, dtv)", () => {
  const { state, events } = reduce(townState(), { type: "embark", mapSeed: OFFER_G });
  const grid = generateGrid(OFFER_G, rollBiome(OFFER_G));
  expect(state.phase).toBe("expedition");
  expect(state.expedition).not.toBeNull();
  expect(state.expedition!.mapSeed).toBe(OFFER_G);
  expect(state.expedition!.pos).toEqual(grid.entry);
  expect(state.expedition!.energy).toBe(MAX_ENERGY); // start at max regardless of packed food
  expect(state.expedition!.maxEnergy).toBe(MAX_ENERGY);
  expect(state.expedition!.autoEatFood).toBeUndefined(); // auto-eat starts OFF (mco)
  expect(state.expedition!.carry).toEqual([]);
  expect(state.expedition!.cleared).toEqual([]);
  expect(events).toEqual([
    {
      type: "embarked",
      mapSeed: OFFER_G,
      biomeId: grid.biomeId,
      pos: grid.entry,
      energy: MAX_ENERGY,
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
  expect(next.expedition!.energy).toBe(MAX_ENERGY); // stamina model: embark at max, food is the reserve
  expect(next.expedition!.loadout.food).toEqual([{ defId: "ration", qty: 3 }]); // packed food carried as reserve
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

test("embark: zero-food embark still starts at MAX_ENERGY (stamina model, dtv)", () => {
  const state: GameState = {
    seed: "e", phase: "town", bank: [], loadout: emptyLoadout(), expedition: null,
  };
  const { state: next, events } = reduce(state, { type: "embark", mapSeed: OFFER_E });
  expect(next.phase).toBe("expedition");
  expect(next.expedition!.energy).toBe(MAX_ENERGY); // start at max; with no food there's just nothing to refill
  expect(next.expedition!.loadout.food).toEqual([]);
  expect(events[0]!.type).toBe("embarked");
});

test("embark: an off-offer seed is rejected (no seed re-farming, 9u9.3)", () => {
  const { state, events } = reduce(townState(), { type: "embark", mapSeed: "not-a-real-offer" });
  expect(state.phase).toBe("town"); // no phase change, costs nothing
  expect(events).toEqual([
    { type: "action-rejected", action: "embark", reason: "not-offered" },
  ]);
});

test("embark: held map tier flows into expedition.mapTier", () => {
  // Held map arrives as a drop (zpm.2): inject a held T3 map, then embark it.
  const base = newGame("emk");
  const held: MapItem = { mapSeed: "held-t3", biomeId: "tundra", vintage: 0, tier: 3 };
  const st = { ...base, maps: [held] };
  const { state } = reduce(st, { type: "embark", mapSeed: "held-t3" });
  expect(state.expedition?.mapTier).toBe(3);
});

test("embark: the local map is tier 1", () => {
  const base = newGame("emk2");
  const local = localMap("emk2", 0);
  const { state } = reduce(base, { type: "embark", mapSeed: local.mapSeed });
  expect(state.expedition?.mapTier).toBe(1);
});

test("embark: the local map rotates with runs — last visit's seed is no longer valid", () => {
  const prevSeed = localMap("g", 0).mapSeed;
  const s1: GameState = { ...townState(), runs: 1 };
  const offeredNow = localMap("g", 1).mapSeed;
  expect(offeredNow).not.toBe(prevSeed); // rotated
  expect(reduce(s1, { type: "embark", mapSeed: prevSeed }).events).toEqual([
    { type: "action-rejected", action: "embark", reason: "not-offered" },
  ]);
  expect(reduce(s1, { type: "embark", mapSeed: offeredNow }).events[0]!.type).toBe("embarked");
});
