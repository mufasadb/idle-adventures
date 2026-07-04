import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { legalActions } from "../src/sim/legal";
import { play } from "../src/sim/play";
import { newGame } from "../src/engine/town";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { GRID_SIZE } from "../src/data/constants";
import type { Action, GameState } from "../src/engine/types";
import type { BiomeId } from "../src/data/constants";

const accepts = (s: GameState, a: Action) =>
  reduce(s, a).events.every((e) => e.type !== "action-rejected");

// Greedy driver: pack a mining loadout, embark on `mapSeed`, walk to the nearest
// gatherable POI and gather, then return. Returns the full run + whether it
// gathered. Every action goes through reduce; legalActions is asserted en route.
function runLoop(seed: string, mapSeed: string): { state: GameState; gathered: boolean } {
  let state = newGame(seed);
  const pack = (a: Action) => { state = reduce(state, a).state; };
  pack({ type: "pack", slot: "tool", itemId: "pick" });
  pack({ type: "pack", slot: "tool", itemId: "axe" });
  pack({ type: "pack", slot: "tool", itemId: "knife" });
  pack({ type: "pack", slot: "backpack", itemId: "starter" });
  for (let i = 0; i < 4; i++) pack({ type: "pack", slot: "food", itemId: "ration" }); // 40 energy
  state = reduce(state, { type: "embark", mapSeed }).state;
  expect(state.phase).toBe("expedition");

  const grid = generateGrid(mapSeed, rollBiome(mapSeed));
  const gatherable = grid.pois.filter((p) => p.kind !== "monster" && p.material !== null);

  let gathered = false;
  // up to GRID_SIZE*2 steps: move toward the nearest uncleared gatherable POI,
  // gather when standing on one.
  for (let step = 0; step < GRID_SIZE * 2 && state.expedition; step++) {
    const legal = legalActions(state);
    for (const a of legal) expect(accepts(state, a)).toBe(true); // D29: no drift
    const here = state.expedition.pos;
    const onNode = gatherable.some(
      (p) => p.x === here.x && p.y === here.y &&
        !state.expedition!.cleared.some((c) => c.x === p.x && c.y === p.y),
    );
    if (onNode && legal.some((a) => a.type === "gather")) {
      state = reduce(state, { type: "gather" }).state;
      gathered = true;
      break;
    }
    // nearest uncleared gatherable POI
    const targets = gatherable.filter(
      (p) => !state.expedition!.cleared.some((c) => c.x === p.x && c.y === p.y),
    );
    if (targets.length === 0) break;
    targets.sort(
      (a, b) =>
        Math.max(Math.abs(a.x - here.x), Math.abs(a.y - here.y)) -
        Math.max(Math.abs(b.x - here.x), Math.abs(b.y - here.y)),
    );
    const move: Action = { type: "move", to: { x: targets[0]!.x, y: targets[0]!.y } };
    if (!accepts(state, move)) break; // blocked (impassable/exhausted)
    const before = here;
    state = reduce(state, move).state;
    const after = state.expedition!.pos;
    if (after.x === before.x && after.y === before.y) break; // no progress
  }

  state = reduce(state, { type: "return" }).state;
  expect(state.phase).toBe("town");
  return { state, gathered };
}

// Find CANDIDATE map seeds (derived like candidateMaps: `${seed}:map:${i}`) whose
// biome differs, so we prove the harness on ≥2 biomes.
function twoBiomeMaps(): { mapSeed: string; biome: BiomeId }[] {
  const byBiome = new Map<BiomeId, string>();
  for (let i = 0; i < 60 && byBiome.size < 2; i++) {
    const mapSeed = `hl:map:${i}`;
    const biome = rollBiome(mapSeed);
    if (!byBiome.has(biome)) byBiome.set(biome, mapSeed);
  }
  return [...byBiome.entries()].map(([biome, mapSeed]) => ({ mapSeed, biome }));
}

test("harness: a JSON action stream drives a full loop on two different biomes", () => {
  const maps = twoBiomeMaps();
  expect(maps.length).toBe(2);
  expect(maps[0]!.biome).not.toBe(maps[1]!.biome);
  for (const { mapSeed } of maps) {
    const { state, gathered } = runLoop("hl", mapSeed);
    expect(state.phase).toBe("town");
    expect(gathered).toBe(true); // walked to a node and gathered
    // banked at least one non-starter material (loot came home)
    const starter = new Set(["starter", "pick", "axe", "knife", "sword", "ration", "potion"]);
    expect(state.bank.some((s) => !starter.has(s.defId) && s.qty > 0)).toBe(true);
  }
});

test("harness: play() reproduces a hand-authored full loop headlessly", () => {
  // A fixed JSON action list (town → embark → return) drives play with no UI.
  const actions: Action[] = [
    { type: "pack", slot: "food", itemId: "ration" },
    { type: "pack", slot: "food", itemId: "ration" },
    { type: "embark", mapSeed: "hl:map:0" },
    { type: "return" },
  ];
  const { state, events } = play("hl", actions);
  expect(state.phase).toBe("town");
  expect(events.some((e) => e.type === "embarked")).toBe(true);
  expect(events.some((e) => e.type === "run-ended" && e.reason === "returned")).toBe(true);
});
