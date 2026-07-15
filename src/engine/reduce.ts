import type { GameState, Action, GameEvent, ItemStack, LoadoutSlot, RejectionReason, Expedition, Equipment, Loadout } from "./types";
import { expeditionGrid, rollBiome } from "./grid";
import { emptyLoadout } from "./loadout";
import { stepToward, moveCost } from "./move";
import { addToCarry, freeLootStacks, usedSlots, carryCap, consumeExpeditionInputs, mapCarryCap } from "./carry";
import { toolSpeedFor, gatherCost, gateSatisfied } from "./tools";
import { strikeExchange, rollLoot, explainMatchup, damageTaken, wieldsRanged, hasAmmo } from "./combat";
import { eatToRefill, foodEnergyOf } from "./food";
import { endExpedition, subtractStacks } from "./bank";
import { pickReturnFlavor } from "./flavor";
import { rand } from "./rng";
import { craft as applyRecipe, recipeOutputQty } from "./craft";
import { packItem, reserveLoadout, EQUIP_SLOTS } from "./pack";
import type { EquipSlot } from "./pack";
import { slotOf, isGear } from "./catalog";
import { localMap, previewHints } from "./town";
import { MAX_ENERGY, TENT_FOOD_MULTIPLIER, ENERGY_CAP_BONUS, PLAYER_BASE_HP, MAP_WIDTH, MAP_HEIGHT, NODE_TOOL, GATHER_YIELD, NODE_MAGNITUDE_YIELD, MAP_SCROLL_ID, FOOD, POTION, MONSTERS, MONSTER_TIER_HP_CURVE, POTION_HEAL, POTION_HEAL_BY, QUAFF_ENERGY, DON_DOFF_ENERGY, MAP_TIER_MAX, COMBAT_BUFF, SURVEY_ENERGY, FIELD_CRAFT_ENERGY, TOOL_CAPABILITY, INKS, RECIPE, WEAPON_ENHANCEMENT } from "../data/constants";
import { visionRadius } from "./perceive";

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
    case "ink":
      return inkMap(state, action.mapSeed, action.inkId);
    case "move":
      return move(state, action.to);
    case "gather":
      return gather(state);
    case "eat":
      return eat(state);
    case "set-auto-eat-food":
      return setAutoEatFood(state, action.defId);
    case "drop":
      return drop(state, action.itemId);
    case "drop-map":
      return dropMap(state, action.mapSeed);
    case "fight":
      return fight(state, action.at);
    case "flee":
      return flee(state);
    case "quaff":
      return quaff(state);
    case "use-item":
      return useItem(state, action.itemId);
    case "enhance":
      return enhance(state, action.id);
    case "survey":
      return survey(state, action.at);
    case "toggle-auto-quaff":
      return toggleAutoQuaff(state);
    case "toggle-auto-gather":
      return toggleAutoGather(state);
    case "toggle-auto-finish":
      return toggleAutoFinish(state);
    case "don":
      return don(state, action.itemId);
    case "doff":
      return doff(state, action.itemId);
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
  // No seed re-farming (9u9.3): you can only embark on the town's CURRENT local
  // map (localMap rotates with runs — D80) OR a held map you earned as a drop.
  // Validating here makes reduce the source of truth (D29) so no driver can farm a
  // favourable seed by hand-building the action.
  // The local map is the free "go nearby" run — a fresh T1 map, NOT held, so it's
  // never consumed. Held maps (state.maps, drop-minted, zpm.2) ARE consumed on
  // embark (wasHeld below). A seed that's neither stays not-offered — farm closed.
  const offered = localMap(state.seed, state.runs ?? 0).mapSeed;
  const held = state.maps ?? [];
  const wasHeld = held.some((m) => m.mapSeed === mapSeed);
  if (offered !== mapSeed && !wasHeld) return rejected(state, "embark", "not-offered");
  // D28: settle the plan against the bank — debit everything the loadout pulls.
  const reserved = reserveLoadout(state.loadout);
  const bank = subtractStacks(state.bank, reserved);
  if (bank === null) return rejected(state, "embark", "unaffordable");
  const heldMap = held.find((m) => m.mapSeed === mapSeed);
  const mapTier = heldMap?.tier ?? 1;
  const affixes = heldMap?.affixes ?? []; // cartography affixes ride onto the run (cxq)
  const grid = expeditionGrid({ mapSeed, mapTier, affixes });
  // Stamina model (dtv): current energy starts at MAX_ENERGY regardless of packed
  // food — food is a reserve you EAT to refill toward max mid-run, not the source
  // of the whole budget. Auto-eat starts OFF (mco): the player designates a food
  // (set-auto-eat-food) to refill waste-free after each spend; until then nothing auto-eats.
  // Capacity gear (si7.2): canteen and future tools raise the ceiling additively.
  const maxEnergy = MAX_ENERGY + energyCapOf(state.loadout.equipment);
  const energy = maxEnergy;
  // Spare gear (82r): packed spares expand into carry as ONE PIECE PER STACK
  // (stackCapOf gear = 1), and the expedition loadout's spares clear so the
  // slots aren't double-counted (consumableSlots vs carry.length — 1:1 move).
  const carry: ItemStack[] = [];
  for (const s of state.loadout.spares ?? []) {
    for (let i = 0; i < s.qty; i++) carry.push({ defId: s.defId, qty: 1 });
  }
  return {
    state: {
      ...state,
      phase: "expedition",
      bank,
      loadout: emptyLoadout(),
      maps: wasHeld ? held.filter((m) => m.mapSeed !== mapSeed) : held, // spend the held map (xzx)
      expedition: {
        mapSeed,
        mapTier,
        pos: grid.entry,
        energy,
        maxEnergy,
        hp: PLAYER_BASE_HP,
        loadout: { ...state.loadout, spares: [] },
        carry,
        cleared: [],
        carriedMaps: [],
        ...(affixes.length ? { affixes } : {}),
      },
    },
    events: [
      { type: "embarked", mapSeed, biomeId: grid.biomeId, pos: grid.entry, energy },
    ],
  };
}

