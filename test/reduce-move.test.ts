import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { moveCost } from "../src/engine/move";
import { GRID_SIZE } from "../src/data/constants";
import type { Terrain, BiomeId } from "../src/data/constants";
import type { GameState } from "../src/engine/types";
import type { Grid } from "../src/engine/grid";

// Deterministically find a mapSeed whose rolled biome matches.
function seedFor(biome: BiomeId): string {
  const seed = Array.from({ length: 200 }, (_, i) => `m2-scan-${i}`).find(
    (s) => rollBiome(s) === biome,
  );
  if (!seed) throw new Error(`no seed rolls ${biome} in scan range`);
  return seed;
}

// Find a tile of `terrain` with an in-bounds neighbour to stand on.
function findStep(grid: Grid, terrain: Terrain): { from: { x: number; y: number }; to: { x: number; y: number } } {
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (grid.terrain[y]![x] !== terrain) continue;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
          return { from: { x: nx, y: ny }, to: { x, y } };
        }
      }
    }
  }
  throw new Error(`no ${terrain} tile with an in-bounds neighbour`);
}

function expeditionState(
  mapSeed: string,
  pos: { x: number; y: number },
  energy: number,
  transport: string | null = null,
): GameState {
  const loadout = emptyLoadout();
  loadout.equipment.transport = transport;
  return {
    seed: "g",
    phase: "expedition",
    bank: [],
    loadout: emptyLoadout(),
    expedition: { mapSeed, pos, energy, hp: 0, loadout, carry: [], cleared: [] },
  };
}

test("move: steps one tile onto the target terrain and pays its cost", () => {
  const seed = seedFor("woodland");
  const grid = generateGrid(seed, "woodland");
  const { from, to } = findStep(grid, "mud");
  const cost = moveCost("mud", null);
  const { state, events } = reduce(expeditionState(seed, from, 200), { type: "move", to });
  expect(state.expedition!.pos).toEqual(to);
  expect(state.expedition!.energy).toBe(200 - cost);
  expect(events).toEqual([
    { type: "moved", from, to, terrain: "mud", cost, energy: 200 - cost },
  ]);
});

test("move: distant target still moves exactly one tile (8-dir diagonal)", () => {
  const seed = seedFor("woodland");
  const start = { x: 5, y: 5 };
  const { state } = reduce(expeditionState(seed, start, 1000), {
    type: "move",
    to: { x: 12, y: 12 },
  });
  // either moved to (6,6) or was rejected if (6,6) is impassable — assert on the event instead
  const grid = generateGrid(seed, "woodland");
  const terrain = grid.terrain[6]![6]!;
  if (Number.isFinite(moveCost(terrain, null))) {
    expect(state.expedition!.pos).toEqual({ x: 6, y: 6 });
  } else {
    expect(state.expedition!.pos).toEqual(start);
  }
});

test("move: transport lowers the cost of the same step (bead acceptance)", () => {
  const seed = seedFor("woodland");
  const grid = generateGrid(seed, "woodland");
  const { from, to } = findStep(grid, "plains");
  const onFoot = reduce(expeditionState(seed, from, 10, null), { type: "move", to });
  const onHorse = reduce(expeditionState(seed, from, 10, "horse"), { type: "move", to });
  expect(10 - onHorse.state.expedition!.energy).toBeLessThan(
    10 - onFoot.state.expedition!.energy,
  );
});

test("move: ice step drains more energy than plains step (bead acceptance)", () => {
  const tundraSeed = seedFor("tundra");
  const tundraGrid = generateGrid(tundraSeed, rollBiome(tundraSeed));
  const ice = findStep(tundraGrid, "ice");
  const iceSpent =
    200 - reduce(expeditionState(tundraSeed, ice.from, 200), { type: "move", to: ice.to }).state.expedition!.energy;

  const woodSeed = seedFor("woodland");
  const woodGrid = generateGrid(woodSeed, rollBiome(woodSeed));
  const plains = findStep(woodGrid, "plains");
  const plainsSpent =
    200 - reduce(expeditionState(woodSeed, plains.from, 200), { type: "move", to: plains.to }).state.expedition!.energy;

  expect(iceSpent).toBeGreaterThan(plainsSpent);
});

test("move: cost never reads the biome — plains costs the same on every map (D21 guardrail)", () => {
  const spentOn = (biome: BiomeId): number => {
    const seed = seedFor(biome);
    const grid = generateGrid(seed, rollBiome(seed));
    const { from, to } = findStep(grid, "plains");
    return 10 - reduce(expeditionState(seed, from, 10), { type: "move", to }).state.expedition!.energy;
  };
  expect(spentOn("woodland")).toBe(spentOn("desert"));
  expect(spentOn("woodland")).toBe(spentOn("tundra"));
});

