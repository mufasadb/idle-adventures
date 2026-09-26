import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { localMap } from "../src/engine/town";
import { emptyLoadout } from "../src/engine/loadout";
import { MAX_ENERGY, ENERGY_CAP_BONUS } from "../src/data/constants";
import { energyCapOf } from "../src/engine/carry";
import type { GameState, Action, ItemStack } from "../src/engine/types";
import { town as baseTown } from "./helpers";

const town = (bank: ItemStack[]): GameState => baseTown(bank, undefined, { seed: "cap", runs: 0 });

test("energyCapOf sums ENERGY_CAP_BONUS over equipped tools", () => {
  const eq = { ...emptyLoadout().equipment, tools: ["canteen"] };
  expect(energyCapOf(eq)).toBe(ENERGY_CAP_BONUS.canteen);
  expect(energyCapOf(emptyLoadout().equipment)).toBe(0);
});

test("embark with a canteen raises maxEnergy and starts full", () => {
  const seed = localMap("cap", 0).mapSeed;
  let s = town([{ defId: "canteen", qty: 1 }]);
  s = reduce(s, { type: "pack", slot: "tool", itemId: "canteen" } as Action).state;
  s = reduce(s, { type: "embark", mapSeed: seed } as Action).state;
  expect(s.expedition!.maxEnergy).toBe(MAX_ENERGY + ENERGY_CAP_BONUS.canteen);
  expect(s.expedition!.energy).toBe(MAX_ENERGY + ENERGY_CAP_BONUS.canteen);
});

test("embark with no capacity gear is unchanged at MAX_ENERGY", () => {
  const seed = localMap("cap", 0).mapSeed;
  let s = town([]);
  s = reduce(s, { type: "embark", mapSeed: seed } as Action).state;
  expect(s.expedition!.maxEnergy).toBe(MAX_ENERGY);
  expect(s.expedition!.energy).toBe(MAX_ENERGY);
});
