import type { GameState, Action, GameEvent, ItemStack, LoadoutSlot, RejectionReason, Expedition } from "./types";
import { generateGrid, rollBiome } from "./grid";
import { emptyLoadout } from "./loadout";
import { stepToward, moveCost } from "./move";
import { addToCarry, freeCarryStacks, freeLootStacks, usedSlots, carryCap } from "./carry";
import { toolQualityFor } from "./tools";
import { strikeExchange, battleBuff, rollLoot, explainMatchup, damageTaken, wieldsRanged, hasAmmo } from "./combat";
import { eatToRefill, foodEnergyOf } from "./food";
import { endExpedition, subtractStacks } from "./bank";
import { craft as applyRecipe } from "./craft";
import { packItem, reserveLoadout, EQUIP_SLOTS } from "./pack";
import type { EquipSlot } from "./pack";
import { slotOf, isGear } from "./catalog";
import { candidateMaps, previewHints } from "./town";
import { MAX_ENERGY, TENT_FOOD_MULTIPLIER, PLAYER_BASE_HP, MAP_WIDTH, MAP_HEIGHT, NODE_HARDNESS, NODE_TOOL, GATHER_YIELD, MATERIAL_TIER, MAP_SCROLL_ID, FOOD, MONSTERS, MONSTER_TIER_HP_CURVE, POTION_HEAL, POTION_HEAL_BY, QUAFF_ENERGY, DON_DOFF_ENERGY } from "../data/constants";
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
      return fight(state, action.at);
    case "flee":
      return flee(state);
    case "quaff":
      return quaff(state);
    case "toggle-auto-quaff":
      return toggleAutoQuaff(state);
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
        pos: grid.entry,
        energy,
        maxEnergy: MAX_ENERGY,
        autoEat: true,
        hp: PLAYER_BASE_HP,
        loadout: { ...state.loadout, spares: [] },
        carry,
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
  if (expedition.combat) return rejected(state, "return", "engaged");
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
  if (expedition.combat) return rejected(state, "move", "engaged");
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
    return engage(state, expedition, step, poiAtStep.creature, "move", true);
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
  if (expedition.combat) return rejected(state, "gather", "engaged");
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
  const qty = GATHER_YIELD[kind];
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
    if (usedSlots(candidate, expedition.carry, expedition.carriedMaps) > carryCap(candidate.equipment)) {
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
  const maxStacks = freeLootStacks(loadout, expedition.carriedMaps);
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
  const maxStacks = freeLootStacks(expedition.loadout, expedition.carriedMaps);
  let carryWithLoot: typeof expedition.carry | null = expedition.carry;
  for (const stack of loot) {
    carryWithLoot = addToCarry(carryWithLoot, stack.defId, stack.qty, maxStacks);
    if (carryWithLoot === null) return rejected(state, action, "carry-full");
  }
  const buff = battleBuff(expedition.loadout.battleItems ?? []);
  const monsterHp = MONSTER_TIER_HP_CURVE[MONSTERS[creature]!.tier]!;
  return {
    state: {
      ...state,
      expedition: {
        ...expedition,
        loadout: { ...expedition.loadout, battleItems: [] }, // consumed at engagement start (bzd)
        combat: {
          at: { x: at.x, y: at.y }, creature, monsterHp, moveOnWin,
          damageAdd: buff.damageAdd, mitigationAdd: buff.mitigationAdd,
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
    const grid = generateGrid(expedition.mapSeed, rollBiome(expedition.mapSeed));
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
      return engage(state, expedition, at, poi.creature, "fight", false, true);
    }
    // Not engaged, no target: engage the live monster on the CURRENT tile (as before).
    const poi = grid.pois.find((p) => p.x === pos.x && p.y === pos.y);
    const alreadyCleared = expedition.cleared.some((c) => c.x === pos.x && c.y === pos.y);
    if (!poi || poi.kind !== "monster" || alreadyCleared || poi.creature === null) {
      return rejected(state, "fight", "no-monster");
    }
    return engage(state, expedition, pos, poi.creature, "fight", false);
  }
  // Engaged: one exchange. A `fight at` aimed at a DIFFERENT tile mid-engagement
  // is rejected (you're locked in); re-targeting the engaged monster just swings.
  if (at !== undefined && (at.x !== combat.at.x || at.y !== combat.at.y)) {
    return rejected(state, "fight", "engaged");
  }
  // Arrow economy (D45): a wielded bow with ammo shoots — and spends — one arrow
  // per exchange, walk-in fights included (the bow always shoots if it can).
  // Arrows-out: playerDamage degrades the bow to UNARMED_DAMAGE (a club).
  const spendsArrow = wieldsRanged(expedition.loadout) && hasAmmo(expedition.loadout);
  const round = strikeExchange(
    expedition.loadout, expedition.hp, combat.monsterHp, combat.creature,
    combat.damageAdd, combat.mitigationAdd, expedition.autoQuaff ?? true,
    combat.opener ?? false, // ranged opener (D45): skip the monster's FIRST retaliation
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
  };
  const loadout = { ...expedition.loadout, potions: round.potionsAfter, ammo };
  const fought = (victory: boolean): GameEvent => ({
    type: "fought", at: { x: combat.at.x, y: combat.at.y }, creature: combat.creature,
    // quaffing above startHp reads as 0 lost, not negative
    victory, hpLost: Math.max(0, combat.startHp - round.hp), potionsUsed,
    loot: victory ? rollLoot(state.seed, combat.creature, combat.at).filter((s) => s.defId !== MAP_SCROLL_ID) : [],
    hp: round.hp, matchup: explainMatchup(expedition.loadout, combat.creature),
  });
  if (round.defeated) {
    const ended = endExpedition(state, { ...expedition, loadout, combat: undefined });
    return { state: ended, events: [exchanged, fought(false), { type: "run-ended", reason: "defeated" }] };
  }
  if (!round.victory) {
    return {
      state: { ...state, expedition: { ...expedition, hp: round.hp, loadout, combat: { ...combat, monsterHp: round.monsterHp, potionsUsed, opener: false } } }, // opener spent after the first exchange (D45)
      events: [exchanged],
    };
  }
  // Victory: apply loot/maps/cleared/relocation exactly as the old fightAt did.
  const rolled = rollLoot(state.seed, combat.creature, combat.at);
  const mapDrops = rolled.filter((s) => s.defId === MAP_SCROLL_ID);
  const loot = rolled.filter((s) => s.defId !== MAP_SCROLL_ID);
  const maxStacks = freeLootStacks(loadout, expedition.carriedMaps);
  let carryWithLoot: typeof expedition.carry = expedition.carry;
  for (const stack of loot) {
    carryWithLoot = addToCarry(carryWithLoot, stack.defId, stack.qty, maxStacks)!; // fit-checked at engage; carry can't change while engaged
  }
  const carriedMaps = expedition.carriedMaps ?? [];
  let mapsAfter = carriedMaps;
  const mapEvents: GameEvent[] = [];
  if (mapDrops.length > 0) {
    const mapSeed = `${expedition.mapSeed}:drop:${combat.at.x},${combat.at.y}`;
    const biomeId = rollBiome(mapSeed);
    const carried = carryWithLoot.length + carriedMaps.length < freeCarryStacks(loadout);
    if (carried) mapsAfter = [...carriedMaps, { mapSeed, biomeId, vintage: state.runs ?? 0 }];
    mapEvents.push({ type: "map-dropped", at: { x: combat.at.x, y: combat.at.y }, mapSeed, biomeId, hints: previewHints(mapSeed, biomeId), carried });
  }
  return {
    state: {
      ...state,
      expedition: {
        ...expedition,
        pos: combat.moveOnWin ? { x: combat.at.x, y: combat.at.y } : expedition.pos,
        hp: round.hp, loadout, carry: carryWithLoot,
        cleared: [...expedition.cleared, { x: combat.at.x, y: combat.at.y }],
        carriedMaps: mapsAfter,
        combat: undefined,
      },
    },
    events: [exchanged, fought(true), ...mapEvents],
  };
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
  return {
    state: {
      ...state,
      expedition: {
        ...expedition, hp,
        loadout: { ...expedition.loadout, potions: next },
        combat: { ...combat, potionsUsed: combat.potionsUsed + 1 },
      },
    },
    events: [{ type: "quaffed", defId: front.defId, healed: hp - expedition.hp, hp }],
  };
}

function toggleAutoQuaff(state: GameState): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) return rejected(state, "toggle-auto-quaff", "not-on-expedition");
  const on = !(expedition.autoQuaff ?? true);
  return { state: { ...state, expedition: { ...expedition, autoQuaff: on } }, events: [{ type: "auto-quaff-toggled", on }] };
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
  if (expedition.combat) return { rejected: rejected(state, action, "engaged") };
  if (DON_DOFF_ENERGY > expedition.energy) return { rejected: rejected(state, action, "exhausted") };
  return { expedition };
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
  if (usedSlots(loadout, carryNext, expedition.carriedMaps) > carryCap(equipment)) {
    return rejected(state, "don", "carry-full");
  }
  const fed = autoRefill({ ...expedition, loadout }, expedition.energy - DON_DOFF_ENERGY);
  return {
    state: {
      ...state,
      expedition: { ...expedition, energy: fed.energy, loadout: { ...loadout, food: fed.food }, carry: carryNext },
    },
    events: [{ type: "donned", defId: itemId, slot, displaced, energy: fed.energy }],
  };
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
  if (usedSlots(loadout, carryNext, expedition.carriedMaps) > carryCap(equipment)) {
    return rejected(state, "doff", "carry-full");
  }
  const fed = autoRefill({ ...expedition, loadout }, expedition.energy - DON_DOFF_ENERGY);
  return {
    state: {
      ...state,
      expedition: { ...expedition, energy: fed.energy, loadout: { ...loadout, food: fed.food }, carry: carryNext },
    },
    events: [{ type: "doffed", defId: itemId, slot, energy: fed.energy }],
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
  if (expedition.combat) return rejected(state, "eat", "engaged");
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
