// Town entry (M5): a fresh game's starter state, and the town's candidate-map
// offer. candidateMaps is a pure helper (like the future legalActions, M6) that
// feeds both the web view and the AI harness — it is NOT a reducer action;
// embark carries only the chosen mapSeed.
import type { GameState } from "./types";
import type { BiomeId } from "../data/constants";
import { emptyLoadout } from "./loadout";
import { rollBiome } from "./grid";
import { CANDIDATE_MAP_COUNT, PREVIEW_FIDELITY } from "../data/constants";

// Modest, functional starter kit: enough to run a real first expedition. You
// start with NO backpack (bare BASE_CARRY_SLOTS) — the "starter" pack is your
// first craftable upgrade. Everything else comes from crafting the haul.
export function newGame(seed: string): GameState {
  return {
    seed,
    phase: "town",
    bank: [
      { defId: "pick", qty: 1 },
      { defId: "axe", qty: 1 },
      { defId: "knife", qty: 1 },
      { defId: "sword", qty: 1 },
      { defId: "ration", qty: 5 }, // exactly one stack (STACK_CAP) — 1 slot, ~a run's buffer while you bootstrap the food loop
      { defId: "potion", qty: 2 },
    ],
    loadout: emptyLoadout(),
    expedition: null,
    runs: 0,
  };
}

// PREVIEW_FIDELITY (0 for the POC) scales hints beyond the biome-name headline.
// Structured so higher tiers — and a later cartography system (craftable/editable
// maps) — plug in here without reshaping the return type.
function previewHints(_mapSeed: string, _biomeId: BiomeId): string[] {
  if (PREVIEW_FIDELITY <= 0) return [];
  return []; // higher-fidelity whispers land here when the lever is raised
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