// Apply an ink to a held map (cxq): consume 1 ink from the bank, roll an affix
// from the ink's domain pool (seeded by the map's ink count so re-inking a domain
// can land differently — deterministic, not save-scummable), and REPLACE any
// existing affix from the same domain (chasing the roll is a resource loop).
function inkMap(state: GameState, mapSeed: string, inkId: string): { state: GameState; events: GameEvent[] } {
  if (state.phase !== "town") return rejected(state, "ink", "not-in-town");
  const maps = state.maps ?? [];
  const idx = maps.findIndex((m) => m.mapSeed === mapSeed);
  if (idx === -1) return rejected(state, "ink", "map-not-carried");
  const ink = INKS[inkId];
  if (!ink) return rejected(state, "ink", "insufficient");
  const bank = subtractStacks(state.bank, [{ defId: inkId, qty: 1 }]);
  if (bank === null) return rejected(state, "ink", "insufficient");
  const map = maps[idx]!;
  const inkCount = map.inkCount ?? 0;
  const roll = rand(`${state.seed}:${mapSeed}`, "ink", inkCount);
  const affix = ink.pool[Math.floor(roll * ink.pool.length)] ?? ink.pool[0]!;
  const kept = (map.affixes ?? []).filter((a) => !ink.pool.includes(a)); // same-domain replace
  const nextMap = { ...map, affixes: [...kept, affix], inkCount: inkCount + 1 };
  return {
    state: { ...state, bank, maps: maps.map((m, i) => (i === idx ? nextMap : m)) },
    events: [{ type: "inked", mapSeed, affix }],
  };
}

