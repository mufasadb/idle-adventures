import type { GameState, Action, GameEvent, LoadoutSlot, RejectionReason, Expedition } from "./types";
import { generateGrid, rollBiome } from "./grid";
import { emptyLoadout } from "./loadout";
import { stepToward, moveCost } from "./move";
import { addToCarry, freeCarryStacks } from "./carry";
import { toolQualityFor } from "./tools";
import { resolveCombat, rollLoot } from "./combat";
import { digest } from "./food";
import { endExpedition, subtractStacks } from "./bank";
import { craft as applyRecipe } from "./craft";
import { packItem, reserveLoadout } from "./pack";
import { ENERGY_PER_FOOD, FOOD_ENERGY, BASE_ENERGY_FLOOR, PLAYER_BASE_HP, GRID_SIZE, NODE_HARDNESS, NODE_TOOL, GATHER_YIELD, MATERIAL_TIER, MONSTERS, MONSTER_TIER_HP_CURVE, MONSTER_TIER_DMG_CURVE, SCOUT_ENERGY_COST, SCOUT_RADIUS, SCOUT_TOOL } from "../data/constants";
import type { GatherableNodeType } from "../data/constants";

// Pure reducer. M2 fills embark/move; M3 fills gather/drop; M4 fills scout/fight; remaining cases are no-op stubs:
//   craft/pack/return             → M5
// Adding a new Action variant without a case here is a compile error (assertNever).
export function reduce(
  state: GameState,
  action: Action,
): { state: GameState; events: GameEvent[] } {
  switch (action.type) {
    case "embark":
      return embark(state, action.mapSeed);
    case "move":
      return move(state, action.to);
    case "gather":
      return gather(state);
    case "drop":
      return drop(state, action.itemId);
    case "fight":
      return fight(state);
    case "scout":
      return scout(state);
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
  // D28: settle the plan against the bank — debit everything the loadout pulls.
  const reserved = reserveLoadout(state.loadout);
  const bank = subtractStacks(state.bank, reserved);
  if (bank === null) return rejected(state, "embark", "unaffordable");
  const grid = generateGrid(mapSeed, rollBiome(mapSeed));
  // Per-food energy (2026-07-04): each stack contributes its defId's energy;
  // tiered food (trail-ration) is denser, so a better-fed player fights the squeeze.
  const foodEnergy = state.loadout.food.reduce(
    (sum, stack) => sum + stack.qty * (FOOD_ENERGY[stack.defId] ?? ENERGY_PER_FOOD),
    0,
  );
  // Base energy floor (2026-07-05, qrl): no-food embarks still get ~5 actions —
  // a recoverable fail state, not a 0-energy dead-loop (spec §3/§4.5).
  const energy = Math.max(BASE_ENERGY_FLOOR, foodEnergy);
  return {
    state: {
      ...state,
      phase: "expedition",
      bank,
      loadout: emptyLoadout(),
      expedition: {
        mapSeed,
        pos: grid.entry,
        energy,
        hp: PLAYER_BASE_HP,
        loadout: state.loadout,
        carry: [],
        cleared: [],
      },
    },
    events: [
      { type: "embarked", mapSeed, biomeId: grid.biomeId, pos: grid.entry, energy },
    ],
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
  if (step.x < 0 || step.x >= GRID_SIZE || step.y < 0 || step.y >= GRID_SIZE) {
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
  const energy = expedition.energy - cost;
  const food = digest(expedition.loadout.food, energy); // eat just-in-time, free slots (pqp)
  return {
    state: {
      ...state,
      expedition: { ...expedition, pos: step, energy, loadout: { ...expedition.loadout, food } },
    },
    events: [{ type: "moved", from, to: step, terrain, cost, energy }],
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
  // Pay energy first — eating food frees its slot, which can make room for this
  // gather's loot (pqp): the fit-check runs against the post-digest inventory.
  const energy = expedition.energy - cost;
  const loadout = { ...expedition.loadout, food: digest(expedition.loadout.food, energy) };
  const maxStacks = freeCarryStacks(loadout);
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
  const loot = rollLoot(state.seed, creature, at);
  // Pre-fight fit check: rejecting is free, so the player can drop and retry
  // instead of losing loot (or HP) to a full pack.
  const maxStacks = freeCarryStacks(expedition.loadout);
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
  };
  if (!result.victory) {
    // Soft fail (D26): run ends, carry is kept — banked with the durables.
    const ended = endExpedition(state, {
      ...expedition,
      loadout: { ...expedition.loadout, potions: result.potionsAfter, battleItems: result.battleItemsAfter },
    });
    return { state: ended, events: [fought, { type: "run-ended", reason: "defeated" }] };
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
      },
    },
    events: [fought],
  };
}

function scout(state: GameState): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) {
    return rejected(state, "scout", "not-on-expedition");
  }
  if (!expedition.loadout.equipment.tools.includes(SCOUT_TOOL)) {
    return rejected(state, "scout", "missing-tool");
  }
  if (SCOUT_ENERGY_COST > expedition.energy) {
    return rejected(state, "scout", "exhausted");
  }
  const { pos } = expedition;
  const grid = generateGrid(expedition.mapSeed, rollBiome(expedition.mapSeed));
  const monsters = grid.pois
    .filter(
      (p) =>
        p.kind === "monster" &&
        p.creature !== null &&
        Math.max(Math.abs(p.x - pos.x), Math.abs(p.y - pos.y)) <= SCOUT_RADIUS &&
        !expedition.cleared.some((c) => c.x === p.x && c.y === p.y),
    )
    .map((p) => {
      const monster = MONSTERS[p.creature!]!;
      const forecast = resolveCombat(expedition.loadout, expedition.hp, p.creature!);
      return {
        at: { x: p.x, y: p.y },
        creature: p.creature!,
        tier: monster.tier,
        hp: MONSTER_TIER_HP_CURVE[monster.tier]!,
        dmg: MONSTER_TIER_DMG_CURVE[monster.tier]!,
        dmgType: monster.dmgType,
        // tags deliberately withheld: affinities are discoverable, and the
        // forecast already prices them in without naming them.
        forecast: {
          victory: forecast.victory,
          hpLost: forecast.hpLost,
          potionsUsed: forecast.potionsUsed,
        },
      };
    });
  const energy = expedition.energy - SCOUT_ENERGY_COST;
  const food = digest(expedition.loadout.food, energy); // scouting spends energy too (pqp)
  return {
    state: { ...state, expedition: { ...expedition, energy, loadout: { ...expedition.loadout, food } } },
    events: [
      { type: "scouted", at: { x: pos.x, y: pos.y }, cost: SCOUT_ENERGY_COST, energy, monsters },
    ],
  };
}

function assertNever(x: never): never {
  throw new Error(`Unhandled action: ${JSON.stringify(x)}`);
}
