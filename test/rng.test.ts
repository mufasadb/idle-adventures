import { test, expect } from "bun:test";
import { hashString, rand, weightedPick } from "../src/engine/rng";

test("rand: deterministic for identical seed+context", () => {
  expect(rand("seed-1", "poi-x", 3)).toBe(rand("seed-1", "poi-x", 3));
});

test("rand: different context gives different values", () => {
  const values = new Set(
    Array.from({ length: 100 }, (_, i) => rand("seed-1", "poi-x", i)),
  );
  expect(values.size).toBeGreaterThan(95); // no meaningful collisions
});

test("rand: different seeds decorrelate", () => {
  expect(rand("seed-1", "biome")).not.toBe(rand("seed-2", "biome"));
});

test("rand: stays in [0, 1)", () => {
  for (let i = 0; i < 1000; i++) {
    const v = rand("range-check", i);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  }
});

test("hashString: 32-bit unsigned and stable", () => {
  const h = hashString("abc");
  expect(h).toBe(hashString("abc"));
  expect(h).toBeGreaterThanOrEqual(0);
  expect(h).toBeLessThanOrEqual(0xffffffff);
  expect(Number.isInteger(h)).toBe(true);
});

test("weightedPick: bands follow cumulative weights in the given order", () => {
  const order = ["a", "b", "c"] as const;
  const weights = { a: 0.5, b: 0.25, c: 0.25 };
  expect(weightedPick(weights, order, 0.0)).toBe("a");
  expect(weightedPick(weights, order, 0.49)).toBe("a");
  expect(weightedPick(weights, order, 0.5)).toBe("b");
  expect(weightedPick(weights, order, 0.74)).toBe("b");
  expect(weightedPick(weights, order, 0.75)).toBe("c");
  expect(weightedPick(weights, order, 0.999)).toBe("c");
});

test("weightedPick: skips zero/absent weights and normalizes the rest", () => {
  const order = ["a", "b", "c"] as const;
  expect(weightedPick({ b: 2 }, order, 0.99)).toBe("b");
  expect(weightedPick({ a: 1, c: 3 }, order, 0.1)).toBe("a"); // a band = [0, 0.25)
  expect(weightedPick({ a: 1, c: 3 }, order, 0.3)).toBe("c");
});

test("weightedPick: throws when all weights are zero", () => {
  expect(() => weightedPick({}, ["a", "b"] as const, 0.5)).toThrow();
});
