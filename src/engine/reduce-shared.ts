import type { GameState, Action, GameEvent, RejectionReason, Expedition } from "./types";
import type { Grid, Poi } from "./grid";
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
    target, // 7lr: auto-eat gets NO tent bonus — the tent's +50% lives only in the manual camp meal
  );
}

// Has the POI at `at` already been gathered / beaten this run?
export function isCleared(expedition: Expedition, at: { x: number; y: number }): boolean {
  return expedition.cleared.some((c) => c.x === at.x && c.y === at.y);
}

// The POI at `at` if there is one AND it isn't cleared yet — the "is something
// still there?" lookup shared by walk-in engage, fight, and ranged fight.
export function livePoiAt(grid: Grid, expedition: Expedition, at: { x: number; y: number }): Poi | undefined {
  const poi = grid.pois.find((p) => p.x === at.x && p.y === at.y);
  return poi && !isCleared(expedition, at) ? poi : undefined;
}