function craftAction(
  state: GameState,
  recipeId: string,
): { state: GameState; events: GameEvent[] } {
  // ke3.4: one craft Action, routed by phase. On expedition → field crafting.
  if (state.phase === "expedition") return fieldCraftAction(state, recipeId);
  if (state.phase !== "town") return rejected(state, "craft", "not-in-town");
  // A field:true recipe is field-ONLY — in town you're not on an expedition (ke3.4).
  if (RECIPE[recipeId]?.field) return rejected(state, "craft", "not-on-expedition");
  // Town tool pool (ke3.1): home means everything's reachable — a required tool
  // may sit in the bank OR the loadout. Stations come from base state.
  const stations = state.stations ?? [];
  const toolPool = [...state.bank.map((s) => s.defId), ...state.loadout.equipment.tools];
  const result = applyRecipe(state.bank, recipeId, toolPool, stations);
  if (!result.ok) return rejected(state, "craft", result.reason);
  // ke3.2: a station-building recipe deposits its output into base infra
  // (state.stations, idempotent — no dupes), never the bank. craft() already
  // rejected a rebuild ('already-built') and left the output un-banked. Ordinary
  // crafts don't touch the stations key (keeps terse states/snapshots minimal).
  const builds = RECIPE[recipeId]?.buildsStation;
  const next: GameState = builds
    ? { ...state, bank: result.bank, stations: [...stations, builds] }
    : { ...state, bank: result.bank };
  return {
    state: next,
    events: [{ type: "crafted", recipeId, output: result.output }],
  };
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
function fieldCraftAction(state: GameState, recipeId: string): { state: GameState; events: GameEvent[] } {
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
  // A CONSUMABLE output lives in the loadout (food → food, potion → potions) and
  // counts as slots; append to the BACK (food auto-eats last; a fresh potion is a
  // reserve — quaff drinks the front). A material/gear output goes to carry. Food
  // uses the post-auto-eat list; potions are untouched by auto-eat.
  const target: "food" | "potions" | null = FOOD.includes(outDef) ? "food" : POTION.includes(outDef) ? "potions" : null;
  if (target) {
    const cur = target === "food" ? fed.food : loadout.potions;
    const last = cur[cur.length - 1];
    const nextList = last && last.defId === outDef
      ? [...cur.slice(0, -1), { defId: outDef, qty: last.qty + qty }]
      : [...cur, output];
    const candidate = target === "food"
      ? { ...loadout, food: nextList }
      : { ...loadout, food: fed.food, potions: nextList };
    if (usedSlots(candidate, consumed.carry) > carryCap(candidate.equipment)) {
      return rejected(state, "craft", "carry-full");
    }
    return {
      state: { ...state, expedition: { ...expedition, energy: fed.energy, carry: consumed.carry, loadout: candidate } },
      events: [{ type: "crafted", recipeId, output, where: "field" }],
    };
  }
  // Material/gear output → carry, slot-fit-checked against the post-consume inventory.
  const loadoutFed = { ...loadout, food: fed.food };
  const carry = addToCarry(consumed.carry, outDef, qty, freeLootStacks(loadoutFed));
  if (carry === null) return rejected(state, "craft", "carry-full");
  return {
    state: { ...state, expedition: { ...expedition, energy: fed.energy, carry, loadout: loadoutFed } },
    events: [{ type: "crafted", recipeId, output, where: "field" }],
  };
}

function returnHome(state: GameState): { state: GameState; events: GameEvent[] } {
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
  const poiAtStep = grid.pois.find((p) => p.x === step.x && p.y === step.y);
  const stepCleared = expedition.cleared.some((c) => c.x === step.x && c.y === step.y);
  if (poiAtStep && poiAtStep.kind === "monster" && poiAtStep.creature !== null && !stepCleared) {
    return maybeAutoFinish(engage(state, expedition, step, poiAtStep.creature, "move", true), expedition); // 67e: auto-finish resolves a walked-into fight
  }
  const terrain = grid.terrain[step.y]![step.x]!;
  const cost = moveCost(terrain, expedition.loadout.equipment.transport, expedition.loadout.equipment.tools, from.x !== step.x && from.y !== step.y); // l2w: diagonal steps cost √2×
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
  if (expedition.combat) return rejected(state, "gather", "engaged");
  const { pos } = expedition;
  const grid = expeditionGrid(expedition);
  const poi = grid.pois.find((p) => p.x === pos.x && p.y === pos.y);
  const alreadyCleared = expedition.cleared.some(
    (c) => c.x === pos.x && c.y === pos.y,
  );
  if (!poi) return rejected(state, "gather", "no-node");
  if (alreadyCleared) return rejected(state, "gather", "already-cleared");
  if (poi.kind === "monster" || poi.material === null) {
    return rejected(state, "gather", "not-gatherable");
  }
  const kind = poi.kind; // narrowed to GatherableNodeType by the guard above (1gp: no cast)
  const speed = toolSpeedFor(expedition.loadout.equipment.tools, NODE_TOOL[kind]);
  if (speed === null) return rejected(state, "gather", "missing-tool");
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
  const qty = GATHER_YIELD[kind] * (NODE_MAGNITUDE_YIELD[poi.magnitude ?? 1] ?? 1);
  // Fresh forage (e3j): a yield that IS food (FOOD catalog) joins the food
  // reserve at the FRONT — eaten before packed food, since fresh stales on
  // return while rations bank back. One slot per unit, like packed food.
  if (FOOD.includes(poi.material)) {
    const front = loadout.food[0];
    const food =
      front && front.defId === poi.material
        ? [{ defId: front.defId, qty: front.qty + qty }, ...loadout.food.slice(1)]
        : [{ defId: poi.material, qty }, ...loadout.food];
    const candidate = { ...loadout, food };
    if (usedSlots(candidate, expedition.carry) > carryCap(candidate.equipment)) {
      return rejected(state, "gather", "carry-full");
    }
    return {
      state: {
        ...state,
        expedition: {
          ...expedition,
          energy,
          cleared: [...expedition.cleared, { x: pos.x, y: pos.y }],
          loadout: candidate,
        },
      },
      events: [
        { type: "gathered", at: { x: pos.x, y: pos.y }, kind: poi.kind, material: poi.material, qty, cost, energy },
      ],
    };
  }
  const maxStacks = freeLootStacks(loadout);
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
function dropMap(
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

// Start an engagement (si7.1, replaces atomic fightAt): the fit-check still
// runs BEFORE any blood (rejecting is free), battle items are consumed NOW and
// their buffs ride the Engagement for all its rounds. No exchange here — the
// player sees the forecast before the first swing.
function engage(
  state: GameState,
  expedition: Expedition,
  at: { x: number; y: number },
  creature: string,
  action: "fight" | "move",
  moveOnWin: boolean,
  ranged = false, // D45: engaged from an adjacent tile with a bow — grants the opener
): { state: GameState; events: GameEvent[] } {
  const rolled = rollLoot(state.seed, creature, at);
  const loot = rolled.filter((s) => s.defId !== MAP_SCROLL_ID);
  const maxStacks = freeLootStacks(expedition.loadout);
  let carryWithLoot: typeof expedition.carry | null = expedition.carry;
  for (const stack of loot) {
    carryWithLoot = addToCarry(carryWithLoot, stack.defId, stack.qty, maxStacks);
    if (carryWithLoot === null) return rejected(state, action, "carry-full");
  }
  const monsterHp = MONSTER_TIER_HP_CURVE[MONSTERS[creature]!.tier]!;
  return {
    state: {
      ...state,
      expedition: {
        ...expedition,
        // Battle items are NO LONGER auto-consumed at engage (90j, amends D36): they
        // stay packed and are used mid-fight by the `use-item` action, or bank back
        // unused. The engagement's buff therefore starts at zero.
        combat: {
          at: { x: at.x, y: at.y }, creature, monsterHp, moveOnWin,
          damageAdd: 0, mitigationAdd: 0,
          startHp: expedition.hp, potionsUsed: 0,
          ...(ranged ? { ranged: true, opener: true } : {}), // D45: first exchange skips its retaliation
        },
      },
    },
    events: [{ type: "engaged", at: { x: at.x, y: at.y }, creature, monsterHp, ...(ranged ? { ranged: true } : {}) }],
  };
}

function fight(state: GameState, at?: { x: number; y: number }): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) return rejected(state, "fight", "not-on-expedition");
  const combat = expedition.combat;
  if (!combat) {
    const { pos } = expedition;
    const grid = expeditionGrid(expedition);
    if (at !== undefined) {
      // Ranged engage (D45): `at` must be an ADJACENT (8-neighbour) live monster
      // tile, with a bow wielded and ≥1 arrow held. Engages without stepping in
      // (moveOnWin false — you never relocate onto a tile you shot from afar).
      const adjacent = Math.max(Math.abs(at.x - pos.x), Math.abs(at.y - pos.y)) === 1;
      const poi = grid.pois.find((p) => p.x === at.x && p.y === at.y);
      const targetCleared = expedition.cleared.some((c) => c.x === at.x && c.y === at.y);
      if (!adjacent || !poi || poi.kind !== "monster" || targetCleared || poi.creature === null) {
        return rejected(state, "fight", "no-monster");
      }
      if (!wieldsRanged(expedition.loadout) || !hasAmmo(expedition.loadout)) {
        return rejected(state, "fight", "missing-tool");
      }
      return maybeAutoFinish(engage(state, expedition, at, poi.creature, "fight", false, true), expedition);
    }
    // Not engaged, no target: engage the live monster on the CURRENT tile (as before).
    const poi = grid.pois.find((p) => p.x === pos.x && p.y === pos.y);
    const alreadyCleared = expedition.cleared.some((c) => c.x === pos.x && c.y === pos.y);
    if (!poi || poi.kind !== "monster" || alreadyCleared || poi.creature === null) {
      return rejected(state, "fight", "no-monster");
    }
    return maybeAutoFinish(engage(state, expedition, pos, poi.creature, "fight", false), expedition);
  }
  // Engaged: one exchange. A `fight at` aimed at a DIFFERENT tile mid-engagement
  // is rejected (you're locked in); re-targeting the engaged monster just swings.
  if (at !== undefined && (at.x !== combat.at.x || at.y !== combat.at.y)) {
    return rejected(state, "fight", "engaged");
  }
  // 67e: auto-finish resolves the whole fight in one action; else a single round.
  if (expedition.autoFinish ?? false) return resolveEngagedFully(state);
  return fightRound(state);
}

// One engaged exchange (67e: extracted from fight() so the auto-finish loop can
// re-run it). Assumes state.expedition.combat is set.
function fightRound(state: GameState): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition!;
  const combat = expedition.combat!;
  // Arrow economy (D45): a wielded bow with ammo shoots — and spends — one arrow
  // per exchange, walk-in fights included (the bow always shoots if it can).
  // Arrows-out: playerDamage degrades the bow to UNARMED_DAMAGE (a club).
  const spendsArrow = wieldsRanged(expedition.loadout) && hasAmmo(expedition.loadout);
  const round = strikeExchange(
    expedition.loadout, expedition.hp, combat.monsterHp, combat.creature,
    combat.damageAdd, combat.mitigationAdd, expedition.autoQuaff ?? true,
    combat.opener ?? false, // ranged opener (D45): skip the monster's FIRST retaliation
    expedition.weaponBuff, combat.poison, // D60: coating charges spent per strike; poison ticks per round (same math as resolveCombat)
  );
  let ammo = expedition.loadout.ammo ?? [];
  if (spendsArrow) {
    ammo = ammo.map((s) => ({ ...s }));
    ammo[0]!.qty -= 1; // front stack, FIFO — mirrors potions/food
    if (ammo[0]!.qty <= 0) ammo.shift();
  }
  const potionsUsed = combat.potionsUsed + round.potionsUsed;
  const exchanged: GameEvent = {
    type: "exchanged", creature: combat.creature, dmgDealt: round.dmgDealt,
    dmgTaken: round.dmgTaken, monsterHp: round.monsterHp, hp: round.hp, potionsUsed,
    ...(spendsArrow ? { arrowSpent: true } : {}),
    ...(round.poisonDmg > 0 ? { poisonDmg: round.poisonDmg } : {}), // D60: poison DoT this round
  };
  const loadout = { ...expedition.loadout, potions: round.potionsAfter, ammo };
  // One roll, shared by the event and the carry apply (c5l): rollLoot is
  // deterministic so the old double call couldn't drift — but only by accident.
  const rolled = rollLoot(state.seed, combat.creature, combat.at);
  const mapDrops = rolled.filter((s) => s.defId === MAP_SCROLL_ID);
  const loot = rolled.filter((s) => s.defId !== MAP_SCROLL_ID);
  const fought = (victory: boolean): GameEvent => ({
    type: "fought", at: { x: combat.at.x, y: combat.at.y }, creature: combat.creature,
    // quaffing above startHp reads as 0 lost, not negative
    victory, hpLost: Math.max(0, combat.startHp - round.hp), potionsUsed,
    loot: victory ? loot : [],
    hp: round.hp, matchup: explainMatchup(expedition.loadout, combat.creature),
  });
  if (round.defeated) {
    // D60: the coating clears with the run; endExpedition doesn't read weaponBuff, but drop it cleanly.
    const ended = endExpedition(state, { ...expedition, loadout, weaponBuff: round.weaponBuffAfter, combat: undefined });
    return { state: ended, events: [exchanged, fought(false), { type: "run-ended", reason: "defeated" }] };
  }
  if (!round.victory) {
    return {
      // D60: charges spent this strike ride the expedition; poison ticks on the engagement.
      state: { ...state, expedition: { ...expedition, hp: round.hp, loadout, weaponBuff: round.weaponBuffAfter, combat: { ...combat, monsterHp: round.monsterHp, potionsUsed, opener: false, poison: round.poisonAfter } } }, // opener spent after the first exchange (D45)
      events: [exchanged],
    };
  }
  // Victory: apply loot/maps/cleared/relocation exactly as the old fightAt did. The
  // fit was checked at engage AND re-checked by any mid-fight don/doff (xe4,
  // pendingLootFits) — so this can't overflow; fail loudly if that invariant ever
  // breaks again rather than writing carry:null into state.
  const maxStacks = freeLootStacks(loadout);
  let carryWithLoot: typeof expedition.carry = expedition.carry;
  for (const stack of loot) {
    const next = addToCarry(carryWithLoot, stack.defId, stack.qty, maxStacks);
    if (next === null) throw new Error(`victory loot overflow at ${combat.at.x},${combat.at.y}: mid-fight carry mutation escaped the pending-loot fit-check (xe4)`);
    carryWithLoot = next;
  }
  const carriedMaps = expedition.carriedMaps ?? [];
  let mapsAfter = carriedMaps;
  const mapEvents: GameEvent[] = [];
  if (mapDrops.length > 0) {
    const mapSeed = `${expedition.mapSeed}:drop:${combat.at.x},${combat.at.y}`;
    const biomeId = rollBiome(mapSeed);
    const sourceTier = expedition.mapTier ?? 1;
    const tier = Math.min(sourceTier + 1, MAP_TIER_MAX);
    const carried = carriedMaps.length < mapCarryCap(state.bank); // zpm.2: maps have their own dedicated pool, not a loot slot
    if (carried) mapsAfter = [...carriedMaps, { mapSeed, biomeId, vintage: state.runs ?? 0, tier }];
    mapEvents.push({ type: "map-dropped", at: { x: combat.at.x, y: combat.at.y }, mapSeed, biomeId, hints: previewHints(mapSeed, biomeId), carried, tier });
  }
  return {
    state: {
      ...state,
      expedition: {
        ...expedition,
        pos: combat.moveOnWin ? { x: combat.at.x, y: combat.at.y } : expedition.pos,
        hp: round.hp, loadout, carry: carryWithLoot,
        weaponBuff: round.weaponBuffAfter, // D60: charges spent on the killing strike
        cleared: [...expedition.cleared, { x: combat.at.x, y: combat.at.y }],
        carriedMaps: mapsAfter,
        combat: undefined,
      },
    },
    events: [exchanged, fought(true), ...mapEvents],
  };
}

