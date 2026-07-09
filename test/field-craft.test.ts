import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { consumeExpeditionInputs } from "../src/engine/carry";
import { emptyLoadout } from "../src/engine/loadout";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { RECIPE, FIELD_CRAFT_ENERGY, FOOD_ENERGY, TERRAINS } from "../src/data/constants";
import type { GameState, ItemStack } from "../src/engine/types";
import type { Terrain } from "../src/data/constants";

// A field expedition: pick any seed, stand at a walkable tile, equip tools, carry
// the given materials. maxEnergy default (no food) so autoRefill is a no-op and
// energy deltas are exact.
function fieldState(opts: { tools?: string[]; carry?: ItemStack[]; energy?: number; food?: ItemStack[]; seed?: string; pos?: { x: number; y: number }; autoEatFood?: string } = {}): GameState {
  const seed = opts.seed ?? "fc-seed";
  const loadout = emptyLoadout();
  loadout.equipment.tools = opts.tools ?? [];
  loadout.food = opts.food ?? [];
  return {
    seed: "fc",
    phase: "expedition",
    bank: [],
    loadout: emptyLoadout(),
    expedition: {
      mapSeed: seed,
      pos: opts.pos ?? { x: 10, y: 30 },
      energy: opts.energy ?? 100,
      hp: 30,
      loadout,
      carry: opts.carry ?? [],
      cleared: [],
      autoEatFood: opts.autoEatFood,
    },
  };
}

// Inject a throwaway recipe (cleaned up around the assertions) for gate-only cases
// that shouldn't add real catalog content.
function withRecipe<T>(id: string, recipe: (typeof RECIPE)[string], fn: () => T): T {
  (RECIPE as Record<string, (typeof RECIPE)[string]>)[id] = recipe;
  try { return fn(); } finally { delete (RECIPE as Record<string, (typeof RECIPE)[string]>)[id]; }
}

// --- the pure input-consumer -------------------------------------------------

test("consumeExpeditionInputs: takes carry first, then food; multi-stack safe (ke3.4)", () => {
  const food = [{ defId: "ration", qty: 2 }];
  const carry = [{ defId: "oak-log", qty: 1 }, { defId: "oak-log", qty: 2 }, { defId: "rich-venison", qty: 1 }];
  const out = consumeExpeditionInputs(food, carry, [{ defId: "oak-log", qty: 2 }, { defId: "rich-venison", qty: 1 }]);
  expect(out).not.toBeNull();
  // 3 oak-logs total, 2 consumed → 1 left; rich-venison gone; food untouched
  expect(out!.carry).toEqual([{ defId: "oak-log", qty: 1 }]);
  expect(out!.food).toEqual([{ defId: "ration", qty: 2 }]);
});

test("consumeExpeditionInputs: short pool returns null (ke3.4)", () => {
  expect(consumeExpeditionInputs([], [{ defId: "oak-log", qty: 1 }], [{ defId: "oak-log", qty: 2 }])).toBeNull();
});

test("consumeExpeditionInputs: falls back to food when carry is short (ke3.4)", () => {
  const out = consumeExpeditionInputs([{ defId: "ration", qty: 3 }], [{ defId: "ration", qty: 1 }], [{ defId: "ration", qty: 2 }]);
  expect(out).not.toBeNull();
  expect(out!.carry).toEqual([]); // the 1 carry ration first
  expect(out!.food).toEqual([{ defId: "ration", qty: 2 }]); // then 1 off food
});

// --- the e2e cooking vehicle -------------------------------------------------

test("field craft: fire-kit + rich-venison + oak-log → cooked-venison at food BACK, correct deltas (ke3.4)", () => {
  // auto-eat OFF so the ration stays put and the energy delta is exactly the flat
  // cost — isolates the placement + cost from the (separately-tested) auto-eat.
  const before = fieldState({
    tools: ["fire-kit"],
    carry: [{ defId: "rich-venison", qty: 1 }, { defId: "oak-log", qty: 1 }],
    food: [{ defId: "ration", qty: 1 }],
    energy: 100,
    // auto-eat off (no autoEatFood) — the ration stays put; energy delta is the flat cost.
  });
  const { state, events } = reduce(before, { type: "craft", recipeId: "cooked-venison" });
  const exp = state.expedition!;
  // cooked food appended to the BACK (ration stays at the front → auto-eaten first)
  expect(exp.loadout.food).toEqual([{ defId: "ration", qty: 1 }, { defId: "cooked-venison", qty: 1 }]);
  expect(exp.carry).toEqual([]); // both inputs consumed
  expect(exp.energy).toBe(100 - FIELD_CRAFT_ENERGY); // flat cost only
  expect(events).toEqual([{ type: "crafted", recipeId: "cooked-venison", output: { defId: "cooked-venison", qty: 1 }, where: "field" }]);
  expect(FOOD_ENERGY["cooked-venison"]).toBeGreaterThan(0);
});

