// Legal-action introspection (M6, D29). Split by phase to mirror the UX: town
// reads your bank, the expedition reads the map + what you carried in. Both build
// phase-appropriate CANDIDATE actions, then keep only those reduce accepts — one
// source of truth for legality, so this can never drift from the reducer (and
// future terrain-gating gear is reflected for free).
import type { Action, GameState } from "../engine/types";
import { reduce } from "../engine/reduce";
import { RECIPE, INKS } from "../data/constants";
import { slotOf, isGear } from "../engine/catalog";
import { candidateMaps } from "../engine/town";
import { expeditionGrid } from "../engine/grid";
import { perceive } from "../engine/perceive";

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
  // pack: every bank item into the slot its defId belongs to; gear can also
  // pack as a SPARE into a carry slot (82r)
  for (const stack of state.bank) {
    const slot = slotOf(stack.defId);
    if (slot !== null) candidates.push({ type: "pack", slot, itemId: stack.defId });
    if (isGear(stack.defId)) candidates.push({ type: "pack", slot: "spare", itemId: stack.defId });
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
  // ink (cxq): each held map × each ink defId you hold; reduce filters the rest (D29)
  const inkIds = state.bank.filter((s) => s.defId in INKS).map((s) => s.defId);
  for (const m of state.maps ?? []) for (const inkId of inkIds) candidates.push({ type: "ink", mapSeed: m.mapSeed, inkId });
  return candidates.filter((a) => accepts(state, a));
}

export function expeditionActions(state: GameState): Action[] {
  if (state.phase !== "expedition" || !state.expedition) return [];
  const { pos, carry } = state.expedition;
  const candidates: Action[] = [];
  // move: the 8 neighbouring tiles as step targets (reduce filters
  // out-of-bounds / impassable / exhausted). Un-engaged, each neighbour is also
  // a `fight at` candidate — ranged engage (D45); reduce filters non-monster /
  // no-bow / no-ammo per D29.
  const engaged = state.expedition.combat !== undefined;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      candidates.push({ type: "move", to: { x: pos.x + dx, y: pos.y + dy } });
      if (!engaged) candidates.push({ type: "fight", at: { x: pos.x + dx, y: pos.y + dy } });
    }
  }
  // tile-contextual actions
  candidates.push({ type: "gather" });
  candidates.push({ type: "fight" });
  candidates.push({ type: "flee" });
  candidates.push({ type: "quaff" });
  candidates.push({ type: "toggle-auto-quaff" });
  // use-item (90j): each held battle item; reduce keeps it only while engaged (D29)
  for (const stack of state.expedition.loadout.battleItems ?? []) candidates.push({ type: "use-item", itemId: stack.defId });
  // enhance (D60): each held weapon enhancement; usable engaged or not (reduce filters, D29)
  for (const stack of state.expedition.loadout.enhancements ?? []) candidates.push({ type: "enhance", id: stack.defId });
  // survey (54f): each POI whose detail is NOT yet resolved from here; reduce
  // filters missing-tool / exhausted / already-resolved (D29)
  const grid = expeditionGrid(state.expedition);
  for (const p of perceive(grid, pos, state.expedition.loadout.equipment.tools, state.expedition.surveyed ?? [])) {
    if (p.detail === null) candidates.push({ type: "survey", at: { x: p.x, y: p.y } });
  }
  // field craft (ke3.4): every recipe as a craft candidate; reduce filters
  // non-field / missing-tool / not-near-terrain / insufficient / exhausted (D29)
  if (!engaged) for (const recipeId of Object.keys(RECIPE)) candidates.push({ type: "craft", recipeId });
  // stamina (dtv/mco): eat when there's food + room; designate the auto-eat food.
  // One set-auto-eat-food per held food defId (designate it), plus null (clear/off).
  candidates.push({ type: "eat" });
  const foodDefs = new Set(state.expedition.loadout.food.map((s) => s.defId));
  for (const defId of foodDefs) candidates.push({ type: "set-auto-eat-food", defId });
  candidates.push({ type: "set-auto-eat-food", defId: null });
  // drop each carried stack
  for (const stack of carry) candidates.push({ type: "drop", itemId: stack.defId });
  // don each carried gear piece; doff each worn piece + tool (82r) — reduce
  // filters engaged / exhausted / capacity, per D29
  for (const stack of carry) {
    if (isGear(stack.defId)) candidates.push({ type: "don", itemId: stack.defId });
  }
  const worn = state.expedition.loadout.equipment;
  for (const piece of [worn.weapon, worn.helmet, worn.chest, worn.legs, worn.boots, worn.gloves, worn.transport, worn.backpack, worn.panniers]) {
    if (piece !== null) candidates.push({ type: "doff", itemId: piece });
  }
  for (const tool of worn.tools) candidates.push({ type: "doff", itemId: tool });
  // drop each carried map (8ec)
  for (const m of state.expedition.carriedMaps ?? []) candidates.push({ type: "drop-map", mapSeed: m.mapSeed });
  // return is always legal when un-engaged — a 0-energy run is never a dead end
  // (bead note a). While engaged, reduce rejects return; flee is the always-
  // available out instead (D43) — accepts() below filters return out for us.
  candidates.push({ type: "return" });
  return candidates.filter((a) => accepts(state, a));
}

export function legalActions(state: GameState): Action[] {
  return state.phase === "town" ? townActions(state) : expeditionActions(state);
}
