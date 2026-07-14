import { test, expect } from "bun:test";
import {
  MAP_TIER_MAX, MATERIAL_MAP_TIER_WEIGHT, NODE_MAGNITUDE_WEIGHTS,
  NODE_MAGNITUDE_YIELD, MAP_TIER_CREATURE_ADD,
  BIOMES, BIOME_IDS, GATHER_YIELD,
  MAP_DROP_CHANCE, MAP_SCROLL_ID, PLAYER_BASE_HP,
} from "../src/data/constants";
import { generateGrid, tierProfile, rollBiome } from "../src/engine/grid";
import type { Poi } from "../src/engine/grid";
import { rand } from "../src/engine/rng";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { newGame } from "../src/engine/town";
import type { GameState, GameEvent } from "../src/engine/types";

test("map-tier levers: T1 is identity (hygiene)", () => {
  expect(MAP_TIER_MAX).toBe(5);
  // Every material's tier-1 multiplier is 1 (or absent → treated as 1).
  for (const m of Object.keys(MATERIAL_MAP_TIER_WEIGHT)) {
    expect(MATERIAL_MAP_TIER_WEIGHT[m]![1] ?? 1).toBe(1);
  }
  // Magnitude at T1 is always the base class.
  expect(NODE_MAGNITUDE_WEIGHTS[1]).toEqual({ 1: 1 });
  expect(NODE_MAGNITUDE_YIELD[1]).toBe(1);
  // No boss additive layer at T1 (bosses gated to T2+) — biome-scoped shape.
  for (const b of BIOME_IDS) expect(MAP_TIER_CREATURE_ADD[b][1]).toBeUndefined();
});

test("generateGrid: mapTier 1 equals the default (identity at T1)", () => {
  for (const seed of ["mt-a", "mt-b", "mt-c"]) {
    const b = rollBiome(seed);
    expect(generateGrid(seed, b, 1)).toEqual(generateGrid(seed, b));
  }
});

test("tierProfile: T1 returns the base biome unchanged", () => {
  for (const id of ["woodland", "desert", "tundra"] as const) {
    expect(tierProfile(BIOMES[id], id, 1)).toEqual(BIOMES[id]);
  }
});

test("boss gate: wyrm never on a T1 grid, present by T3 (tundra)", () => {
  let sawWyrmT1 = false, sawWyrmT3 = false;
  for (let i = 0; i < 300; i++) {
    const seed = `bg-${i}`;
    if (rollBiome(seed) !== "tundra") continue;
    if (generateGrid(seed, "tundra", 1).pois.some((p) => p.creature === "ancient-wyrm")) sawWyrmT1 = true;
    if (generateGrid(seed, "tundra", 3).pois.some((p) => p.creature === "ancient-wyrm")) sawWyrmT3 = true;
  }
  expect(sawWyrmT1).toBe(false);
  expect(sawWyrmT3).toBe(true);
}, 30000);

test("miniboss gate: ice-troll absent at T1, present by T2 (tundra)", () => {
  let t1 = false, t2 = false;
  for (let i = 0; i < 300; i++) {
    const seed = `mb-${i}`;
    if (rollBiome(seed) !== "tundra") continue;
    if (generateGrid(seed, "tundra", 1).pois.some((p) => p.creature === "ice-troll")) t1 = true;
    if (generateGrid(seed, "tundra", 2).pois.some((p) => p.creature === "ice-troll")) t2 = true;
  }
  expect(t1).toBe(false);
  expect(t2).toBe(true);
}, 30000);

test("magnitude: T1 gatherable nodes are all base (undefined magnitude)", () => {
  for (let i = 0; i < 50; i++) {
    const seed = `mag1-${i}`;
    for (const p of generateGrid(seed, rollBiome(seed), 1).pois) {
      if (p.kind !== "monster") expect(p.magnitude ?? 1).toBe(1);
    }
  }
});

test("magnitude: higher tiers produce rich variants; monsters never carry it", () => {
  let rich = 0, monsterWithMag = 0;
  for (let i = 0; i < 100; i++) {
    const seed = `mag5-${i}`;
    for (const p of generateGrid(seed, rollBiome(seed), 5).pois) {
      if (p.kind === "monster" && p.magnitude !== undefined) monsterWithMag++;
      if (p.kind !== "monster" && (p.magnitude ?? 1) >= 2) rich++;
    }
  }
  expect(rich).toBeGreaterThan(0);
  expect(monsterWithMag).toBe(0);
});

