import { test, expect } from "bun:test";
import { lineTiles } from "../src/engine/line";

// eot.1: lineTiles is the naive direct-line stepper for player-planned routing —
// a Bresenham dominant-axis walk, START-EXCLUSIVE and END-INCLUSIVE, one grid step
// per tile (each consecutive pair an 8-neighbour, so every step is a legal
// orthogonal or diagonal `move`). No pathfinding: the geometry is whatever the
// straight line gives.

const key = (p: { x: number; y: number }) => `${p.x},${p.y}`;
const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

test("lineTiles: zero-length (a === b) is empty", () => {
  expect(lineTiles({ x: 3, y: 3 }, { x: 3, y: 3 })).toEqual([]);
});

test("lineTiles: is start-exclusive and end-inclusive", () => {
  const tiles = lineTiles({ x: 0, y: 0 }, { x: 3, y: 0 });
  expect(tiles.map(key)).not.toContain("0,0"); // start excluded
  expect(tiles[tiles.length - 1]).toEqual({ x: 3, y: 0 }); // end included
});

test("lineTiles: axis-aligned is the straight run", () => {
  expect(lineTiles({ x: 0, y: 0 }, { x: 3, y: 0 })).toEqual([
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 3, y: 0 },
  ]);
});

test("lineTiles: pure diagonal is all diagonal steps", () => {
  expect(lineTiles({ x: 0, y: 0 }, { x: 3, y: 3 })).toEqual([
    { x: 1, y: 1 },
    { x: 2, y: 2 },
    { x: 3, y: 3 },
  ]);
});

test("lineTiles: shallow slope mixes orthogonal + diagonal steps", () => {
  expect(lineTiles({ x: 0, y: 0 }, { x: 4, y: 2 })).toEqual([
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    { x: 3, y: 2 },
    { x: 4, y: 2 },
  ]);
});

test("lineTiles: handles negative directions", () => {
  const tiles = lineTiles({ x: 5, y: 5 }, { x: 3, y: 4 });
  expect(tiles[tiles.length - 1]).toEqual({ x: 3, y: 4 });
  expect(tiles).toEqual([
    { x: 4, y: 4 },
    { x: 3, y: 4 },
  ]);
});

test("lineTiles: length equals Chebyshev distance (one step per tile)", () => {
  const cases: [{ x: number; y: number }, { x: number; y: number }][] = [
    [{ x: 0, y: 0 }, { x: 7, y: 3 }],
    [{ x: 2, y: 9 }, { x: 2, y: 0 }],
    [{ x: 10, y: 4 }, { x: 1, y: 11 }],
    [{ x: 6, y: 6 }, { x: 0, y: 0 }],
  ];
  for (const [a, b] of cases) {
    expect(lineTiles(a, b).length).toBe(cheb(a, b));
  }
});

test("lineTiles: every consecutive pair is an 8-neighbour (connected path)", () => {
  const cases: [{ x: number; y: number }, { x: number; y: number }][] = [
    [{ x: 0, y: 0 }, { x: 7, y: 3 }],
    [{ x: 12, y: 1 }, { x: 0, y: 9 }],
    [{ x: 3, y: 8 }, { x: 9, y: 2 }],
  ];
  for (const [a, b] of cases) {
    const path = [a, ...lineTiles(a, b)];
    for (let i = 1; i < path.length; i++) {
      expect(cheb(path[i - 1]!, path[i]!)).toBe(1); // exactly one grid step apart
    }
  }
});
