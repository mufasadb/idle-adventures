import { test, expect } from "bun:test";
import { newGame, localMap } from "../src/engine/town";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { familyHints } from "../src/engine/hints";
import { HINT_FALLBACK, HINT_FAMILIES } from "../src/data/constants";

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

test("localMap: the free map is PLAIN — nothing remarkable, so rerolling it can't fish for a good map (D102)", () => {
  for (let r = 0; r < 20; r++) {
    const m = localMap("plain-seed", r);
    const fam = familyHints(generateGrid(m.mapSeed, m.biomeId));
    for (const f of HINT_FAMILIES) expect(fam[f]).toBe(HINT_FALLBACK[f].id);
  }
});

test("localMap: rotates per run-count — distinct seeds across visits (D80)", () => {
  const seeds = [0, 1, 2, 3, 4].map((r) => localMap("town-seed", r).mapSeed);
  expect(new Set(seeds).size).toBe(seeds.length);
});
