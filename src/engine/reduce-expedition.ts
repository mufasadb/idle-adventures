import type { GameState, Action, GameEvent, ItemStack, LoadoutSlot, Expedition, Loadout } from "./types";
import { expeditionGrid, fishWaterOf } from "./grid";
import { rand } from "./rng";
import { stepToward, moveCost, isDiagonalStep, terrainHpCost } from "./move";
import { addToCarry, freeLootStacks, usedSlots, carryCap, consumeExpeditionInputs, consumeOne } from "./carry";
import { toolSpeedFor, gatherCost, gateSatisfied, secondaryToolSatisfied } from "./tools";
import { foodEnergyOf } from "./food";
import { endExpedition } from "./bank";
import { pickReturnFlavor } from "./flavor";
import { recipeOutputQty } from "./craft";
import { EQUIP_SLOTS } from "./pack";
import type { EquipSlot } from "./pack";
import { slotOf, isGear } from "./catalog";
import { MAX_ENERGY, MAP_WIDTH, MAP_HEIGHT, NODE_TOOL, GATHER_YIELD, NODE_MAGNITUDE_YIELD, FOOD, POTION, TENT_FOOD_MULTIPLIER, TENT_CAMP_MEALS, DON_DOFF_ENERGY, SURVEY_ENERGY, FIELD_CRAFT_ENERGY, TOOL_CAPABILITY, RECIPE, FISH_CAST_ENERGY, CATCH_EFFECT, LOCKBOX_LOOT, TERRAIN_HP_FLOOR } from "../data/constants";
import type { GatherableNodeType } from "../data/constants";
import { visionRadius } from "./perceive";
import { rejected, autoRefill, livePoiAt, isCleared } from "./reduce-shared";
import { engage, maybeAutoFinish, provokeTurn, pendingLootFits, mintMap, withPoison } from "./reduce-combat";
import { poisonTick } from "./combat";

export function move(
  state: GameState,
  to: { x: number; y: number },
): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) {
    return rejected(state, "move", "not-on-expedition");
  }
  if (expedition.combat) return rejected(state, "move", "engaged");
  const from = expedition.pos;
  const step = stepToward(from, to);
  if (step.x === from.x && step.y === from.y) {
    return rejected(state, "move", "no-step");
  }
  if (step.x < 0 || step.x >= MAP_WIDTH || step.y < 0 || step.y >= MAP_HEIGHT) {
    return rejected(state, "move", "out-of-bounds");
  }
  const grid = expeditionGrid(expedition);
  // Walking INTO a live monster is a fight, not a step (2026-07-05): monsters
  // block their tile until beaten, so pathing through one is a real choice
  // (fight it, or route around). No energy cost — combat spends HP, not energy.
  const poiAtStep = livePoiAt(grid, expedition, step);
  if (poiAtStep && poiAtStep.kind === "monster" && poiAtStep.creature !== null) {
    return maybeAutoFinish(engage(state, expedition, step, poiAtStep.creature, "move", true), expedition); // 67e: auto-finish resolves a walked-into fight
  }
  const terrain = grid.terrain[step.y]![step.x]!;
  const cost = moveCost(terrain, expedition.loadout.equipment.transport, expedition.loadout.equipment.tools, isDiagonalStep(from, step)); // l2w: diagonal steps cost √2×
  if (!Number.isFinite(cost)) return rejected(state, "move", "impassable");
  if (cost > expedition.energy) return rejected(state, "move", "exhausted");
  const fed = autoRefill(expedition, expedition.energy - cost); // drain, then waste-free auto-eat (dtv)
  // si7.6.9.4: a hazardous terrain (spore-thicket) costs HP unless a ward tool is carried.
  const hazard = terrainHpCost(terrain, expedition.loadout.equipment.tools);
  const afterHazard = Math.max(Math.min(expedition.hp, TERRAIN_HP_FLOOR), expedition.hp - hazard);
  // si7.6.9.2: your poison ticks once per step (never below PLAYER_POISON_FLOOR).
  const tick = expedition.poisoned ? poisonTick(afterHazard, expedition.poisoned) : undefined;
  const hp = tick?.hp ?? afterHazard;
  const stepped = { ...withPoison(expedition, tick?.after ?? (tick ? undefined : expedition.poisoned)), pos: step, energy: fed.energy, hp, loadout: { ...expedition.loadout, food: fed.food } };
  return {
    state: { ...state, expedition: stepped },
    events: [{ type: "moved", from, to: step, terrain, cost, energy: fed.energy,
      ...(expedition.hp - afterHazard > 0 ? { hazardTaken: expedition.hp - afterHazard } : {}),
      ...(tick && tick.taken > 0 ? { poisonTaken: tick.taken } : {}),
      ...(hp !== expedition.hp ? { hp } : {}) }],
  };
}

