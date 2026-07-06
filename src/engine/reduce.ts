import type { GameState, Action, GameEvent, LoadoutSlot, RejectionReason, Expedition } from "./types";
import { generateGrid, rollBiome } from "./grid";
import { emptyLoadout } from "./loadout";
import { stepToward, moveCost } from "./move";
import { addToCarry, freeCarryStacks, freeLootStacks } from "./carry";
import { toolQualityFor } from "./tools";
import { resolveCombat, rollLoot, explainMatchup } from "./combat";
import { eatToRefill, foodEnergyOf } from "./food";
import { endExpedition, subtractStacks } from "./bank";
import { craft as applyRecipe } from "./craft";
import { packItem, reserveLoadout } from "./pack";
import { candidateMaps, previewHints } from "./town";
import { MAX_ENERGY, TENT_FOOD_MULTIPLIER, PLAYER_BASE_HP, MAP_WIDTH, MAP_HEIGHT, NODE_HARDNESS, NODE_TOOL, GATHER_YIELD, MATERIAL_TIER, MAP_SCROLL_ID } from "../data/constants";
import type { GatherableNodeType } from "../data/constants";

// Pure reducer. M2 fills embark/move; M3 fills gather/drop; M4 fills fight; remaining cases are no-op stubs:
//   craft/pack/return             → M5
// Adding a new Action variant without a case here is a compile error (assertNever).
export function reduce(
  state: GameState,
  action: Action,
): { state: GameState; events: GameEvent[] } {
  switch (action.type) {
    case "embark":
      return embark(state, action.mapSeed);
    case "pocket-map":
      return pocketMap(state, action.mapSeed);
    case "move":
      return move(state, action.to);
    case "gather":
      return gather(state);
    case "eat":
      return eat(state);
    case "toggle-auto-eat":
      return toggleAutoEat(state);
    case "drop":
      return drop(state, action.itemId);
    case "drop-map":
      return dropMap(state, action.mapSeed);
    case "fight":
      return fight(state);
    case "craft":
      return craftAction(state, action.recipeId);
    case "pack":
      return packAction(state, action.slot, action.itemId);
    case "return":
      return returnHome(state);
    default:
      return assertNever(action);
  }
}

function rejected(
  state: GameState,
  action: Action["type"],
  reason: RejectionReason,
): { state: GameState; events: GameEvent[] } {
  return { state, events: [{ type: "action-rejected", action, reason }] };
}

function embark(
  state: GameState,
  mapSeed: string,
): { state: GameState; events: GameEvent[] } {
  if (state.phase !== "town") return rejected(state, "embark", "not-in-town");
  // No seed re-farming (9u9.3): you can only embark on a map the town is CURRENTLY
  // offering (candidateMaps rotates with runs). legalActions already restricts to
  // these; validating here makes reduce the source of truth (D29) so no driver can
  // farm a favourable seed by hand-building the action.
  // A map is embarkable if the town is CURRENTLY offering it ("go nearby" — a
  // fresh map, not consumed) OR you're holding it (a pocketed map, xzx — spent on
  // embark). A seed that's neither is not-offered, so the farm loop stays closed.
  const offered = candidateMaps(state.seed, state.runs ?? 0).map((m) => m.mapSeed);
  const held = state.maps ?? [];
  const wasHeld = held.some((m) => m.mapSeed === mapSeed);
  if (!offered.includes(mapSeed) && !wasHeld) return rejected(state, "embark", "not-offered");
  // D28: settle the plan against the bank — debit everything the loadout pulls.
  const reserved = reserveLoadout(state.loadout);
  const bank = subtractStacks(state.bank, reserved);
  if (bank === null) return rejected(state, "embark", "unaffordable");
  const grid = generateGrid(mapSeed, rollBiome(mapSeed));
  // Stamina model (dtv): current energy starts at MAX_ENERGY regardless of packed
  // food — food is a reserve you EAT to refill toward max mid-run, not the source
  // of the whole budget. autoEat (default on) refills waste-free after each spend.
  const energy = MAX_ENERGY;
  return {
    state: {
      ...state,
      phase: "expedition",
      bank,
      loadout: emptyLoadout(),
      maps: wasHeld ? held.filter((m) => m.mapSeed !== mapSeed) : held, // spend the held map (xzx)
      expedition: {
        mapSeed,
        pos: grid.entry,
        energy,
        maxEnergy: MAX_ENERGY,
        autoEat: true,
        hp: PLAYER_BASE_HP,
        loadout: state.loadout,
        carry: [],
        cleared: [],
        carriedMaps: [],
      },
    },
    events: [
      { type: "embarked", mapSeed, biomeId: grid.biomeId, pos: grid.entry, energy },
    ],
  };
}

