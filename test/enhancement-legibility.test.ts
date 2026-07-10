import { test, expect } from "bun:test";
import { enhancementHint, describe as describeItem } from "../src/render/render";
import { WEAPON_ENHANCEMENT, ENHANCEMENT, AFFINITY_MULTIPLIER } from "../src/data/constants";

// 7ao: whetstone + the three oils were buildable but had zero in-game hint of their
// combat function (unlike weapons). enhancementHint reads WEAPON_ENHANCEMENT — no
// magic numbers — so each one states its effect on the tooltip + console.

test("enhancementHint: whetstone states its flat damage + charges", () => {
  const s = enhancementHint("whetstone")!;
  expect(s).toContain(String(WEAPON_ENHANCEMENT.whetstone!.flatDamage)); // 2
  expect(s).toContain(String(WEAPON_ENHANCEMENT.whetstone!.charges)); // 6
  expect(s).toMatch(/damage/i);
});

test("enhancementHint: an affinity oil states its ×multiplier + tag", () => {
  const s = enhancementHint("drake-oil")!;
  expect(s).toContain(String(AFFINITY_MULTIPLIER)); // ×2 — from the lever, not hardcoded
  expect(s).toContain("dragon"); // the affinityTag
  expect(s).toContain(String(WEAPON_ENHANCEMENT["drake-oil"]!.charges)); // 5
});

test("enhancementHint: venom-oil states its poison DoT", () => {
  const s = enhancementHint("venom-oil")!;
  const p = WEAPON_ENHANCEMENT["venom-oil"]!.poison!;
  expect(s).toMatch(/poison/i);
  expect(s).toContain(String(p.dmg)); // 3
  expect(s).toContain(String(p.rounds)); // 4
});

test("enhancementHint: every ENHANCEMENT has a non-empty hint; non-enhancement is null", () => {
  for (const id of ENHANCEMENT) expect((enhancementHint(id) ?? "").length).toBeGreaterThan(0);
  expect(enhancementHint("sword")).toBeNull();
  expect(enhancementHint("iron-ore")).toBeNull();
});

test("describe: an enhancement item surfaces its combat effect", () => {
  const s = describeItem("silver-oil");
  expect(s).toContain("werewolf");
  expect(s).toContain(String(AFFINITY_MULTIPLIER));
});
