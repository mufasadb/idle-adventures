import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { MAX_ENERGY, TENT_FOOD_MULTIPLIER } from "../src/data/constants";
import type { GameState, Loadout } from "../src/engine/types";

// Stamina model (dtv): manual `eat` refills one unit toward max (even if slightly
// wasteful); `toggle-auto-eat` flips the waste-free auto-eat; move drains then
// auto-eats.

function onExpedition(opts: {
  energy?: number;
  autoEat?: boolean;
  food?: { defId: string; qty: number }[];
  tools?: string[];
} = {}): GameState {
  const loadout: Loadout = emptyLoadout();
  loadout.food = opts.food ?? [{ defId: "ration", qty: 3 }];
  loadout.equipment.tools = opts.tools ?? [];
  return {
    seed: "eat", phase: "expedition", bank: [], loadout: emptyLoadout(),
    expedition: {
      mapSeed: "eat", pos: { x: 0, y: 0 },
      energy: opts.energy ?? 100, maxEnergy: MAX_ENERGY, autoEat: opts.autoEat ?? true,
      hp: 30, loadout, carry: [], cleared: [],
    },
  };
}

test("eat: refills one food unit toward max and removes it", () => {
  const { state, events } = reduce(onExpedition({ energy: 100 }), { type: "eat" });
  expect(state.expedition!.energy).toBe(180); // 100 + 80
  expect(state.expedition!.loadout.food).toEqual([{ defId: "ration", qty: 2 }]);
  expect(events).toEqual([{ type: "ate", defId: "ration", restored: 80, energy: 180 }]);
});

test("eat: clamps to max (manual eat may waste)", () => {
  const { state, events } = reduce(onExpedition({ energy: 260 }), { type: "eat" });
  expect(state.expedition!.energy).toBe(MAX_ENERGY); // 260 + 80 clamped to 300
  expect(events).toEqual([{ type: "ate", defId: "ration", restored: 40, energy: 300 }]);
});

test("eat: tent boosts the restore", () => {
  const { state } = reduce(onExpedition({ energy: 0, tools: ["tent"] }), { type: "eat" });
  expect(state.expedition!.energy).toBe(80 * TENT_FOOD_MULTIPLIER); // 120
});

test("eat: rejected at full energy", () => {
  const { events } = reduce(onExpedition({ energy: MAX_ENERGY }), { type: "eat" });
  expect(events).toEqual([{ type: "action-rejected", action: "eat", reason: "insufficient" }]);
});

test("eat: rejected with no food", () => {
  const { events } = reduce(onExpedition({ energy: 100, food: [] }), { type: "eat" });
  expect(events).toEqual([{ type: "action-rejected", action: "eat", reason: "insufficient" }]);
});

test("toggle-auto-eat: flips the flag", () => {
  const { state, events } = reduce(onExpedition({ autoEat: true }), { type: "toggle-auto-eat" });
  expect(state.expedition!.autoEat).toBe(false);
  expect(events).toEqual([{ type: "auto-eat-toggled", on: false }]);
  const back = reduce(state, { type: "toggle-auto-eat" });
  expect(back.state.expedition!.autoEat).toBe(true);
});

test("auto-eat off: eat and toggle are the only ways to refill", () => {
  const s = onExpedition({ energy: 100, autoEat: false });
  // manual eat still works with autoEat off
  const { state } = reduce(s, { type: "eat" });
  expect(state.expedition!.energy).toBe(180);
});