// Units one gather of this node kind + magnitude yields — single source for the
// reducer and the web route preview (seyh.6). Tool speed changes cost, not yield.
export function gatherYield(kind: GatherableNodeType, magnitude: number | null | undefined): number {
  return GATHER_YIELD[kind] * (NODE_MAGNITUDE_YIELD[magnitude ?? 1] ?? 1);
}

export function gather(state: GameState): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) {
    return rejected(state, "gather", "not-on-expedition");
  }
  if (expedition.combat) return rejected(state, "gather", "engaged");
  const { pos } = expedition;
  const grid = expeditionGrid(expedition);
  const poi = grid.pois.find((p) => p.x === pos.x && p.y === pos.y);
  if (!poi) return rejected(state, "gather", "no-node");
  if (isCleared(expedition, pos)) return rejected(state, "gather", "already-cleared");
  if (poi.kind === "monster" || poi.material === null) {
    return rejected(state, "gather", "not-gatherable");
  }
  const kind = poi.kind; // narrowed to GatherableNodeType by the guard above (1gp: no cast)
  const speed = toolSpeedFor(expedition.loadout.equipment.tools, NODE_TOOL[kind]);
  if (speed === null) return rejected(state, "gather", "missing-tool");
  // D83: secondary AND-gate — animal "hunting" needs a TRAP (catch) as well as the
  // knife (skin). Missing it is a "missing-tool" reject; the render layer names both
  // tools in the near-node hint. Checked before gatherCost so its `!` stays valid.
  if (!secondaryToolSatisfied(kind, expedition.loadout.equipment.tools)) {
    return rejected(state, "gather", "missing-tool");
  }
  // Access gate (D78): a material may require an unlocking tool (MATERIAL_GATE,
  // an any-of list) — e.g. coal/silver need an iron-or-steel pick, mithril the
  // steel pick. You SEE the node but can't work it until you hold a key. This
  // one check is the whole tech tree (no smelting step); legalActions gets it
  // for free via speculative reduce (D29). Tool SPEED and material ACCESS are
  // now decoupled levers (the old quality==tier conflation is retired).
  if (!gateSatisfied(poi.material, expedition.loadout.equipment.tools)) {
    return rejected(state, "gather", "tool-too-weak");
  }
  const cost = gatherCost(poi, expedition.loadout.equipment.tools)!; // single source w/ the route cost-preview (eot); the guards above guarantee non-null
  if (cost > expedition.energy) return rejected(state, "gather", "exhausted");
  // Pay energy first, then waste-free auto-eat (dtv). Eating a food unit frees its
  // slot, which can make room for this gather's loot: the fit-check runs against
  // the post-eat inventory.
  const fed = autoRefill(expedition, expedition.energy - cost);
  const energy = fed.energy;
  const loadout = { ...expedition.loadout, food: fed.food };
  const qty = gatherYield(kind, poi.magnitude);
  // Fresh forage (e3j): a yield that IS food (FOOD catalog) joins the food reserve at
  // the FRONT — eaten before packed food, since fresh stales on return while rations
  // bank back. One slot per unit; a material/gear yield stacks into carry instead.
  const placed = placeYield(loadout, expedition.carry, poi.material, qty, "front");
  if (placed === null) return rejected(state, "gather", "carry-full");
  return {
    state: {
      ...state,
      expedition: {
        ...expedition,
        energy,
        carry: placed.carry,
        cleared: [...expedition.cleared, { x: pos.x, y: pos.y }],
        loadout: placed.loadout,
      },
    },
    events: [
      { type: "gathered", at: { x: pos.x, y: pos.y }, kind: poi.kind, material: poi.material, qty, cost, energy },
    ],
  };
}