// 67e: after an engage, if auto-finish is on, resolve the whole fight now (else the
// player would have to click Fight). No-op when not engaged or the flag is off.
function maybeAutoFinish(
  r: { state: GameState; events: GameEvent[] },
  before: Expedition,
): { state: GameState; events: GameEvent[] } {
  if (!(before.autoFinish ?? false) || !r.state.expedition?.combat) return r;
  const resolved = resolveEngagedFully(r.state);
  return { state: resolved.state, events: [...r.events, ...resolved.events] };
}

// 67e auto-finish: loop fightRound until the engagement ends (victory or defeat).
// Fights terminate — monster HP strictly decreases each round (dmgDealt ≥ CHIP_MIN) —
// so the guard is a backstop, not the exit. Collapses the log: drops per-round
// `exchanged` spam, keeps the terminal fought/run-ended/map events, and stamps the
// fought event with the round count.
function resolveEngagedFully(state: GameState): { state: GameState; events: GameEvent[] } {
  let s = state;
  let rounds = 0;
  const collected: GameEvent[] = [];
  while (s.expedition?.combat && rounds < 500) {
    const r = fightRound(s);
    s = r.state;
    collected.push(...r.events);
    rounds++;
  }
  const events = collected
    .filter((e) => e.type !== "exchanged")
    .map((e) => (e.type === "fought" ? { ...e, rounds } : e));
  return { state: s, events };
}

