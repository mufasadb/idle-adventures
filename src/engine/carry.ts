// Carry-slot accounting. Loot stacks hold STACK_CAP each; consumables and tools
// each occupy ONE slot per unit (Phase 2, pqp — no stacking for consumables).
import { BASE_CARRY_SLOTS, BACKPACK_SLOTS, STACK_CAP, TRANSPORT_CARRY, BEAST_TRANSPORTS, PANNIERS_SLOTS, AMMO, ARROW_STACK_CAP } from "../data/constants";
import { isGear } from "./catalog";
import type { ItemStack, Loadout, Equipment } from "./types";

// Gear takes one slot PER PIECE in carry (82r) — consistent with tools costing a
// slot each in the loadout — so a spare sword is a real slot commitment. Loot
// keeps stacking to STACK_CAP. Ammo (D45) stacks deep — ARROW_STACK_CAP per slot,
// so a slot of arrows ≈ 20 shots.
export function stackCapOf(defId: string): number {
  if (AMMO.includes(defId)) return ARROW_STACK_CAP;
  return isGear(defId) ? 1 : STACK_CAP;
}

// Inventory slots consumed by non-loot items (pqp): each food unit, each potion
// unit, and each tool is one slot. Ammo (D45) is the exception: it stacks, so it
// costs ceil(units/ARROW_STACK_CAP) slots. Loot (carry) stacks take the rest.
export function consumableSlots(loadout: Loadout): number {
  const units = (stacks: ItemStack[]) => stacks.reduce((n, s) => n + s.qty, 0);
  return (
    units(loadout.food) +
    units(loadout.potions) +
    units(loadout.battleItems ?? []) +
    units(loadout.spares ?? []) + // spare gear (82r): 1 slot per piece, town-side; expanded into carry at embark
    (loadout.ammo ?? []).reduce((n, s) => n + Math.ceil(s.qty / stackCapOf(s.defId)), 0) + // ammo (D45): stacked slots
    loadout.equipment.tools.length
  );
}

// Free carry stacks for loot after consumables + tools take their slots (pqp):
// food is eaten to refill stamina over the run (food.eatToRefill, dtv), so this grows as you go.
// Single source for gather/fight (M3/M4) and pack (M5).
export function freeCarryStacks(loadout: Loadout): number {
  return carryCap(loadout.equipment) - consumableSlots(loadout);
}

// Loot capacity after carried maps take their slots (8ec): each carried map
// costs one slot for the run. Gather + fightAt size their stack budget here.
export function freeLootStacks(loadout: Loadout, carriedMaps: { mapSeed: string }[] | undefined): number {
  return freeCarryStacks(loadout) - (carriedMaps ?? []).length;
}

// Whole-bag occupancy (e3j): consumable units + loot stacks + carried maps.
// Fresh forage lands in loadout.food (not carry), so gather's fit check for
// food yields must count every slot source, not just loot stacks.
export function usedSlots(
  loadout: Loadout,
  carry: ItemStack[],
  carriedMaps: { mapSeed: string }[] | undefined,
): number {
  return consumableSlots(loadout) + carry.length + (carriedMaps ?? []).length;
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
  const cap = stackCapOf(defId);
  let remaining = qty;
  const next = carry.map((stack) => {
    if (stack.defId !== defId || stack.qty >= cap || remaining === 0) {
      return stack;
    }
    const take = Math.min(cap - stack.qty, remaining);
    remaining -= take;
    return { defId, qty: stack.qty + take };
  });
  while (remaining > 0) {
    const take = Math.min(cap, remaining);
    next.push({ defId, qty: take });
    remaining -= take;
  }
  return next.length > maxStacks ? null : next;
}

// Field crafting (ke3.4): consume recipe inputs from the EXPEDITION inventory —
// carry materials first, then loadout.food for any remainder (a recipe may list a
// food item). Returns the debited {food, carry}, or null if the combined pool is
// short. Multi-stack safe; pure (clones before mutating). The bank isn't reachable
// in the field, so it's deliberately not consulted here.
export function consumeExpeditionInputs(
  food: ItemStack[],
  carry: ItemStack[],
  inputs: { defId: string; qty: number }[],
): { food: ItemStack[]; carry: ItemStack[] } | null {
  const f = food.map((s) => ({ ...s }));
  const c = carry.map((s) => ({ ...s }));
  for (const need of inputs) {
    let remaining = need.qty;
    for (const s of c) {
      if (s.defId !== need.defId || remaining === 0) continue;
      const take = Math.min(s.qty, remaining);
      s.qty -= take;
      remaining -= take;
    }
    for (const s of f) {
      if (s.defId !== need.defId || remaining === 0) continue;
      const take = Math.min(s.qty, remaining);
      s.qty -= take;
      remaining -= take;
    }
    if (remaining > 0) return null;
  }
  return { food: f.filter((s) => s.qty > 0), carry: c.filter((s) => s.qty > 0) };
}
