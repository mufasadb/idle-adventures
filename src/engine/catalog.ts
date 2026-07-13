// Item classification (M5): maps a defId to the loadout slot it belongs to, so
// `pack` can reject items in the wrong slot. Reads the code-side catalog only.
import { WEAPONS, ARMOUR, TOOL_CAPABILITY, TRANSPORT_MULTIPLIER, BACKPACK_SLOTS, FOOD, POTION, BATTLE_ITEM, PANNIERS, AMMO, ENHANCEMENT, ARROW_STACK_CAP } from "../data/constants";
import type { LoadoutSlot, Loadout, ItemStack } from "./types";

export function slotOf(defId: string): LoadoutSlot | null {
  if (defId in WEAPONS) return "weapon";
  if (defId in ARMOUR) return ARMOUR[defId]!.slot;
  if (defId in TOOL_CAPABILITY) return "tool";
  if (defId in TRANSPORT_MULTIPLIER) return "transport";
  if (defId in BACKPACK_SLOTS) return "backpack";
  if (PANNIERS.includes(defId)) return "panniers";
  // Consumable kinds derive their intrinsic slot from the registry's member
  // predicates (0ps). 'spares' is skipped: "spare" is a packing INTENT (any gear
  // defId), not an item's intrinsic slot — and every gear item already returned
  // above, so its isGear predicate would never fire here anyway.
  for (const key of CONSUMABLE_KEYS) {
    const kind = CONSUMABLE_KINDS[key];
    if (kind.slot === "spare") continue;
    if (kind.member(defId)) return kind.slot;
  }
  return null;
}

// Gear = anything worn/wielded (durable); consumables (food/potion/battle-item)
// are not. Drives the "spare" pack slot and per-piece carry stacking (82r).
const GEAR_SLOTS: readonly LoadoutSlot[] = ["weapon", "helmet", "chest", "legs", "boots", "gloves", "tool", "transport", "backpack", "panniers"];

export function isGear(defId: string): boolean {
  const slot = slotOf(defId);
  return slot !== null && GEAR_SLOTS.includes(slot);
}

// Consumable-kind registry (0ps): the single table describing every ItemStack[]
// list on Loadout, so a new consumable category (magic scrolls, reagents, …) is
// one Loadout field + one row here + one catalog list — instead of ~7 hand-copied
// plumbing sites (slot accounting, packing, banking). The action handlers
// (eat/quaff/use-item/enhance in reduce.ts) keep their bespoke consumption-order
// logic; this table unifies slot accounting / packing / banking ONLY.
//
// ConsumableKey is DERIVED from Loadout: any field whose type is ItemStack[]
// (optional or not). Adding such a field without a registry row is a COMPILE
// ERROR (the Record below becomes non-exhaustive) — that is the drift-killer, so
// do not weaken it to Record<string, …>.
export type ConsumableKey = {
  [K in keyof Loadout]-?: NonNullable<Loadout[K]> extends ItemStack[] ? K : never;
}[keyof Loadout];

export const CONSUMABLE_KINDS: Record<ConsumableKey, {
  slot: LoadoutSlot; // the LoadoutSlot name `pack` targets and slotOf returns
  member: (defId: string) => boolean; // does this defId belong to the kind?
  stackCapPerSlot: number; // units per carry slot (ammo stacks; everything else 1)
}> = {
  // Consumption order (documented, NOT enforced here — see the action handlers):
  food: { slot: "food", member: (d) => FOOD.includes(d), stackCapPerSlot: 1 }, // eaten from FRONT; fresh forage front-inserts (food.ts)
  potions: { slot: "potion", member: (d) => POTION.includes(d), stackCapPerSlot: 1 }, // quaffed FIFO
  battleItems: { slot: "battle-item", member: (d) => BATTLE_ITEM.includes(d), stackCapPerSlot: 1 }, // used mid-fight by use-item (90j)
  spares: { slot: "spare", member: isGear, stackCapPerSlot: 1 }, // any gear (82r); expanded into carry at embark, so [] during expeditions
  ammo: { slot: "ammo", member: (d) => AMMO.includes(d), stackCapPerSlot: ARROW_STACK_CAP }, // front stack FIFO (D45); the one deep-stacking kind
  enhancements: { slot: "enhancement", member: (d) => ENHANCEMENT.includes(d), stackCapPerSlot: 1 }, // applied by enhance (D60)
};

// Iteration order for the registry (stable; drives incidental bank/reserve order).
export const CONSUMABLE_KEYS = Object.keys(CONSUMABLE_KINDS) as ConsumableKey[];

// slot → Loadout key, for pack's incoming LoadoutSlot → which list to grow.
// No banksBack flag: every kind banks back today (bank.ts). Add one only when a
// kind that does NOT bank back shows up (YAGNI).
const KEY_BY_SLOT: Partial<Record<LoadoutSlot, ConsumableKey>> = Object.fromEntries(
  CONSUMABLE_KEYS.map((key) => [CONSUMABLE_KINDS[key].slot, key]),
);
export function consumableKeyForSlot(slot: LoadoutSlot): ConsumableKey | undefined {
  return KEY_BY_SLOT[slot];
}

export function validForSlot(slot: LoadoutSlot, defId: string): boolean {
  if (slot === "spare") return isGear(defId); // spares accept any gear defId (82r)
  return slotOf(defId) === slot;
}
