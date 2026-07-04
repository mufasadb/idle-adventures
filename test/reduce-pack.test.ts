import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { reserveLoadout } from "../src/engine/pack";
import type { GameState } from "../src/engine/types";

function town(bank: { defId: string; qty: number }[]): GameState {
  return { seed: "p", phase: "town", bank, loadout: emptyLoadout(), expedition: null };
}

test("pack: equipment slot is set, bank untouched (D28 plan)", () => {
  const { state, events } = reduce(town([{ defId: "iron-sword", qty: 1 }]), {
    type: "pack",
    slot: "weapon",
    itemId: "iron-sword",
  });
  expect(state.loadout.equipment.weapon).toBe("iron-sword");
  expect(state.bank).toEqual([{ defId: "iron-sword", qty: 1 }]); // NOT debited until embark
  expect(events).toEqual([{ type: "packed", slot: "weapon", defId: "iron-sword" }]);
});

test("pack: re-packing an equipment slot overwrites (frees the old reservation)", () => {
  const s1 = reduce(town([{ defId: "sword", qty: 1 }, { defId: "iron-sword", qty: 1 }]), {
    type: "pack", slot: "weapon", itemId: "sword",
  }).state;
  const s2 = reduce(s1, { type: "pack", slot: "weapon", itemId: "iron-sword" }).state;
  expect(s2.loadout.equipment.weapon).toBe("iron-sword");
});

test("pack: wrong slot is rejected", () => {
  const { events } = reduce(town([{ defId: "plate-helmet", qty: 1 }]), {
    type: "pack", slot: "chest", itemId: "plate-helmet",
  });
  expect(events).toEqual([{ type: "action-rejected", action: "pack", reason: "wrong-slot" }]);
});

test("pack: cannot plan more than the bank holds", () => {
  // one ration in bank, pack it, then try to pack a second
  const s1 = reduce(town([{ defId: "ration", qty: 1 }]), {
    type: "pack", slot: "food", itemId: "ration",
  }).state;
  const { events } = reduce(s1, { type: "pack", slot: "food", itemId: "ration" });
  expect(events).toEqual([{ type: "action-rejected", action: "pack", reason: "insufficient" }]);
});

test("pack: food merges into a stack up to STACK_CAP before opening a new slot", () => {
  const s = reduce(town([{ defId: "ration", qty: 5 }]), {
    type: "pack", slot: "food", itemId: "ration",
  }).state;
  const s2 = reduce(s, { type: "pack", slot: "food", itemId: "ration" }).state;
  expect(s2.loadout.food).toEqual([{ defId: "ration", qty: 2 }]); // one stack, qty 2
});

test("pack: rejects when a new food/potion stack would exceed backpack slots (bead note e)", () => {
  // leather backpack = 6 slots; fill all 6 with full ration stacks (STACK_CAP=10),
  // then packing a potion (new stack) must fail.
  let state = town([
    { defId: "leather", qty: 1 },
    { defId: "ration", qty: 60 },
    { defId: "potion", qty: 1 },
  ]);
  state = reduce(state, { type: "pack", slot: "backpack", itemId: "leather" }).state; // 6 slots
  for (let i = 0; i < 60; i++) {
    state = reduce(state, { type: "pack", slot: "food", itemId: "ration" }).state;
  }
  expect(state.loadout.food.length).toBe(6);
  const { events } = reduce(state, { type: "pack", slot: "potion", itemId: "potion" });
  expect(events).toEqual([{ type: "action-rejected", action: "pack", reason: "no-slot" }]);
});

test("pack: duplicate tool defId is rejected", () => {
  const s1 = reduce(town([{ defId: "pick", qty: 1 }]), {
    type: "pack", slot: "tool", itemId: "pick",
  }).state;
  const { events } = reduce(s1, { type: "pack", slot: "tool", itemId: "pick" });
  expect(events).toEqual([{ type: "action-rejected", action: "pack", reason: "already-packed" }]);
});

test("pack: rejected outside town", () => {
  const { events } = reduce({ ...town([{ defId: "sword", qty: 1 }]), phase: "expedition" }, {
    type: "pack", slot: "weapon", itemId: "sword",
  });
  expect(events).toEqual([{ type: "action-rejected", action: "pack", reason: "not-in-town" }]);
});

test("reserveLoadout: enumerates every defId the plan pulls from the bank", () => {
  const loadout = emptyLoadout();
  loadout.equipment.weapon = "iron-sword";
  loadout.equipment.tools = ["pick", "spyglass"];
  loadout.equipment.backpack = "leather";
  loadout.food = [{ defId: "ration", qty: 3 }];
  loadout.potions = [{ defId: "potion", qty: 2 }];
  expect(reserveLoadout(loadout)).toEqual([
    { defId: "iron-sword", qty: 1 },
    { defId: "pick", qty: 1 },
    { defId: "spyglass", qty: 1 },
    { defId: "leather", qty: 1 },
    { defId: "ration", qty: 3 },
    { defId: "potion", qty: 2 },
  ]);
});
