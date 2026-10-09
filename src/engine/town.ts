// Town entry (M5): a fresh game's starter state, and the town's local-map offer.
// localMap is a pure helper (like legalActions) that feeds both the web view and
// the AI harness — it is NOT a reducer action; embark carries only the chosen
// mapSeed.
import type { GameState, MapItem } from "./types";
import type { BiomeId } from "../data/constants";
import type { Grid } from "./grid";
import { emptyLoadout } from "./loadout";
import { rollBiome, generateGrid } from "./grid";
import { EPITHETS, HINT_FALLBACK, HINT_FAMILIES, LOCAL_MAP_PLAIN_TRIES, MONSTERS, STARTER_BANK } from "../data/constants";
import { familyHints, hintLabel, rollMapHints } from "./hints";

// Modest, functional starter kit: enough to run a real first expedition. You
// start with NO backpack (bare BASE_CARRY_SLOTS) — the small-backpack is your
// first craftable upgrade. Everything else comes from crafting the haul.
// 675 (D104): `recipeFog` fogs the recipe book — real players' new games (web + the
// console) pass it; the balance sim / harness / tests don't, so their numbers never move.
// A fogged game starts having "seen" only its starter bank and knowing STARTER_RECIPES.
export function newGame(seed: string, opts: { recipeFog?: boolean } = {}): GameState {
  const base: GameState = {
    seed,
    phase: "town",
    bank: STARTER_BANK.map((s) => ({ ...s })), // clone the lever so run-state never mutates it (e96)
    loadout: emptyLoadout(),
    expedition: null,
    runs: 0,
  };
  return opts.recipeFog ? { ...base, recipeFog: true, seen: base.bank.map((s) => s.defId), crafted: [] } : base;
}

// Map hints (3iq, D95): a held map's hint ids in reveal order — rolled at mint and
// frozen on the MapItem; an old-save map without them re-derives (deterministic).
// Only the first `studied` are known; `study` in town reveals the next.
export function mapHintIds(m: MapItem): string[] {
  return m.hints ?? rollMapHints(generateGrid(m.mapSeed, m.biomeId, m.tier ?? 1), m.mapSeed);
}
export function revealedHints(m: MapItem): string[] {
  return mapHintIds(m).slice(0, m.studied ?? 0).map(hintLabel);
}

// Map epithet (q2k): the highest-priority EPITHETS label a map's generated
// content earns, or null (most maps). Tally POI materials / node-kinds / the
// max creature tier, then walk EPITHETS in order — first match wins. Reads the
// (memoized) grid, so calling it per offer each town render is cheap. Pure and
// deterministic in (mapSeed, biomeId, mapTier). Labels only — never a number.
export function epithetForGrid(grid: Grid): string | null {
  const materialCounts = new Map<string, number>();
  const nodeTypeCounts = new Map<string, number>();
  let maxCreatureTier = 0;
  for (const p of grid.pois) {
    nodeTypeCounts.set(p.kind, (nodeTypeCounts.get(p.kind) ?? 0) + 1);
    if (p.material) materialCounts.set(p.material, (materialCounts.get(p.material) ?? 0) + 1);
    if (p.creature) maxCreatureTier = Math.max(maxCreatureTier, MONSTERS[p.creature]?.tier ?? 0);
  }
  const total = grid.pois.length;
  for (const { label, test } of EPITHETS) {
    if ("material" in test) {
      if ((materialCounts.get(test.material) ?? 0) >= test.minCount) return label;
    } else if ("creatureTierAtLeast" in test) {
      if (maxCreatureTier >= test.creatureTierAtLeast) return label;
    } else if (total > 0 && (nodeTypeCounts.get(test.nodeType) ?? 0) / total >= test.minShare) {
      return label;
    }
  }
  return null;
}

export function mapEpithet(mapSeed: string, biomeId: BiomeId, mapTier = 1): string | null {
  return epithetForGrid(generateGrid(mapSeed, biomeId, mapTier));
}

// The town's single free "over the hill" local map (zpm.1, map-economy spec §①).
// Replaces the old 3-map offer: one deterministic T1 map, always available,
// never pocketable, never consumed on embark. `runs` (GameState.runs) advances
// the seed namespace so the local map ROTATES each town visit — a fresh Perlin
// map every time, not the same map forever (keeps it from going stale). Still
// pure and deterministic: (seed, runs) fully determines the map. The real map
// economy is now the drop-minted held maps (state.maps); this is the cheap-food
// + humanoid-map-drop seed of that climb.
export function localMap(
  seed: string,
  runs = 0,
): { mapSeed: string; biomeId: BiomeId; preview: { headline: string; hints: string[] } } {
  const key = `${seed}:local:${runs}`;
  const cached = localCache.get(key);
  if (cached) return cached;
  // D102: the free map is PLAIN — the first candidate seed whose every hint family is
  // the fallback ("nothing remarkable"), so rerolling it (free return, D62) can't fish
  // for a good map. Remarkable (hinted) maps only come from drops. No plain candidate
  // within the cap → the least remarkable one. Candidate 0 keeps the old seed shape.
  let best = { mapSeed: key, biomeId: rollBiome(key), remarkable: Infinity };
  for (let k = 0; k < LOCAL_MAP_PLAIN_TRIES && best.remarkable > 0; k++) {
    const mapSeed = k === 0 ? key : `${key}:${k}`;
    const biomeId = rollBiome(mapSeed);
    const fam = familyHints(generateGrid(mapSeed, biomeId));
    const remarkable = HINT_FAMILIES.filter((f) => fam[f] !== HINT_FALLBACK[f].id).length;
    if (remarkable < best.remarkable) best = { mapSeed, biomeId, remarkable };
  }
  // A plain map has nothing to whisper: no hints on the offer (they'd all read "ordinary").
  const out = { mapSeed: best.mapSeed, biomeId: best.biomeId, preview: { headline: best.biomeId, hints: [] as string[] } };
  if (localCache.size >= LOCAL_CACHE_CAP) localCache.clear();
  localCache.set(key, out);
  return out;
}
// Memo (pure in (seed, runs)): every town render and embark check asks for the local map.
const localCache = new Map<string, ReturnType<typeof localMap>>();
const LOCAL_CACHE_CAP = 64;
