// Run-end banking (D26): carry + durable loadout (equipment, tools,
// transport, backpack) + unspent potions go home; food does NOT — it was
// converted to energy at embark and its stacks were pure ballast (D23).
// Used by fight's soft-fail (M4) and return (M5).
import type { GameState, Expedition, ItemStack } from "./types";
import { emptyLoadout } from "./loadout";

export function bankStacks(bank: ItemStack[], stacks: ItemStack[]): ItemStack[] {
  const next = bank.map((s) => ({ ...s }));
  for (const stack of stacks) {
    const existing = next.find((s) => s.defId === stack.defId);
    if (existing) existing.qty += stack.qty;
    else next.push({ ...stack });
  }
  return next;
}

// Inverse of bankStacks: remove `stacks` from `bank`, or return null if any
// required defId is short. Emptied stacks are dropped. Used by craft + embark (D28).
export function subtractStacks(bank: ItemStack[], stacks: ItemStack[]): ItemStack[] | null {
  const next = bank.map((s) => ({ ...s }));
  for (const need of stacks) {
    const existing = next.find((s) => s.defId === need.defId);
    if (!existing || existing.qty < need.qty) return null;
    existing.qty -= need.qty;
  }
  return next.filter((s) => s.qty > 0);
}

export function endExpedition(state: GameState, expedition: Expedition): GameState {
  const { equipment } = expedition.loadout;
  const durables: ItemStack[] = [];
  for (const piece of [
    equipment.weapon,
    equipment.helmet,
    equipment.chest,
    equipment.legs,
    equipment.boots,
    equipment.gloves,
  ]) {
    if (piece !== null) durables.push({ defId: piece, qty: 1 });
  }
  for (const tool of equipment.tools) durables.push({ defId: tool, qty: 1 });
  if (equipment.transport !== null) durables.push({ defId: equipment.transport, qty: 1 });
  if (equipment.backpack !== null) durables.push({ defId: equipment.backpack, qty: 1 });
  return {
    ...state,
    phase: "town",
    bank: bankStacks(state.bank, [
      ...expedition.carry,
      ...durables,
      ...expedition.loadout.potions,
    ]),
    loadout: emptyLoadout(),
    expedition: null,
    runs: (state.runs ?? 0) + 1, // advance the town's map offer for the next visit
  };
}
