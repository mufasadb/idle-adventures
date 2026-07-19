import type { GameState, GameEvent, ItemStack, Expedition, Loadout } from "./types";
import { expeditionGrid, rollBiome } from "./grid";
import { addToCarry, freeLootStacks, mapCarryCap, consumeOne } from "./carry";
import { strikeExchange, rollLoot, explainMatchup, damageTaken, wieldsRanged, hasAmmo } from "./combat";
import type { ExchangeResult } from "./combat";
import { endExpedition } from "./bank";
import { previewHints } from "./town";
import { slotOf } from "./catalog";
import { MAP_SCROLL_ID, MONSTERS, MONSTER_TIER_HP_CURVE, MAP_TIER_MAX, PLAYER_BASE_HP, POTION_HEAL, POTION_HEAL_BY, QUAFF_ENERGY, COMBAT_BUFF, WEAPON_ENHANCEMENT } from "../data/constants";
import { rejected, autoRefill } from "./reduce-shared";

// Start an engagement (si7.1, replaces atomic fightAt): the fit-check still
// runs BEFORE any blood (rejecting is free), battle items are consumed NOW and
// their buffs ride the Engagement for all its rounds. No exchange here — the
// player sees the forecast before the first swing.
export function engage(
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

export function fight(state: GameState, at?: { x: number; y: number }): { state: GameState; events: GameEvent[] } {
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
    {
      damageAdd: combat.damageAdd,
      mitigationAdd: combat.mitigationAdd,
      autoQuaff: expedition.autoQuaff ?? true,
      skipRetaliation: combat.opener ?? false, // ranged opener (D45): skip the monster's FIRST retaliation
      weaponBuff: expedition.weaponBuff, // D60: coating charges spent per strike
      poison: combat.poison, // poison ticks per round (same math as resolveCombat)
    },
  );
  let ammo = expedition.loadout.ammo ?? [];
  if (spendsArrow) ammo = consumeOne(ammo); // front stack, FIFO — mirrors potions/food
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
  // Victory: loot/maps/cleared/relocation all applied in applyVictory (the clean seam
  // the deferred positional-combat work will want, D69).
  return applyVictory(state, round, loadout, loot, mapDrops, [exchanged, fought(true)]);
}

// Apply a won exchange (xkz, extracted from fightRound): route the kill's loot into
// carry, mint any map drop into the carried-map pool, clear the tile, relocate on a
// walk-in win, and end the engagement. `precedingEvents` are the exchange/fought
// events fightRound already assembled; map-dropped events append after them.
// The carry fit was checked at engage AND re-checked by any mid-fight don/doff (xe4,
// pendingLootFits) — so this can't overflow; fail loudly if that invariant ever
// breaks again rather than writing carry:null into state.
function applyVictory(
  state: GameState,
  round: ExchangeResult,
  loadout: Loadout,
  loot: ItemStack[],
  mapDrops: ItemStack[],
  precedingEvents: GameEvent[],
): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition!;
  const combat = expedition.combat!;
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
    events: [...precedingEvents, ...mapEvents],
  };
}

// 67e: after an engage, if auto-finish is on, resolve the whole fight now (else the
// player would have to click Fight). No-op when not engaged or the flag is off.
export function maybeAutoFinish(
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

export function flee(state: GameState): { state: GameState; events: GameEvent[] } {
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
export function quaff(state: GameState): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) return rejected(state, "quaff", "not-on-expedition");
  const combat = expedition.combat;
  const potions = expedition.loadout.potions;
  if (potions.length === 0 || expedition.hp >= PLAYER_BASE_HP) return rejected(state, "quaff", "insufficient");
  if (!combat && QUAFF_ENERGY > expedition.energy) return rejected(state, "quaff", "exhausted");
  const front = potions[0]!;
  const heal = POTION_HEAL_BY[front.defId] ?? POTION_HEAL;
  const hp = Math.min(PLAYER_BASE_HP, expedition.hp + heal);
  const next = consumeOne(potions);
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
export function useItem(state: GameState, itemId: string): { state: GameState; events: GameEvent[] } {
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
  const next = consumeOne(items, idx);
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
export function enhance(state: GameState, id: string): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) return rejected(state, "enhance", "not-on-expedition");
  if (slotOf(id) !== "enhancement") return rejected(state, "enhance", "wrong-slot");
  const held = expedition.loadout.enhancements ?? [];
  const idx = held.findIndex((s) => s.defId === id);
  if (idx === -1) return rejected(state, "enhance", "insufficient");
  const charges = WEAPON_ENHANCEMENT[id]!.charges;
  const next = consumeOne(held, idx);
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

export function toggleAutoFinish(state: GameState): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) return rejected(state, "toggle-auto-finish", "not-on-expedition");
  const on = !(expedition.autoFinish ?? false);
  return { state: { ...state, expedition: { ...expedition, autoFinish: on } }, events: [{ type: "auto-finish-toggled", on }] };
}

// 67e: a non-flee in-combat action (coat / manual potion / gear-swap) costs a TURN —
// the engaged monster lands one damageTaken hit (no player swing), exactly like flee's
// parting hit, and it can soft-fail. `exp` is the post-action expedition (combat still
// set); `events` are the action's own events, which the retaliation is appended to.
export function provokeTurn(
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

// idle-adventure-xe4: the victory path applies the engaged monster's rolled loot
// with a bare addToCarry(...)! trusting the fit-check that ran at engage. Since 67e
// a mid-fight don/doff is legal and mutates carry, so any in-combat swap must RE-
// verify the pending loot still fits the candidate kit — else victory would write
// carry:null (silent state corruption). Mirrors engage()'s pre-check.
export function pendingLootFits(
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
