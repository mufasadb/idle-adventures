// Town entry (M5): a fresh game's starter state, and the town's candidate-map
// offer. candidateMaps is a pure helper (like the future legalActions, M6) that
// feeds both the web view and the AI harness — it is NOT a reducer action;
// embark carries only the chosen mapSeed.
import type { GameState } from "./types";
import type { BiomeId } from "../data/constants";
import type { Grid } from "./grid";
import { emptyLoadout } from "./loadout";
import { rollBiome, generateGrid } from "./grid";
import { CANDIDATE_MAP_COUNT, PREVIEW_FIDELITY, EPITHETS, MONSTERS, STARTER_BANK } from "../data/constants";

// Modest, functional starter kit: enough to run a real first expedition. You
// start with NO backpack (bare BASE_CARRY_SLOTS) — the "starter" pack is your
// first craftable upgrade. Everything else comes from crafting the haul.
export function newGame(seed: string): GameState {
  return {
    seed,
    phase: "town",
    bank: STARTER_BANK.map((s) => ({ ...s })), // clone the lever so run-state never mutates it (e96)
    loadout: emptyLoadout(),
    expedition: null,
    runs: 0,
  };
}

// PREVIEW_FIDELITY (0 for the POC) scales hints beyond the biome-name headline.
// Structured so higher tiers — and a later cartography system (craftable/editable
// maps) — plug in here without reshaping the return type. Exported for the
// map-dropped event (8ec): a dropped map previews exactly like an offered one.
export function previewHints(_mapSeed: string, _biomeId: BiomeId): string[] {
  if (PREVIEW_FIDELITY <= 0) return [];
  return []; // higher-fidelity whispers land here when the lever is raised
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

// The town's offer for the CURRENT visit. `runs` (GameState.runs) advances the
// seed namespace so every return to town rolls a fresh batch of Perlin maps —
// the world is effectively infinite, not the same 3 maps forever. Still pure and
// deterministic: (seed, runs) fully determines the offer.
export function candidateMaps(
  seed: string,
  runs = 0,
): { mapSeed: string; biomeId: BiomeId; preview: { headline: string; hints: string[] } }[] {
  const maps: { mapSeed: string; biomeId: BiomeId; preview: { headline: string; hints: string[] } }[] = [];
  for (let i = 0; i < CANDIDATE_MAP_COUNT; i++) {
    const mapSeed = `${seed}:map:${runs}:${i}`;
    const biomeId = rollBiome(mapSeed);
    maps.push({ mapSeed, biomeId, preview: { headline: biomeId, hints: previewHints(mapSeed, biomeId) } });
  }
  return maps;
}
