import { test, expect } from "bun:test";
import { newGame, localMap } from "../src/engine/town";
import { rollBiome } from "../src/engine/grid";

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

test("localMap: a single deterministic map, biome-name headline, no hints at fidelity 0 (zpm.1)", () => {
  const m = localMap("town-seed");
  expect(localMap("town-seed")).toEqual(m); // deterministic per (seed, runs)
  expect(m.biomeId).toBe(rollBiome(m.mapSeed)); // anyone with the seed re-derives the biome (D21)
  expect(m.preview.headline).toBe(m.biomeId); // headline IS the biome name
  expect(m.preview.hints).toEqual([]); // PREVIEW_FIDELITY === 0
});

test("localMap: rotates per run-count — distinct seeds across visits (D80)", () => {
  const seeds = [0, 1, 2, 3, 4].map((r) => localMap("town-seed", r).mapSeed);
  expect(new Set(seeds).size).toBe(seeds.length);
});
