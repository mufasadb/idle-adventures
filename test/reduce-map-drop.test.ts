// Humanoid map drops (8ec): fightAt mints a carried MapItem; carried maps cost
// a slot each and bank as held maps at run end.
import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { generateGrid, rollBiome } from "../src/engine/grid";
import type { Poi } from "../src/engine/grid";
import { rand } from "../src/engine/rng";
import {
  MAP_DROP_CHANCE,
  MAP_SCROLL_ID,
  PLAYER_BASE_HP,
  BASE_CARRY_SLOTS,
  STACK_CAP,
  MAP_TIER_MAX,
} from "../src/data/constants";
import type { GameState, GameEvent, MapItem } from "../src/engine/types";

// Combat is no longer atomic (si7.1): the first `fight` engages, subsequent
// `fight`s each run one exchange. Loop to the terminal outcome so these tests
// can assert on the same victory/defeat/loot facts the old atomic API gave.
function fightToEnd(state: GameState): { state: GameState; events: GameEvent[] } {
  let s = reduce(state, { type: "fight" });
  const all = [...s.events];
  let guard = 0;
  while (s.state.expedition?.combat && ++guard < 100) {
    s = reduce(s.state, { type: "fight" });
    all.push(...s.events);
  }
  return { state: s.state, events: all };
}

// Find a map with a tier-1 humanoid the base sword build beats, where the
// map-scroll roll PASSES (drop=true) or FAILS (drop=false) on the game seed "g".
function humanoidFight(drop: boolean): { seed: string; poi: Poi } {
  for (let i = 0; i < 2000; i++) {
    const seed = `8ec-scan-${i}`;
    const grid = generateGrid(seed, rollBiome(seed));
    const poi = grid.pois.find(
      (p) => p.kind === "monster" && (p.creature === "sand-raider" || p.creature === "forest-bandit"),
    );
    if (!poi) continue;
    const roll = rand("g", "loot", poi.creature!, poi.x, poi.y, MAP_SCROLL_ID);
    if (roll < MAP_DROP_CHANCE === drop) return { seed, poi };
  }
  throw new Error("no suitable humanoid map in scan range");
}

function atMonster(seed: string, poi: Poi, mutate?: (s: GameState) => void): GameState {
  const loadout = emptyLoadout();
  loadout.equipment.weapon = "sword";
  const state: GameState = {
    seed: "g",
    phase: "expedition",
    bank: [],
    loadout: emptyLoadout(),
    runs: 3,
    expedition: {
      mapSeed: seed,
      pos: { x: poi.x, y: poi.y },
      energy: 50,
      hp: PLAYER_BASE_HP,
      loadout,
      carry: [],
      cleared: [],
    },
  };
  mutate?.(state);
  return state;
}

test("humanoid victory mints a carried map: deterministic seed, biome from rollBiome, vintage=runs", () => {
  const { seed, poi } = humanoidFight(true);
  const { state, events } = fightToEnd(atMonster(seed, poi));
  const expectedSeed = `${seed}:drop:${poi.x},${poi.y}`;
  expect(state.expedition!.carriedMaps ?? []).toEqual([
    { mapSeed: expectedSeed, biomeId: rollBiome(expectedSeed), vintage: 3, tier: 2 },
  ]);
  expect(events).toContainEqual({
    type: "map-dropped",
    at: { x: poi.x, y: poi.y },
    mapSeed: expectedSeed,
    biomeId: rollBiome(expectedSeed),
    hints: [],
    carried: true,
    tier: 2,
  });
  // the scroll never enters carry as a material, and fought.loot excludes it
  expect(state.expedition!.carry.some((s) => s.defId === MAP_SCROLL_ID)).toBe(false);
  const fought = events.find((e) => e.type === "fought") as { loot: { defId: string }[] };
  expect(fought.loot.some((s) => s.defId === MAP_SCROLL_ID)).toBe(false);
});

test("no roll, no map", () => {
  const { seed, poi } = humanoidFight(false);
  const { state, events } = fightToEnd(atMonster(seed, poi));
  expect(state.expedition!.carriedMaps ?? []).toEqual([]);
  expect(events.some((e) => e.type === "map-dropped")).toBe(false);
});

