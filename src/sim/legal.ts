// Legal-action introspection (M6, D29). Split by phase to mirror the UX: town
// reads your bank, the expedition reads the map + what you carried in. Both build
// phase-appropriate CANDIDATE actions, then keep only those reduce accepts — one
// source of truth for legality, so this can never drift from the reducer (and
// future terrain-gating gear is reflected for free).
import type { Action, GameState } from "../engine/types";
import { reduce } from "../engine/reduce";
import { RECIPE } from "../data/constants";
import { slotOf } from "../engine/catalog";
import { candidateMaps } from "../engine/town";

// An action is legal iff reducing it emits no rejection. reduce is pure + cheap.
function accepts(state: GameState, action: Action): boolean {
  return reduce(state, action).events.every((e) => e.type !== "action-rejected");
}

export function townActions(state: GameState): Action[] {
  if (state.phase !== "town") return [];
  const candidates: Action[] = [];
  // craft: every recipe (reduce filters the unaffordable ones)
  for (const recipeId of Object.keys(RECIPE)) {
    candidates.push({ type: "craft", recipeId });
  }
  // pack: every bank item into the slot its defId belongs to
  for (const stack of state.bank) {
    const slot = slotOf(stack.defId);
    if (slot !== null) candidates.push({ type: "pack", slot, itemId: stack.defId });
  }
  // embark: each candidate map the town is offering (rotates with state.runs)
  for (const map of candidateMaps(state.seed, state.runs ?? 0)) {
    candidates.push({ type: "embark", mapSeed: map.mapSeed });
  }
  // pocket each offered map you don't already hold; embark each held map (xzx)
  const held = new Set((state.maps ?? []).map((m) => m.mapSeed));
  for (const map of candidateMaps(state.seed, state.runs ?? 0)) {
    if (!held.has(map.mapSeed)) candidates.push({ type: "pocket-map", mapSeed: map.mapSeed });
  }
  for (const m of state.maps ?? []) candidates.push({ type: "embark", mapSeed: m.mapSeed });
  return candidates.filter((a) => accepts(state, a));
}

export function expeditionActions(state: GameState): Action[] {
  if (state.phase !== "expedition" || !state.expedition) return [];
  const { pos, carry } = state.expedition;
  const candidates: Action[] = [];
  // move: the 8 neighbouring tiles as step targets (reduce filters
  // out-of-bounds / impassable / exhausted)
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      candidates.push({ type: "move", to: { x: pos.x + dx, y: pos.y + dy } });
    }
  }
  // tile-contextual actions
  candidates.push({ type: "gather" });
  candidates.push({ type: "fight" });
  // stamina (dtv): eat when there's food + room; toggle the auto-eat any time
  candidates.push({ type: "eat" });
  candidates.push({ type: "toggle-auto-eat" });
  // drop each carried stack
  for (const stack of carry) candidates.push({ type: "drop", itemId: stack.defId });
  // drop each carried map (8ec)
  for (const m of state.expedition.carriedMaps ?? []) candidates.push({ type: "drop-map", mapSeed: m.mapSeed });
  // return is always legal — a 0-energy run is never a dead end (bead note a)
  candidates.push({ type: "return" });
  return candidates.filter((a) => accepts(state, a));
}

export function legalActions(state: GameState): Action[] {
  return state.phase === "town" ? townActions(state) : expeditionActions(state);
}
