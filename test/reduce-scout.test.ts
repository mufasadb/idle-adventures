import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { generateGrid, rollBiome } from "../src/engine/grid";
import type { Grid, Poi } from "../src/engine/grid";
import { resolveCombat } from "../src/engine/combat";
import {
  MONSTERS,
  MONSTER_TIER_HP_CURVE,
  SCOUT_ENERGY_COST,
  SCOUT_RADIUS,
  SCOUT_TOOL,
  PLAYER_BASE_HP,
} from "../src/data/constants";
import type { GameState } from "../src/engine/types";

function mapWithMonster(): { seed: string; grid: Grid; poi: Poi } {
  for (let i = 0; i < 500; i++) {
    const seed = `m4-scout-${i}`;
    const grid = generateGrid(seed, rollBiome(seed));
    const poi = grid.pois.find((p) => p.kind === "monster");
    if (poi) return { seed, grid, poi };
  }
  throw new Error("no monster map in scan range");
}

function nearMonster(seed: string, poi: Poi, tools: string[], energy = 20): GameState {
  const loadout = emptyLoadout();
  loadout.equipment.weapon = "sword";
  loadout.equipment.tools = tools;
  return {
    seed: "g",
    phase: "expedition",
    bank: [],
    loadout: emptyLoadout(),
    expedition: {
      mapSeed: seed,
      pos: { x: poi.x, y: poi.y }, // standing on it — distance 0 ≤ radius
      energy,
      hp: PLAYER_BASE_HP,
      loadout,
      carry: [],
      cleared: [],
    },
  };
}

test("scout: without a spyglass there is no information (bead acceptance)", () => {
  const { seed, poi } = mapWithMonster();
  const { events } = reduce(nearMonster(seed, poi, []), { type: "scout" });
  expect(events).toEqual([
    { type: "action-rejected", action: "scout", reason: "missing-tool" },
  ]);
});

test("scout: with a spyglass, nearby monsters come back with stats + exact forecast", () => {
  const { seed, grid, poi } = mapWithMonster();
  const before = nearMonster(seed, poi, [SCOUT_TOOL]);
  const { state, events } = reduce(before, { type: "scout" });
  expect(state.expedition!.energy).toBe(20 - SCOUT_ENERGY_COST);
  expect(events.length).toBe(1);
  const event = events[0]! as Extract<
    (typeof events)[number],
    { type: "scouted" }
  >;
  expect(event.type).toBe("scouted");
  expect(event.cost).toBe(SCOUT_ENERGY_COST);
  const reported = event.monsters.find((m) => m.at.x === poi.x && m.at.y === poi.y)!;
  expect(reported.creature).toBe(poi.creature!);
  expect(reported.hp).toBe(MONSTER_TIER_HP_CURVE[MONSTERS[poi.creature!]!.tier]!);
  const expected = resolveCombat(before.expedition!.loadout, PLAYER_BASE_HP, poi.creature!);
  expect(reported.forecast).toEqual({
    victory: expected.victory,
    hpLost: expected.hpLost,
    potionsUsed: expected.potionsUsed,
  });
  // hidden layer stays hidden: no tags on the wire
  expect("tags" in reported).toBe(false);
  // every reported monster is within the radius
  for (const m of event.monsters) {
    const d = Math.max(Math.abs(m.at.x - poi.x), Math.abs(m.at.y - poi.y));
    expect(d).toBeLessThanOrEqual(SCOUT_RADIUS);
  }
  // and every reportable monster in radius IS reported
  const inRadius = grid.pois.filter(
    (p) =>
      p.kind === "monster" &&
      p.creature !== null &&
      Math.max(Math.abs(p.x - poi.x), Math.abs(p.y - poi.y)) <= SCOUT_RADIUS,
  );
  expect(event.monsters.length).toBe(inRadius.length);
});

test("scout: cleared monsters are not reported", () => {
  const { seed, poi } = mapWithMonster();
  const state = nearMonster(seed, poi, [SCOUT_TOOL]);
  state.expedition!.cleared = [{ x: poi.x, y: poi.y }];
  const { events } = reduce(state, { type: "scout" });
  const event = events[0]! as { type: string; monsters: { at: { x: number; y: number } }[] };
  expect(event.monsters.some((m) => m.at.x === poi.x && m.at.y === poi.y)).toBe(false);
});

test("scout: energy gate", () => {
  const { seed, poi } = mapWithMonster();
  const { events } = reduce(nearMonster(seed, poi, [SCOUT_TOOL], 0), { type: "scout" });
  expect(events).toEqual([
    { type: "action-rejected", action: "scout", reason: "exhausted" },
  ]);
});

test("scout: rejected in town; deterministic; no mutation", () => {
  const town: GameState = { seed: "g", phase: "town", bank: [], loadout: emptyLoadout(), expedition: null };
  expect(reduce(town, { type: "scout" }).events).toEqual([
    { type: "action-rejected", action: "scout", reason: "not-on-expedition" },
  ]);
  const { seed, poi } = mapWithMonster();
  const a = nearMonster(seed, poi, [SCOUT_TOOL]);
  const before = structuredClone(a);
  const r1 = reduce(a, { type: "scout" });
  expect(a).toEqual(before);
  expect(r1).toEqual(reduce(nearMonster(seed, poi, [SCOUT_TOOL]), { type: "scout" }));
});
