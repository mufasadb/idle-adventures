import { test, expect } from "bun:test";
import { describe as describeItem, logisticsEffect } from "../src/render/render";
import { TRANSPORT_MULTIPLIER, TERRAIN_GATE, TERRAIN_COST, ENERGY_CAP_BONUS, TRANSPORT_CARRY } from "../src/data/constants";

// wzk: the range-extenders read as inert names in blind play. describe() + the
// craft-book effect label must SURFACE the movement/range benefit, not just carry.

test("describe: a transport states its SPEED benefit, not only carry", () => {
  const s = describeItem("horse");
  // horse ×2 on plains (TRANSPORT_MULTIPLIER) — the range benefit must be named
  expect(s).toContain(String(TRANSPORT_MULTIPLIER["horse"]!.plains)); // "2"
  expect(s).toMatch(/plains/i);
  expect(s).toMatch(/carr/i); // still mentions carry
});

test("describe: terrain gear states the actual terrain discount", () => {
  const cleats = describeItem("ice-cleats");
  const base = TERRAIN_COST.ice; // 20
  const eased = base - TERRAIN_GATE.ice!["ice-cleats"]!.discount!; // 5
  expect(cleats).toContain(String(base));
  expect(cleats).toContain(String(eased));
  expect(cleats).toMatch(/ice/i);

  const raft = describeItem("raft");
  expect(raft).toMatch(/river/i);
  expect(raft).toContain(String(TERRAIN_COST.river - TERRAIN_GATE.river!.raft!.discount!)); // 10
});

test("describe: climbing-pick states it crosses the impassable barrier", () => {
  const s = describeItem("climbing-pick");
  expect(s).toMatch(/mountain/i);
  expect(s).toContain(String(TERRAIN_GATE.mountain!["climbing-pick"]!.enable!)); // 40
});

// --- logisticsEffect: the concise inline craft-book label ---

test("logisticsEffect: range/carry gear gets a concise label", () => {
  expect(logisticsEffect("canteen")).toContain(String(ENERGY_CAP_BONUS.canteen)); // +100 max energy
  expect(logisticsEffect("horse")).toMatch(/plains/i);
  expect(logisticsEffect("horse")).toContain(String(TRANSPORT_CARRY.horse));
  expect(logisticsEffect("ice-cleats")).toMatch(/ice/i);
  expect(logisticsEffect("tent")).toMatch(/food/i);
});

test("logisticsEffect: returns null for items whose value is already obvious", () => {
  expect(logisticsEffect("sword")).toBeNull(); // weapons carry weaponHint
  expect(logisticsEffect("iron-ore")).toBeNull(); // raw material
});
