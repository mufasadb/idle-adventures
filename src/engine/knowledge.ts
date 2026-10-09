// Crafting fog (675, D104): who knows which recipe, and how deep each recipe sits.
// Spec: docs/superpowers/specs/2026-10-09-crafting-fog-research-design.md
//
// A recipe is KNOWN when any of: it's a STARTER_RECIPE; you've crafted it; the
// research table revealed it; or it's "next" — every one of its inputs is an item
// you have EVER held (state.seen). With `recipeFog` off (old saves, terse test
// states, the balance sim/harness) every recipe is known and nothing here runs.
//
// Recipe TIERS (verticality): derived from data — the lowest map tier where each raw
// input can be had, a crafted input takes its own recipe's tier, a recipe is the max
// of its inputs/tools/station (min 1) — with RECIPE_TIER_OVERRIDE for "meant for
// later" things. Research only reaches recipes up to progressTier + lookahead.
import type { GameState, GameEvent, ItemStack, Loadout } from "./types";
import {
  RECIPE,
  BIOMES,
  BIOME_IDS,
  RARE_BIOMES,
  MATERIAL_GATE,
  MONSTERS,
  LOOT_TABLE,
  MAP_TIER_CREATURE_ADD,
  LOCKBOX_LOOT,
  CATCH_EFFECT,
  FRESH_TO_STALE,
  STARTER_BANK,
  STARTER_RECIPES,
  RECIPE_TIER_OVERRIDE,
  GATED_MATERIAL_TIER_STEP,
  FISH_WATER_GEAR,
  MAP_TIER_MAX,
} from "../data/constants";
import type { BiomeId, FishWater } from "../data/constants";
import { CONSUMABLE_KEYS } from "./catalog";

// ---------------------------------------------------------------------------
// Tiers
// ---------------------------------------------------------------------------

const biomeMinTier = (b: BiomeId): number => RARE_BIOMES[b]?.minTier ?? 1;

// Fixed point over the item graph: item tier = MIN over its sources, recipe tier =
// MAX over its requirements (or the override). Values only fall from Infinity, so
// the loop converges; cycles (bog-iron → iron-ore) are harmless.
function computeTiers(): { items: Map<string, number>; recipes: Map<string, number> } {
  const items = new Map<string, number>();
  const recipes = new Map<string, number>();
  const tierOf = (defId: string): number => items.get(defId) ?? Infinity;
  // A GATED material (MATERIAL_GATE) never sits below its cheapest opening tool + a
  // step, whatever the source (a lucky lockbox silver doesn't make silver a T1 material).
  const gateFloor = (defId: string): number => {
    const gate = MATERIAL_GATE[defId];
    return gate ? Math.min(...gate.tools.map(tierOf)) + GATED_MATERIAL_TIER_STEP : 1;
  };
  const offer = (defId: string, offered: number): boolean => {
    const t = Math.max(offered, gateFloor(defId));
    if (t < tierOf(defId)) { items.set(defId, t); return true; }
    return false;
  };
  for (let pass = 0, changed = true; changed && pass < 100; pass++) {
    changed = false;
    for (const s of STARTER_BANK) changed = offer(s.defId, 1) || changed;
    for (const b of BIOME_IDS) {
      const biome = BIOMES[b];
      const bt = biomeMinTier(b);
      // Gathered materials: the biome's floor (offer() applies any gate floor).
      for (const table of Object.values(biome.materialTable)) {
        for (const mat of Object.keys(table ?? {})) changed = offer(mat, bt) || changed;
      }
      // Fish: floored by the gear the water needs (rod; a boat for deep water).
      for (const [water, table] of Object.entries(biome.fishTable ?? {})) {
        const gearTier = Math.max(1, ...FISH_WATER_GEAR[water as FishWater].map(tierOf));
        const t = Math.max(bt, gearTier);
        for (const c of Object.keys(table ?? {})) {
          changed = offer(c, t) || changed;
          if (CATCH_EFFECT[c] === "lockbox") for (const l of LOCKBOX_LOOT) changed = offer(l.defId, t) || changed;
        }
      }
      // Monster loot: no earlier than the monster's own tier or the first map tier it spawns on.
      const spawns: [string, number][] = Object.keys(biome.creatureTable).map((c) => [c, bt]);
      for (const [t, add] of Object.entries(MAP_TIER_CREATURE_ADD[b])) {
        for (const c of Object.keys(add)) spawns.push([c, Math.max(bt, Number(t))]);
      }
      for (const [c, spawnTier] of spawns) {
        const t = Math.max(spawnTier, MONSTERS[c]?.tier ?? 1);
        for (const l of LOOT_TABLE[c] ?? []) changed = offer(l.defId, t) || changed;
      }
    }
    for (const [fresh, stale] of Object.entries(FRESH_TO_STALE)) changed = offer(stale, tierOf(fresh)) || changed;
    for (const [id, r] of Object.entries(RECIPE)) {
      const reqs = [
        ...r.inputs.map((i) => tierOf(i.defId)),
        ...(r.requires?.tools ?? []).map(tierOf),
        ...(r.requires?.station ? [tierOf(r.requires.station)] : []),
      ];
      const t = RECIPE_TIER_OVERRIDE[id] ?? Math.max(1, ...reqs);
      if (t !== recipes.get(id)) { recipes.set(id, t); changed = true; }
      if (Number.isFinite(t)) changed = offer(r.output.defId, t) || changed;
    }
  }
  return { items, recipes };
}

