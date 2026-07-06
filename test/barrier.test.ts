import { test, expect } from "bun:test";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { moveCost } from "../src/engine/move";
import { MAP_WIDTH, MAP_HEIGHT, BARRIER_THRESHOLD, BARRIER_NOISE_FREQUENCY, NOISE_FREQUENCY } from "../src/data/constants";
import type { Terrain } from "../src/data/constants";

const walkable = (t: Terrain) => Number.isFinite(moveCost(t, null, []));

// Flood-fill walkable tiles from `from`; returns how many it reached (8-dir,
// mirroring movement adjacency).
function flood(terrain: Terrain[][], from: { x: number; y: number }): number {
  const seen = new Set<string>([`${from.x},${from.y}`]);
  const stack = [from];
  let n = 1;
  while (stack.length) {
    const c = stack.pop()!;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = c.x + dx, ny = c.y + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_WIDTH || ny >= MAP_HEIGHT) continue;
      const k = `${nx},${ny}`;
      if (seen.has(k) || !walkable(terrain[ny]![nx]!)) continue;
      seen.add(k); n++; stack.push({ x: nx, y: ny });
    }
  }
  return n;
}

test("levers: barrier layer is chunkier than base terrain", () => {
  expect(BARRIER_NOISE_FREQUENCY).toBeLessThan(NOISE_FREQUENCY);
  expect(BARRIER_THRESHOLD).toBeGreaterThan(0.5);
});

test("connectivity: every walkable tile is one component (30 seeds)", () => {
  for (let i = 0; i < 30; i++) {
    const seed = `conn-${i}`;
    const grid = generateGrid(seed, rollBiome(seed));
    let total = 0;
    let start: { x: number; y: number } | null = null;
    for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) {
      if (!walkable(grid.terrain[y]![x]!)) continue;
      total++;
      if (!start) start = { x, y };
    }
    expect(start).not.toBeNull();
    expect(flood(grid.terrain, start!)).toBe(total);
  }
});

test("barriers exist: most seeds carry a real wall mass", () => {
  let walled = 0;
  for (let i = 0; i < 30; i++) {
    const seed = `wall-${i}`;
    const grid = generateGrid(seed, rollBiome(seed));
    let walls = 0;
    for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) {
      if (!walkable(grid.terrain[y]![x]!)) walls++;
    }
    if (walls >= 60) walled++; // ≥5% of 1200 tiles is wall
  }
  expect(walled).toBeGreaterThanOrEqual(15); // "sometimes maze, often decisions, sometimes open" — at least half the seeds have real walls
});
