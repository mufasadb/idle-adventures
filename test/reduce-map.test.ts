import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { localMap, newGame } from "../src/engine/town";
import { rollBiome } from "../src/engine/grid";
import type { GameState } from "../src/engine/types";

function town(seed = "m", runs = 0): GameState {
  return { seed, phase: "town", runs, bank: [], loadout: emptyLoadout(), expedition: null, maps: [] };
}

// Held maps now arrive as humanoid DROPS (zpm.2), not by pocketing — pocket-map
// is retired (zpm.1). These tests construct state.maps directly to exercise the
// held-map embark path (consumed on embark), and the local map (free, not consumed).

test("embark: a HELD map embarks and is consumed (removed from maps)", () => {
  const heldMap = { mapSeed: "m:drop:1", biomeId: rollBiome("m:drop:1"), vintage: 0, tier: 2 };
  const s: GameState = { ...town("m", 0), maps: [heldMap] };
  const { state, events } = reduce(s, { type: "embark", mapSeed: heldMap.mapSeed });
  expect(events.some((e) => e.type === "embarked")).toBe(true);
  expect(state.maps).toEqual([]); // consumed
});

test("embark: the local map (not held) is free — does not touch the collection", () => {
  const local = localMap("m", 0);
  const s: GameState = { ...town("m", 0), maps: [{ mapSeed: "other:drop:9", biomeId: rollBiome("other:drop:9"), vintage: 0 }] };
  const { state, events } = reduce(s, { type: "embark", mapSeed: local.mapSeed });
  expect(events.some((e) => e.type === "embarked")).toBe(true);
  expect(state.maps!.length).toBe(1); // untouched — the local run consumed nothing
});

test("embark: the local map is a single T1 map", () => {
  const s = newGame("lm");
  const local = localMap("lm", 0);
  const { state } = reduce(s, { type: "embark", mapSeed: local.mapSeed });
  expect(state.expedition?.mapTier).toBe(1);
});

test("localMap: rotates per run-count, deterministic per (seed, runs)", () => {
  expect(localMap("r", 0).mapSeed).toBe("r:local:0");
  expect(localMap("r", 1).mapSeed).toBe("r:local:1");
  expect(localMap("r", 0)).toEqual(localMap("r", 0)); // deterministic
  expect(localMap("r", 0).mapSeed).not.toBe(localMap("r", 1).mapSeed); // rotates
});

test("embark: a seed neither the local map nor held is rejected (farm loop stays closed)", () => {
  const { events } = reduce(town("m", 0), { type: "embark", mapSeed: "arbitrary" });
  expect(events).toEqual([{ type: "action-rejected", action: "embark", reason: "not-offered" }]);
});