// Fishing (si7.6.2): with a rod, cast into the water tile you stand on or one of its
// 8 neighbours — the DEEPEST one not yet fished this run (ties → row-major), so where
// you stand (the bank, the shallows, out on the raft) is the decision. Equal depth
// prefers a lake/sea tile over shallows over river. Each water tile
// yields its generation-rolled catch once. Pay energy, auto-eat, then place the catch:
// a fish is fresh food (front of the queue, like forage), a lockbox opens into carry,
// a sodden map joins the carried maps.
export function fish(state: GameState): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) return rejected(state, "fish", "not-on-expedition");
  if (expedition.combat) return rejected(state, "fish", "engaged");
  const grid = expeditionGrid(expedition);
  const fished = expedition.fished ?? [];
  let anyWater = false;
  let spot: { x: number; y: number; catch: string; depth: number; score: number } | null = null;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = expedition.pos.x + dx, y = expedition.pos.y + dy;
    const caught = grid.catches?.[y]?.[x];
    if (!caught) continue;
    anyWater = true;
    if (fished.some((f) => f.x === x && f.y === y)) continue;
    const depth = grid.depth?.[y]?.[x] ?? 1;
    // Deepest first; at equal depth a standing body beats shallows beats river (the
    // richer table), then row-major.
    const t = grid.terrain[y]![x]!;
    const score = depth * 10 + (t === "lake" || t === "sea" ? 2 : t === "shallows" ? 1 : 0);
    if (!spot || score > spot.score) spot = { x, y, catch: caught, depth, score };
  }
  if (!anyWater) return rejected(state, "fish", "no-water");
  // Water before rod: away from water a rodless player has nothing to be told (the
  // surfaces only nag about a rod when there's water to cast into).
  if (!expedition.loadout.equipment.tools.some((t) => TOOL_CAPABILITY[t] === "fish")) {
    return rejected(state, "fish", "missing-tool");
  }
  if (!spot) return rejected(state, "fish", "fished-out");
  const cost = FISH_CAST_ENERGY;
  if (cost > expedition.energy) return rejected(state, "fish", "exhausted");
  const fed = autoRefill(expedition, expedition.energy - cost);
  let loadout: Loadout = { ...expedition.loadout, food: fed.food };
  let carry = expedition.carry;
  let carriedMaps = expedition.carriedMaps;
  const contents: ItemStack[] = [];
  const extra: GameEvent[] = [];
  const effect = CATCH_EFFECT[spot.catch];
  if (effect === "lockbox") {
    for (const entry of LOCKBOX_LOOT) {
      if (rand(expedition.mapSeed, "lockbox", spot.x, spot.y, entry.defId) >= entry.chance) continue;
      const placed = placeYield(loadout, carry, entry.defId, entry.qty, "back");
      if (placed === null) return rejected(state, "fish", "carry-full");
      loadout = placed.loadout;
      carry = placed.carry;
      contents.push({ defId: entry.defId, qty: entry.qty });
    }
  } else if (effect === "map") {
    const minted = mintMap(state, `${expedition.mapSeed}:fish:${spot.x},${spot.y}`, spot, "fished");
    carriedMaps = minted.carriedMaps;
    extra.push(minted.event);
  } else {
    const placed = placeYield(loadout, carry, spot.catch, 1, "front");
    if (placed === null) return rejected(state, "fish", "carry-full");
    loadout = placed.loadout;
    carry = placed.carry;
  }
  const water = fishWaterOf(grid.terrain[spot.y]![spot.x]!, spot.depth)!;
  return {
    state: {
      ...state,
      expedition: {
        ...expedition,
        energy: fed.energy,
        loadout,
        carry,
        ...(carriedMaps ? { carriedMaps } : {}),
        fished: [...fished, { x: spot.x, y: spot.y }],
      },
    },
    events: [
      { type: "fished", at: { x: spot.x, y: spot.y }, water, catch: spot.catch, contents, cost, energy: fed.energy },
      ...extra,
    ],
  };
}

