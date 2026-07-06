import { test, expect } from "bun:test";
import { bankStacks, endExpedition } from "../src/engine/bank";
import { emptyLoadout } from "../src/engine/loadout";
import type { GameState } from "../src/engine/types";

test("bankStacks: merges by defId without a cap", () => {
  expect(
    bankStacks(
      [{ defId: "iron-ore", qty: 9 }],
      [{ defId: "iron-ore", qty: 8 }, { defId: "oak-log", qty: 2 }],
    ),
  ).toEqual([
    { defId: "iron-ore", qty: 17 },
    { defId: "oak-log", qty: 2 },
  ]);
});

test("bankStacks: pure", () => {
  const bank = [{ defId: "iron-ore", qty: 1 }];
  bankStacks(bank, [{ defId: "iron-ore", qty: 1 }]);
  expect(bank).toEqual([{ defId: "iron-ore", qty: 1 }]);
});

test("endExpedition: banks carry + durables + potions + uneaten food (D26, pqp)", () => {
  const loadout = emptyLoadout();
  loadout.equipment.weapon = "sword";
  loadout.equipment.chest = "plate-chest";
  loadout.equipment.tools = ["pick", "spyglass"];
  loadout.equipment.transport = "horse";
  loadout.equipment.backpack = "starter";
  loadout.food = [{ defId: "bread", qty: 2 }]; // uneaten — banks back (pqp)
  loadout.potions = [{ defId: "healing-potion", qty: 1 }];
  const state: GameState = {
    seed: "g",
    phase: "expedition",
    bank: [{ defId: "sword", qty: 1 }],
    loadout: emptyLoadout(),
    expedition: {
      mapSeed: "m",
      pos: { x: 1, y: 1 },
      energy: 5,
      hp: 0,
      loadout,
      carry: [{ defId: "silver-ore", qty: 3 }],
      cleared: [{ x: 1, y: 1 }],
    },
  };
  const ended = endExpedition(state, state.expedition!);
  expect(ended.phase).toBe("town");
  expect(ended.expedition).toBeNull();
  expect(ended.loadout).toEqual(emptyLoadout());
  expect(ended.bank).toEqual([
    { defId: "sword", qty: 2 }, // pre-existing 1 + the equipped one
    { defId: "silver-ore", qty: 3 },
    { defId: "plate-chest", qty: 1 },
    { defId: "pick", qty: 1 },
    { defId: "spyglass", qty: 1 },
    { defId: "horse", qty: 1 },
    { defId: "starter", qty: 1 },
    { defId: "healing-potion", qty: 1 },
    { defId: "bread", qty: 2 }, // uneaten food banks back (pqp)
  ]);
  expect(state.phase).toBe("expedition"); // pure — input untouched
});

test("endExpedition banks carried maps into state.maps (D26: they follow the carry's fate)", () => {
  const state: GameState = {
    seed: "g",
    phase: "expedition",
    bank: [],
    loadout: emptyLoadout(),
    maps: [{ mapSeed: "pocketed-1", biomeId: "desert", vintage: 0 }],
    expedition: {
      mapSeed: "m",
      pos: { x: 1, y: 1 },
      energy: 0,
      hp: 5,
      loadout: emptyLoadout(),
      carry: [],
      cleared: [],
      carriedMaps: [{ mapSeed: "run:drop:1,2", biomeId: "tundra", vintage: 2 }],
    },
  };
  const ended = endExpedition(state, state.expedition!);
  expect(ended.maps).toEqual([
    { mapSeed: "pocketed-1", biomeId: "desert", vintage: 0 },
    { mapSeed: "run:drop:1,2", biomeId: "tundra", vintage: 2 },
  ]);
  expect(ended.phase).toBe("town");
});
