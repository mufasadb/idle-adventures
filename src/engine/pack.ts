// Town-side loadout planning (M5, D28). `pack` edits a PLAN on GameState.loadout
// without touching the bank; the plan is validated against `bank − reservations`
// so it never exceeds holdings. The bank is only debited at embark. There is no
// unpack action — reduce a mis-planned consumable by embarking and re-planning.
import type { ItemStack, Loadout, LoadoutSlot } from "./types";
import { validForSlot } from "./catalog";
import { carryCap, consumableSlots } from "./carry";

// Add one unit of a consumable, merging into an existing same-defId stack
// (representation stays merged; slots are counted per-unit by consumableSlots).
function addConsumable(list: ItemStack[], defId: string): ItemStack[] {
  const idx = list.findIndex((s) => s.defId === defId);
  if (idx === -1) return [...list, { defId, qty: 1 }];
  return list.map((s, i) => (i === idx ? { defId, qty: s.qty + 1 } : s));
}

// Single-occupancy equipment slots keyed exactly by LoadoutSlot name.
// Exported for don/doff (82r), which swaps the same slots mid-run.
export const EQUIP_SLOTS = ["weapon", "helmet", "chest", "legs", "boots", "gloves", "transport", "backpack", "panniers"] as const;
export type EquipSlot = (typeof EQUIP_SLOTS)[number];

// Every defId the plan reserves from the bank (each equipment piece ×1, each
// tool ×1, transport, backpack, plus food/potion stack quantities). This is the
// exact set embark debits (D28) and mirrors what endExpedition banks back (D26,
// minus food).
export function reserveLoadout(loadout: Loadout): ItemStack[] {
  const { equipment, food, potions } = loadout;
  const out: ItemStack[] = [];
  for (const piece of [equipment.weapon, equipment.helmet, equipment.chest, equipment.legs, equipment.boots, equipment.gloves]) {
    if (piece !== null) out.push({ defId: piece, qty: 1 });
  }
  for (const tool of equipment.tools) out.push({ defId: tool, qty: 1 });
  if (equipment.transport !== null) out.push({ defId: equipment.transport, qty: 1 });
  if (equipment.backpack !== null) out.push({ defId: equipment.backpack, qty: 1 });
  if (equipment.panniers !== null) out.push({ defId: equipment.panniers, qty: 1 });
  for (const stack of food) out.push({ defId: stack.defId, qty: stack.qty });
  for (const stack of potions) out.push({ defId: stack.defId, qty: stack.qty });
  for (const stack of loadout.battleItems ?? []) out.push({ defId: stack.defId, qty: stack.qty });
  for (const stack of loadout.spares ?? []) out.push({ defId: stack.defId, qty: stack.qty }); // spare gear (82r)
  for (const stack of loadout.ammo ?? []) out.push({ defId: stack.defId, qty: stack.qty }); // arrows (D45)
  return out;
}

function reservedQty(loadout: Loadout, defId: string): number {
  return reserveLoadout(loadout)
    .filter((s) => s.defId === defId)
    .reduce((sum, s) => sum + s.qty, 0);
}

function bankQty(bank: ItemStack[], defId: string): number {
  return bank.find((s) => s.defId === defId)?.qty ?? 0;
}

export function packItem(
  loadout: Loadout,
  bank: ItemStack[],
  slot: LoadoutSlot,
  itemId: string,
):
  | { ok: true; loadout: Loadout }
  | { ok: false; reason: "wrong-slot" | "insufficient" | "already-packed" | "no-slot" } {
  if (!validForSlot(slot, itemId)) return { ok: false, reason: "wrong-slot" };

  // Equipment: overwrite the slot. Affordability is checked against the CANDIDATE
  // loadout, so replacing frees the old occupant's reservation.
  if ((EQUIP_SLOTS as readonly string[]).includes(slot)) {
    const equipment = { ...loadout.equipment, [slot as EquipSlot]: itemId };
    const candidate: Loadout = { ...loadout, equipment };
    if (reservedQty(candidate, itemId) > bankQty(bank, itemId)) {
      return { ok: false, reason: "insufficient" };
    }
    return { ok: true, loadout: candidate };
  }

  // Tools now cost an inventory slot each (pqp): pick + axe + knife + spyglass
  // can't all come along with a full food supply — a mining run and a boss run
  // become different loadouts.
  const cap = carryCap(loadout.equipment);
  if (slot === "tool") {
    if (loadout.equipment.tools.includes(itemId)) return { ok: false, reason: "already-packed" };
    const equipment = { ...loadout.equipment, tools: [...loadout.equipment.tools, itemId] };
    const candidate: Loadout = { ...loadout, equipment };
    if (consumableSlots(candidate) > cap) return { ok: false, reason: "no-slot" };
    if (reservedQty(candidate, itemId) > bankQty(bank, itemId)) {
      return { ok: false, reason: "insufficient" };
    }
    return { ok: true, loadout: candidate };
  }

  // food / potion / battle-item / spare gear: one unit = one slot, no stacking
  // (pqp; spares 82r). Packing 5 rations takes 5 slots — the visible, live
  // food-vs-loot commitment; a spare sword competes with those same slots.
  // Ammo (D45) packs the same way but consumableSlots counts it as
  // ceil(units/ARROW_STACK_CAP) — the one deep-stacking consumable.
  const candidate: Loadout =
    slot === "food"
      ? { ...loadout, food: addConsumable(loadout.food, itemId) }
      : slot === "potion"
        ? { ...loadout, potions: addConsumable(loadout.potions, itemId) }
        : slot === "spare"
          ? { ...loadout, spares: addConsumable(loadout.spares ?? [], itemId) }
          : slot === "ammo"
            ? { ...loadout, ammo: addConsumable(loadout.ammo ?? [], itemId) }
            : { ...loadout, battleItems: addConsumable(loadout.battleItems, itemId) };
  if (consumableSlots(candidate) > cap) return { ok: false, reason: "no-slot" };
  if (reservedQty(candidate, itemId) > bankQty(bank, itemId)) {
    return { ok: false, reason: "insufficient" };
  }
  return { ok: true, loadout: candidate };
}
