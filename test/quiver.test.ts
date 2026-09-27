// ke3.7.1 (D92) — the quiver: an equipment piece that holds ammo OUTSIDE general carry.
import { test, expect } from "bun:test";
import { emptyLoadout } from "../src/engine/loadout";
import { consumableSlots, usedSlots, freeLootStacks } from "../src/engine/carry";
import { slotOf } from "../src/engine/catalog";
import { ARROW_STACK_CAP, QUIVER_AMMO_CAP, RECIPE } from "../src/data/constants";
import type { ItemStack } from "../src/engine/types";

const withAmmo = (ammo: ItemStack[], quiver: string | null) => {
  const l = emptyLoadout();
  l.ammo = ammo;
  l.equipment.quiver = quiver;
  return l;
};

test("arrows stack 10 per slot (D92: was 20)", () => {
  expect(ARROW_STACK_CAP).toBe(10);
  expect(consumableSlots(withAmmo([{ defId: "arrows", qty: 25 }], null))).toBe(3);
});

test("a quiver carries QUIVER_AMMO_CAP ammo free of carry; overflow spills into slots", () => {
  expect(QUIVER_AMMO_CAP.quiver).toBe(100);
  expect(consumableSlots(withAmmo([{ defId: "arrows", qty: 100 }], "quiver"))).toBe(0);
  expect(consumableSlots(withAmmo([{ defId: "arrows", qty: 120 }], "quiver"))).toBe(2);
  // any ammo kind shares the pool
  expect(consumableSlots(withAmmo([{ defId: "arrows", qty: 50 }, { defId: "blow-dart", qty: 50 }], "quiver"))).toBe(0);
});

test("F2 guard: a quiver never adds general (non-ammo) capacity", () => {
  const bare = emptyLoadout();
  bare.food = [{ defId: "ration", qty: 3 }];
  bare.equipment.tools = ["pick"];
  const carry: ItemStack[] = [{ defId: "iron-ore", qty: 5 }, { defId: "oak-log", qty: 2 }];
  const quivered = { ...bare, equipment: { ...bare.equipment, quiver: "quiver" } };
  expect(usedSlots(quivered, carry)).toBe(usedSlots(bare, carry));
  expect(freeLootStacks(quivered)).toBe(freeLootStacks(bare));
});

test("the quiver is its own equipment slot, forged at the anvil", () => {
  expect(slotOf("quiver")).toBe("quiver");
  expect(RECIPE.quiver!.requires?.station).toBe("anvil");
});