// Pocket an offered map (xzx): keep a single-use snapshot to run later, even after
// the offer rotates. No cost, no cap — "go nearby" means you're never stuck, so
// hoarding buys nothing. Dedupe by mapSeed; must be in the current offer.
function pocketMap(
  state: GameState,
  mapSeed: string,
): { state: GameState; events: GameEvent[] } {
  if (state.phase !== "town") return rejected(state, "pocket-map", "not-in-town");
  const offer = candidateMaps(state.seed, state.runs ?? 0);
  const found = offer.find((m) => m.mapSeed === mapSeed);
  if (!found) return rejected(state, "pocket-map", "not-offered");
  const maps = state.maps ?? [];
  if (maps.some((m) => m.mapSeed === mapSeed)) return rejected(state, "pocket-map", "already-pocketed");
  const item = { mapSeed: found.mapSeed, biomeId: found.biomeId, vintage: state.runs ?? 0 };
  return {
    state: { ...state, maps: [...maps, item] },
    events: [{ type: "pocketed-map", mapSeed, biomeId: found.biomeId }],
  };
}

function craftAction(
  state: GameState,
  recipeId: string,
): { state: GameState; events: GameEvent[] } {
  if (state.phase !== "town") return rejected(state, "craft", "not-in-town");
  const result = applyRecipe(state.bank, recipeId);
  if (!result.ok) return rejected(state, "craft", result.reason);
  return {
    state: { ...state, bank: result.bank },
    events: [{ type: "crafted", recipeId, output: result.output }],
  };
}

function returnHome(state: GameState): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) {
    return rejected(state, "return", "not-on-expedition");
  }
  return {
    state: endExpedition(state, expedition),
    events: [{ type: "run-ended", reason: "returned" }],
  };
}

function packAction(
  state: GameState,
  slot: LoadoutSlot,
  itemId: string,
): { state: GameState; events: GameEvent[] } {
  if (state.phase !== "town") return rejected(state, "pack", "not-in-town");
  const result = packItem(state.loadout, state.bank, slot, itemId);
  if (!result.ok) return rejected(state, "pack", result.reason);
  return {
    state: { ...state, loadout: result.loadout },
    events: [{ type: "packed", slot, defId: itemId }],
  };
}

