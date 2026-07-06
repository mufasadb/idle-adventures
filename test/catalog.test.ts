import { test, expect } from "bun:test";
import { slotOf, validForSlot } from "../src/engine/catalog";

test("slotOf: classifies each catalog family to its loadout slot", () => {
  expect(slotOf("sword")).toBe("weapon");
  expect(slotOf("plate-helmet")).toBe("helmet");
  expect(slotOf("robe-hood")).toBe("helmet");
  expect(slotOf("plate-chest")).toBe("chest");
  expect(slotOf("iron-pick")).toBe("tool");
  expect(slotOf("spyglass")).toBe("tool");
  expect(slotOf("horse")).toBe("transport");
  expect(slotOf("leather")).toBe("backpack");
  expect(slotOf("ration")).toBe("food");
  expect(slotOf("potion")).toBe("potion");
  expect(slotOf("iron-ore")).toBeNull(); // raw material, not equippable
});

test("slotOf: gating tools classify as tools", () => {
  expect(slotOf("climbing-pick")).toBe("tool");
  expect(slotOf("raft")).toBe("tool");
});

test("slotOf: graded-movement gear classifies as tools", () => {
  expect(slotOf("waders")).toBe("tool");
  expect(slotOf("ice-cleats")).toBe("tool");
});

test("validForSlot: only accepts a defId in its own slot", () => {
  expect(validForSlot("helmet", "plate-helmet")).toBe(true);
  expect(validForSlot("chest", "plate-helmet")).toBe(false);
  expect(validForSlot("tool", "spyglass")).toBe(true);
  expect(validForSlot("weapon", "iron-ore")).toBe(false);
});

// --- Monster categories (8ec) ---
import { MONSTERS, BIOMES, LOOT_TABLE } from "../src/data/constants";

test("every monster has a category", () => {
  for (const m of Object.values(MONSTERS)) {
    expect(["beast", "humanoid", "fae", "undead", "giant", "dragon"]).toContain(m.category);
  }
});

test("each biome spawns a humanoid — map-hunting is viable anywhere", () => {
  for (const biome of Object.values(BIOMES)) {
    const hasHumanoid = Object.keys(biome.creatureTable).some((c) => MONSTERS[c]?.category === "humanoid");
    expect(hasHumanoid).toBe(true);
  }
});

test("new humanoids have loot and ordinary tiers", () => {
  expect(MONSTERS["forest-bandit"]).toMatchObject({ tier: 1, category: "humanoid" });
  expect(MONSTERS["snow-marauder"]).toMatchObject({ tier: 2, category: "humanoid" });
  expect(LOOT_TABLE["forest-bandit"]).toEqual([{ defId: "raider-supplies", qty: 1 }]);
  expect(LOOT_TABLE["snow-marauder"]).toEqual([{ defId: "raider-supplies", qty: 1 }]);
});
