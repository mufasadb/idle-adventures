import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { reserveLoadout } from "../src/engine/pack";
import { slotCap } from "../src/engine/carry";
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

test("pack: food representation merges by defId (but each unit is one slot, pqp)", () => {
  const s = reduce(town([{ defId: "ration", qty: 5 }]), {
    type: "pack", slot: "food", itemId: "ration",
  }).state;
  const s2 = reduce(s, { type: "pack", slot: "food", itemId: "ration" }).state;
  expect(s2.loadout.food).toEqual([{ defId: "ration", qty: 2 }]); // merged entry, 2 units = 2 slots
});

test("pack: consumables take one slot per unit — filling the pack rejects the next (pqp)", () => {
  // Each ration is ONE slot now (no stacking). Fill every leather slot with
  // rations, then packing a potion must fail. Lever-driven so it never churns.
  const slots = slotCap("leather"); // total inventory slots the leather pack holds
  let state = town([
    { defId: "leather", qty: 1 },
    { defId: "ration", qty: slots },
    { defId: "potion", qty: 1 },
  ]);
  state = reduce(state, { type: "pack", slot: "backpack", itemId: "leather" }).state;
  for (let i = 0; i < slots; i++) {
    state = reduce(state, { type: "pack", slot: "food", itemId: "ration" }).state;
  }
  const foodUnits = state.loadout.food.reduce((n, s) => n + s.qty, 0);
  expect(foodUnits).toBe(slots); // all slots consumed by food units
  const { events } = reduce(state, { type: "pack", slot: "potion", itemId: "potion" });
  expect(events).toEqual([{ type: "action-rejected", action: "pack", reason: "no-slot" }]);
});

test("pack: a battle item packs into its slot and counts as a consumable (bzd)", () => {
  const s1 = reduce(town([{ defId: "elixir-of-power", qty: 2 }]), {
    type: "pack", slot: "battle-item", itemId: "elixir-of-power",
  }).state;
  expect(s1.loadout.battleItems).toEqual([{ defId: "elixir-of-power", qty: 1 }]);
  expect(reserveLoadout(s1.loadout)).toContainEqual({ defId: "elixir-of-power", qty: 1 });
  // packing to the wrong slot is rejected (it's a battle-item, not a potion)
  const { events } = reduce(town([{ defId: "elixir-of-power", qty: 1 }]), {
    type: "pack", slot: "potion", itemId: "elixir-of-power",
  });
  expect(events).toEqual([{ type: "action-rejected", action: "pack", reason: "wrong-slot" }]);
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