export function drop(
  state: GameState,
  itemId: string,
): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) {
    return rejected(state, "drop", "not-on-expedition");
  }
  if (expedition.combat) return rejected(state, "drop", "engaged");
  // Only carry is droppable — packed food/potions are slot ballast (D23).
  const index = expedition.carry.findIndex((stack) => stack.defId === itemId);
  if (index === -1) return rejected(state, "drop", "not-carried");
  const dropped = expedition.carry[index]!;
  const carry = expedition.carry.filter((_, i) => i !== index);
  return {
    state: { ...state, expedition: { ...expedition, carry } },
    events: [{ type: "dropped", defId: dropped.defId, qty: dropped.qty }],
  };
}

// Discard a carried map (8ec): frees its slot for the rest of the run. No
// re-pickup — paper burns. Mirrors `drop` for loot stacks.
export function dropMap(
  state: GameState,
  mapSeed: string,
): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) {
    return rejected(state, "drop-map", "not-on-expedition");
  }
  if (expedition.combat) return rejected(state, "drop-map", "engaged");
  const held = expedition.carriedMaps ?? [];
  if (!held.some((m) => m.mapSeed === mapSeed)) return rejected(state, "drop-map", "map-not-carried");
  return {
    state: { ...state, expedition: { ...expedition, carriedMaps: held.filter((m) => m.mapSeed !== mapSeed) } },
    events: [{ type: "map-discarded", mapSeed }],
  };
}

// Survey a POI at range (54f): the spyglass's ACTIVE verb. Costs SURVEY_ENERGY
// to resolve one far node's detail (perceive then treats it as always-in-radius).
// Not-engaged, needs a vision-capability tool equipped; the target must be an
// as-yet-unresolved POI tile. Range is the whole map — the cost + slot + not-
// engaged is the price. Qualitative only: the `surveyed` event carries the kind,
// never an outcome (perception rules hold).
export function survey(state: GameState, at: { x: number; y: number }): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) return rejected(state, "survey", "not-on-expedition");
  if (expedition.combat) return rejected(state, "survey", "engaged");
  const tools = expedition.loadout.equipment.tools;
  if (!tools.some((t) => TOOL_CAPABILITY[t] === "vision")) return rejected(state, "survey", "missing-tool");
  const grid = expeditionGrid(expedition);
  const poi = grid.pois.find((p) => p.x === at.x && p.y === at.y);
  if (!poi) return rejected(state, "survey", "no-node");
  const surveyed = expedition.surveyed ?? [];
  const withinRadius = Math.max(Math.abs(at.x - expedition.pos.x), Math.abs(at.y - expedition.pos.y)) <= visionRadius(tools);
  const alreadySurveyed = surveyed.some((s) => s.x === at.x && s.y === at.y);
  if (withinRadius || alreadySurveyed) return rejected(state, "survey", "already-resolved");
  if (SURVEY_ENERGY > expedition.energy) return rejected(state, "survey", "exhausted");
  const fed = autoRefill(expedition, expedition.energy - SURVEY_ENERGY);
  return {
    state: {
      ...state,
      expedition: {
        ...expedition,
        energy: fed.energy,
        loadout: { ...expedition.loadout, food: fed.food },
        surveyed: [...surveyed, { x: at.x, y: at.y }],
      },
    },
    events: [{ type: "surveyed", at: { x: at.x, y: at.y }, kind: poi.kind }],
  };
}

