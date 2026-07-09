import { test, expect } from "bun:test";
import { describe as describeItem } from "../src/render/render";
import { WEAPONS, ARMOUR, FOOD_ENERGY, ENERGY_PER_FOOD, POTION_HEAL_BY, COMBAT_BUFF, INKS } from "../src/data/constants";

test("describe: a weapon states its damage, class, and the class hint", () => {
  const s = describeItem("sword");
  expect(s).toContain(String(WEAPONS["sword"]!.damage));
  expect(s).toContain("melee");
});

test("describe: armour states defense, type, and slot", () => {
  const s = describeItem("plate-chest");
  const a = ARMOUR["plate-chest"]!;
  expect(s).toContain(String(a.defense));
  expect(s).toContain("plate");
  expect(s).toContain("chest");
});

test("describe: food states energy per unit (lever value, not hardcoded)", () => {
  expect(describeItem("ration")).toContain(String(FOOD_ENERGY["ration"] ?? ENERGY_PER_FOOD));
});

test("describe: a potion states its heal", () => {
  expect(describeItem("greater-potion")).toContain(String(POTION_HEAL_BY["greater-potion"]));
});

test("describe: a battle item states its buff", () => {
  const s = describeItem("elixir-of-power");
  expect(s).toContain(String(COMBAT_BUFF["elixir-of-power"]!.damageAdd));
});

test("describe: a tool names its capability + tier", () => {
  const s = describeItem("iron-pick");
  expect(s).toContain("pick");
});

test("describe: the canteen states its energy-capacity bonus", () => {
  expect(describeItem("canteen")).toMatch(/energy/i);
});

test("describe: a backpack states its carry slots", () => {
  expect(describeItem("leather")).toMatch(/slot/i);
});

test("describe: an ink stays VAGUE — no material spoiler (cxq legibility rule)", () => {
  const s = describeItem(Object.keys(INKS)[0]!);
  expect(s).toMatch(/ink/i);
  expect(s.toLowerCase()).not.toContain("coal");
  expect(s.toLowerCase()).not.toContain("mithril");
});

test("describe: an unclassified material still returns a non-empty string", () => {
  expect(describeItem("iron-ore").length).toBeGreaterThan(0);
});