let tierMemo: ReturnType<typeof computeTiers> | null = null;
const tiers = () => (tierMemo ??= computeTiers());

// The tier of one recipe (1..MAP_TIER_MAX). An unknown id, or a recipe whose inputs
// have no source anywhere (a data bug — pinned by test), reads as MAP_TIER_MAX.
export function recipeTier(recipeId: string): number {
  const t = tiers().recipes.get(recipeId);
  return t === undefined || !Number.isFinite(t) ? MAP_TIER_MAX : Math.min(MAP_TIER_MAX, t);
}

// The whole table, recipe id → tier, in catalog order (snapshot-pinned; the web's tree).
export function recipeTierTable(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of Object.keys(RECIPE)) out[id] = recipeTier(id);
  return out;
}

// The lowest map tier an ITEM can be had at (raw source or cheapest recipe). Infinity = no source.
export function itemTier(defId: string): number {
  return tiers().items.get(defId) ?? Infinity;
}

// ---------------------------------------------------------------------------
// Knowledge
// ---------------------------------------------------------------------------

export const fogOn = (state: GameState): boolean => state.recipeFog ?? false;

// The player's progress tier for research: the highest map tier embarked on, or held.
export function progressTier(state: GameState): number {
  return Math.max(
    state.maxTier ?? 1,
    state.expedition?.mapTier ?? 1,
    ...(state.maps ?? []).map((m) => m.tier ?? 1),
    ...(state.expedition?.carriedMaps ?? []).map((m) => m.tier ?? 1),
  );
}

// "Next": every input has been held at some point.
function isNext(seen: ReadonlySet<string>, recipeId: string): boolean {
  const r = RECIPE[recipeId];
  return !!r && r.inputs.every((i) => seen.has(i.defId));
}

// Known without research — starter, crafted, or next.
function knownBase(state: GameState, seen: ReadonlySet<string>, recipeId: string): boolean {
  return STARTER_RECIPES.includes(recipeId) || (state.crafted ?? []).includes(recipeId) || isNext(seen, recipeId);
}

// May this recipe be crafted / shown? Always true with fog off.
export function isRecipeKnown(state: GameState, recipeId: string): boolean {
  if (!fogOn(state)) return true;
  if ((state.revealed ?? []).includes(recipeId)) return true;
  return knownBase(state, new Set(state.seen ?? []), recipeId);
}

export type RecipeStatus = "known" | "revealed" | "hidden";
export type InputStatus = "seen" | "heard" | "unknown";
export type RecipeKnowledge = {
  recipeId: string;
  output: string; // output defId
  status: RecipeStatus; // known (starter/crafted/next) > revealed (research only) > hidden
  affordable: boolean; // every input is in the bank in the needed qty (materials only — station/tool gates are the reducer's job: whyNot)
  tier: number;
  inputs: { defId: string; qty: number; status: InputStatus }[]; // DIRECT inputs only — the web greys "heard"/"unknown" nodes
};

