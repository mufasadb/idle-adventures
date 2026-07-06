import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { newGame, candidateMaps } from "../src/engine/town";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { costToReach } from "../src/engine/reach";
import { MAX_ENERGY, MAP_WIDTH, MAP_HEIGHT } from "../src/data/constants";
import type { Action, GameState } from "../src/engine/types";

test("e3j structural: the strip out-ranges one energy tank (5 offered maps)", () => {
  // The farthest POI must cost more than MAX_ENERGY to even REACH on foot —
  // food (and forage routing) is the only way to work the deep half.
  for (let r = 0; r < 5; r++) {
    const c = candidateMaps("rf", r)[0]!;
    const grid = generateGrid(c.mapSeed, rollBiome(c.mapSeed));
    const reach = costToReach(grid.terrain, grid.entry);
    const finite = grid.pois.map((p) => reach[p.y]![p.x]!).filter(Number.isFinite);
    expect(finite.length).toBeGreaterThan(0);
    expect(Math.max(...finite)).toBeGreaterThan(MAX_ENERGY);
  }
});

test("e3j report: starter-kit harvest fraction", () => {
  const c = candidateMaps("rf", 0)[0]!;
  let state: GameState = newGame("rf");
  const act = (a: Action) => { state = reduce(state, a).state; };
  act({ type: "pack", slot: "tool", itemId: "pick" });
  act({ type: "pack", slot: "tool", itemId: "axe" });
  act({ type: "pack", slot: "tool", itemId: "knife" });
  act({ type: "pack", slot: "backpack", itemId: "starter" });
  for (let i = 0; i < 4; i++) act({ type: "pack", slot: "food", itemId: "ration" });
  act({ type: "embark", mapSeed: c.mapSeed });
  expect(state.phase).toBe("expedition");
  const grid = generateGrid(c.mapSeed, rollBiome(c.mapSeed));
  const gatherable = grid.pois.filter((p) => p.kind !== "monster" && p.material !== null);
  let cleared = 0;
  // Greedy: walk to the nearest unworked gatherable node, gather, DROP the loot
  // (this measures energy reach, not carry pressure), repeat until exhausted,
  // wedged, or killed (walking into a blocking monster unarmed can end the run).
  for (let step = 0; step < (MAP_WIDTH + MAP_HEIGHT) * 4 && state.expedition; step++) {
    const exp = state.expedition;
    const here = exp.pos;
    const targets = gatherable.filter((p) => !exp.cleared.some((q) => q.x === p.x && q.y === p.y));
    if (targets.length === 0) break;
    targets.sort(
      (a, b) =>
        Math.max(Math.abs(a.x - here.x), Math.abs(a.y - here.y)) -
        Math.max(Math.abs(b.x - here.x), Math.abs(b.y - here.y)),
    );
    const t = targets[0]!;
    if (t.x === here.x && t.y === here.y) {
      const r = reduce(state, { type: "gather" });
      state = r.state;
      if (!r.events.some((e) => e.type === "gathered")) break; // tool-too-weak/carry-full — greedy is done
      cleared++;
      state = reduce(state, { type: "drop", itemId: t.material! }).state; // shed loot: measure reach, not carry
      continue;
    }
    const r = reduce(state, { type: "move", to: { x: t.x, y: t.y } });
    if (r.events.some((e) => e.type === "action-rejected")) break; // exhausted / impassable
    state = r.state;
    if (state.expedition && state.expedition.pos.x === here.x && state.expedition.pos.y === here.y) break; // wedged
  }
  if (state.expedition) state = reduce(state, { type: "return" }).state;
  const fraction = cleared / grid.pois.length;
  console.log(
    `[e3j] starter-kit harvest: ${cleared}/${grid.pois.length} POIs (${(100 * fraction).toFixed(0)}%) — target 15–20% starter, ~50% geared`,
  );
  // Structural ceiling only: even a perfect starter run must not clear most of the map.
  expect(fraction).toBeLessThan(0.6);
});
