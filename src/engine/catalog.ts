// Item classification (M5): maps a defId to the loadout slot it belongs to, so
// `pack` can reject items in the wrong slot. Reads the code-side catalog only.
import { WEAPONS, ARMOUR, TOOL_CAPABILITY, TRANSPORT_MULTIPLIER, BACKPACK_SLOTS, FOOD, POTION, BATTLE_ITEM } from "../data/constants";
import type { LoadoutSlot } from "./types";

export function slotOf(defId: string): LoadoutSlot | null {
  if (defId in WEAPONS) return "weapon";
  if (defId in ARMOUR) return ARMOUR[defId]!.slot;
  if (defId in TOOL_CAPABILITY) return "tool";
  if (defId in TRANSPORT_MULTIPLIER) return "transport";
  if (defId in BACKPACK_SLOTS) return "backpack";
  if (FOOD.includes(defId)) return "food";
  if (POTION.includes(defId)) return "potion";
  if (BATTLE_ITEM.includes(defId)) return "battle-item";
  return null;
}

export function validForSlot(slot: LoadoutSlot, defId: string): boolean {
  return slotOf(defId) === slot;
}
