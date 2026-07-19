import type { GameState, Action, GameEvent, RejectionReason, Expedition } from "./types";
import { eatToRefill } from "./food";
import { MAX_ENERGY } from "../data/constants";

// A rejected action returns the ORIGINAL state plus an `action-rejected` event
// (the reducer contract). Shared by every handler module.
export function rejected(
  state: GameState,
  action: Action["type"],
  reason: RejectionReason,
): { state: GameState; events: GameEvent[] } {
  return { state, events: [{ type: "action-rejected", action, reason }] };
}

// Drain-then-refill helper for move/gather: given the post-spend current energy,
// eat waste-free from the DESIGNATED auto-eat food if one is set (mco). Returns the
// food reserve + new current energy. No designation (autoEatFood absent) = off, no eat.
// maxEnergy defaults via the optional-field guard.
export function autoRefill(
  expedition: Expedition,
  energy: number,
): { food: Expedition["loadout"]["food"]; energy: number } {
  const target = expedition.autoEatFood;
  if (!target) return { food: expedition.loadout.food, energy };
  return eatToRefill(
    expedition.loadout.food,
    energy,
    expedition.maxEnergy ?? MAX_ENERGY,
    target,
    1, // 7lr: auto-eat gets NO tent bonus — the tent's +50% now lives only in the manual camp meal
  );
}
