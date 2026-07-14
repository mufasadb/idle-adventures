import { test, expect } from "bun:test";
import { WEAPONS } from "../src/data/combat";
import { STARTER_BANK, BIOMES, RECIPE } from "../src/data/constants";
import { reduce } from "../src/engine/reduce";
import { newGame } from "../src/engine/town";
import { emptyLoadout } from "../src/engine/loadout";
import type { GameState, Action } from "../src/engine/types";

// Stone-age bootstrap (xls/9az, 2026-07-14): a fresh game hands you NO tools or
// weapon — you knap the whole starter kit (club/knife/axe/pick) your first run
// from the two bare-hands forageables, flint + deadwood. These tests pin that the
// kit is really craftable end-to-end (no phantom inputs, the 7pi lesson) and that
// the starter bank actually dropped the pre-made gear.

function craft(bank: { defId: string; qty: number }[], recipeId: string) {
  const s: GameState = { seed: "b", phase: "town", bank, loadout: emptyLoadout(), expedition: null, runs: 0 };
  return reduce(s, { type: "craft", recipeId } as Action);
}
const output = (r: { state: GameState }, defId: string) => r.state.bank.find((x) => x.defId === defId)?.qty;

test("a fresh game starts with NO tools or weapon — food only", () => {
  const g = newGame("b");
  const has = (d: string) => g.bank.some((x) => x.defId === d && x.qty > 0);
  for (const item of ["pick", "axe", "knife", "sword", "club"]) expect(has(item)).toBe(false);
  expect(has("ration")).toBe(true); // food only — enough energy to embark and forage the first kit
  expect(STARTER_BANK.every((s) => s.defId === "ration" || s.defId === "potion")).toBe(true);
});

test("club is the tier-0 entry weapon: dmg 2, between unarmed (1) and sword (3)", () => {
  expect(WEAPONS.club).toEqual({ dmgType: "melee", damage: 2, tags: [] });
  expect(WEAPONS.club!.damage).toBeLessThan(WEAPONS.sword!.damage);
});

test("deadwood is a real bare-hands forage material — sourced in every biome's herb table", () => {
  for (const b of ["woodland", "desert", "tundra"] as const) {
    expect(BIOMES[b].materialTable.herb?.deadwood ?? 0).toBeGreaterThan(0);
  }
});

test("the whole starter kit knaps from bare-hands mats (flint + deadwood), end to end", () => {
  expect(output(craft([{ defId: "flint", qty: 1 }], "knife"), "knife")).toBe(1);
  expect(output(craft([{ defId: "flint", qty: 1 }, { defId: "deadwood", qty: 1 }], "axe"), "axe")).toBe(1);
  expect(output(craft([{ defId: "flint", qty: 1 }, { defId: "deadwood", qty: 1 }], "pick"), "pick")).toBe(1);
  expect(output(craft([{ defId: "deadwood", qty: 2 }], "club"), "club")).toBe(1);
});

test("every stone-age recipe input is a sourced material (no phantom input, cf. 7pi)", () => {
  const herb = BIOMES.woodland.materialTable.herb!; // flint + deadwood both forage here, bare hands
  for (const recipeId of ["club", "knife", "axe", "pick"]) {
    for (const inp of RECIPE[recipeId]!.inputs) {
      expect(herb[inp.defId] ?? 0).toBeGreaterThan(0); // input is a bare-hands forage, so the kit self-bootstraps
    }
    expect(RECIPE[recipeId]!.requires).toBeUndefined(); // no tool/station gate — craftable bare-handed
  }
});

test("plain sword stays obtainable (9az): given a recipe so it isn't orphaned when it left STARTER_BANK", () => {
  expect(output(craft([{ defId: "iron-ore", qty: 2 }], "sword"), "sword")).toBe(1);
  // sword vs iron-sword differentiated by COST, not damage: sword is the cheap
  // generic (iron-ore x2, no affinity); iron-sword pays +1 ore for the fae tag.
  expect(RECIPE.sword!.inputs).toEqual([{ defId: "iron-ore", qty: 2 }]);
  expect(RECIPE["iron-sword"]!.inputs).toEqual([{ defId: "iron-ore", qty: 3 }]);
  expect(WEAPONS.sword!.tags).toEqual([]);
  expect(WEAPONS["iron-sword"]!.tags).toContain("iron");
  expect(WEAPONS.sword!.damage).toBe(WEAPONS["iron-sword"]!.damage); // same dmg — the edge is the affinity
});