export function returnHome(state: GameState): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) {
    return rejected(state, "return", "not-on-expedition");
  }
  if (expedition.combat) return rejected(state, "return", "engaged");
  const flavor = pickReturnFlavor({
    energy: expedition.energy,
    maxEnergy: expedition.maxEnergy ?? MAX_ENERGY,
    mapTier: expedition.mapTier ?? 1,
    food: expedition.loadout.food,
    seed: expedition.mapSeed,
    runs: state.runs ?? 0,
  });
  return {
    state: endExpedition(state, expedition),
    events: [{ type: "run-ended", reason: "returned", flavor }],
  };
}

export function toggleAutoQuaff(state: GameState): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) return rejected(state, "toggle-auto-quaff", "not-on-expedition");
  const on = !(expedition.autoQuaff ?? true);
  return { state: { ...state, expedition: { ...expedition, autoQuaff: on } }, events: [{ type: "auto-quaff-toggled", on }] };
}

export function toggleAutoGather(state: GameState): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) return rejected(state, "toggle-auto-gather", "not-on-expedition");
  const on = !(expedition.autoGather ?? true); // eot: default ON
  return { state: { ...state, expedition: { ...expedition, autoGather: on } }, events: [{ type: "auto-gather-toggled", on }] };
}

// Shared don/doff plumbing (82r). Out of combat a swap costs DON_DOFF_ENERGY;
// since 67e it is also legal while engaged, where it costs a monster turn
// (provokeTurn) instead of energy. The candidate (equipment + carry) must fit its
// OWN capacity — carryCap of the candidate equipment — which makes backpack /
// transport / panniers swaps safe with no special cases: you can't doff the
// horse while the panniers capacity it enables is holding your loot.
function donDoffChecks(
  state: GameState,
  action: "don" | "doff",
): { expedition: Expedition } | { rejected: { state: GameState; events: GameEvent[] } } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) return { rejected: rejected(state, action, "not-on-expedition") };
  // 67e: gear-swap is now ALLOWED while engaged — it costs a monster turn (applied
  // in don/doff via provokeTurn), not energy. The energy gate only bites out of combat.
  if (!expedition.combat && DON_DOFF_ENERGY > expedition.energy) return { rejected: rejected(state, action, "exhausted") };
  return { expedition };
}

// The common tail of don/doff: capacity check on the candidate kit, the xe4
// pending-loot re-check while engaged, then the cost — a monster turn in combat
// (67e), DON_DOFF_ENERGY (+ auto-refill) out of it. `event` builds the action's
// own event from the post-refill energy.
function finishSwap(
  state: GameState,
  expedition: Expedition,
  action: "don" | "doff",
  loadout: Loadout,
  carryNext: ItemStack[],
  event: (energy: number) => GameEvent,
): { state: GameState; events: GameEvent[] } {
  if (usedSlots(loadout, carryNext) > carryCap(loadout.equipment)) {
    return rejected(state, action, "carry-full");
  }
  // xe4: while engaged, the swap must also leave room for the pending victory loot.
  if (expedition.combat && !pendingLootFits(state, expedition.combat, loadout, carryNext)) {
    return rejected(state, action, "carry-full");
  }
  // 67e: in-combat swap costs the monster's turn, NOT energy; out-of-combat keeps DON_DOFF_ENERGY.
  const spend = expedition.combat ? 0 : DON_DOFF_ENERGY;
  const fed = autoRefill({ ...expedition, loadout }, expedition.energy - spend);
  const nextExp = { ...expedition, energy: fed.energy, loadout: { ...loadout, food: fed.food }, carry: carryNext };
  const ev = event(fed.energy);
  if (nextExp.combat) return provokeTurn(state, nextExp, [ev]);
  return { state: { ...state, expedition: nextExp }, events: [ev] };
}

