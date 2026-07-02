import { test, expect } from "bun:test";
import { perlin2 } from "../src/engine/noise";

test("perlin2: deterministic for identical inputs", () => {
  expect(perlin2("s1", 3.7, 8.2)).toBe(perlin2("s1", 3.7, 8.2));
});

test("perlin2: different seeds give different fields", () => {
  expect(perlin2("s1", 3.7, 8.2)).not.toBe(perlin2("s2", 3.7, 8.2));
});

test("perlin2: output stays in [0, 1]", () => {
  for (let i = 0; i < 500; i++) {
    const v = perlin2("range", i * 0.173, i * 0.311);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  }
});

test("perlin2: spatially smooth — close samples differ less than far samples", () => {
  // Average |delta| over many probe points: a 0.05 step should move the
  // field far less than the field's overall spread does.
  let nearDelta = 0;
  let spread = 0;
  const probes = 200;
  for (let i = 0; i < probes; i++) {
    const x = 0.31 * i;
    const y = 0.17 * i;
    const v = perlin2("smooth", x, y);
    nearDelta += Math.abs(perlin2("smooth", x + 0.05, y) - v);
    spread += Math.abs(v - 0.5);
  }
  expect(nearDelta / probes).toBeLessThan((spread / probes) * 0.5);
});

test("perlin2: varies across the field (not constant)", () => {
  const values = new Set(
    Array.from({ length: 50 }, (_, i) => perlin2("vary", i * 0.37 + 0.5, i * 0.53 + 0.5)),
  );
  expect(values.size).toBeGreaterThan(40);
});