function move(
  state: GameState,
  to: { x: number; y: number },
): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) {
    return rejected(state, "move", "not-on-expedition");
  }
  const from = expedition.pos;
  const step = stepToward(from, to);
  if (step.x === from.x && step.y === from.y) {
    return rejected(state, "move", "no-step");
  }
  if (step.x < 0 || step.x >= MAP_WIDTH || step.y < 0 || step.y >= MAP_HEIGHT) {
    return rejected(state, "move", "out-of-bounds");
  }
  const grid = generateGrid(expedition.mapSeed, rollBiome(expedition.mapSeed));
  // Walking INTO a live monster is a fight, not a step (2026-07-05): monsters
  // block their tile until beaten, so pathing through one is a real choice
  // (fight it, or route around). No energy cost — combat spends HP, not energy.
  const poiAtStep = grid.pois.find((p) => p.x === step.x && p.y === step.y);
  const stepCleared = expedition.cleared.some((c) => c.x === step.x && c.y === step.y);
  if (poiAtStep && poiAtStep.kind === "monster" && poiAtStep.creature !== null && !stepCleared) {
    return fightAt(state, expedition, step, poiAtStep.creature, "move", true);
  }
  const terrain = grid.terrain[step.y]![step.x]!;
  const cost = moveCost(terrain, expedition.loadout.equipment.transport, expedition.loadout.equipment.tools);
  if (!Number.isFinite(cost)) return rejected(state, "move", "impassable");
  if (cost > expedition.energy) return rejected(state, "move", "exhausted");
  const fed = autoRefill(expedition, expedition.energy - cost); // drain, then waste-free auto-eat (dtv)
  return {
    state: {
      ...state,
      expedition: { ...expedition, pos: step, energy: fed.energy, loadout: { ...expedition.loadout, food: fed.food } },
    },
    events: [{ type: "moved", from, to: step, terrain, cost, energy: fed.energy }],
  };
}

function gather(state: GameState): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) {
    return rejected(state, "gather", "not-on-expedition");
  }
  const { pos } = expedition;
  const grid = generateGrid(expedition.mapSeed, rollBiome(expedition.mapSeed));
  const poi = grid.pois.find((p) => p.x === pos.x && p.y === pos.y);
  const alreadyCleared = expedition.cleared.some(
    (c) => c.x === pos.x && c.y === pos.y,
  );
  if (!poi) return rejected(state, "gather", "no-node");
  if (alreadyCleared) return rejected(state, "gather", "already-cleared");
  if (poi.kind === "monster" || poi.material === null) {
    return rejected(state, "gather", "not-gatherable");
  }
  const kind = poi.kind as GatherableNodeType;
  const quality = toolQualityFor(expedition.loadout.equipment.tools, NODE_TOOL[kind]);
  if (quality === null) return rejected(state, "gather", "missing-tool");
  // Tier gate (2026-07-04): a tool's quality doubles as its tier. A material
  // rolled from a higher tier (e.g. coal T2, mithril T3) needs a tool that
  // strong — you SEE the node but can't work it until you've climbed. This one
  // check enforces the whole tech tree (no smelting step). legalActions gets it
  // for free via speculative reduce (D29).
  if (quality < (MATERIAL_TIER[poi.material] ?? 1)) {
    return rejected(state, "gather", "tool-too-weak");
  }
  const cost = NODE_HARDNESS[kind] / quality;
  if (cost > expedition.energy) return rejected(state, "gather", "exhausted");
  // Pay energy first, then waste-free auto-eat (dtv). Eating a food unit frees its
  // slot, which can make room for this gather's loot: the fit-check runs against
  // the post-eat inventory.
  const fed = autoRefill(expedition, expedition.energy - cost);
  const energy = fed.energy;
  const loadout = { ...expedition.loadout, food: fed.food };
  const maxStacks = freeLootStacks(loadout, expedition.carriedMaps);
  const qty = GATHER_YIELD[kind];
  const carry = addToCarry(expedition.carry, poi.material, qty, maxStacks);
  if (carry === null) return rejected(state, "gather", "carry-full");
  return {
    state: {
      ...state,
      expedition: {
        ...expedition,
        energy,
        carry,
        cleared: [...expedition.cleared, { x: pos.x, y: pos.y }],
        loadout,
      },
    },
    events: [
      {
        type: "gathered",
        at: { x: pos.x, y: pos.y },
        kind: poi.kind,
        material: poi.material,
        qty,
        cost,
        energy,
      },
    ],
  };
}

