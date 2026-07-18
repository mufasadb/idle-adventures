import { test, expect } from "bun:test";
import { scanForPoi } from "./helpers";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import type { Poi } from "../src/engine/grid";
import { slotOf } from "../src/engine/catalog";
import { GATHER_YIELD, FOOD_ENERGY, MAX_ENERGY } from "../src/data/constants";
import type { GameState } from "../src/engine/types";

// Find a map holding a berry-bush (an herb POI whose rolled material is
// "berries") — mirrors reduce-gather.test.ts's mapWith scan.
const berryMap = (): { seed: string; poi: Poi } => scanForPoi("forage-scan", (p) => p.kind === "herb" && p.material === "berries", 600);

function standingOn(
  seed: string,
  poi: Poi,
  opts: { energy?: number; food?: { defId: string; qty: number }[] } = {},
): GameState {
  const loadout = emptyLoadout();
  loadout.food = opts.food ?? [];
  return {
    seed: "g",
    phase: "expedition",
    bank: [],
    loadout: emptyLoadout(),
    expedition: {
      mapSeed: seed,
      pos: { x: poi.x, y: poi.y },
      energy: opts.energy ?? MAX_ENERGY,
      hp: 10,
      loadout,
      carry: [],
      cleared: [],
    },
  };
}

test("berries are food, stale-berries are not packable anywhere", () => {
  expect(slotOf("berries")).toBe("food");
  expect(slotOf("jam")).toBe("food");
  expect(slotOf("stale-berries")).toBeNull();
});

test("gathering berries routes to the FRONT of the food reserve, not carry", () => {
  const { seed, poi } = berryMap();
  // Full energy → the waste-free auto-eat can't fire, so packed food is untouched.
  const before = standingOn(seed, poi, { energy: MAX_ENERGY, food: [{ defId: "ration", qty: 2 }] });
  const { state, events } = reduce(before, { type: "gather" });
  expect(events[0]!.type).toBe("gathered");
  expect(state.expedition!.carry).toEqual([]); // NOT loot
  expect(state.expedition!.loadout.food).toEqual([
    { defId: "berries", qty: GATHER_YIELD.herb }, // fresh eats first — it stales on return, rations bank back
    { defId: "ration", qty: 2 },
  ]);
  expect(state.expedition!.cleared).toEqual([{ x: poi.x, y: poi.y }]);
});

test("gathering berries rejects carry-full when the bag can't hold the units", () => {
  const { seed, poi } = berryMap();
  // Bare bag = 6 slots (BASE_CARRY_SLOTS); 5 packed rations + 2 berries = 7 > 6.
  const before = standingOn(seed, poi, { energy: MAX_ENERGY, food: [{ defId: "ration", qty: 5 }] });
  const { events } = reduce(before, { type: "gather" });
  expect(events).toEqual([{ type: "action-rejected", action: "gather", reason: "carry-full" }]);
});

test("berries eat like food (30 restore)", () => {
  // manual eat (m0a) jumps energy TO foodEnergy×tentMult. Use energy 0 so
  // boosted(30) > current(0) and the eat is accepted.
  const { seed, poi } = berryMap();
  const before = standingOn(seed, poi, { energy: 0, food: [{ defId: "berries", qty: 1 }] });
  const { state, events } = reduce(before, { type: "eat", defId: "berries" });
  expect(events[0]).toEqual({ type: "ate", defId: "berries", restored: FOOD_ENERGY.berries!, energy: FOOD_ENERGY.berries! });
  expect(state.expedition!.loadout.food).toEqual([]);
});

test("returning banks berries as stale-berries; rations bank back unchanged", () => {
  const { seed, poi } = berryMap();
  const before = standingOn(seed, poi, {
    energy: MAX_ENERGY,
    food: [
      { defId: "berries", qty: 2 },
      { defId: "ration", qty: 1 },
    ],
  });
  const { state } = reduce(before, { type: "return" });
  expect(state.phase).toBe("town");
  expect(state.bank).toEqual(
    expect.arrayContaining([
      { defId: "stale-berries", qty: 2 },
      { defId: "ration", qty: 1 },
    ]),
  );
  expect(state.bank.some((s) => s.defId === "berries")).toBe(false);
});

test("town crafts stale-berries ×3 → jam", () => {
  const town: GameState = {
    seed: "g",
    phase: "town",
    bank: [{ defId: "stale-berries", qty: 3 }],
    loadout: emptyLoadout(),
    expedition: null,
  };
  const { state, events } = reduce(town, { type: "craft", recipeId: "jam" });
  expect(events[0]!.type).toBe("crafted");
  expect(state.bank).toEqual([{ defId: "jam", qty: 1 }]);
});
