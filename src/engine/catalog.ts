// Item classification (M5): maps a defId to the loadout slot it belongs to, so
// `pack` can reject items in the wrong slot. Reads the code-side catalog only.
import { WEAPONS, ARMOUR, TOOL_CAPABILITY, TRANSPORT_MULTIPLIER, BACKPACK_SLOTS, FOOD, POTION, BATTLE_ITEM, PANNIERS, AMMO } from "../data/constants";
import type { LoadoutSlot } from "./types";

export function slotOf(defId: string): LoadoutSlot | null {
  if (defId in WEAPONS) return "weapon";
  if (defId in ARMOUR) return ARMOUR[defId]!.slot;
  if (defId in TOOL_CAPABILITY) return "tool";
  if (defId in TRANSPORT_MULTIPLIER) return "transport";
  if (defId in BACKPACK_SLOTS) return "backpack";
  if (PANNIERS.includes(defId)) return "panniers";
  if (FOOD.includes(defId)) return "food";
  if (POTION.includes(defId)) return "potion";
  if (BATTLE_ITEM.includes(defId)) return "battle-item";
  if (AMMO.includes(defId)) return "ammo"; // arrows (D45)
  return null;
}

// Gear = anything worn/wielded (durable); consumables (food/potion/battle-item)
// are not. Drives the "spare" pack slot and per-piece carry stacking (82r).
const GEAR_SLOTS: readonly LoadoutSlot[] = ["weapon", "helmet", "chest", "legs", "boots", "gloves", "tool", "transport", "backpack", "panniers"];

export function isGear(defId: string): boolean {
  const slot = slotOf(defId);
  return slot !== null && GEAR_SLOTS.includes(slot);
}

export function validForSlot(slot: LoadoutSlot, defId: string): boolean {
  if (slot === "spare") return isGear(defId); // spares accept any gear defId (82r)
  return slotOf(defId) === slot;
}
