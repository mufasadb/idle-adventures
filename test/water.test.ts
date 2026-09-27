// si7.6.5 — standing water: shallows (wade), lake (raft), sea (sea boat, later).
import { test, expect } from "bun:test";
import { generateGrid } from "../src/engine/grid";
import { moveCost } from "../src/engine/move";
import { BIOMES, MAP_WIDTH, MAP_HEIGHT } from "../src/data/constants";
import type { BiomeId } from "../src/data/constants";

const fingerprint = (biome: BiomeId): string => {
  let s = "";
  for (const seed of ["a", "b", "c", "d"]) {
    const g = generateGrid(seed, biome);
    s += g.terrain.flat().join("") + JSON.stringify(g.pois) + JSON.stringify(g.entry);
  }
  return Bun.hash(s).toString(16);
};

test("biomes without a water layer generate byte-identically to before water existed", () => {
  // Pinned from the pre-si7.6.5 generator: desert/tundra have no `water`, so the
  // appended terrains and the namespaced water field must not move a single tile.
  expect(BIOMES.desert.water).toBeUndefined();
  expect(BIOMES.tundra.water).toBeUndefined();
  expect(fingerprint("desert")).toBe("cd50eb10e4e9a235");
  expect(fingerprint("tundra")).toBe("a52382432fd3e1de");
});

test("woodland generates lakes ringed by shallows on most maps", () => {
  let withLake = 0;
  for (let i = 0; i < 30; i++) {
    const g = generateGrid(`lake-${i}`, "woodland");
    const flat = g.terrain.flat();
    if (flat.includes("lake")) {
      withLake++;
      expect(flat).toContain("shallows");
    }
    expect(flat).not.toContain("sea"); // woodland's body is lake
  }
  expect(withLake).toBeGreaterThanOrEqual(25);
});

test("no POI and no entry ever sits on lake or sea", () => {
  for (let i = 0; i < 30; i++) {
    const g = generateGrid(`lake-${i}`, "woodland");
    for (const p of [...g.pois, g.entry]) {
      expect(["lake", "sea"]).not.toContain(g.terrain[p.y]![p.x]!);
    }
  }
});

test("all land (on-foot walkable) tiles stay one 8-connected component around lakes", () => {
  for (let i = 0; i < 30; i++) {
    const g = generateGrid(`lake-${i}`, "woodland");
    const walk = (x: number, y: number) => Number.isFinite(moveCost(g.terrain[y]![x]!, null));
    const seen = new Set<string>();
    const stack = [g.entry];
    seen.add(`${g.entry.x},${g.entry.y}`);
    while (stack.length) {
      const c = stack.pop()!;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = c.x + dx, y = c.y + dy, k = `${x},${y}`;
        if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT || seen.has(k) || !walk(x, y)) continue;
        seen.add(k);
        stack.push({ x, y });
      }
    }
    let land = 0;
    for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) if (walk(x, y)) land++;
    expect(seen.size).toBe(land);
  }
});

test("movement: shallows wade, lake needs a raft, sea resists even a raft", () => {
  expect(moveCost("shallows", null)).toBe(25);
  expect(moveCost("shallows", null, ["waders"])).toBe(15);
  expect(moveCost("shallows", null, ["raft"])).toBe(10);
  expect(moveCost("lake", null)).toBe(Infinity);
  expect(moveCost("lake", null, ["raft"])).toBe(15);
  expect(moveCost("sea", null)).toBe(Infinity);
  expect(moveCost("sea", null, ["raft"])).toBe(Infinity);
});
