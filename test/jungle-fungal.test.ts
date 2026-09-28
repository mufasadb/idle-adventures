// Set 2 content (si7.6.9.3–.5, D99/D100): jungle (venom, rich) + fungal forest (spores).
import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { terrainHpCost } from "../src/engine/move";
import { BIOMES, MONSTERS, RECIPE, FOOD, TERRAIN_HP_COST, TERRAIN_HP_FLOOR, MAP_WIDTH, MAP_HEIGHT } from "../src/data/constants";
import type { GameState } from "../src/engine/types";

test("rare rolls: jungle never below T2, fungal never below T3", () => {
  let jungle = 0, fungal = 0;
  for (let i = 0; i < 600; i++) {
    expect(["jungle", "fungal"]).not.toContain(rollBiome(`s2-${i}`, 1));
    expect(rollBiome(`s2-${i}`, 2)).not.toBe("fungal");
    const t3 = rollBiome(`s2-${i}`, 3);
    if (t3 === "jungle") jungle++;
    if (t3 === "fungal") fungal++;
  }
  expect(jungle).toBeGreaterThan(30); // ~12%
  expect(fungal).toBeGreaterThan(20); // ~8%
});

test("spore-thickets grow only where a biome has a spores layer", () => {
  const share = (b: "fungal" | "jungle") => {
    let n = 0, s = 0;
    for (let i = 0; i < 20; i++) for (const t of generateGrid(`sp-${i}`, b, 3).terrain.flat()) { n++; if (t === "spore-thicket") s++; }
    return s / n;
  };
  expect(share("fungal")).toBeGreaterThan(0.08);
  expect(share("jungle")).toBe(0);
});

test("spore-thicket costs HP per step — never below the floor — and a filter-mask negates it", () => {
  expect(terrainHpCost("spore-thicket", [])).toBe(TERRAIN_HP_COST["spore-thicket"]!);
  expect(terrainHpCost("spore-thicket", ["filter-mask"])).toBe(0);
  expect(terrainHpCost("plains", [])).toBe(0);
  // walk onto a real thicket tile from a walkable neighbour
  for (let i = 0; i < 20; i++) {
    const mapSeed = `walk-sp-${i}`;
    const g = generateGrid(mapSeed, "fungal", 3);
    for (let y = 1; y < MAP_HEIGHT - 1; y++) for (let x = 1; x < MAP_WIDTH - 1; x++) {
      if (g.terrain[y]![x] !== "spore-thicket" || g.terrain[y]![x - 1] !== "plains") continue;
      if (g.pois.some((p) => (p.x === x && p.y === y) || (p.x === x - 1 && p.y === y))) continue;
      const at = (hp: number, tools: string[] = []): GameState => {
        const loadout = emptyLoadout(); loadout.equipment.tools = tools;
        return { seed: "g", phase: "expedition", bank: [], loadout: emptyLoadout(),
          expedition: { mapSeed, biomeId: "fungal", mapTier: 3, pos: { x: x - 1, y }, energy: 300, hp, loadout, carry: [], cleared: [] } };
      };
      const bare = reduce(at(20), { type: "move", to: { x, y } });
      expect(bare.events[0]).toMatchObject({ type: "moved", hazardTaken: 2, hp: 18 });
      expect(reduce(at(20, ["filter-mask"]), { type: "move", to: { x, y } }).state.expedition!.hp).toBe(20);
      expect(reduce(at(TERRAIN_HP_FLOOR), { type: "move", to: { x, y } }).state.expedition!.hp).toBe(TERRAIN_HP_FLOOR);
      return;
    }
  }
  throw new Error("no spore-thicket beside plains found");
});

test("the jungle pays: more rich nodes than woodland at the same tier", () => {
  const rich = (b: "jungle" | "woodland") => {
    let r = 0, n = 0;
    for (let i = 0; i < 20; i++) for (const p of generateGrid(`rich-${i}`, b, 2).pois) if (p.kind !== "monster") { n++; if ((p.magnitude ?? 1) >= 2) r++; }
    return r / n;
  };
  expect(rich("jungle")).toBeGreaterThan(rich("woodland") * 1.4);
  expect(Object.keys(BIOMES.jungle.materialTable.mining!)).toContain("mithril-ore");
});

test("venom stays uncommon: only some jungle/fungal creatures are venomous, and no older one is", () => {
  for (const [id, m] of Object.entries(MONSTERS)) {
    if (!m.venom) continue;
    expect(["jungle-viper", "headhunter", "cave-spider"]).toContain(id);
    expect(m.venom.chance).toBeLessThanOrEqual(0.25);
  }
  for (const b of ["jungle", "fungal"] as const) {
    const t = BIOMES[b].creatureTable;
    const total = Object.values(t).reduce((a, w) => a + w, 0);
    const venomous = Object.entries(t).filter(([c]) => MONSTERS[c]!.venom).reduce((a, [, w]) => a + w, 0);
    expect(venomous / total).toBeLessThan(0.6);
  }
});

test("every Set 2 material has a use the moment it lands", () => {
  const consumed = (d: string) => Object.values(RECIPE).some((r) => r.inputs.some((i) => i.defId === d));
  for (const d of ["venom-sac", "spores"]) expect(consumed(d)).toBe(true);
  for (const d of ["jungle-fruit", "glowcap"]) expect(FOOD).toContain(d);
  expect(RECIPE["filter-mask"]).toBeDefined();
  expect(RECIPE.antidote!.field).toBe(true); // brewable before you ever meet venom
});