export function don(state: GameState, itemId: string): { state: GameState; events: GameEvent[] } {
  const checks = donDoffChecks(state, "don");
  if ("rejected" in checks) return checks.rejected;
  const expedition = checks.expedition;
  const slot = slotOf(itemId);
  if (!isGear(itemId) || slot === null) return rejected(state, "don", "wrong-slot");
  const carryLess = removeOneFromCarry(expedition.carry, itemId);
  if (carryLess === null) return rejected(state, "don", "not-carried");
  const worn = expedition.loadout.equipment;
  let equipment: typeof worn;
  let carryNext = carryLess;
  let displaced: string | null = null;
  if (slot === "tool") {
    if (worn.tools.includes(itemId)) return rejected(state, "don", "already-packed");
    equipment = { ...worn, tools: [...worn.tools, itemId] };
  } else {
    displaced = worn[slot as EquipSlot] ?? null;
    equipment = { ...worn, [slot as EquipSlot]: itemId };
    if (displaced !== null) carryNext = [...carryNext, { defId: displaced, qty: 1 }];
  }
  const loadout = { ...expedition.loadout, equipment };
  return finishSwap(state, expedition, "don", loadout, carryNext, (energy) => ({ type: "donned", defId: itemId, slot, displaced, energy }));
}

export function doff(state: GameState, itemId: string): { state: GameState; events: GameEvent[] } {
  const checks = donDoffChecks(state, "doff");
  if ("rejected" in checks) return checks.rejected;
  const expedition = checks.expedition;
  const worn = expedition.loadout.equipment;
  let equipment: typeof worn;
  let slot: LoadoutSlot;
  if (worn.tools.includes(itemId)) {
    slot = "tool";
    equipment = { ...worn, tools: worn.tools.filter((t) => t !== itemId) };
  } else {
    const eqSlot = EQUIP_SLOTS.find((s) => worn[s] === itemId);
    if (eqSlot === undefined) return rejected(state, "doff", "not-worn");
    slot = eqSlot;
    equipment = { ...worn, [eqSlot]: null };
  }
  const carryNext = [...expedition.carry, { defId: itemId, qty: 1 }];
  const loadout = { ...expedition.loadout, equipment };
  return finishSwap(state, expedition, "doff", loadout, carryNext, (energy) => ({ type: "doffed", defId: itemId, slot, energy }));
}

// ke3.4: is `terrain` the current tile or one of its 4-neighbours? (field-craft
// terrain gate — e.g. an alchemy recipe that needs water nearby). Bounds-safe.
function nearTerrain(grid: ReturnType<typeof expeditionGrid>, pos: { x: number; y: number }, terrain: string): boolean {
  const at = (x: number, y: number) =>
    y >= 0 && y < grid.terrain.length && x >= 0 && x < grid.terrain[0]!.length && grid.terrain[y]![x] === terrain;
  return at(pos.x, pos.y) || at(pos.x + 1, pos.y) || at(pos.x - 1, pos.y) || at(pos.x, pos.y + 1) || at(pos.x, pos.y - 1);
}

