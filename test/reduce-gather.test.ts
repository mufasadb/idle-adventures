import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { generateGrid, rollBiome } from "../src/engine/grid";
import type { Grid, Poi } from "../src/engine/grid";
import {
  NODE_HARDNESS,
  GATHER_YIELD,
  TOOL_QUALITY,
  BASE_CARRY_SLOTS,
} from "../src/data/constants";
import type { NodeType } from "../src/data/constants";
import type { GameState } from "../src/engine/types";

// Deterministically find a map whose rolled biome contains a POI of `kind`.
function mapWith(kind: NodeType): { seed: string; grid: Grid; poi: Poi } {
  for (let i = 0; i < 300; i++) {
    const seed = `m3-scan-${i}`;
    const grid = generateGrid(seed, rollBiome(seed));
    const poi = grid.pois.find((p) => p.kind === kind);
    if (poi) return { seed, grid, poi };
  }
  throw new Error(`no map with a ${kind} POI in scan range`);
}

function standingOn(
  seed: string,
  poi: Poi,
  opts: { tools?: string[]; energy?: number; food?: { defId: string; qty: number }[] } = {},
): GameState {
  const loadout = emptyLoadout();
  loadout.equipment.tools = opts.tools ?? [];
  loadout.food = opts.food ?? [];
  return {
    seed: "g",
    phase: "expedition",
    bank: [],
    loadout: emptyLoadout(),
    expedition: {
      mapSeed: seed,
      pos: { x: poi.x, y: poi.y },
      energy: opts.energy ?? 100,
      hp: 0,
      loadout,
      carry: [],
      cleared: [],
    },
  };
}

test("gather: ore without a pick fails (bead acceptance)", () => {
  const { seed, poi } = mapWith("mining");
  const { state, events } = reduce(standingOn(seed, poi, { tools: [] }), { type: "gather" });
  expect(events).toEqual([
    { type: "action-rejected", action: "gather", reason: "missing-tool" },
  ]);
  expect(state.expedition!.carry).toEqual([]);
});

test("gather: with a pick, yield lands in carry and node clears (bead acceptance)", () => {
  const { seed, poi } = mapWith("mining");
  const before = standingOn(seed, poi, { tools: ["pick"] });
  const { state, events } = reduce(before, { type: "gather" });
  const cost = NODE_HARDNESS.mining / TOOL_QUALITY.pick!;
  expect(state.expedition!.carry).toEqual([
    { defId: poi.material!, qty: GATHER_YIELD.mining },
  ]);
  expect(state.expedition!.energy).toBe(100 - cost);
  expect(state.expedition!.cleared).toEqual([{ x: poi.x, y: poi.y }]);
  expect(events).toEqual([
    {
      type: "gathered",
      at: { x: poi.x, y: poi.y },
      kind: "mining",
      material: poi.material!,
      qty: GATHER_YIELD.mining,
      cost,
      energy: 100 - cost,
    },
  ]);
});

test("gather: a cleared node cannot be gathered again (one-shot, D24)", () => {
  const { seed, poi } = mapWith("mining");
  const first = reduce(standingOn(seed, poi, { tools: ["pick"] }), { type: "gather" }).state;
  const { state, events } = reduce(first, { type: "gather" });
  expect(state).toEqual(first);
  expect(events).toEqual([
    { type: "action-rejected", action: "gather", reason: "already-cleared" },
  ]);
});

test("gather: herbs come up bare-handed", () => {
  const { seed, poi } = mapWith("herb");
  const { state } = reduce(standingOn(seed, poi, { tools: [] }), { type: "gather" });
  expect(state.expedition!.carry).toEqual([
    { defId: poi.material!, qty: GATHER_YIELD.herb },
  ]);
});

test("gather: monster nodes are not gatherable", () => {
  const { seed, poi } = mapWith("monster");
  const { events } = reduce(standingOn(seed, poi, { tools: ["pick", "axe", "knife"] }), {
    type: "gather",
  });
  expect(events).toEqual([
    { type: "action-rejected", action: "gather", reason: "not-gatherable" },
  ]);
});

test("gather: empty tile has no node", () => {
  const { seed, grid, poi } = mapWith("mining");
  // find a tile with no POI
  let empty: { x: number; y: number } | null = null;
  outer: for (let y = 0; y < grid.terrain.length; y++) {
    for (let x = 0; x < grid.terrain.length; x++) {
      if (!grid.pois.some((p) => p.x === x && p.y === y)) {
        empty = { x, y };
        break outer;
      }
    }
  }
  const state = standingOn(seed, poi, { tools: ["pick"] });
  state.expedition!.pos = empty!;
  const { events } = reduce(state, { type: "gather" });
  expect(events).toEqual([
    { type: "action-rejected", action: "gather", reason: "no-node" },
  ]);
});

test("gather: insufficient energy is rejected before touching carry", () => {
  const { seed, poi } = mapWith("mining");
  const { state, events } = reduce(
    standingOn(seed, poi, { tools: ["pick"], energy: NODE_HARDNESS.mining / TOOL_QUALITY.pick! - 0.5 }),
    { type: "gather" },
  );
  expect(events).toEqual([
    { type: "action-rejected", action: "gather", reason: "exhausted" },
  ]);
  expect(state.expedition!.carry).toEqual([]);
});

test("gather: packed food is slot ballast — full slots reject the gather (D23)", () => {
  const { seed, poi } = mapWith("mining");
  // no backpack → BASE_CARRY_SLOTS; fill them all with food stacks
  const food = Array.from({ length: BASE_CARRY_SLOTS }, (_, i) => ({
    defId: `ration-${i}`,
    qty: 1,
  }));
  const { events } = reduce(standingOn(seed, poi, { tools: ["pick"], food }), {
    type: "gather",
  });
  expect(events).toEqual([
    { type: "action-rejected", action: "gather", reason: "carry-full" },
  ]);
});

test("gather: rejected in town", () => {
  const town: GameState = {
    seed: "g",
    phase: "town",
    bank: [],
    loadout: emptyLoadout(),
    expedition: null,
  };
  const { events } = reduce(town, { type: "gather" });
  expect(events).toEqual([
    { type: "action-rejected", action: "gather", reason: "not-on-expedition" },
  ]);
});

test("gather: deterministic and does not mutate input", () => {
  const { seed, poi } = mapWith("wood");
  const a = standingOn(seed, poi, { tools: ["axe"] });
  const before = structuredClone(a);
  const r1 = reduce(a, { type: "gather" });
  expect(a).toEqual(before);
  expect(r1).toEqual(reduce(standingOn(seed, poi, { tools: ["axe"] }), { type: "gather" }));
});