test("move: impassable terrain is rejected and costs nothing", () => {
  const seed = seedFor("tundra"); // tundra has mountain weight 0.25
  const grid = generateGrid(seed, rollBiome(seed));
  const { from, to } = findStep(grid, "mountain");
  const { state, events } = reduce(expeditionState(seed, from, 10), { type: "move", to });
  expect(state.expedition!.pos).toEqual(from);
  expect(state.expedition!.energy).toBe(10);
  expect(events).toEqual([
    { type: "action-rejected", action: "move", reason: "impassable" },
  ]);
});

test("move: climbing-pick lets you step onto a mountain (finite cost, not rejected)", () => {
  const seed = seedFor("tundra");
  const grid = generateGrid(seed, rollBiome(seed));
  const { from, to } = findStep(grid, "mountain");

  // On foot the same step is impassable (mirrors the impassable test's combo).
  const onFoot = reduce(expeditionState(seed, from, 200), { type: "move", to });
  expect(onFoot.events).toEqual([
    { type: "action-rejected", action: "move", reason: "impassable" },
  ]);

  // With a climbing-pick equipped, mountain becomes finite (enable = 40).
  const withPick = expeditionState(seed, from, 200);
  withPick.expedition!.loadout.equipment.tools = ["climbing-pick"];
  const climbed = reduce(withPick, { type: "move", to });
  expect(climbed.state.expedition!.pos).toEqual(to);
  expect(climbed.events).toEqual([
    { type: "moved", from, to, terrain: "mountain", cost: 40, energy: 160 },
  ]);
});

test("move: energy at 0 stops further moves (bead acceptance)", () => {
  const seed = seedFor("woodland");
  const grid = generateGrid(seed, rollBiome(seed));
  const { from, to } = findStep(grid, "plains");
  const { state, events } = reduce(expeditionState(seed, from, 0), { type: "move", to });
  expect(state.expedition!.pos).toEqual(from);
  expect(events).toEqual([
    { type: "action-rejected", action: "move", reason: "exhausted" },
  ]);
});

test("move: insufficient energy for the specific step is rejected", () => {
  const seed = seedFor("woodland");
  const grid = generateGrid(seed, rollBiome(seed));
  const { from, to } = findStep(grid, "mud"); // mud costs 1.5
  const { events } = reduce(expeditionState(seed, from, 1), { type: "move", to });
  expect(events).toEqual([
    { type: "action-rejected", action: "move", reason: "exhausted" },
  ]);
});

test("move: already at target is rejected as no-step", () => {
  const seed = seedFor("woodland");
  const { events } = reduce(expeditionState(seed, { x: 4, y: 4 }, 10), {
    type: "move",
    to: { x: 4, y: 4 },
  });
  expect(events).toEqual([
    { type: "action-rejected", action: "move", reason: "no-step" },
  ]);
});

test("move: step off the grid edge is rejected", () => {
  const seed = seedFor("woodland");
  const { events } = reduce(
    expeditionState(seed, { x: 0, y: GRID_SIZE - 1 }, 10),
    { type: "move", to: { x: 0, y: GRID_SIZE + 5 } },
  );
  expect(events).toEqual([
    { type: "action-rejected", action: "move", reason: "out-of-bounds" },
  ]);
});

test("move: rejected in town", () => {
  const town: GameState = {
    seed: "g",
    phase: "town",
    bank: [],
    loadout: emptyLoadout(),
    expedition: null,
  };
  const { state, events } = reduce(town, { type: "move", to: { x: 1, y: 1 } });
  expect(state).toEqual(town);
  expect(events).toEqual([
    { type: "action-rejected", action: "move", reason: "not-on-expedition" },
  ]);
});

test("move: does not mutate the input state", () => {
  const seed = seedFor("woodland");
  const grid = generateGrid(seed, rollBiome(seed));
  const { from, to } = findStep(grid, "plains");
  const input = expeditionState(seed, from, 10);
  const before = structuredClone(input);
  reduce(input, { type: "move", to });
  expect(input).toEqual(before);
});

test("move: energy exactly equal to the step cost is allowed and lands on 0", () => {
  const seed = seedFor("woodland");
  const grid = generateGrid(seed, rollBiome(seed));
  const { from, to } = findStep(grid, "plains");
  const cost = moveCost("plains", null);
  const { state, events } = reduce(expeditionState(seed, from, cost), { type: "move", to });
  expect(state.expedition!.pos).toEqual(to);
  expect(state.expedition!.energy).toBe(0);
  expect(events[0]!.type).toBe("moved");
});
