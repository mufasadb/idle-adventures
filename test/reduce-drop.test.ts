import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import type { GameState, ItemStack } from "../src/engine/types";

function carrying(carry: ItemStack[], food: ItemStack[] = []): GameState {
  const loadout = emptyLoadout();
  loadout.food = food;
  return {
    seed: "g",
    phase: "expedition",
    bank: [],
    loadout: emptyLoadout(),
    expedition: {
      mapSeed: "m3-drop",
      pos: { x: 5, y: 5 },
      energy: 10,
      hp: 0,
      loadout,
      carry,
      cleared: [],
    },
  };
}

test("drop: removes the first matching stack and frees its slot", () => {
  const { state, events } = reduce(
    carrying([
      { defId: "iron-ore", qty: 3 },
      { defId: "oak-log", qty: 2 },
      { defId: "iron-ore", qty: 1 },
    ]),
    { type: "drop", itemId: "iron-ore" },
  );
  expect(state.expedition!.carry).toEqual([
    { defId: "oak-log", qty: 2 },
    { defId: "iron-ore", qty: 1 }, // only the FIRST matching stack dropped
  ]);
  expect(events).toEqual([{ type: "dropped", defId: "iron-ore", qty: 3 }]);
});

test("drop: costs nothing", () => {
  const { state } = reduce(carrying([{ defId: "iron-ore", qty: 3 }]), {
    type: "drop",
    itemId: "iron-ore",
  });
  expect(state.expedition!.energy).toBe(10);
});

test("drop: something not carried is rejected", () => {
  const before = carrying([{ defId: "iron-ore", qty: 3 }]);
  const { state, events } = reduce(before, { type: "drop", itemId: "oak-log" });
  expect(state).toEqual(before);
  expect(events).toEqual([
    { type: "action-rejected", action: "drop", reason: "not-carried" },
  ]);
});

test("drop: packed food is ballast, not droppable (D23)", () => {
  const { events } = reduce(
    carrying([], [{ defId: "bread", qty: 3 }]),
    { type: "drop", itemId: "bread" },
  );
  expect(events).toEqual([
    { type: "action-rejected", action: "drop", reason: "not-carried" },
  ]);
});

test("drop: rejected in town", () => {
  const town: GameState = {
    seed: "g",
    phase: "town",
    bank: [],
    loadout: emptyLoadout(),
    expedition: null,
  };
  const { events } = reduce(town, { type: "drop", itemId: "iron-ore" });
  expect(events).toEqual([
    { type: "action-rejected", action: "drop", reason: "not-on-expedition" },
  ]);
});

test("drop: does not mutate the input state", () => {
  const input = carrying([{ defId: "iron-ore", qty: 3 }]);
  const before = structuredClone(input);
  reduce(input, { type: "drop", itemId: "iron-ore" });
  expect(input).toEqual(before);
});
