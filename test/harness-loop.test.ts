import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { legalActions } from "../src/sim/legal";
import { play } from "../src/sim/play";
import { newGame, candidateMaps } from "../src/engine/town";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { MAP_WIDTH, MAP_HEIGHT } from "../src/data/constants";
import type { Action, GameState } from "../src/engine/types";
import type { BiomeId } from "../src/data/constants";

const accepts = (s: GameState, a: Action) =>
  reduce(s, a).events.every((e) => e.type !== "action-rejected");

// This driver targets non-monster gatherable POIs, but the greedy walk can
// still step onto a monster tile en route. si7.1: that ENGAGES rather than
// resolving inline (accepts() sees no rejection, so the walk "succeeds" into
// an engagement instead of a step). Fight it out so the loop doesn't read a
// resolved engagement as "no progress" and wedge.
function resolveWalkIn(state: GameState): GameState {
  let s = state;
  let guard = 0;
  while (s.expedition?.combat && ++guard < 100) {
    s = reduce(s, { type: "fight" }).state;
  }
  return s;
}

// Greedy driver: pack a mining loadout, embark on `mapSeed`, walk to the nearest
// gatherable POI and gather, then return. Returns the full run + whether it
// gathered. Every action goes through reduce; legalActions is asserted en route.
function runLoop(seed: string, mapSeed: string, runs: number): { state: GameState; gathered: boolean } {
  let state: GameState = { ...newGame(seed), runs }; // runs must match the visit that offered mapSeed (9u9.3)
  const pack = (a: Action) => { state = reduce(state, a).state; };
  pack({ type: "pack", slot: "tool", itemId: "pick" });
  pack({ type: "pack", slot: "tool", itemId: "axe" });
  pack({ type: "pack", slot: "tool", itemId: "knife" });
  pack({ type: "pack", slot: "backpack", itemId: "starter" });
  for (let i = 0; i < 4; i++) pack({ type: "pack", slot: "food", itemId: "ration" }); // 40 energy
  state = reduce(state, { type: "embark", mapSeed }).state;
  expect(state.phase).toBe("expedition");
  // mco: auto-eat is off by default — designate the packed ration to eat-to-refill.
  state = reduce(state, { type: "set-auto-eat-food", defId: "ration" }).state;

  const grid = generateGrid(mapSeed, rollBiome(mapSeed));
  const gatherable = grid.pois.filter((p) => p.kind !== "monster" && p.material !== null);

  let gathered = false;
  // up to MAP_WIDTH+MAP_HEIGHT steps: move toward the nearest uncleared
  // gatherable POI, gather when standing on one.
  for (let step = 0; step < MAP_WIDTH + MAP_HEIGHT && state.expedition; step++) {
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
    if (state.expedition?.combat) state = resolveWalkIn(state); // accidental walk-in: fight it out
    if (!state.expedition) break; // engagement lost, run ended
    const after = state.expedition.pos;
    if (after.x === before.x && after.y === before.y) break; // no progress
  }

  state = reduce(state, { type: "return" }).state;
  expect(state.phase).toBe("town");
  return { state, gathered };
}

test("harness: a JSON action stream drives a full loop on two different biomes", () => {
  // Scan the town's rotating offer (candidateMaps, by town-visit `runs`) for two
  // DISTINCT biomes on which the greedy driver actually completes a gather. The
  // driver is naive (no pathfinding — mountains can wedge a straight-line route),
  // so we don't bet on a specific map; we prove the loop works on ≥2 biomes and
  // every embark is a validly-offered candidate (9u9.3).
  const done = new Map<BiomeId, { state: GameState; gathered: boolean }>();
  for (let r = 0; r < 80 && done.size < 2; r++) {
    for (const c of candidateMaps("hl", r)) {
      if (done.has(c.biomeId)) continue;
      const res = runLoop("hl", c.mapSeed, r); // embark validates: mapSeed ∈ offer at runs=r
      if (res.gathered) done.set(c.biomeId, res);
    }
  }
  expect(done.size).toBe(2); // two biomes drove a full gather loop
  const starter = new Set(["starter", "pick", "axe", "knife", "sword", "ration", "potion"]);
  for (const { state, gathered } of done.values()) {
    expect(state.phase).toBe("town");
    expect(gathered).toBe(true);
    expect(state.bank.some((s) => !starter.has(s.defId) && s.qty > 0)).toBe(true); // loot came home
  }
});

test("harness: play() reproduces a hand-authored full loop headlessly", () => {
  // A fixed JSON action list (town → embark → return) drives play with no UI.
  const actions: Action[] = [
    { type: "pack", slot: "food", itemId: "ration" },
    { type: "pack", slot: "food", itemId: "ration" },
    { type: "embark", mapSeed: candidateMaps("hl", 0)[0]!.mapSeed },
    { type: "return" },
  ];
  const { state, events } = play("hl", actions);
  expect(state.phase).toBe("town");
  expect(events.some((e) => e.type === "embarked")).toBe(true);
  expect(events.some((e) => e.type === "run-ended" && e.reason === "returned")).toBe(true);
});
