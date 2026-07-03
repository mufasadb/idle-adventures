// Town entry (M5): a fresh game's starter state, and the town's candidate-map
// offer. candidateMaps is a pure helper (like the future legalActions, M6) that
// feeds both the web view and the AI harness — it is NOT a reducer action;
// embark carries only the chosen mapSeed.
import type { GameState } from "./types";
import type { BiomeId } from "../data/constants";
import { emptyLoadout } from "./loadout";
import { rollBiome } from "./grid";
import { CANDIDATE_MAP_COUNT, PREVIEW_FIDELITY } from "../data/constants";

// Modest, functional starter kit: enough to run a real first expedition. Gear
// upgrades come from crafting the haul (the loop's point).
export function newGame(seed: string): GameState {
  return {
    seed,
    phase: "town",
    bank: [
      { defId: "starter", qty: 1 }, // starter backpack (4 slots)
      { defId: "pick", qty: 1 },
      { defId: "axe", qty: 1 },
      { defId: "knife", qty: 1 },
      { defId: "sword", qty: 1 },
      { defId: "ration", qty: 4 },
      { defId: "potion", qty: 2 },
    ],
    loadout: emptyLoadout(),
    expedition: null,
  };
}

// PREVIEW_FIDELITY (0 for the POC) scales hints beyond the biome-name headline.
// Structured so higher tiers — and a later cartography system (craftable/editable
// maps) — plug in here without reshaping the return type.
function previewHints(_mapSeed: string, _biomeId: BiomeId): string[] {
  if (PREVIEW_FIDELITY <= 0) return [];
  return []; // higher-fidelity whispers land here when the lever is raised
}

export function candidateMaps(
  seed: string,
): { mapSeed: string; biomeId: BiomeId; preview: { headline: string; hints: string[] } }[] {
  const maps: { mapSeed: string; biomeId: BiomeId; preview: { headline: string; hints: string[] } }[] = [];
  for (let i = 0; i < CANDIDATE_MAP_COUNT; i++) {
    const mapSeed = `${seed}:map:${i}`;
    const biomeId = rollBiome(mapSeed);
    maps.push({ mapSeed, biomeId, preview: { headline: biomeId, hints: previewHints(mapSeed, biomeId) } });
  }
  return maps;
}
