import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { slotOf } from "../src/engine/catalog";
import { WEAPON_ENHANCEMENT, ENHANCEMENT } from "../src/data/constants";
import type { GameState, GameEvent, Loadout } from "../src/engine/types";

// --- constants invariants (§8) ----------------------------------------------

test("constants: ENHANCEMENT ⇔ WEAPON_ENHANCEMENT are the same set, and slotOf → enhancement (D60)", () => {
  for (const id of ENHANCEMENT) {
    expect(WEAPON_ENHANCEMENT[id]).toBeDefined(); // every catalog defId has a table entry
    expect(slotOf(id)).toBe("enhancement");
  }
  for (const id of Object.keys(WEAPON_ENHANCEMENT)) {
    expect(ENHANCEMENT.includes(id)).toBe(true); // …and vice-versa
  }
});

// --- the enhance action (§8) ------------------------------------------------

function expeditionWith(mutate?: (l: Loadout) => void, combat?: GameState["expedition"] extends infer E ? (E extends { combat?: infer C } ? C : never) : never): GameState {
  const loadout = emptyLoadout();
  loadout.equipment.weapon = "sword";
  loadout.enhancements = [{ defId: "whetstone", qty: 2 }, { defId: "venom-oil", qty: 1 }];
  mutate?.(loadout);
  return {
    seed: "g",
    phase: "expedition",
    bank: [],
    loadout: emptyLoadout(),
    expedition: {
      mapSeed: "m",
      pos: { x: 1, y: 1 },
      energy: 100,
      hp: 30,
      loadout,
      carry: [],
      cleared: [],
      ...(combat ? { combat } : {}),
    },
  };
}

test("enhance: applies a coating, sets weaponBuff at full charges, decrements the stack, emits enhanced (D60)", () => {
  const before = expeditionWith();
  const { state, events } = reduce(before, { type: "enhance", id: "whetstone" });
  expect(state.expedition!.weaponBuff).toEqual({ id: "whetstone", charges: WEAPON_ENHANCEMENT.whetstone!.charges });
  // one unit consumed off the whetstone stack
  const stack = state.expedition!.loadout.enhancements!.find((s) => s.defId === "whetstone");
  expect(stack!.qty).toBe(1);
  const ev = events.find((e) => e.type === "enhanced") as Extract<GameEvent, { type: "enhanced" }>;
  expect(ev).toEqual({ type: "enhanced", id: "whetstone", charges: WEAPON_ENHANCEMENT.whetstone!.charges });
});

test("enhance: applying over an existing buff REPLACES it — old charges discarded (D60)", () => {
  const before = expeditionWith();
  const one = reduce(before, { type: "enhance", id: "whetstone" }).state;
  // spend nothing, just re-apply venom-oil over the whetstone
  const two = reduce(one, { type: "enhance", id: "venom-oil" }).state;
  expect(two.expedition!.weaponBuff).toEqual({ id: "venom-oil", charges: WEAPON_ENHANCEMENT["venom-oil"]!.charges });
  // whetstone stack unchanged from the first apply (still 1), venom-oil now gone
  expect(two.expedition!.loadout.enhancements!.find((s) => s.defId === "whetstone")!.qty).toBe(1);
  expect(two.expedition!.loadout.enhancements!.find((s) => s.defId === "venom-oil")).toBeUndefined();
});

test("enhance: works while ENGAGED, runs no exchange, spends no energy (D60)", () => {
  const before = expeditionWith(undefined, {
    at: { x: 1, y: 1 }, creature: "forest-boar", monsterHp: 8, moveOnWin: false,
    damageAdd: 0, mitigationAdd: 0, startHp: 30, potionsUsed: 0,
  });
  const { state } = reduce(before, { type: "enhance", id: "whetstone" });
  expect(state.expedition!.weaponBuff).toEqual({ id: "whetstone", charges: WEAPON_ENHANCEMENT.whetstone!.charges });
  expect(state.expedition!.combat!.monsterHp).toBe(8); // no exchange ran
  expect(state.expedition!.energy).toBe(100); // no energy spent
});

test("enhance: rejects wrong-slot / insufficient / not-on-expedition (D60)", () => {
  const before = expeditionWith();
  const wrong = reduce(before, { type: "enhance", id: "sword" }); // not an enhancement
  expect(wrong.events.some((e) => e.type === "action-rejected" && e.reason === "wrong-slot")).toBe(true);
  expect(wrong.state).toBe(before); // original state returned

  const noHold = reduce(before, { type: "enhance", id: "silver-oil" }); // not carried
  expect(noHold.events.some((e) => e.type === "action-rejected" && e.reason === "insufficient")).toBe(true);

  const town: GameState = { seed: "g", phase: "town", bank: [], loadout: emptyLoadout(), expedition: null };
  const notOn = reduce(town, { type: "enhance", id: "whetstone" });
  expect(notOn.events.some((e) => e.type === "action-rejected" && e.reason === "not-on-expedition")).toBe(true);
});