function flee(state: GameState): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) return rejected(state, "flee", "not-on-expedition");
  const combat = expedition.combat;
  if (!combat) return rejected(state, "flee", "not-engaged");
  // The standing price of bailing (si7.1): one parting hit BEFORE you're clear —
  // always affordable before the exchange that would kill you, never free.
  const partingHit = damageTaken(expedition.loadout, combat.creature, combat.mitigationAdd);
  const hp = Math.max(0, expedition.hp - partingHit);
  const fled: GameEvent = { type: "fled", creature: combat.creature, partingHit, hp };
  if (hp <= 0) {
    const ended = endExpedition(state, { ...expedition, combat: undefined });
    return { state: ended, events: [fled, { type: "run-ended", reason: "defeated" }] };
  }
  return { state: { ...state, expedition: { ...expedition, hp, combat: undefined } }, events: [fled] };
}

// Drink one potion. Mid-engagement: no exchange, no energy — its cost is tempo
// (si7.1). On the map (82r): heal between fights for QUAFF_ENERGY, so patching
// up before the next monster is a real (small) budget call.
function quaff(state: GameState): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) return rejected(state, "quaff", "not-on-expedition");
  const combat = expedition.combat;
  const potions = expedition.loadout.potions;
  if (potions.length === 0 || expedition.hp >= PLAYER_BASE_HP) return rejected(state, "quaff", "insufficient");
  if (!combat && QUAFF_ENERGY > expedition.energy) return rejected(state, "quaff", "exhausted");
  const front = potions[0]!;
  const heal = POTION_HEAL_BY[front.defId] ?? POTION_HEAL;
  const hp = Math.min(PLAYER_BASE_HP, expedition.hp + heal);
  const next = potions.map((p) => ({ ...p }));
  next[0]!.qty -= 1;
  if (next[0]!.qty <= 0) next.shift();
  if (!combat) {
    const fed = autoRefill({ ...expedition, loadout: { ...expedition.loadout, potions: next } }, expedition.energy - QUAFF_ENERGY);
    return {
      state: {
        ...state,
        expedition: {
          ...expedition, hp, energy: fed.energy,
          loadout: { ...expedition.loadout, potions: next, food: fed.food },
        },
      },
      events: [{ type: "quaffed", defId: front.defId, healed: hp - expedition.hp, hp, energy: fed.energy }],
    };
  }
  // 67e: a manual mid-fight potion now costs a monster turn (auto-quaff, folded into
  // a Fight round, stays free — pre-setting it is the efficient heal).
  const nextExp = {
    ...expedition, hp,
    loadout: { ...expedition.loadout, potions: next },
    combat: { ...combat, potionsUsed: combat.potionsUsed + 1 },
  };
  return provokeTurn(state, nextExp, [{ type: "quaffed", defId: front.defId, healed: hp - expedition.hp, hp }]);
}

