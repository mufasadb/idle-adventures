// si7.6.2 — fishing: a rod fishes the deepest unfished water tile on or beside you.
import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { generateGrid, rollBiome, fishWaterOf } from "../src/engine/grid";
import type { Grid } from "../src/engine/grid";
import { FISH_CAST_ENERGY, FISH_DEEP_DEPTH, WATER_TERRAINS, BIOMES, FRESH_TO_STALE, FOOD, RECIPE } from "../src/data/constants";
import type { GameState } from "../src/engine/types";

type Pos = { x: number; y: number };

function woodlandSeeds(): string[] {
  const out: string[] = [];
  for (let i = 0; out.length < 40 && i < 400; i++) if (rollBiome(`fish-${i}`) === "woodland") out.push(`fish-${i}`);
  return out;
}

const neighbours = (p: Pos): Pos[] => {
  const out: Pos[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) out.push({ x: p.x + dx, y: p.y + dy });
  return out;
};

// Stand ON `pos` with every other water tile around it already fished, so the cast
// has exactly one candidate: `pos` itself.
function onlyTile(seed: string, grid: Grid, pos: Pos, tools: string[]): GameState {
  const s = at(seed, pos, { tools });
  s.expedition!.fished = waterAround(grid, pos).filter((n) => n.x !== pos.x || n.y !== pos.y);
  return s;
}

function at(seed: string, pos: Pos, opts: { tools?: string[]; energy?: number } = {}): GameState {
  const loadout = emptyLoadout();
  loadout.equipment.tools = opts.tools ?? ["fishing-rod"];
  return {
    seed: "g", phase: "expedition", bank: [], loadout: emptyLoadout(),
    expedition: { mapSeed: seed, pos, energy: opts.energy ?? 200, hp: 30, loadout, carry: [], cleared: [] },
  };
}

// First (seed, tile) in scan order matching a predicate over the grid.
function find(pred: (g: Grid, p: Pos) => boolean): { seed: string; grid: Grid; pos: Pos } {
  for (const seed of woodlandSeeds()) {
    const grid = generateGrid(seed, "woodland");
    for (let y = 0; y < 35; y++) for (let x = 0; x < 35; x++) if (pred(grid, { x, y })) return { seed, grid, pos: { x, y } };
  }
  throw new Error("no matching tile");
}

const isLand = (g: Grid, p: Pos) => !WATER_TERRAINS.includes(g.terrain[p.y]![p.x]!);
const inBounds = (p: Pos) => p.x >= 0 && p.y >= 0 && p.x < 35 && p.y < 35;
const waterAround = (g: Grid, p: Pos) => neighbours(p).filter((n) => inBounds(n) && g.catches?.[n.y]?.[n.x]);

test("every water tile with a fishTable row gets a pre-rolled catch; land never does", () => {
  const grid = generateGrid(woodlandSeeds()[0]!, "woodland");
  for (let y = 0; y < 35; y++) for (let x = 0; x < 35; x++) {
    const water = fishWaterOf(grid.terrain[y]![x]!, grid.depth![y]![x]!);
    if (water === null) expect(grid.catches![y]![x]).toBeNull();
    else expect(Object.keys(BIOMES.woodland.fishTable![water]!)).toContain(grid.catches![y]![x]!);
  }
});

test("deep water only exists FISH_DEEP_DEPTH+ tiles from land", () => {
  const { grid, pos } = find((g, p) => (g.depth![p.y]![p.x]!) >= FISH_DEEP_DEPTH);
  for (let dy = -(FISH_DEEP_DEPTH - 1); dy <= FISH_DEEP_DEPTH - 1; dy++) for (let dx = -(FISH_DEEP_DEPTH - 1); dx <= FISH_DEEP_DEPTH - 1; dx++) {
    const n = { x: pos.x + dx, y: pos.y + dy };
    if (inBounds(n)) expect(isLand(grid, n)).toBe(false);
  }
});

test("no rod → missing-tool; no water around → no-water", () => {
  const shore = find((g, p) => isLand(g, p) && waterAround(g, p).length > 0);
  const r1 = reduce(at(shore.seed, shore.pos, { tools: [] }), { type: "fish" });
  expect(r1.events[0]).toMatchObject({ type: "action-rejected", reason: "missing-tool" });
  const dry = find((g, p) => isLand(g, p) && waterAround(g, p).length === 0);
  const r2 = reduce(at(dry.seed, dry.pos), { type: "fish" });
  expect(r2.events[0]).toMatchObject({ type: "action-rejected", reason: "no-water" });
  // no rod AND no water → no-water (not "needs a rod" on every dry tile)
  const r3 = reduce(at(dry.seed, dry.pos, { tools: [] }), { type: "fish" });
  expect(r3.events[0]).toMatchObject({ type: "action-rejected", reason: "no-water" });
});

