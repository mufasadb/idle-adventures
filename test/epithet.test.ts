import { test, expect } from "bun:test";
import { mapEpithet, epithetForGrid } from "../src/engine/town";
import type { Grid, Poi } from "../src/engine/grid";
import { EPITHETS, BIOME_IDS, CANDIDATE_MAP_COUNT } from "../src/data/constants";

// Minimal synthetic grid — epithetForGrid only reads pois, so terrain/entry are dummy.
function mkGrid(pois: Partial<Poi>[]): Grid {
  return {
    biomeId: "woodland",
    terrain: [[]],
    entry: { x: 0, y: 0 },
    pois: pois.map((p, i) => ({
      x: i, y: 0, kind: p.kind ?? "wood", material: p.material ?? null, creature: p.creature ?? null,
      ...(p.magnitude ? { magnitude: p.magnitude } : {}),
    })),
  };
}

test("epithetForGrid: a plain map matches nothing", () => {
  const g = mkGrid([
    ...Array.from({ length: 4 }, () => ({ kind: "wood" as const, material: "oak-log" })),
    ...Array.from({ length: 3 }, () => ({ kind: "herb" as const, material: "berries" })),
    ...Array.from({ length: 3 }, () => ({ kind: "animal" as const, material: "deer-hide" })),
  ]);
  expect(epithetForGrid(g)).toBeNull();
});

test("epithetForGrid: a tier-3+ creature earns 'the ancients'", () => {
  const g = mkGrid([
    { kind: "wood", material: "oak-log" },
    { kind: "monster", creature: "ancient-wyrm" }, // tier 4
  ]);
  expect(epithetForGrid(g)).toBe("the ancients");
});

test("epithetForGrid: a tier-2 creature is NOT notable", () => {
  const g = mkGrid([
    { kind: "monster", creature: "werewolf" }, // tier 2
    ...Array.from({ length: 9 }, () => ({ kind: "wood" as const, material: "oak-log" })),
  ]);
  expect(epithetForGrid(g)).toBeNull();
});

test("epithetForGrid: a coal seam earns 'carbon'", () => {
  const g = mkGrid(Array.from({ length: 4 }, () => ({ kind: "mining" as const, material: "coal" })));
  expect(epithetForGrid(g)).toBe("carbon");
});

test("epithetForGrid: below the coal threshold stays plain", () => {
  const g = mkGrid(Array.from({ length: 2 }, () => ({ kind: "mining" as const, material: "coal" })));
  expect(epithetForGrid(g)).toBeNull();
});

test("epithetForGrid: priority — a boss outranks a coal seam (array order wins)", () => {
  const g = mkGrid([
    ...Array.from({ length: 5 }, () => ({ kind: "mining" as const, material: "coal" })),
    { kind: "monster", creature: "ice-troll" }, // tier 3
  ]);
  expect(epithetForGrid(g)).toBe("the ancients");
});

test("EPITHETS: labels never leak numbers — qualitative flavour only", () => {
  for (const e of EPITHETS) expect(e.label).toMatch(/^[a-z][a-z ]*$/);
});

test("mapEpithet: pure — same inputs give the same output", () => {
  for (const b of BIOME_IDS) {
    const seed = `epi:${b}:7`;
    expect(mapEpithet(seed, b, 1)).toBe(mapEpithet(seed, b, 1));
  }
});

test("mapEpithet: never leaks a number, whatever it returns", () => {
  for (const b of BIOME_IDS) {
    for (let i = 0; i < 12; i++) {
      const out = mapEpithet(`sweep:${b}:${i}`, b, 1);
      if (out !== null) expect(out).not.toMatch(/[0-9]/);
    }
  }
}, 20000);

test("mapEpithet: high-tier tundra maps surface a boss epithet", () => {
  // tundra tier 3 injects ice-troll + ancient-wyrm; across a sweep some maps lair one.
  let named = 0;
  for (let i = 0; i < 40; i++) if (mapEpithet(`boss:${i}`, "tundra", 3) === "the ancients") named++;
  expect(named).toBeGreaterThan(0);
}, 20000);

test("mapEpithet: typical T1 offers stay plain — under 40% named across a sweep", () => {
  let total = 0, named = 0;
  for (let run = 0; run < 24; run++) {
    for (let i = 0; i < CANDIDATE_MAP_COUNT; i++) {
      const seed = `game:map:${run}:${i}`;
      const b = BIOME_IDS[(run * CANDIDATE_MAP_COUNT + i) % BIOME_IDS.length]!;
      total++;
      if (mapEpithet(seed, b, 1) !== null) named++;
    }
  }
  expect(named / total).toBeLessThan(0.4);
}, 20000);
