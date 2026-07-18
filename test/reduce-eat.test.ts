import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { MAX_ENERGY, TENT_FOOD_MULTIPLIER, FOOD_ENERGY } from "../src/data/constants";
import type { GameState, Loadout } from "../src/engine/types";

// Food model (7lr): manual `eat` eats one unit of a CHOSEN food — additive, capped at
// max — UNLESS a tent turns it into the once-per-run CAMP MEAL (over-max + ×TENT_FOOD_
// MULTIPLIER, spends a charge). Auto-eat (waste-free, designated food) gets NO tent
// bonus now. `set-auto-eat-food` designates the auto-eat food (mco).

function onExpedition(opts: {
  energy?: number;
  autoEatFood?: string;
  food?: { defId: string; qty: number }[];
  tools?: string[];
  campMealsUsed?: number;
} = {}): GameState {
  const loadout: Loadout = emptyLoadout();
  loadout.food = opts.food ?? [{ defId: "ration", qty: 3 }];
  loadout.equipment.tools = opts.tools ?? [];
  return {
    seed: "eat", phase: "expedition", bank: [], loadout: emptyLoadout(),
    expedition: {
      mapSeed: "eat", pos: { x: 0, y: 0 },
      energy: opts.energy ?? 100, maxEnergy: MAX_ENERGY, autoEatFood: opts.autoEatFood,
      hp: 30, loadout, carry: [], cleared: [], campMealsUsed: opts.campMealsUsed,
    },
  };
}

test("eat: ADDITIVE, capped at max, removes the eaten unit (no tent)", () => {
  const { state, events } = reduce(onExpedition({ energy: 100 }), { type: "eat", defId: "ration" });
  expect(state.expedition!.energy).toBe(180); // 100 + 80, additive (not jump-to)
  expect(state.expedition!.loadout.food).toEqual([{ defId: "ration", qty: 2 }]);
  expect(events).toEqual([{ type: "ate", defId: "ration", restored: 80, energy: 180 }]);
});

test("eat: you CHOOSE the food — eating berries leaves the denser rations alone", () => {
  const s = onExpedition({ energy: 0, food: [{ defId: "ration", qty: 2 }, { defId: "berries", qty: 1 }] });
  const { state } = reduce(s, { type: "eat", defId: "berries" });
  expect(state.expedition!.energy).toBe(FOOD_ENERGY.berries); // 0 + 30, the chosen food
  expect(state.expedition!.loadout.food).toEqual([{ defId: "ration", qty: 2 }]); // berries gone, rations untouched
});

test("eat: a plain (no-tent) meal never exceeds max — the overflow is wasted", () => {
  const { state } = reduce(onExpedition({ energy: 290 }), { type: "eat", defId: "ration" });
  expect(state.expedition!.energy).toBe(MAX_ENERGY); // 290 + 80 capped at 300
});

test("eat: a TENT camp meal over-eats past max at ×TENT_FOOD_MULTIPLIER and spends a charge", () => {
  const s = onExpedition({ energy: 100, food: [{ defId: "pemmican", qty: 1 }], tools: ["tent"] });
  const { state, events } = reduce(s, { type: "eat", defId: "pemmican" });
  const restore = FOOD_ENERGY.pemmican! * TENT_FOOD_MULTIPLIER; // 240 × 1.5 = 360
  expect(state.expedition!.energy).toBe(100 + restore); // 460 — past max, banked reach
  expect(state.expedition!.campMealsUsed).toBe(1);
  expect(events[0]).toMatchObject({ type: "ate", defId: "pemmican", campMeal: true, restored: restore, energy: 460 });
});

test("eat: the SECOND eat that run (charge spent) is a plain capped meal — no ×1.5, no over-max", () => {
  const s = onExpedition({ energy: 100, food: [{ defId: "ration", qty: 2 }], tools: ["tent"], campMealsUsed: 1 });
  const { state, events } = reduce(s, { type: "eat", defId: "ration" });
  expect(state.expedition!.energy).toBe(180); // 100 + 80 ×1, no tent bonus once the charge is spent
  expect(state.expedition!.campMealsUsed).toBe(1); // unchanged
  expect(events[0]).not.toHaveProperty("campMeal");
});

test("eat: rejected when the meal can't raise energy (at/over max, no camp meal)", () => {
  const { events } = reduce(onExpedition({ energy: MAX_ENERGY }), { type: "eat", defId: "ration" });
  expect(events).toEqual([{ type: "action-rejected", action: "eat", reason: "insufficient" }]);
});

test("eat: rejected when the named food isn't packed (no silent no-op)", () => {
  const { events } = reduce(onExpedition({ energy: 100, food: [{ defId: "ration", qty: 1 }] }), { type: "eat", defId: "pemmican" });
  expect(events).toEqual([{ type: "action-rejected", action: "eat", reason: "insufficient" }]);
});

test("set-auto-eat-food: designates a food, then null clears it (mco)", () => {
  const { state, events } = reduce(onExpedition(), { type: "set-auto-eat-food", defId: "ration" });
  expect(state.expedition!.autoEatFood).toBe("ration");
  expect(events).toEqual([{ type: "auto-eat-set", defId: "ration" }]);
  const cleared = reduce(state, { type: "set-auto-eat-food", defId: null });
  expect(cleared.state.expedition!.autoEatFood).toBeUndefined();
  expect(cleared.events).toEqual([{ type: "auto-eat-set", defId: null }]);
});

test("set-auto-eat-food: rejects a non-food defId (mco)", () => {
  const { state, events } = reduce(onExpedition(), { type: "set-auto-eat-food", defId: "knife" });
  expect(state.expedition!.autoEatFood).toBeUndefined();
  expect(events).toEqual([{ type: "action-rejected", action: "set-auto-eat-food", reason: "not-food" }]);
});
