// Carry-slot accounting. Loot stacks hold STACK_CAP each; consumables and tools
// each occupy ONE slot per unit (Phase 2, pqp — no stacking for consumables).
import { BASE_CARRY_SLOTS, BACKPACK_SLOTS, STACK_CAP, TRANSPORT_CARRY, BEAST_TRANSPORTS, PANNIERS_SLOTS } from "../data/constants";
import type { ItemStack, Loadout, Equipment } from "./types";

// Inventory slots consumed by non-loot items (pqp): each food unit, each potion
// unit, and each tool is one slot. Loot (carry) stacks take the rest.
export function consumableSlots(loadout: Loadout): number {
  const units = (stacks: ItemStack[]) => stacks.reduce((n, s) => n + s.qty, 0);
  return (
    units(loadout.food) +
    units(loadout.potions) +
    units(loadout.battleItems ?? []) +
    loadout.equipment.tools.length
  );
}

// Free carry stacks for loot after consumables + tools take their slots (pqp):
// food/potions burn down over the run (food.digest), so this grows as you go.
// Single source for gather/fight (M3/M4) and pack (M5).
export function freeCarryStacks(loadout: Loadout): number {
  return carryCap(loadout.equipment) - consumableSlots(loadout);
}

// Backpack tier total. The backpack REPLACES the base (it IS your storage), it
// doesn't add to it. Transport/panniers layer ON TOP via carryCap (zhn).
export function slotCap(backpack: string | null): number {
  if (backpack === null) return BASE_CARRY_SLOTS;
  return BACKPACK_SLOTS[backpack] ?? BASE_CARRY_SLOTS;
}

// Total inventory capacity from all carry sources (zhn): backpack tier + a small
// transport bonus (bringing a beast/cart) + panniers (only with a beast). So a
// mule + panniers is a hauler; a horse is fast with a little extra room.
export function carryCap(equipment: Equipment): number {
  let cap = slotCap(equipment.backpack);
  if (equipment.transport !== null) cap += TRANSPORT_CARRY[equipment.transport] ?? 0;
  if (equipment.panniers !== null && equipment.transport !== null && BEAST_TRANSPORTS.includes(equipment.transport)) {
    cap += PANNIERS_SLOTS[equipment.panniers] ?? 0;
  }
  return cap;
}

// Pure: returns the new carry, or null if qty can't FULLY fit within
// maxStacks (gather is all-or-nothing). Merges into existing same-defId
// stacks first, then opens new stacks.
export function addToCarry(
  carry: ItemStack[],
  defId: string,
  qty: number,
  maxStacks: number,
): ItemStack[] | null {
  let remaining = qty;
  const next = carry.map((stack) => {
    if (stack.defId !== defId || stack.qty >= STACK_CAP || remaining === 0) {
      return stack;
    }
    const take = Math.min(STACK_CAP - stack.qty, remaining);
    remaining -= take;
    return { defId, qty: stack.qty + take };
  });
  while (remaining > 0) {
    const take = Math.min(STACK_CAP, remaining);
    next.push({ defId, qty: take });
    remaining -= take;
  }
  return next.length > maxStacks ? null : next;
}