function drop(
  state: GameState,
  itemId: string,
): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) {
    return rejected(state, "drop", "not-on-expedition");
  }
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
function dropMap(
  state: GameState,
  mapSeed: string,
): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) {
    return rejected(state, "drop-map", "not-on-expedition");
  }
  const held = expedition.carriedMaps ?? [];
  if (!held.some((m) => m.mapSeed === mapSeed)) return rejected(state, "drop-map", "map-not-carried");
  return {
    state: { ...state, expedition: { ...expedition, carriedMaps: held.filter((m) => m.mapSeed !== mapSeed) } },
    events: [{ type: "map-discarded", mapSeed }],
  };
}

function fight(state: GameState): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) {
    return rejected(state, "fight", "not-on-expedition");
  }
  const { pos } = expedition;
  const grid = generateGrid(expedition.mapSeed, rollBiome(expedition.mapSeed));
  const poi = grid.pois.find((p) => p.x === pos.x && p.y === pos.y);
  const alreadyCleared = expedition.cleared.some((c) => c.x === pos.x && c.y === pos.y);
  if (!poi || poi.kind !== "monster" || alreadyCleared || poi.creature === null) {
    return rejected(state, "fight", "no-monster");
  }
  return fightAt(state, expedition, pos, poi.creature, "fight", false);
}

// Shared combat resolution at a tile. `fight` uses it to stand and fight the
// monster you're on; `move` uses it when you walk INTO a live monster (monsters
// block a tile until beaten — routing around them is the choice, 2026-07-05).
// moveOnWin=true relocates you onto the cleared tile after a win.
function fightAt(
  state: GameState,
  expedition: Expedition,
  at: { x: number; y: number },
  creature: string,
  action: "fight" | "move",
  moveOnWin: boolean,
): { state: GameState; events: GameEvent[] } {
  // Roll the actual drops up front (deterministic, t07): the fit-check reserves
  // space only for loot that WILL drop, so an unrolled 20% rare never blocks.
  const rolled = rollLoot(state.seed, creature, at);
  // Map scrolls (8ec) never enter carry as materials — they mint a carried
  // MapItem on victory. The fit check covers MATERIAL loot only: the map is an
  // optional pickup (left behind if the pack is full), never a reason to
  // refuse a fight.
  const mapDrops = rolled.filter((s) => s.defId === MAP_SCROLL_ID);
  const loot = rolled.filter((s) => s.defId !== MAP_SCROLL_ID);
  // Pre-fight fit check: rejecting is free, so the player can drop and retry
  // instead of losing loot (or HP) to a full pack.
  const maxStacks = freeLootStacks(expedition.loadout, expedition.carriedMaps);
  let carryWithLoot: typeof expedition.carry | null = expedition.carry;
  for (const stack of loot) {
    carryWithLoot = addToCarry(carryWithLoot, stack.defId, stack.qty, maxStacks);
    if (carryWithLoot === null) return rejected(state, action, "carry-full");
  }
  const result = resolveCombat(expedition.loadout, expedition.hp, creature);
  const fought: GameEvent = {
    type: "fought",
    at: { x: at.x, y: at.y },
    creature,
    victory: result.victory,
    hpLost: result.hpLost,
    potionsUsed: result.potionsUsed,
    loot: result.victory ? loot : [],
    hp: result.hpAfter,
    matchup: explainMatchup(expedition.loadout, creature),
  };
  if (!result.victory) {
    // Soft fail (D26): run ends, carry is kept — banked with the durables.
    const ended = endExpedition(state, {
      ...expedition,
      loadout: { ...expedition.loadout, potions: result.potionsAfter, battleItems: result.battleItemsAfter },
    });
    return { state: ended, events: [fought, { type: "run-ended", reason: "defeated" }] };
  }
  const carriedMaps = expedition.carriedMaps ?? [];
  let mapsAfter = carriedMaps;
  const mapEvents: GameEvent[] = [];
  if (mapDrops.length > 0) {
    // Mint (8ec): seed is namespaced by run-map + tile, so the drop is replayable
    // (D14) and the biome falls out of rollBiome — uniform, and embark re-derives
    // it from the seed exactly like an offered map (D21).
    const mapSeed = `${expedition.mapSeed}:drop:${at.x},${at.y}`;
    const biomeId = rollBiome(mapSeed);
    const carried = carryWithLoot.length + carriedMaps.length < freeCarryStacks(expedition.loadout);
    if (carried) mapsAfter = [...carriedMaps, { mapSeed, biomeId, vintage: state.runs ?? 0 }];
    mapEvents.push({ type: "map-dropped", at: { x: at.x, y: at.y }, mapSeed, biomeId, hints: previewHints(mapSeed, biomeId), carried });
  }
  return {
    state: {
      ...state,
      expedition: {
        ...expedition,
        pos: moveOnWin ? { x: at.x, y: at.y } : expedition.pos,
        hp: result.hpAfter,
        loadout: { ...expedition.loadout, potions: result.potionsAfter, battleItems: result.battleItemsAfter },
        carry: carryWithLoot,
        cleared: [...expedition.cleared, { x: at.x, y: at.y }],
        carriedMaps: mapsAfter,
      },
    },
    events: [fought, ...mapEvents],
  };
}

