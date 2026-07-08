import { test, expect } from "bun:test";
import { simHarvest, harvestFractionReport } from "../src/sim/harvest";
import { candidateMaps } from "../src/engine/town";
import { HARVEST_FRACTION_TIER_TARGET, HARVEST_FRACTION_BASE_TARGET } from "../src/data/constants";

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

const PROOF_TIER = 3;
const BAND = 0.1; // seed-noise tolerance around each calibrated target

test("calibrated harvest proof: tier food ≈2× base rations on a high-tier map", () => {
  const maps = seeds(5);
  // Tier-matched loadout: dense pemmican + capacity gear + full reach kit.
  const tierPack = { tools: ["pick", "knife", "canteen", "tent", "ice-cleats", "climbing-pick"], backpack: "large-pack", transport: "horse", food: [{ defId: "pemmican", qty: 6 }] };
  // Base loadout: the SAME reach gear but CHEAP food (base rations only).
  const basePack = { tools: ["pick", "knife", "tent", "ice-cleats", "climbing-pick"], backpack: "large-pack", transport: "horse", food: [{ defId: "ration", qty: 6 }] };
  const tier = harvestFractionReport(tierPack, PROOF_TIER, maps).avg;
  const base = harvestFractionReport(basePack, PROOF_TIER, maps).avg;
  console.log(`[si7.2] tier=${(100 * tier).toFixed(0)}% base=${(100 * base).toFixed(0)}% ratio=${(tier / base).toFixed(2)} (targets ${100 * HARVEST_FRACTION_TIER_TARGET}/${100 * HARVEST_FRACTION_BASE_TARGET})`);
  // Loose absolute bands (calibration sanity), around the named targets:
  expect(tier).toBeGreaterThan(HARVEST_FRACTION_TIER_TARGET - BAND); // ≥ ~0.40
  expect(base).toBeLessThan(HARVEST_FRACTION_BASE_TARGET + BAND);    // ≤ ~0.35
  // THE HARD GATE — the design invariant: tier food is worth ~2× cheap food.
  expect(tier).toBeGreaterThan(base * 1.8);
}, 30000); // Dijkstra-per-step over 10 harvests — generous timeout (cf. reach tests)
