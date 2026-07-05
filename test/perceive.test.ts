import { test, expect } from "bun:test";
import { perceive } from "../src/engine/perceive";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { DETAIL_RADIUS } from "../src/data/constants";

const cheby = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

test("perceive: kind is always present; detail only within DETAIL_RADIUS", () => {
  const seed = "perceive-1";
  const grid = generateGrid(seed, rollBiome(seed));
  const at = grid.pois[0]!; // stand on the first POI
  const seen = perceive(grid, { x: at.x, y: at.y }, []);
  expect(seen.length).toBe(grid.pois.length);
  for (const p of seen) {
    const src = grid.pois.find((g) => g.x === p.x && g.y === p.y)!;
    expect(p.kind).toBe(src.kind); // kind always known
    if (cheby(at, p) <= DETAIL_RADIUS) expect(p.detail).not.toBeNull();
    else expect(p.detail).toBeNull();
  }
});

test("perceive: detail carries facts (tier + type/identity), never an outcome", () => {
  const seed = "perceive-2";
  const grid = generateGrid(seed, rollBiome(seed));
  const monster = grid.pois.find((p) => p.kind === "monster")!;
  const seen = perceive(grid, { x: monster.x, y: monster.y }, []);
  const m = seen.find((p) => p.x === monster.x && p.y === monster.y)!;
  expect(m.detail).not.toBeNull();
  expect(m.detail!.tier).toBeGreaterThan(0);
  expect(m.detail!.dmgType).toBeDefined();
  expect(m.detail!.armourType).toBeDefined();
  expect(m.detail!.creature).toBe(monster.creature!);
  // no outcome fields ever
  expect((m.detail as Record<string, unknown>).victory).toBeUndefined();
  expect((m.detail as Record<string, unknown>).hpLost).toBeUndefined();
});

test("perceive: spyglass extends the detail radius", () => {
  const seed = "perceive-3";
  const grid = generateGrid(seed, rollBiome(seed));
  const origin = grid.entry;
  // A POI just outside base radius but inside spyglass radius from the entry.
  const far = grid.pois.find((p) => {
    const d = cheby(origin, p);
    return d > DETAIL_RADIUS && d <= DETAIL_RADIUS + 3;
  });
  if (!far) return; // seed-dependent; asserts only run when such a POI exists
  const bare = perceive(grid, origin, []).find((p) => p.x === far.x && p.y === far.y)!;
  const glass = perceive(grid, origin, ["spyglass"]).find((p) => p.x === far.x && p.y === far.y)!;
  expect(bare.detail).toBeNull();
  expect(glass.detail).not.toBeNull();
});