test("full pack: map left behind (carried:false), fight unaffected", () => {
  const { seed, poi } = humanoidFight(true);
  const before = atMonster(seed, poi, (s) => {
    // fill all but one free slot with distinct full stacks: the fight's material
    // loot takes the last stack, leaving no free slot for the map
    s.expedition!.carry = Array.from({ length: BASE_CARRY_SLOTS - 1 }, (_, i) => ({
      defId: `filler-${i}`,
      qty: STACK_CAP,
    }));
  });
  const { state, events } = fightToEnd(before);
  const dropped = events.find((e) => e.type === "map-dropped") as { carried: boolean } | undefined;
  expect(dropped?.carried).toBe(false);
  expect(state.expedition!.carriedMaps ?? []).toEqual([]);
  expect(events.some((e) => e.type === "fought")).toBe(true);
});

test("carried maps debit gather/loot capacity by one stack each", () => {
  const { seed, poi } = humanoidFight(true);
  const held: MapItem[] = Array.from({ length: BASE_CARRY_SLOTS }, (_, i) => ({
    mapSeed: `m${i}`,
    biomeId: "desert",
    vintage: 0,
  }));
  const before = atMonster(seed, poi, (s) => {
    s.expedition!.carriedMaps = held;
  });
  // all slots eaten by maps → the fight's material loot can't fit → carry-full
  const { events } = reduce(before, { type: "fight" });
  expect(events).toContainEqual(
    expect.objectContaining({ type: "action-rejected", reason: "carry-full" }),
  );
});

test("drop-map discards a carried map, freeing its slot; unknown seed rejects", () => {
  const { seed, poi } = humanoidFight(true);
  const before = atMonster(seed, poi, (s) => {
    s.expedition!.carriedMaps = [{ mapSeed: "held-1", biomeId: "desert", vintage: 0 }];
  });
  const { state, events } = reduce(before, { type: "drop-map", mapSeed: "held-1" });
  expect(state.expedition!.carriedMaps).toEqual([]);
  expect(events).toEqual([{ type: "map-discarded", mapSeed: "held-1" }]);
  const rej = reduce(state, { type: "drop-map", mapSeed: "held-1" });
  expect(rej.events).toContainEqual(
    expect.objectContaining({ type: "action-rejected", action: "drop-map", reason: "map-not-carried" }),
  );
});

test("drop-map in town rejects", () => {
  const town: GameState = { seed: "g", phase: "town", bank: [], loadout: emptyLoadout(), expedition: null };
  const { events } = reduce(town, { type: "drop-map", mapSeed: "x" });
  expect(events).toContainEqual(expect.objectContaining({ reason: "not-on-expedition" }));
});

test("carried map banks on return and is embarkable+spent like a pocketed map", () => {
  const { seed, poi } = humanoidFight(true);
  const won = fightToEnd(atMonster(seed, poi)).state;
  const home = reduce(won, { type: "return" }).state;
  const minted = `${seed}:drop:${poi.x},${poi.y}`;
  expect(home.phase).toBe("town");
  expect((home.maps ?? []).some((m) => m.mapSeed === minted)).toBe(true);
  const out = reduce(home, { type: "embark", mapSeed: minted });
  expect(out.state.phase).toBe("expedition");
  expect((out.state.maps ?? []).some((m) => m.mapSeed === minted)).toBe(false); // spent
});

test("drop-mint stamps sourceTier+1, capped at MAP_TIER_MAX", () => {
  const { seed, poi } = humanoidFight(true);

  // T4 source → mints T5
  const t4State = atMonster(seed, poi, (s) => { s.expedition!.mapTier = 4; });
  const { events: t4Events } = fightToEnd(t4State);
  const t4Drop = t4Events.find((e) => e.type === "map-dropped") as { tier: number } | undefined;
  expect(t4Drop?.tier).toBe(5);

  // T5 source → mints T5 (capped at MAP_TIER_MAX)
  const t5State = atMonster(seed, poi, (s) => { s.expedition!.mapTier = 5; });
  const { events: t5Events } = fightToEnd(t5State);
  const t5Drop = t5Events.find((e) => e.type === "map-dropped") as { tier: number } | undefined;
  expect(t5Drop?.tier).toBe(MAP_TIER_MAX);
});
