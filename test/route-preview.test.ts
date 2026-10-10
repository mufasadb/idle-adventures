import { test, expect, describe } from "bun:test";
import { deriveRoute } from "../src/web/route";
import { reduce } from "../src/engine/reduce";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { moveCost } from "../src/engine/move";
import { MAP_WIDTH, MAP_HEIGHT } from "../src/data/constants";
import type { Expedition, GameState } from "../src/engine/types";
import { emptyLoadout } from "../src/engine/loadout";
import { freeLootStacks } from "../src/engine/carry";
import { gatherYield } from "../src/engine/reduce-expedition";
import { route as walkWaypoints } from "../src/sim/play";
import { yieldLine } from "../src/render/render";

// df3: the route-energy preview must account for DESIGNATED auto-eat refills that
// happen DURING the walk. The reducer refills after paying each step's cost, so a
// route whose raw walkCost exceeds current energy can still complete (and end with
// energy > 0) when packed food covers it. The old preview flagged "runs dry" on
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

test("route coverable by auto-eat is NOT flagged as running dry, and end-energy matches a real walk", () => {
  // 20 plains tiles north = 200 walkCost. Start with only 50 energy — raw total (200)
  // far exceeds it. But 3 rations (80 each = 240 energy of refills) auto-eat mid-walk.
  const exp = expAt(50, [{ defId: "ration", qty: 3 }], "ration");
  const rt = deriveRoute(GRID, exp, wpsNorth(20), new Set(), new Set());

  expect(rt.walkCost).toBe(200); // raw spend
  expect(rt.walkCost).toBeGreaterThan(exp.energy); // exceeds current energy (old code would flag it)
  expect(rt.runsDry).toBe(false); // ...but auto-eat covers it, so it does NOT run dry
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

test("route NOT coverable (no designated food) is still flagged as running dry", () => {
  // Same 200-cost route, 50 energy, but auto-eat is OFF (no autoEatFood) — the walk
  // genuinely can't finish, so the honest verdict is still "runs dry".
  const exp = expAt(50, [{ defId: "ration", qty: 3 }] /* packed but not designated */);
  const rt = deriveRoute(GRID, exp, wpsNorth(20), new Set(), new Set());
  expect(rt.runsDry).toBe(true);
  expect(rt.endEnergy).toBeLessThanOrEqual(0);
});

test("baseline: preview end-energy tracks a real walk when auto-eat is off (no refills)", () => {
  // Short route (3 tiles = 30 cost) within 50 energy, auto-eat OFF: end-energy is
  // simply energy − cost = 20, and a real walk agrees.
  const exp = expAt(50, [{ defId: "ration", qty: 3 }] /* not designated */);
  const rt = deriveRoute(GRID, exp, wpsNorth(3), new Set(), new Set());
  expect(rt.runsDry).toBe(false);
  expect(rt.endEnergy).toBeCloseTo(20, 5); // 50 − 3×10, no auto-eat

  let state: GameState = { seed: "s", phase: "expedition", bank: [], loadout: emptyLoadout(), expedition: exp };
  for (let i = 0; i < 3; i++) {
    state = reduce(state, { type: "move", to: { x: START.x, y: START.y - (i + 1) } }).state;
  }
  expect(state.expedition!.energy).toBeCloseTo(rt.endEnergy, 5);
});

// 2i8: the walk auto-engages the FIRST monster on the line, so the preview surfaces it
// (used to warn on a route that runs into a fight you'd lose). Clearing it drops it.
test("deriveRoute surfaces the first uncleared monster crossed; a cleared one is not", () => {
  const walkableAt = (grid: ReturnType<typeof generateGrid>, x: number, y: number) =>
    x >= 0 && y >= 0 && x < MAP_WIDTH && y < MAP_HEIGHT && Number.isFinite(moveCost(grid.terrain[y]![x]!, null, []));
  for (let i = 0; i < 400; i++) {
    const seed = `cm-${i}`;
    const grid = generateGrid(seed, rollBiome(seed));
    const mon = grid.pois.find((p) => p.kind === "monster" && p.creature);
    if (!mon) continue;
    // a walkable 4-neighbour to start the line from (monster tiles are walkable)
    const start = [{ x: mon.x - 1, y: mon.y }, { x: mon.x + 1, y: mon.y }, { x: mon.x, y: mon.y - 1 }, { x: mon.x, y: mon.y + 1 }]
      .find((c) => walkableAt(grid, c.x, c.y));
    if (!start) continue;
    const exp: Expedition = { mapSeed: seed, pos: start, energy: 300, maxEnergy: 300, hp: 30, loadout: emptyLoadout(), carry: [], cleared: [] };
    const wps = [{ x: mon.x, y: mon.y }];
    const rt = deriveRoute(grid, exp, wps, new Set(), new Set());
    expect(rt.crossedMonster).toEqual({ pos: { x: mon.x, y: mon.y }, creature: mon.creature! });
    // once that tile is cleared, the walk no longer engages it → not surfaced
    const rtCleared = deriveRoute(grid, exp, wps, new Set(), new Set([`${mon.x},${mon.y}`]));
    expect(rtCleared.crossedMonster).toBeNull();
    return;
  }
  throw new Error("no monster-on-line fixture found in scan range");
});

test("deriveRoute prices spore-thickets in HP, and a filter-mask zeroes it (si7.6.9.6, D99)", () => {
  // a hand-built strip: plains → 3 thickets → plains
  const grid = generateGrid("route-hp", "woodland");
  const terrain = grid.terrain.map((row) => [...row]);
  for (let x = 0; x < 6; x++) terrain[0]![x] = x >= 1 && x <= 3 ? "spore-thicket" : "plains";
  const g = { ...grid, terrain, pois: [] };
  const exp = (tools: string[]): Expedition => {
    const loadout = emptyLoadout(); loadout.equipment.tools = tools;
    return { mapSeed: "route-hp", pos: { x: 0, y: 0 }, energy: 300, hp: 30, loadout, carry: [], cleared: [] };
  };
  const bare = deriveRoute(g, exp([]), [{ x: 5, y: 0 }], new Set(), new Set());
  expect(bare.hpCost).toBe(6);
  expect(bare.hazardKeys.size).toBe(3);
  const masked = deriveRoute(g, exp(["filter-mask"]), [{ x: 5, y: 0 }], new Set(), new Set());
  expect(masked.hpCost).toBe(0);
});

// seyh.6: the route card promises what the walk will gather and whether it fits. The
// prediction must match a REAL walk (sim/play route — the web's walkWaypoints), so the
// card can never lie. FIXTURE (seed scan, like scanForPoi): map "yl-0" — from (17,27)
// the lines to the copper veins at (18,27) and (15,25), and on to the iron vein at
// (23,21), are walkable and cross no other POI.
describe("deriveRoute gathers + fits (seyh.6)", () => {
  const YSEED = "yl-0";
  const YGRID = generateGrid(YSEED, rollBiome(YSEED));
  const YSTART = { x: 17, y: 27 };
  const CU_A = { x: 18, y: 27 }, CU_B = { x: 15, y: 25 }, FE = { x: 23, y: 21 };
  const allResolved = new Set(YGRID.pois.map((p) => `${p.x},${p.y}`));
  const yexp = (over: Partial<Expedition> = {}): Expedition => {
    const loadout = emptyLoadout(); loadout.equipment.tools = ["pick"];
    return { mapSeed: YSEED, pos: { ...YSTART }, energy: 300, maxEnergy: 300, hp: 30, loadout, carry: [], cleared: [], ...over };
  };
  const walk = (exp: Expedition, wps: { x: number; y: number }[]) =>
    walkWaypoints({ seed: "s", phase: "expedition", bank: [], loadout: emptyLoadout(), expedition: exp }, wps);
  const gotten = (r: ReturnType<typeof walk>) => r.events.flatMap((e) => (e.type === "gathered" ? [{ material: e.material, qty: e.qty }] : []));

  test("fixture sanity: the three veins are where the scan put them", () => {
    const at = (p: { x: number; y: number }) => YGRID.pois.find((q) => q.x === p.x && q.y === p.y);
    expect(at(CU_A)?.material).toBe("copper-ore");
    expect(at(CU_B)?.material).toBe("copper-ore");
    expect(at(FE)?.material).toBe("iron-ore");
  });

  test("a 3-waypoint sweep over 2 resolved copper veins predicts 2 gathers that fit — and a real walk agrees", () => {
    const exp = yexp();
    const wps = [CU_A, CU_B, YSTART];
    const rt = deriveRoute(YGRID, exp, wps, allResolved, new Set());
    const q = gatherYield("mining", null);
    expect(rt.gathers.map((g) => ({ material: g.material, qty: g.qty }))).toEqual([{ material: "copper-ore", qty: q }, { material: "copper-ore", qty: q }]);
    expect(rt.fits).toBe(true);
    expect(rt.short).toBe(0);
    expect(yieldLine(rt.gathers)).toBe(`→ Copper Ore +${2 * q}`); // seyh.29: the yield only, no fit verdict
    const r = walk(exp, wps);
    expect(r.halt).toBeNull();
    expect(gotten(r)).toEqual(rt.gathers.map((g) => ({ material: g.material, qty: g.qty })));
  });

  test("1 free slot and 2 new materials → the route model is 1 short, and the real walk pauses bag-full there", () => {
    const free = freeLootStacks(yexp().loadout); // the pick takes a slot too
    const carry = Array.from({ length: free - 1 }, () => ({ defId: "oak-log", qty: 1 }));
    const exp = yexp({ carry });
    const wps = [CU_A, FE];
    const rt = deriveRoute(YGRID, exp, wps, allResolved, new Set());
    expect(rt.gathers.map((g) => g.material)).toEqual(["copper-ore", "iron-ore"]);
    expect(rt.fits).toBe(false);
    expect(rt.short).toBe(1);
    expect(yieldLine(rt.gathers)).not.toMatch(/fit|✓|✗/); // seyh.29 (D111): no verdict — the bag counter says the bag is full
    const r = walk(exp, wps);
    expect(r.halt).toEqual({ kind: "bag-full" });
    expect(gotten(r).map((g) => g.material)).toEqual(["copper-ore"]); // the fitting prefix landed
  });

  test("auto-gather off → no gathers, empty yield line (only what the walk will actually do)", () => {
    const rt = deriveRoute(YGRID, yexp({ autoGather: false }), [CU_A, CU_B], allResolved, new Set());
    expect(rt.gathers).toEqual([]);
    expect(yieldLine(rt.gathers)).toBe("");
  });

  test("unresolved nodes are never predicted", () => {
    const rt = deriveRoute(YGRID, yexp(), [CU_A, CU_B], new Set(), new Set());
    expect(rt.gathers).toEqual([]);
  });
});