// Restore-per-food multiplier for this loadout: a tent (durable "camp" tool)
// stretches each ration (dtv). NODE_TOOL never asks for "camp", so no gather impact.
function tentMultOf(expedition: Expedition): number {
  return expedition.loadout.equipment.tools.includes("tent") ? TENT_FOOD_MULTIPLIER : 1;
}

// Drain-then-refill helper for move/gather: given the post-spend current energy,
// run waste-free auto-eat if the toggle is on (dtv). Returns the food reserve +
// new current energy. autoEat/maxEnergy default via the optional-field guards.
function autoRefill(
  expedition: Expedition,
  energy: number,
): { food: Expedition["loadout"]["food"]; energy: number } {
  if (!(expedition.autoEat ?? true)) return { food: expedition.loadout.food, energy };
  return eatToRefill(
    expedition.loadout.food,
    energy,
    expedition.maxEnergy ?? MAX_ENERGY,
    tentMultOf(expedition),
  );
}

// Eat one food unit NOW (dtv): the player's manual refill, even if slightly
// wasteful (unlike the waste-free auto-eat). Rejects when there's no food or you're
// already at max. Restore = foodEnergyOf × tentMult, clamped to max.
function eat(state: GameState): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) {
    return rejected(state, "eat", "not-on-expedition");
  }
  const maxEnergy = expedition.maxEnergy ?? MAX_ENERGY;
  const food = expedition.loadout.food;
  if (food.length === 0 || expedition.energy >= maxEnergy) {
    return rejected(state, "eat", "insufficient");
  }
  const front = food[0]!;
  const restore = foodEnergyOf(front.defId) * tentMultOf(expedition);
  const energy = Math.min(maxEnergy, expedition.energy + restore);
  const nextFood = food.map((s) => ({ ...s }));
  nextFood[0]!.qty -= 1;
  if (nextFood[0]!.qty <= 0) nextFood.shift();
  return {
    state: {
      ...state,
      expedition: { ...expedition, energy, loadout: { ...expedition.loadout, food: nextFood } },
    },
    events: [{ type: "ate", defId: front.defId, restored: energy - expedition.energy, energy }],
  };
}

// Flip the waste-free "eat when hungry" auto-eat (dtv). Pure toggle; no eating here.
function toggleAutoEat(state: GameState): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) {
    return rejected(state, "toggle-auto-eat", "not-on-expedition");
  }
  const on = !(expedition.autoEat ?? true);
  return {
    state: { ...state, expedition: { ...expedition, autoEat: on } },
    events: [{ type: "auto-eat-toggled", on }],
  };
}

function assertNever(x: never): never {
  throw new Error(`Unhandled action: ${JSON.stringify(x)}`);
}
