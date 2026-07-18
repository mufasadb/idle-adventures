import { test, expect } from "bun:test";
import { deriveRoute } from "../src/web/route";
import { reduce } from "../src/engine/reduce";
import { generateGrid, rollBiome } from "../src/engine/grid";
import type { Expedition, GameState } from "../src/engine/types";
import { emptyLoadout } from "../src/engine/loadout";

// df3: the route-energy preview must account for DESIGNATED auto-eat refills that
// happen DURING the walk. The reducer refills after paying each step's cost, so a
// route whose raw walkCost exceeds current energy can still complete (and end with
// energy > 0) when packed food covers it. The old preview flagged "strands you" on
// any raw total > energy, lying about a walk that actually succeeds.
//
// FIXTURE (found by scanning seeds, _find.ts): map "rp-0", column x=3 has a straight
// walkable plains run from y=34 north — 20 single steps @ 10 each = 200 walkCost,
// with NO POIs on the line (so no auto-gather confounds the energy accounting). Using
// a REAL generated grid means the reducer (which regenerates the grid from mapSeed)
// walks the SAME terrain as the preview, so preview-vs-reality is an honest compare.
const SEED = "rp-0";
const GRID = generateGrid(SEED, rollBiome(SEED));
const START = { x: 3, y: 34 };

function expAt(energy: number, food: { defId: string; qty: number }[], autoEatFood?: string): Expedition {
  const loadout = emptyLoadout();
  loadout.food = food;
  return {
    mapSeed: SEED,
    pos: { ...START },
    energy,
    maxEnergy: 300,
    hp: 30,
    loadout,
    carry: [],
    cleared: [],
    autoEatFood,
    autoGather: false,
  };
}

// A single waypoint 20 tiles north — the naive line fills the column.
const wpsNorth = (n: number) => [{ x: START.x, y: START.y - n }];

test("route coverable by auto-eat is NOT flagged as stranding, and end-energy matches a real walk", () => {
  // 20 plains tiles north = 200 walkCost. Start with only 50 energy — raw total (200)
  // far exceeds it. But 3 rations (80 each = 240 energy of refills) auto-eat mid-walk.
  const exp = expAt(50, [{ defId: "ration", qty: 3 }], "ration");
  const rt = deriveRoute(GRID, exp, wpsNorth(20), new Set(), new Set());

  expect(rt.walkCost).toBe(200); // raw spend
  expect(rt.walkCost).toBeGreaterThan(exp.energy); // exceeds current energy (old code would strand)
  expect(rt.strands).toBe(false); // ...but auto-eat covers it, so it does NOT strand
  expect(rt.endEnergy).toBeGreaterThan(0);

  // The preview's projected end-energy must EQUAL what a real reducer walk produces.
  let state: GameState = { seed: "s", phase: "expedition", bank: [], loadout: emptyLoadout(), expedition: exp };
  for (let i = 0; i < 20; i++) {
    const r = reduce(state, { type: "move", to: { x: START.x, y: START.y - (i + 1) } });
    expect(r.events.some((e) => e.type === "action-rejected")).toBe(false); // the walk really completes
    state = r.state;
  }
  expect(state.expedition!.pos.y).toBe(START.y - 20);
  expect(state.expedition!.energy).toBeCloseTo(rt.endEnergy, 5); // preview == reality
});

test("route NOT coverable (no designated food) is still flagged as stranding", () => {
  // Same 200-cost route, 50 energy, but auto-eat is OFF (no autoEatFood) — the walk
  // genuinely can't finish, so the honest verdict is still "strands you".
  const exp = expAt(50, [{ defId: "ration", qty: 3 }] /* packed but not designated */);
  const rt = deriveRoute(GRID, exp, wpsNorth(20), new Set(), new Set());
  expect(rt.strands).toBe(true);
  expect(rt.endEnergy).toBeLessThanOrEqual(0);
});

test("baseline: preview end-energy tracks a real walk when auto-eat is off (no refills)", () => {
  // Short route (3 tiles = 30 cost) within 50 energy, auto-eat OFF: end-energy is
  // simply energy − cost = 20, and a real walk agrees.
  const exp = expAt(50, [{ defId: "ration", qty: 3 }] /* not designated */);
  const rt = deriveRoute(GRID, exp, wpsNorth(3), new Set(), new Set());
  expect(rt.strands).toBe(false);
  expect(rt.endEnergy).toBeCloseTo(20, 5); // 50 − 3×10, no auto-eat

  let state: GameState = { seed: "s", phase: "expedition", bank: [], loadout: emptyLoadout(), expedition: exp };
  for (let i = 0; i < 3; i++) {
    state = reduce(state, { type: "move", to: { x: START.x, y: START.y - (i + 1) } }).state;
  }
  expect(state.expedition!.energy).toBeCloseTo(rt.endEnergy, 5);
});
