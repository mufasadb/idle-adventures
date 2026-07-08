import { test, expect } from "bun:test";
import { simHarvest, harvestFractionReport } from "../src/sim/harvest";
import { candidateMaps } from "../src/engine/town";

const seeds = (n: number) => Array.from({ length: n }, (_, i) => candidateMaps("hf", i)[0]!.mapSeed);

test("simHarvest returns a fraction in [0,1] with a positive POI total", () => {
  const r = simHarvest({ tools: ["pick", "knife"], food: [{ defId: "ration", qty: 2 }] }, seeds(1)[0]!, 1);
  expect(r.total).toBeGreaterThan(0);
  expect(r.fraction).toBeGreaterThanOrEqual(0);
  expect(r.fraction).toBeLessThanOrEqual(1);
});

test("harvestFractionReport averages across seeds", () => {
  const rep = harvestFractionReport({ tools: ["pick", "knife"], food: [{ defId: "ration", qty: 3 }] }, 3, seeds(5));
  expect(rep.rows.length).toBe(5);
  expect(rep.avg).toBeGreaterThanOrEqual(0);
  expect(rep.avg).toBeLessThanOrEqual(1);
});
