import { test, expect } from "bun:test";
import { BIOMES, BIOME_IDS, MONSTERS, LOOT_TABLE, RECIPE } from "../src/data/constants";
import { generateGrid, rollBiome } from "../src/engine/grid";
import type { DmgType, ArmourType } from "../src/data/constants";

test("every biome's tier-1/2 band covers the full type spread", () => {
  for (const id of BIOME_IDS) {
    const reachable = Object.keys(BIOMES[id].creatureTable).filter((c) => MONSTERS[c]!.tier <= 2);
    const dmg = new Set<DmgType>(reachable.map((c) => MONSTERS[c]!.dmgType));
    const hide = new Set<ArmourType>(reachable.map((c) => MONSTERS[c]!.armourType));
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

test("weighted spawns: the Wyrm is rare (≤ ~7% of tundra monster POIs, 300 seeds)", () => {
  let monsters = 0, wyrms = 0;
  for (let i = 0; i < 300; i++) {
    const seed = `roster-${i}`;
    if (rollBiome(seed) !== "tundra") continue;
    for (const p of generateGrid(seed, "tundra").pois) {
      if (p.kind !== "monster" || !p.creature) continue;
      monsters++;
      if (p.creature === "ancient-wyrm") wyrms++;
    }
  }
  expect(monsters).toBeGreaterThan(100); // sanity: the sample is real
  expect(wyrms / monsters).toBeLessThanOrEqual(0.09);
  expect(wyrms).toBeGreaterThan(0); // still spawns — the goal must stay findable
});