// The fogged recipe book as data, for both surfaces. With fog off every row is 'known'.
export function recipeKnowledge(state: GameState): RecipeKnowledge[] {
  const fog = fogOn(state);
  const seen = new Set(state.seen ?? []);
  const heard = new Set(state.heard ?? []);
  const revealed = new Set(state.revealed ?? []);
  const bank = new Map(state.bank.map((s) => [s.defId, s.qty]));
  return Object.keys(RECIPE).map((recipeId) => {
    const r = RECIPE[recipeId]!;
    const status: RecipeStatus = !fog || knownBase(state, seen, recipeId) ? "known" : revealed.has(recipeId) ? "revealed" : "hidden";
    return {
      recipeId,
      output: r.output.defId,
      status,
      affordable: r.inputs.every((i) => (bank.get(i.defId) ?? 0) >= i.qty),
      tier: recipeTier(recipeId),
      inputs: r.inputs.map((i) => ({
        defId: i.defId,
        qty: i.qty,
        status: !fog || seen.has(i.defId) ? "seen" : heard.has(i.defId) ? "heard" : "unknown",
      })),
    };
  });
}

// Every defId the player holds right now: bank + town loadout + (on a run) carry and
// the run loadout. The "ever held" tracker unions this in after each action.
function loadoutDefIds(l: Loadout): string[] {
  const e = l.equipment;
  const out: string[] = [...e.tools];
  for (const g of [e.weapon, e.helmet, e.chest, e.legs, e.boots, e.gloves, e.transport, e.backpack, e.panniers, e.quiver ?? null]) if (g) out.push(g);
  for (const key of CONSUMABLE_KEYS) for (const s of l[key] ?? []) out.push(s.defId);
  for (const s of l.spares ?? []) out.push(s.defId);
  return out;
}
export function heldDefIds(state: GameState): string[] {
  const out = [...state.bank.map((s) => s.defId), ...loadoutDefIds(state.loadout), ...(state.stations ?? [])];
  if (state.expedition) out.push(...state.expedition.carry.map((s) => s.defId), ...loadoutDefIds(state.expedition.loadout));
  return out;
}

function union(base: string[] | undefined, add: Iterable<string>): string[] | undefined {
  const have = new Set(base ?? []);
  const fresh: string[] = [];
  for (const x of add) if (!have.has(x)) { have.add(x); fresh.push(x); }
  return fresh.length ? [...(base ?? []), ...fresh] : base;
}

// The knowledge hook (reduce.ts runs it after every action): while fog is on, fold
// what you now hold into `seen`, crafted events into `crafted`, and the run's map tier
// into `maxTier`. One choke point catches every way an item enters your hands (gather,
// loot, fish, lockbox, craft, field-craft, banking). A rejected action (state returned
// unchanged) and a fog-off game are left byte-identical.
export function trackKnowledge(prev: GameState, result: { state: GameState; events: GameEvent[] }): { state: GameState; events: GameEvent[] } {
  const s = result.state;
  if (s === prev || !fogOn(s)) return result;
  const seen = union(s.seen, heldDefIds(s));
  const crafted = union(s.crafted, result.events.flatMap((e) => (e.type === "crafted" ? [e.recipeId] : [])));
  const runTier = s.expedition?.mapTier ?? 1;
  const maxTier = runTier > (s.maxTier ?? 1) ? runTier : s.maxTier;
  if (seen === s.seen && crafted === s.crafted && maxTier === s.maxTier) return result;
  return { state: { ...s, seen, crafted, maxTier }, events: result.events };
}

// Switch fog on for an existing save (pure migration; the web decides whether to call
// it). Seeds `seen` from everything held now, `crafted` from recipe outputs you own
// (a starter-kit item like ration/potion is NOT evidence you crafted it) and built
// stations, and `maxTier` from held maps / the current run. Idempotent.
export function enableRecipeFog(state: GameState): GameState {
  const held = heldDefIds(state);
  const starter = new Set(STARTER_BANK.map((s) => s.defId));
  const owned = new Set(held.filter((d) => !starter.has(d)));
  const craftedIds = Object.keys(RECIPE).filter((id) => owned.has(RECIPE[id]!.output.defId));
  const tier = progressTier(state);
  return {
    ...state,
    recipeFog: true,
    seen: union(state.seen, held) ?? [],
    crafted: union(state.crafted, craftedIds) ?? [],
    ...(tier > 1 || state.maxTier !== undefined ? { maxTier: Math.max(tier, state.maxTier ?? 1) } : {}),
  };
}

// Inputs a research reveal names that you have never held (→ state.heard).
export function unheldInputs(state: GameState, recipeId: string): ItemStack[] {
  const seen = new Set(state.seen ?? []);
  return (RECIPE[recipeId]?.inputs ?? []).filter((i) => !seen.has(i.defId)).map((i) => ({ ...i }));
}