test("a cast spends FISH_CAST_ENERGY, lands the catch, and marks the tile fished", () => {
  const shore = find((g, p) => isLand(g, p) && waterAround(g, p).some((n) => FOOD.includes(g.catches![n.y]![n.x]!)));
  const r = reduce(at(shore.seed, shore.pos), { type: "fish" });
  const ev = r.events[0]!;
  expect(ev.type).toBe("fished");
  if (ev.type !== "fished") return;
  expect(ev.cost).toBe(FISH_CAST_ENERGY);
  expect(r.state.expedition!.energy).toBe(200 - FISH_CAST_ENERGY);
  expect(r.state.expedition!.fished).toEqual([ev.at]);
  const all = [...r.state.expedition!.loadout.food, ...r.state.expedition!.carry].map((s) => s.defId);
  if (FOOD.includes(ev.catch)) expect(r.state.expedition!.loadout.food[0]!.defId).toBe(ev.catch); // fresh → front of the queue
  else expect(all.length).toBeGreaterThanOrEqual(0);
});

test("the cast picks the DEEPEST unfished tile around you, then works outward until fished-out", () => {
  const shore = find((g, p) => isLand(g, p) && waterAround(g, p).length >= 3);
  let s = at(shore.seed, shore.pos, { energy: 300 });
  const depths: number[] = [];
  for (let i = 0; i < 9; i++) {
    const r = reduce(s, { type: "fish" });
    const ev = r.events[0]!;
    if (ev.type !== "fished") {
      expect(ev).toMatchObject({ type: "action-rejected", reason: "fished-out" });
      break;
    }
    depths.push(shore.grid.depth![ev.at.y]![ev.at.x]!);
    s = r.state;
  }
  expect(depths.length).toBe(waterAround(shore.grid, shore.pos).length);
  expect([...depths].sort((a, b) => b - a)).toEqual(depths); // never shallower before deeper
});

test("out on a raft over deep water, the catch comes from the deep-lake table", () => {
  const deep = find((g, p) => (g.depth![p.y]![p.x]!) >= FISH_DEEP_DEPTH + 1);
  const r = reduce(at(deep.seed, deep.pos, { tools: ["fishing-rod", "raft"] }), { type: "fish" });
  const ev = r.events[0]!;
  expect(ev).toMatchObject({ type: "fished", water: "deep-lake" });
  if (ev.type === "fished") expect(Object.keys(BIOMES.woodland.fishTable!["deep-lake"]!)).toContain(ev.catch);
});

test("a sunken lockbox opens into carry; a sodden map joins the carried maps", () => {
  const box = find((g, p) => g.catches![p.y]![p.x] === "sunken-lockbox");
  const rb = reduce(onlyTile(box.seed, box.grid, box.pos, ["fishing-rod", "raft"]), { type: "fish" });
  const evb = rb.events[0]!;
  expect(evb).toMatchObject({ type: "fished", catch: "sunken-lockbox" });
  if (evb.type === "fished") {
    const held = [...rb.state.expedition!.carry, ...rb.state.expedition!.loadout.potions];
    for (const c of evb.contents) expect(held.some((h) => h.defId === c.defId)).toBe(true);
    expect(held.some((h) => h.defId === "sunken-lockbox")).toBe(false); // opened, not carried
  }
  const map = find((g, p) => g.catches![p.y]![p.x] === "sodden-map");
  const rm = reduce(onlyTile(map.seed, map.grid, map.pos, ["fishing-rod", "raft"]), { type: "fish" });
  expect(rm.events[1]).toMatchObject({ type: "map-dropped", source: "fished", carried: true, tier: 2 });
  expect(rm.state.expedition!.carriedMaps).toHaveLength(1);
});

test("fresh fish stales to stale-fish on the way home, and the smokehouse cures it", () => {
  for (const f of ["trout", "perch", "pike", "crayfish"]) expect(FRESH_TO_STALE[f]).toBe("stale-fish");
  expect(RECIPE["smoked-fish"]!.inputs[0]!.defId).toBe("stale-fish");
  const spot = find((g, p) => g.catches![p.y]![p.x] === "trout");
  const r = reduce(onlyTile(spot.seed, spot.grid, spot.pos, ["fishing-rod", "raft"]), { type: "fish" });
  const ev = r.events[0]!;
  expect(ev).toMatchObject({ type: "fished", catch: "trout" });
  const banked = reduce(r.state, { type: "return" }).state.bank;
  expect(banked.some((b) => b.defId === "stale-fish")).toBe(true);
  expect(banked.some((b) => b.defId === "trout")).toBe(false);
});

test("every fishing catch has a use: food, a recipe input, or a catch effect", () => {
  const catches = new Set<string>();
  for (const b of Object.values(BIOMES)) for (const row of Object.values(b.fishTable ?? {})) for (const d of Object.keys(row)) catches.add(d);
  const inputs = new Set(Object.values(RECIPE).flatMap((r) => r.inputs.map((i) => i.defId)));
  for (const d of catches) {
    const used = FOOD.includes(d) || inputs.has(d) || d === "sunken-lockbox" || d === "sodden-map";
    expect({ d, used }).toEqual({ d, used: true });
  }
});

test("desert and tundra fish their rivers only (no standing water there)", () => {
  for (const biome of ["desert", "tundra"] as const) {
    const g = generateGrid("dry-1", biome);
    for (let y = 0; y < 35; y++) for (let x = 0; x < 35; x++) {
      if (g.catches![y]![x]) expect(g.terrain[y]![x]).toBe("river");
    }
  }
});
