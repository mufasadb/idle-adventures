import { test, expect } from "bun:test";
import { pickReturnFlavor, returnFlavorBucket } from "../src/engine/flavor";
import {
  RETURN_FLAVOR,
  RETURN_FRESH_FRACTION,
  MAP_TIER_MAX,
} from "../src/data/constants";
import type { ItemStack } from "../src/engine/types";

const noFood: ItemStack[] = [];
const cooked: ItemStack[] = [{ defId: "cooked-venison", qty: 2 }];
const raw: ItemStack[] = [{ defId: "berries", qty: 3 }, { defId: "ration", qty: 1 }];

// --- bucket selection (the decision that matters) ---

test("bucket: energy 0 → spent, scaled by map tier", () => {
  expect(returnFlavorBucket({ energy: 0, maxEnergy: 300, mapTier: 1, food: noFood })).toBe("spent-low");
  expect(returnFlavorBucket({ energy: 0, maxEnergy: 300, mapTier: 2, food: cooked })).toBe("spent-low");
  expect(returnFlavorBucket({ energy: 0, maxEnergy: 300, mapTier: 3, food: noFood })).toBe("spent-high");
  expect(returnFlavorBucket({ energy: 0, maxEnergy: 300, mapTier: 4, food: noFood })).toBe("spent-high");
  expect(returnFlavorBucket({ energy: 0, maxEnergy: 300, mapTier: MAP_TIER_MAX, food: noFood })).toBe("spent-epic");
});

test("bucket: spent dominates even with leftover cooked food", () => {
  expect(returnFlavorBucket({ energy: 0, maxEnergy: 300, mapTier: 5, food: cooked })).toBe("spent-epic");
});

test("bucket: 0 < energy ≤ half → weary", () => {
  const half = 300 * RETURN_FRESH_FRACTION;
  expect(returnFlavorBucket({ energy: 1, maxEnergy: 300, mapTier: 3, food: cooked })).toBe("weary");
  expect(returnFlavorBucket({ energy: half, maxEnergy: 300, mapTier: 3, food: cooked })).toBe("weary");
});

test("bucket: energy > half, leftover cooked food → beneath (snark)", () => {
  expect(returnFlavorBucket({ energy: 200, maxEnergy: 300, mapTier: 1, food: cooked })).toBe("beneath");
});

test("bucket: energy > half, only raw/ration food → bored", () => {
  expect(returnFlavorBucket({ energy: 200, maxEnergy: 300, mapTier: 1, food: raw })).toBe("bored");
  expect(returnFlavorBucket({ energy: 200, maxEnergy: 300, mapTier: 1, food: noFood })).toBe("bored");
});

// --- variant pick (deterministic, in-pool) ---

test("pick: returns a line from the selected bucket's pool", () => {
  const line = pickReturnFlavor({
    energy: 0, maxEnergy: 300, mapTier: 1, food: noFood, seed: "abc", runs: 0,
  });
  expect(RETURN_FLAVOR["spent-low"]).toContain(line);
});

test("pick: deterministic for the same inputs, varies with runs", () => {
  const args = { energy: 200, maxEnergy: 300, mapTier: 1, food: cooked, seed: "map-7" };
  const a = pickReturnFlavor({ ...args, runs: 0 });
  const b = pickReturnFlavor({ ...args, runs: 0 });
  expect(a).toBe(b);
  // over several runs we should land on more than one variant (pool has 3)
  const seen = new Set(
    [0, 1, 2, 3, 4, 5].map((r) => pickReturnFlavor({ ...args, runs: r })),
  );
  expect(seen.size).toBeGreaterThan(1);
});

test("copy: no em dashes in any flavor line", () => {
  for (const pool of Object.values(RETURN_FLAVOR)) {
    for (const line of pool) expect(line).not.toContain("—");
  }
});