// Use one packed battle item mid-fight (90j, mirrors quaff): manual-only, no
// auto-consume. Must be engaged; the id must be a held battle-item stack. Adds
// its COMBAT_BUFF into the live engagement (persists for THIS fight only — dies
// with combat) and decrements one unit off the front stack. No exchange runs.
function useItem(state: GameState, itemId: string): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) return rejected(state, "use-item", "not-on-expedition");
  const combat = expedition.combat;
  if (!combat) return rejected(state, "use-item", "not-engaged");
  if (slotOf(itemId) !== "battle-item") return rejected(state, "use-item", "wrong-slot");
  const items = expedition.loadout.battleItems ?? [];
  const idx = items.findIndex((s) => s.defId === itemId);
  if (idx === -1) return rejected(state, "use-item", "insufficient");
  const buff = COMBAT_BUFF[itemId] ?? {};
  const damageAdd = buff.damageAdd ?? 0;
  const mitigationAdd = buff.mitigationAdd ?? 0;
  const next = items.map((s) => ({ ...s }));
  next[idx]!.qty -= 1;
  if (next[idx]!.qty <= 0) next.splice(idx, 1);
  return {
    state: {
      ...state,
      expedition: {
        ...expedition,
        loadout: { ...expedition.loadout, battleItems: next },
        combat: { ...combat, damageAdd: combat.damageAdd + damageAdd, mitigationAdd: combat.mitigationAdd + mitigationAdd },
      },
    },
    events: [{ type: "item-used", defId: itemId, damageAdd, mitigationAdd }],
  };
}

// Apply a weapon enhancement (D60, weapon-enhancement spec §2.3): whetstone/oil
// prep. Expedition-phase; usable ENGAGED or UNENGAGED (mirrors use-item/quaff),
// runs NO exchange and costs NO energy. Consume one unit from the held enhancement
// stack and set Expedition.weaponBuff to a fresh full-charge coating — applying
// over an existing buff REPLACES it (the discarded charges are lost). Rejections
// reuse existing reasons: not-on-expedition / wrong-slot / insufficient.
function enhance(state: GameState, id: string): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) return rejected(state, "enhance", "not-on-expedition");
  if (slotOf(id) !== "enhancement") return rejected(state, "enhance", "wrong-slot");
  const held = expedition.loadout.enhancements ?? [];
  const idx = held.findIndex((s) => s.defId === id);
  if (idx === -1) return rejected(state, "enhance", "insufficient");
  const charges = WEAPON_ENHANCEMENT[id]!.charges;
  const next = held.map((s) => ({ ...s }));
  next[idx]!.qty -= 1;
  if (next[idx]!.qty <= 0) next.splice(idx, 1);
  const nextExp = {
    ...expedition,
    loadout: { ...expedition.loadout, enhancements: next },
    weaponBuff: { id, charges }, // replaces any current coating (old charges lost)
  };
  const enhanced: GameEvent = { type: "enhanced", id, charges };
  // 67e: coating mid-fight now costs a monster turn (D60 reversal — was free/no-exchange).
  if (nextExp.combat) return provokeTurn(state, nextExp, [enhanced]);
  return {
    state: { ...state, expedition: nextExp },
    events: [enhanced],
  };
}