test("gather yield scales with node magnitude", () => {
  // Find a herb node (bare-hands, no tool gate) at magnitude 2 on a T5 map.
  for (let i = 0; i < 500; i++) {
    const seed = `gy-${i}`;
    const grid = generateGrid(seed, rollBiome(seed), 5);
    const node = grid.pois.find((p) => p.kind === "herb" && (p.magnitude ?? 1) === 2);
    if (!node) continue;
    // Stand the player on the node with a T5 expedition and gather.
    const base = newGame(seed);
    const st: GameState = {
      ...base, phase: "expedition", expedition: {
        mapSeed: seed, mapTier: 5, pos: { x: node.x, y: node.y },
        energy: 300, maxEnergy: 300, hp: 100, loadout: base.loadout,
        carry: [], cleared: [], carriedMaps: [],
      },
    };
    const { events } = reduce(st, { type: "gather" });
    const g = events.find((e) => e.type === "gathered")!;
    expect(g.qty).toBe(GATHER_YIELD.herb * NODE_MAGNITUDE_YIELD[2]!);
    return;
  }
  throw new Error("no magnitude-2 herb node found in scan range");
});

test("boss gate is biome-scoped: no cross-biome bosses at high tier", () => {
  let checkedDesert = false, checkedTundra = false;
  for (let i = 0; i < 400; i++) {
    const seed = `bs-${i}`;
    const b = rollBiome(seed);
    if (b === "desert") {
      checkedDesert = true;
      const creatures = generateGrid(seed, "desert", 5).pois.map((p) => p.creature);
      expect(creatures).not.toContain("ancient-wyrm");
      expect(creatures).not.toContain("ice-troll");
    }
    if (b === "tundra") {
      checkedTundra = true;
      expect(generateGrid(seed, "tundra", 5).pois.map((p) => p.creature)).not.toContain("dust-vampire");
    }
  }
  expect(checkedDesert && checkedTundra).toBe(true);
}, 30000);

test("drop ladder: T1 humanoid drop mints T2, and T2 mints T3 (wyrm reachable)", () => {
  // Find a humanoid that guarantees a map drop using the same scan pattern as reduce-map-drop.test.ts.
  // STABILITY REQUIREMENT: the same humanoid creature must appear at the found tile on both the T1
  // and T2 map (terrain weights shift at T2 via TERRAIN_WEIGHT_TIER_SHIFT, which can rearrange POIs).
  // We verify the T2 creature identity before accepting a candidate, so the two fightToEnd calls
  // engage the same humanoid creature and both can roll the map-scroll drop.
  let found: { seed: string; poi: Poi } | undefined;
  for (let i = 0; i < 2000; i++) {
    const seed = `8ec-scan-${i}`;
    const biome = rollBiome(seed);
    const grid = generateGrid(seed, biome);
    const poi = grid.pois.find(
      (p) => p.kind === "monster" && (p.creature === "sand-raider" || p.creature === "forest-bandit"),
    );
    if (!poi) continue;
    // Verify creature is the same at T2 (terrain shift can rearrange POIs).
    const gridT2 = generateGrid(seed, biome, 2);
    const poiT2 = gridT2.pois.find((p) => p.x === poi.x && p.y === poi.y);
    if (poiT2?.creature !== poi.creature) continue; // not stable — skip
    const roll = rand("g", "loot", poi.creature!, poi.x, poi.y, MAP_SCROLL_ID);
    if (roll < MAP_DROP_CHANCE) { found = { seed, poi }; break; }
  }
  expect(found).toBeDefined();
  const { seed, poi } = found!;

  function buildState(mapTier: number): GameState {
    const loadout = emptyLoadout();
    loadout.equipment.weapon = "sword";
    return {
      seed: "g",
      phase: "expedition",
      bank: [],
      loadout: emptyLoadout(),
      runs: 1,
      expedition: {
        mapSeed: seed,
        mapTier,
        pos: { x: poi.x, y: poi.y },
        energy: 50,
        hp: PLAYER_BASE_HP,
        loadout,
        carry: [],
        cleared: [],
      },
    };
  }

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

  // T1 source → mints T2
  const { events: t1Events } = fightToEnd(buildState(1));
  const firstDrop = t1Events.find((e) => e.type === "map-dropped") as { tier: number } | undefined;
  expect(firstDrop?.tier).toBe(2);

  // T2 source → mints T3
  const { events: t2Events } = fightToEnd(buildState(2));
  const secondDrop = t2Events.find((e) => e.type === "map-dropped") as { tier: number } | undefined;
  expect(secondDrop?.tier).toBe(3);
});
