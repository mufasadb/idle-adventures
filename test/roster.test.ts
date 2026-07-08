import { test, expect } from "bun:test";
import { BIOMES, BIOME_IDS, MONSTERS, LOOT_TABLE, RECIPE } from "../src/data/constants";
import { generateGrid, rollBiome } from "../src/engine/grid";
import type { DmgType, ArmourType } from "../src/data/constants";

test("every biome's tier-1/2 band covers the full type spread", () => {
  for (const id of BIOME_IDS) {
    // Resolve defs up front with a named failure (c5l): a creatureTable typo
    // reads "unknown creature X in woodland", not a bare undefined-access throw.
    const defs = Object.keys(BIOMES[id].creatureTable).map((c) => {
      const m = MONSTERS[c];
      if (!m) throw new Error(`unknown creature ${c} in ${id}`);
      return m;
    });
    const reachable = defs.filter((m) => m.tier <= 2);
    const dmg = new Set<DmgType>(reachable.map((m) => m.dmgType));
    const hide = new Set<ArmourType>(reachable.map((m) => m.armourType));
    expect(dmg.size).toBe(3); // melee + ranged + magic incoming
    expect(hide.size).toBe(3); // plate + light + robe hides
  }
});

test("every creatureTable entry is a real monster with loot feeding a recipe", () => {
  for (const id of BIOME_IDS) {
    for (const c of Object.keys(BIOMES[id].creatureTable)) {
      expect(MONSTERS[c]).toBeDefined();
      for (const drop of LOOT_TABLE[c] ?? []) {
        const feeds = Object.values(RECIPE).some((r) => r.inputs.some((i) => i.defId === drop.defId));
        const crafts = Object.values(RECIPE).some((r) => r.output.defId === drop.defId);
        expect(feeds || crafts).toBe(true); // peu rule: every part feeds the tree
      }
    }
  }
});

test("weighted spawns: the Wyrm is rare and tier-gated (≤ ~12% of tundra T3 monster POIs, 300 seeds)", () => {
  let monsters = 0, wyrms = 0;
  for (let i = 0; i < 300; i++) {
    const seed = `roster-${i}`;
    if (rollBiome(seed) !== "tundra") continue;
    // Wyrm is gated to T3+ (boss migration 2yn): scan T3 maps for rarity
    for (const p of generateGrid(seed, "tundra", 3).pois) {
      if (p.kind !== "monster" || !p.creature) continue;
      monsters++;
      if (p.creature === "ancient-wyrm") wyrms++;
    }
  }
  expect(monsters).toBeGreaterThan(100); // sanity: the sample is real
  expect(wyrms / monsters).toBeLessThanOrEqual(0.12); // wyrm weight 1 out of 15 at T3 ≈ 7%
  expect(wyrms).toBeGreaterThan(0); // still spawns — the goal must stay findable
}, 30000);