// Survey a POI at range (54f): the spyglass's ACTIVE verb. Costs SURVEY_ENERGY
// to resolve one far node's detail (perceive then treats it as always-in-radius).
// Not-engaged, needs a vision-capability tool equipped; the target must be an
// as-yet-unresolved POI tile. Range is the whole map — the cost + slot + not-
// engaged is the price. Qualitative only: the `surveyed` event carries the kind,
// never an outcome (perception rules hold).
function survey(state: GameState, at: { x: number; y: number }): { state: GameState; events: GameEvent[] } {
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

function toggleAutoQuaff(state: GameState): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) return rejected(state, "toggle-auto-quaff", "not-on-expedition");
  const on = !(expedition.autoQuaff ?? true);
  return { state: { ...state, expedition: { ...expedition, autoQuaff: on } }, events: [{ type: "auto-quaff-toggled", on }] };
}

function toggleAutoGather(state: GameState): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) return rejected(state, "toggle-auto-gather", "not-on-expedition");
  const on = !(expedition.autoGather ?? true); // eot: default ON
  return { state: { ...state, expedition: { ...expedition, autoGather: on } }, events: [{ type: "auto-gather-toggled", on }] };
}

function toggleAutoFinish(state: GameState): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) return rejected(state, "toggle-auto-finish", "not-on-expedition");
  const on = !(expedition.autoFinish ?? false);
  return { state: { ...state, expedition: { ...expedition, autoFinish: on } }, events: [{ type: "auto-finish-toggled", on }] };
}

// 67e: a non-flee in-combat action (coat / manual potion / gear-swap) costs a TURN —
// the engaged monster lands one damageTaken hit (no player swing), exactly like flee's
// parting hit, and it can soft-fail. `exp` is the post-action expedition (combat still
// set); `events` are the action's own events, which the retaliation is appended to.
function provokeTurn(
  state: GameState,
  exp: Expedition,
  events: GameEvent[],
): { state: GameState; events: GameEvent[] } {
  const combat = exp.combat!;
  const hit = damageTaken(exp.loadout, combat.creature, combat.mitigationAdd);
  const hp = Math.max(0, exp.hp - hit);
  const provoked: GameEvent = { type: "provoked", creature: combat.creature, hit, hp };
  if (hp <= 0) {
    const ended = endExpedition(state, { ...exp, combat: undefined });
    return { state: ended, events: [...events, provoked, { type: "run-ended", reason: "defeated" }] };
  }
  return { state: { ...state, expedition: { ...exp, hp } }, events: [...events, provoked] };
}

// Remove ONE unit of defId from carry (gear stacks are qty 1 via stackCapOf, but
// this is written generically). Returns null when the defId isn't carried.
function removeOneFromCarry(carry: ItemStack[], defId: string): ItemStack[] | null {
  const idx = carry.findIndex((s) => s.defId === defId);
  if (idx === -1) return null;
  return carry
    .map((s, i) => (i === idx ? { ...s, qty: s.qty - 1 } : s))
    .filter((s) => s.qty > 0);
}

// Shared don/doff plumbing (82r): the pre-fight prep actions. Both are rejected
// mid-engagement (the agency is BEFORE stepping onto the monster, not mid-swing)
// and cost DON_DOFF_ENERGY. The candidate (equipment + carry) must fit its OWN
// capacity — carryCap of the candidate equipment — which makes backpack /
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

// idle-adventure-xe4: the victory path applies the engaged monster's rolled loot
// with a bare addToCarry(...)! trusting the fit-check that ran at engage. Since 67e
// a mid-fight don/doff is legal and mutates carry, so any in-combat swap must RE-
// verify the pending loot still fits the candidate kit — else victory would write
// carry:null (silent state corruption). Mirrors engage()'s pre-check (reduce ~513).
function pendingLootFits(
  state: GameState,
  combat: NonNullable<Expedition["combat"]>,
  loadout: Loadout,
  carry: ItemStack[],
): boolean {
  const loot = rollLoot(state.seed, combat.creature, combat.at).filter((s) => s.defId !== MAP_SCROLL_ID);
  const maxStacks = freeLootStacks(loadout);
  let c: ItemStack[] | null = carry;
  for (const stack of loot) {
    c = addToCarry(c, stack.defId, stack.qty, maxStacks);
    if (c === null) return false;
  }
  return true;
}