// Field crafting (ke3.4, spec §4.4): a field:true recipe crafted on expedition.
// Tool pool = equipped ∪ carry (the bank isn't reachable); inputs consumed from
// the expedition inventory (carry materials + loadout.food); output goes to the
// BACK of food (cooked food auto-eats LAST, clarification #3) or into carry. Costs
// FIELD_CRAFT_ENERGY, then waste-free auto-eat exactly like gather.
export function fieldCraftAction(state: GameState, recipeId: string): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) return rejected(state, "craft", "not-on-expedition");
  if (expedition.combat) return rejected(state, "craft", "engaged");
  const recipe = RECIPE[recipeId];
  if (!recipe) return rejected(state, "craft", "no-recipe");
  if (!recipe.field) return rejected(state, "craft", "not-field-craftable");
  const loadout = expedition.loadout;
  // Field tool pool: equipped tools ∪ carried defIds (carried-only — no bank).
  const toolPool = [...loadout.equipment.tools, ...expedition.carry.map((s) => s.defId)];
  const req = recipe.requires;
  if (req?.tools?.some((t) => !toolPool.includes(t))) return rejected(state, "craft", "missing-tool");
  if (req?.terrain && !nearTerrain(expeditionGrid(expedition), expedition.pos, req.terrain)) {
    return rejected(state, "craft", "not-near-terrain");
  }
  if (FIELD_CRAFT_ENERGY > expedition.energy) return rejected(state, "craft", "exhausted");
  // Consume inputs from the expedition inventory (carry first, then food).
  const consumed = consumeExpeditionInputs(loadout.food, expedition.carry, recipe.inputs);
  if (consumed === null) return rejected(state, "craft", "insufficient-materials");
  // Pay energy, then waste-free auto-eat on the POST-consume food (gather pattern).
  const fed = autoRefill({ ...expedition, loadout: { ...loadout, food: consumed.food } }, expedition.energy - FIELD_CRAFT_ENERGY);
  const qty = recipeOutputQty(recipe, toolPool);
  const outDef = recipe.output.defId;
  const output = { defId: outDef, qty };
  // Route the output (xkz): a CONSUMABLE (food/potion) lands in the loadout at the
  // BACK — food auto-eats last, a fresh potion is a reserve (quaff drinks the front) —
  // and counts as slots; a material/gear output stacks into carry. Food routes against
  // the post-auto-eat list (fed.food); potions are untouched by auto-eat.
  const placed = placeYield({ ...loadout, food: fed.food }, consumed.carry, outDef, qty, "back");
  if (placed === null) return rejected(state, "craft", "carry-full");
  return {
    state: { ...state, expedition: { ...expedition, energy: fed.energy, carry: placed.carry, loadout: placed.loadout } },
    events: [{ type: "crafted", recipeId, output, where: "field" }],
  };
}

// Restore-per-food multiplier for this loadout: a "camp" tool (a tent) stretches
// each ration (dtv). Checks the CAPABILITY, not a defId — any camp-capable tool
// (future tiered tents) counts, keeping the tool a data-only addition (e96).
function tentMultOf(expedition: Expedition): number {
  return toolSpeedFor(expedition.loadout.equipment.tools, "camp") !== null ? TENT_FOOD_MULTIPLIER : 1;
}

// Eat one unit of a CHOSEN food NOW (7lr). Additive (+its energy), capped at max —
// UNLESS a tent turns it into the once-per-run CAMP MEAL: with a tent equipped and an
// unspent camp charge, restore is ×TENT_FOOD_MULTIPLIER and over-eats PAST max (banked
// reach), spending a charge. All the tent's food power lives here — auto-eat and a
// normal (no-tent / charge-spent) manual eat are plain ×1 capped. Rejects when the
// named food isn't packed or the eat can't raise energy (already at/over max).
export function eat(state: GameState, action: Extract<Action, { type: "eat" }>): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) {
    return rejected(state, "eat", "not-on-expedition");
  }
  if (expedition.combat) return rejected(state, "eat", "engaged");
  const food = expedition.loadout.food;
  const idx = food.findIndex((s) => s.defId === action.defId && s.qty > 0);
  if (idx < 0) return rejected(state, "eat", "insufficient"); // not a packed food
  const campMeal = tentMultOf(expedition) > 1 && (expedition.campMealsUsed ?? 0) < TENT_CAMP_MEALS;
  const restore = foodEnergyOf(action.defId) * (campMeal ? TENT_FOOD_MULTIPLIER : 1);
  const maxEnergy = expedition.maxEnergy ?? MAX_ENERGY;
  // Camp meal over-eats past max; a plain meal caps at max (no waste-into-nothing).
  const energy = campMeal ? expedition.energy + restore : Math.min(expedition.energy + restore, maxEnergy);
  if (energy <= expedition.energy) return rejected(state, "eat", "insufficient"); // no gain (at/over max, no camp meal)
  const filtered = consumeOne(food, idx);
  return {
    state: {
      ...state,
      expedition: {
        ...expedition,
        energy,
        campMealsUsed: (expedition.campMealsUsed ?? 0) + (campMeal ? 1 : 0),
        loadout: { ...expedition.loadout, food: filtered },
      },
    },
    events: [{ type: "ate", defId: action.defId, restored: energy - expedition.energy, energy, ...(campMeal ? { campMeal: true } : {}) }],
  };
}

