import type { GameState, GameEvent, ItemStack, LoadoutSlot } from "./types";
import { expeditionGrid } from "./grid";
import { emptyLoadout } from "./loadout";
import { energyCapOf } from "./carry";
import { subtractStacks } from "./bank";
import { rand } from "./rng";
import { craft as applyRecipe } from "./craft";
import { packItem, reserveLoadout } from "./pack";
import { localMap } from "./town";
import { MAX_ENERGY, PLAYER_BASE_HP, INKS, RECIPE } from "../data/constants";
import { rejected } from "./reduce-shared";
import { fieldCraftAction } from "./reduce-expedition";

export function embark(
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
export function inkMap(state: GameState, mapSeed: string, inkId: string): { state: GameState; events: GameEvent[] } {
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

export function craftAction(
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

export function packAction(
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
