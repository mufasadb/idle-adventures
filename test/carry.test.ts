import { test, expect } from "bun:test";
import { slotCap, addToCarry, freeCarryStacks } from "../src/engine/carry";
import { BASE_CARRY_SLOTS, BACKPACK_SLOTS, STACK_CAP } from "../src/data/constants";
import { emptyLoadout } from "../src/engine/loadout";

test("slotCap: no backpack gives base slots; backpack defines the cap", () => {
  expect(slotCap(null)).toBe(BASE_CARRY_SLOTS);
  expect(slotCap("starter")).toBe(BACKPACK_SLOTS.starter!);
  expect(slotCap("unknown-pack")).toBe(BASE_CARRY_SLOTS);
});

// Firm carry squeeze (2026-07-04 tiered-progression pass): the tuned tier ladder
// starter 3 < leather 5 < large-pack 7, and a tighter STACK_CAP so a real haul
// opens new slots and food-vs-loot is a live per-run call.
test("carry squeeze: backpack tiers 3/5/7 and STACK_CAP is firm", () => {
  expect(STACK_CAP).toBe(5);
  expect(slotCap("starter")).toBe(3);
  expect(slotCap("leather")).toBe(5);
  expect(slotCap("large-pack")).toBe(7);
});

test("addToCarry: new material starts a stack", () => {
  expect(addToCarry([], "iron-ore", 3, 2)).toEqual([{ defId: "iron-ore", qty: 3 }]);
});

test("addToCarry: merges into an existing stack without a new slot", () => {
  const carry = [{ defId: "iron-ore", qty: 1 }];
  const merged = 1 + (STACK_CAP - 1); // fill the partial stack up to the cap, still one slot
  expect(addToCarry(carry, "iron-ore", STACK_CAP - 1, 1)).toEqual([{ defId: "iron-ore", qty: merged }]);
  expect(carry).toEqual([{ defId: "iron-ore", qty: 1 }]); // pure — input untouched
});

test("addToCarry: overflow past STACK_CAP starts a new stack", () => {
  const carry = [{ defId: "iron-ore", qty: STACK_CAP - 1 }];
  expect(addToCarry(carry, "iron-ore", 3, 2)).toEqual([
    { defId: "iron-ore", qty: STACK_CAP },
    { defId: "iron-ore", qty: 2 },
  ]);
});

test("addToCarry: rejects when the result needs more than maxStacks", () => {
  expect(addToCarry([{ defId: "oak-log", qty: 2 }], "iron-ore", 3, 1)).toBeNull();
  const full = [{ defId: "iron-ore", qty: STACK_CAP }];
  expect(addToCarry(full, "iron-ore", 1, 1)).toBeNull(); // cap reached, needs slot 2
});

test("addToCarry: zero free stacks still allows a pure merge", () => {
  const carry = [{ defId: "iron-ore", qty: 2 }];
  expect(addToCarry(carry, "iron-ore", 3, 1)).toEqual([{ defId: "iron-ore", qty: 5 }]);
});

test("freeCarryStacks: subtracts D23 ballast from the backpack cap", () => {
  const loadout = emptyLoadout();
  expect(freeCarryStacks(loadout)).toBe(BASE_CARRY_SLOTS);
  loadout.equipment.backpack = "starter";
  loadout.food = [{ defId: "bread", qty: 3 }];
  loadout.potions = [{ defId: "healing-potion", qty: 2 }];
  expect(freeCarryStacks(loadout)).toBe(BACKPACK_SLOTS.starter! - 2);
});