function don(state: GameState, itemId: string): { state: GameState; events: GameEvent[] } {
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
    displaced = worn[slot as EquipSlot];
    equipment = { ...worn, [slot as EquipSlot]: itemId };
    if (displaced !== null) carryNext = [...carryNext, { defId: displaced, qty: 1 }];
  }
  const loadout = { ...expedition.loadout, equipment };
  if (usedSlots(loadout, carryNext) > carryCap(equipment)) {
    return rejected(state, "don", "carry-full");
  }
  // xe4: while engaged, the swap must also leave room for the pending victory loot.
  if (expedition.combat && !pendingLootFits(state, expedition.combat, loadout, carryNext)) {
    return rejected(state, "don", "carry-full");
  }
  // 67e: in-combat swap costs the monster's turn, NOT energy; out-of-combat keeps DON_DOFF_ENERGY.
  const spend = expedition.combat ? 0 : DON_DOFF_ENERGY;
  const fed = autoRefill({ ...expedition, loadout }, expedition.energy - spend);
  const nextExp = { ...expedition, energy: fed.energy, loadout: { ...loadout, food: fed.food }, carry: carryNext };
  const donned: GameEvent = { type: "donned", defId: itemId, slot, displaced, energy: fed.energy };
  if (nextExp.combat) return provokeTurn(state, nextExp, [donned]);
  return { state: { ...state, expedition: nextExp }, events: [donned] };
}

function doff(state: GameState, itemId: string): { state: GameState; events: GameEvent[] } {
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
  if (usedSlots(loadout, carryNext) > carryCap(equipment)) {
    return rejected(state, "doff", "carry-full");
  }
  // xe4: while engaged, the swap must also leave room for the pending victory loot.
  if (expedition.combat && !pendingLootFits(state, expedition.combat, loadout, carryNext)) {
    return rejected(state, "doff", "carry-full");
  }
  // 67e: in-combat swap costs the monster's turn, NOT energy (mirrors don).
  const spend = expedition.combat ? 0 : DON_DOFF_ENERGY;
  const fed = autoRefill({ ...expedition, loadout }, expedition.energy - spend);
  const nextExp = { ...expedition, energy: fed.energy, loadout: { ...loadout, food: fed.food }, carry: carryNext };
  const doffed: GameEvent = { type: "doffed", defId: itemId, slot, energy: fed.energy };
  if (nextExp.combat) return provokeTurn(state, nextExp, [doffed]);
  return { state: { ...state, expedition: nextExp }, events: [doffed] };
}

// Restore-per-food multiplier for this loadout: a "camp" tool (a tent) stretches
// each ration (dtv). Checks the CAPABILITY, not a defId — any camp-capable tool
// (future tiered tents) counts, keeping the tool a data-only addition (e96).
function tentMultOf(expedition: Expedition): number {
  return toolSpeedFor(expedition.loadout.equipment.tools, "camp") !== null ? TENT_FOOD_MULTIPLIER : 1;
}

// Sum of ENERGY_CAP_BONUS over equipped tools (si7.2): the flat maxEnergy raise
// from capacity gear. Mirrors tentMultOf's read-gear-on-demand pattern.
export function energyCapOf(equipment: Equipment): number {
  return equipment.tools.reduce((sum, t) => sum + (ENERGY_CAP_BONUS[t] ?? 0), 0);
}

// Drain-then-refill helper for move/gather: given the post-spend current energy,
// eat waste-free from the DESIGNATED auto-eat food if one is set (mco). Returns the
// food reserve + new current energy. No designation (autoEatFood absent) = off, no eat.
// maxEnergy defaults via the optional-field guard.
function autoRefill(
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
    tentMultOf(expedition),
  );
}

// Eat one food unit NOW (m0a): deliberate over-eat. Targets the MOST-dense unit
// (the reserve auto-eat leaves alone) and jumps energy TO its boosted value
// (foodEnergy × tentMult), which may exceed maxEnergy. Ties break by lowest index.
// Rejects when there's no food or the boosted value wouldn't raise energy.
function eat(state: GameState): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) {
    return rejected(state, "eat", "not-on-expedition");
  }
  if (expedition.combat) return rejected(state, "eat", "engaged");
  const tentMult = tentMultOf(expedition);
  const food = expedition.loadout.food;
  if (food.length === 0) return rejected(state, "eat", "insufficient");
  // Deliberate over-eat (m0a): target the MOST-dense unit (the reserve auto-eat
  // leaves alone) and jump energy TO its boosted value (foodEnergy × tentMult),
  // which may exceed maxEnergy. Ties break by lowest index. Reject if eating it
  // wouldn't raise energy (boosted ≤ current) — nothing to gain.
  let idx = 0;
  for (let i = 1; i < food.length; i++) {
    if (foodEnergyOf(food[i]!.defId) > foodEnergyOf(food[idx]!.defId)) idx = i;
  }
  const boosted = foodEnergyOf(food[idx]!.defId) * tentMult;
  if (boosted <= expedition.energy) return rejected(state, "eat", "insufficient");
  const energy = boosted;
  const nextFood = food.map((s) => ({ ...s }));
  nextFood[idx]!.qty -= 1;
  const filtered = nextFood.filter((s) => s.qty > 0);
  return {
    state: {
      ...state,
      expedition: { ...expedition, energy, loadout: { ...expedition.loadout, food: filtered } },
    },
    events: [{ type: "ate", defId: food[idx]!.defId, restored: energy - expedition.energy, energy }],
  };
}

// Designate which food auto-eats waste-free (mco); null clears it (auto-eat off).
// No eating here — just sets Expedition.autoEatFood; autoRefill acts on it next spend.
function setAutoEatFood(state: GameState, defId: string | null): { state: GameState; events: GameEvent[] } {
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

function assertNever(x: never): never {
  throw new Error(`Unhandled action: ${JSON.stringify(x)}`);
}
