// Carry-slot accounting (M3). A slot holds ONE stack; STACK_CAP bounds qty
// per stack. D23: callers count packed food/potion stacks against the cap.
import { BASE_CARRY_SLOTS, BACKPACK_SLOTS, STACK_CAP } from "../data/constants";
import type { ItemStack, Loadout } from "./types";

// Free carry stacks after D23 ballast: packed food/potion stacks occupy the
// same slots as loot. Single source for gather/fight (M3/M4) and pack (M5).
export function freeCarryStacks(loadout: Loadout): number {
  return (
    slotCap(loadout.equipment.backpack) -
    loadout.food.length -
    loadout.potions.length
  );
}

// Total carry stacks available. The backpack REPLACES the base (it IS your
// storage), it doesn't add to it.
export function slotCap(backpack: string | null): number {
  if (backpack === null) return BASE_CARRY_SLOTS;
  return BACKPACK_SLOTS[backpack] ?? BASE_CARRY_SLOTS;
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