// Designate which food auto-eats waste-free (mco); null clears it (auto-eat off).
// No eating here — just sets Expedition.autoEatFood; autoRefill acts on it next spend.
export function setAutoEatFood(state: GameState, defId: string | null): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) {
    return rejected(state, "set-auto-eat-food", "not-on-expedition");
  }
  if (defId !== null && slotOf(defId) !== "food") {
    return rejected(state, "set-auto-eat-food", "not-food");
  }
  return {
    state: { ...state, expedition: { ...expedition, autoEatFood: defId ?? undefined } },
    events: [{ type: "auto-eat-set", defId }],
  };
}

// Route a produced defId — a gather yield or a field-craft output — into the
// expedition inventory (xkz): FOOD → the food list, POTION → potions (both count as
// slots, so the placement is fit-checked against carryCap), else → carry as a loot
// stack. `end` picks where a consumable stack lands: "front" for fresh forage (eaten
// before packed food, since it stales on return) or "back" for a crafted reserve.
// Same-defId stacks coalesce. Returns the updated {loadout, carry}, or null when it
// won't fit (the caller maps that to its own carry-full rejection).
// Exported for the web route preview (seyh.6) so its "fits ✓" prediction places
// yields exactly as gather does.
export function placeYield(
  loadout: Loadout,
  carry: ItemStack[],
  defId: string,
  qty: number,
  end: "front" | "back",
): { loadout: Loadout; carry: ItemStack[] } | null {
  const slot: "food" | "potions" | null = FOOD.includes(defId) ? "food" : POTION.includes(defId) ? "potions" : null;
  if (slot) {
    const cur = slot === "food" ? loadout.food : loadout.potions;
    const head = cur[0];
    const tail = cur[cur.length - 1];
    const nextList =
      end === "front"
        ? head && head.defId === defId
          ? [{ defId, qty: head.qty + qty }, ...cur.slice(1)]
          : [{ defId, qty }, ...cur]
        : tail && tail.defId === defId
          ? [...cur.slice(0, -1), { defId, qty: tail.qty + qty }]
          : [...cur, { defId, qty }];
    const nextLoadout = slot === "food" ? { ...loadout, food: nextList } : { ...loadout, potions: nextList };
    if (usedSlots(nextLoadout, carry) > carryCap(nextLoadout.equipment)) return null;
    return { loadout: nextLoadout, carry };
  }
  const nextCarry = addToCarry(carry, defId, qty, freeLootStacks(loadout));
  if (nextCarry === null) return null;
  return { loadout, carry: nextCarry };
}

// Remove ONE unit of defId from carry (gear stacks are qty 1 via stackCapOf, but
// this is written generically). Returns null when the defId isn't carried.
function removeOneFromCarry(carry: ItemStack[], defId: string): ItemStack[] | null {
  const idx = carry.findIndex((s) => s.defId === defId);
  if (idx === -1) return null;
  return consumeOne(carry, idx);
}
