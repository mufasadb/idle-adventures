import { test, expect } from "bun:test";
import { newGame, localMap } from "../src/engine/town";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { familyHints } from "../src/engine/hints";
import { BIOME_IDS, HINT_FALLBACK, HINT_FAMILIES, RARE_BIOMES } from "../src/data/constants";

const BASE_BIOMES = BIOME_IDS.filter((id) => !RARE_BIOMES[id]); // the T1 lands (mirrors rollBiome)

test("newGame: a town state with a functional starter bank", () => {
  const g = newGame("s1");
  expect(g.phase).toBe("town");
  expect(g.expedition).toBeNull();
  const has = (d: string) => g.bank.some((s) => s.defId === d && s.qty > 0);
  expect(has("small-backpack")).toBe(false); // you start WITHOUT a backpack — it's the first craft
  expect(has("pick")).toBe(false); // xls/9az bootstrap: you start with NO tools/weapon — you knap them your first run (flint + deadwood)
  expect(has("sword")).toBe(false);
  expect(has("ration")).toBe(true); // food only — enough to embark with energy and forage the first kit
});

test("newGame: deterministic", () => {
  expect(newGame("s1")).toEqual(newGame("s1"));
});

test("localMap: a single deterministic map, biome-name headline, no hints — it's plain (zpm.1, D102)", () => {
  const m = localMap("town-seed");
  expect(localMap("town-seed")).toEqual(m); // deterministic per (seed, runs)
  expect(m.biomeId).toBe(rollBiome(m.mapSeed)); // anyone with the seed re-derives the biome (D21)
  expect(m.preview.headline).toBe(m.biomeId); // headline IS the biome name
  expect(m.preview.hints).toEqual([]); // D102: a plain map has nothing to whisper
});

test("localMap: the free map is PLAIN — nothing remarkable, so rerolling it can't fish for a good map (D102, D113)", () => {
  // D113 searches for a plain map WITHIN the pre-rolled biome. Desert/tundra maps are
  // plain often enough (~7-11%) that 64 in-biome tries always find one; woodland is
  // rarely plain (~1.3%), so it may fall back to the least remarkable candidate — at
  // most one family off its fallback, and the offer still shows no hints.
  for (let r = 0; r < 20; r++) {
    const m = localMap("plain-seed", r);
    const fam = familyHints(generateGrid(m.mapSeed, m.biomeId));
    const off = HINT_FAMILIES.filter((f) => fam[f] !== HINT_FALLBACK[f].id).length;
    if (m.biomeId === "woodland") expect(off).toBeLessThanOrEqual(1);
    else expect(off).toBe(0);
  }
}, 30000); // up to 64 grid generations per woodland map

test("localMap: the starter land splits evenly across the base biomes (D113)", () => {
  // Was ~51% desert / 44% tundra / 4.5% woodland when the plain filter ran across
  // biomes (woodland almost never qualified). The biome is now rolled first.
  const N = 200;
  const tally: Record<string, number> = {};
  for (let i = 0; i < N; i++) {
    const m = localMap(`split-${i}`, 0);
    tally[m.biomeId] = (tally[m.biomeId] ?? 0) + 1;
    expect(m.biomeId).toBe(rollBiome(m.mapSeed)); // the seed still re-derives its land (D21)
  }
  expect(Object.keys(tally).sort()).toEqual([...BASE_BIOMES].sort());
  // 1/3 each ± 10 points (binomial sd at N=200 is ~3.3 points)
  for (const b of BASE_BIOMES) expect(Math.abs(tally[b]! / N - 1 / 3)).toBeLessThan(0.1);
}, 60000); // 200 starter maps, each a plain-map search

test("localMap: rotates per run-count — distinct seeds across visits (D80)", () => {
  const seeds = [0, 1, 2, 3, 4].map((r) => localMap("town-seed", r).mapSeed);
  expect(new Set(seeds).size).toBe(seeds.length);
});