test("field craft: pays FIELD_CRAFT_ENERGY then waste-free auto-eats, like gather (ke3.4)", () => {
  // auto-eat ON: paying the cost dips energy, then the front ration refills it —
  // proving the field path reuses gather's autoRefill. The ration is spent, the
  // cooked output lands at the (now-empty) back.
  const before = fieldState({
    tools: ["fire-kit"],
    carry: [{ defId: "rich-venison", qty: 1 }, { defId: "oak-log", qty: 1 }],
    food: [{ defId: "ration", qty: 1 }],
    energy: 100,
    autoEatFood: "ration", // auto-eat ON, designating ration
  });
  const { state } = reduce(before, { type: "craft", recipeId: "cooked-venison" });
  const exp = state.expedition!;
  expect(exp.energy).toBe(100 - FIELD_CRAFT_ENERGY + FOOD_ENERGY.ration!); // ration eaten to refill
  expect(exp.loadout.food).toEqual([{ defId: "cooked-venison", qty: 1 }]); // ration consumed, cooked at back
});

test("field craft: missing fire-kit → missing-tool (carried-only pool, no bank) (ke3.4)", () => {
  const s = fieldState({ tools: [], carry: [{ defId: "rich-venison", qty: 1 }, { defId: "oak-log", qty: 1 }] });
  const { events } = reduce(s, { type: "craft", recipeId: "cooked-venison" });
  expect(events).toEqual([{ type: "action-rejected", action: "craft", reason: "missing-tool" }]);
});

test("field craft: a CARRIED fire-kit satisfies the gate (carry ∪ equipped pool) (ke3.4)", () => {
  const s = fieldState({ tools: [], carry: [{ defId: "fire-kit", qty: 1 }, { defId: "rich-venison", qty: 1 }, { defId: "oak-log", qty: 1 }] });
  const { events } = reduce(s, { type: "craft", recipeId: "cooked-venison" });
  expect(events.some((e) => e.type === "crafted")).toBe(true);
});

test("field craft: insufficient inputs → insufficient-materials (ke3.4)", () => {
  const s = fieldState({ tools: ["fire-kit"], carry: [{ defId: "oak-log", qty: 1 }] }); // no meat
  const { events } = reduce(s, { type: "craft", recipeId: "cooked-venison" });
  expect(events).toEqual([{ type: "action-rejected", action: "craft", reason: "insufficient-materials" }]);
});

test("field craft: too tired → exhausted (ke3.4)", () => {
  const s = fieldState({ tools: ["fire-kit"], carry: [{ defId: "rich-venison", qty: 1 }, { defId: "oak-log", qty: 1 }], energy: FIELD_CRAFT_ENERGY - 1 });
  const { events } = reduce(s, { type: "craft", recipeId: "cooked-venison" });
  expect(events).toEqual([{ type: "action-rejected", action: "craft", reason: "exhausted" }]);
});

// --- phase symmetry ----------------------------------------------------------

test("field craft: a field:true recipe rejects via the TOWN path (not-on-expedition) (ke3.4)", () => {
  const town: GameState = { seed: "t", phase: "town", bank: [{ defId: "rich-venison", qty: 1 }, { defId: "oak-log", qty: 1 }, { defId: "fire-kit", qty: 1 }], loadout: emptyLoadout(), expedition: null };
  const { events } = reduce(town, { type: "craft", recipeId: "cooked-venison" });
  expect(events).toEqual([{ type: "action-rejected", action: "craft", reason: "not-on-expedition" }]);
});

test("field craft: a non-field recipe rejects via the FIELD path (not-field-craftable) (ke3.4)", () => {
  const s = fieldState({ carry: [{ defId: "iron-ore", qty: 5 }] });
  const { events } = reduce(s, { type: "craft", recipeId: "iron-pick" });
  expect(events).toEqual([{ type: "action-rejected", action: "craft", reason: "not-field-craftable" }]);
});

// --- terrain gate ------------------------------------------------------------

test("field craft: requires.terrain satisfied on the current tile, rejected otherwise (ke3.4)", () => {
  const seed = "fc-terrain";
  const grid = generateGrid(seed, rollBiome(seed));
  // find a walkable interior tile and read its terrain + the local neighbour set
  const pos = { x: 10, y: 30 };
  const here = grid.terrain[pos.y]![pos.x]! as Terrain;
  const local = new Set<Terrain>([
    here,
    grid.terrain[pos.y]![pos.x + 1]!, grid.terrain[pos.y]![pos.x - 1]!,
    grid.terrain[pos.y + 1]![pos.x]!, grid.terrain[pos.y - 1]![pos.x]!,
  ] as Terrain[]);
  const absent = TERRAINS.find((t) => !local.has(t));
  withRecipe(
    "test-terrain-craft",
    { inputs: [{ defId: "oak-log", qty: 1 }], output: { defId: "arrow-shaft", qty: 1 }, field: true, requires: { terrain: here } },
    () => {
      const ok = reduce(fieldState({ seed, pos, carry: [{ defId: "oak-log", qty: 2 }] }), { type: "craft", recipeId: "test-terrain-craft" });
      expect(ok.events.some((e) => e.type === "crafted")).toBe(true);
    },
  );
  if (absent) {
    withRecipe(
      "test-terrain-craft2",
      { inputs: [{ defId: "oak-log", qty: 1 }], output: { defId: "arrow-shaft", qty: 1 }, field: true, requires: { terrain: absent } },
      () => {
        const bad = reduce(fieldState({ seed, pos, carry: [{ defId: "oak-log", qty: 2 }] }), { type: "craft", recipeId: "test-terrain-craft2" });
        expect(bad.events).toEqual([{ type: "action-rejected", action: "craft", reason: "not-near-terrain" }]);
      },
    );
  }
});
