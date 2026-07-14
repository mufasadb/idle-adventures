import { test, expect } from "bun:test";
import { newGame, candidateMaps } from "../src/engine/town";
import { rollBiome } from "../src/engine/grid";
import { CANDIDATE_MAP_COUNT } from "../src/data/constants";

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

test("candidateMaps: CANDIDATE_MAP_COUNT deterministic maps, biome-name headline, no hints at fidelity 0", () => {
  const maps = candidateMaps("town-seed");
  expect(maps.length).toBe(CANDIDATE_MAP_COUNT);
  expect(candidateMaps("town-seed")).toEqual(maps); // deterministic
  for (const m of maps) {
    expect(m.biomeId).toBe(rollBiome(m.mapSeed)); // anyone with the seed re-derives the biome (D21)
    expect(m.preview.headline).toBe(m.biomeId); // headline IS the biome name
    expect(m.preview.hints).toEqual([]); // PREVIEW_FIDELITY === 0
  }
});

test("candidateMaps: distinct map seeds", () => {
  const seeds = candidateMaps("town-seed").map((m) => m.mapSeed);
  expect(new Set(seeds).size).toBe(seeds.length);
});
