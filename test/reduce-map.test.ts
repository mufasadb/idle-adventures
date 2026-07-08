import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { candidateMaps, newGame } from "../src/engine/town";
import { rollBiome } from "../src/engine/grid";
import type { GameState } from "../src/engine/types";

function town(seed = "m", runs = 0): GameState {
  return { seed, phase: "town", runs, bank: [], loadout: emptyLoadout(), expedition: null, maps: [] };
}

test("pocket-map: an offered map is added to the held collection with its biome + vintage", () => {
  const s = town("m", 0);
  const offer = candidateMaps("m", 0);
  const { state } = reduce(s, { type: "pocket-map", mapSeed: offer[0]!.mapSeed });
  expect(state.maps).toEqual([{ mapSeed: offer[0]!.mapSeed, biomeId: offer[0]!.biomeId, vintage: 0, tier: 1 }]);
});

test("pocket-map: pocketing the same map twice is rejected", () => {
  const offer = candidateMaps("m", 0);
  const once = reduce(town("m", 0), { type: "pocket-map", mapSeed: offer[0]!.mapSeed }).state;
  const { events } = reduce(once, { type: "pocket-map", mapSeed: offer[0]!.mapSeed });
  expect(events).toEqual([{ type: "action-rejected", action: "pocket-map", reason: "already-pocketed" }]);
});

test("pocket-map: a non-offered seed is rejected", () => {
  const { events } = reduce(town("m", 0), { type: "pocket-map", mapSeed: "not-real" });
  expect(events).toEqual([{ type: "action-rejected", action: "pocket-map", reason: "not-offered" }]);
});

test("embark: a HELD map embarks and is consumed (removed from maps)", () => {
  const offer = candidateMaps("m", 0);
  const held = reduce(town("m", 0), { type: "pocket-map", mapSeed: offer[0]!.mapSeed }).state;
  const { state, events } = reduce(held, { type: "embark", mapSeed: offer[0]!.mapSeed });
  expect(events.some((e) => e.type === "embarked")).toBe(true);
  expect(state.maps).toEqual([]); // consumed
});

test("embark: 'go nearby' (a currently-offered map, not held) does not touch the collection", () => {
  const offer = candidateMaps("m", 0);
  const s: GameState = { ...town("m", 0), maps: [{ mapSeed: "other:map:9:9", biomeId: rollBiome("other:map:9:9"), vintage: 0 }] };
  const { state, events } = reduce(s, { type: "embark", mapSeed: offer[1]!.mapSeed });
  expect(events.some((e) => e.type === "embarked")).toBe(true);
  expect(state.maps!.length).toBe(1); // untouched — go-nearby consumed nothing
});

test("embark: a seed neither offered nor held is rejected (farm loop stays closed)", () => {
  const { events } = reduce(town("m", 0), { type: "embark", mapSeed: "arbitrary" });
  expect(events).toEqual([{ type: "action-rejected", action: "embark", reason: "not-offered" }]);
});

test("pocketed offered map is tier 1", () => {
  const base = newGame("pk");
  const offer = candidateMaps("pk", 0)[0]!;
  const { state, events } = reduce(base, { type: "pocket-map", mapSeed: offer.mapSeed });
  expect(state.maps?.[0]?.tier).toBe(1);
  expect(events.find((e) => e.type === "pocketed-map")).toMatchObject({ tier: 1 });
});
