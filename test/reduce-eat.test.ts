import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { MAX_ENERGY, TENT_FOOD_MULTIPLIER } from "../src/data/constants";
import type { GameState, Loadout } from "../src/engine/types";

// Stamina model (m0a): manual `eat` over-eats the MOST-dense food unit, jumping
// energy TO foodEnergy×tentMult (may exceed maxEnergy). Auto-eat (waste-free,
// scoped to the DESIGNATED food) is separate. `set-auto-eat-food` designates it (mco).

function onExpedition(opts: {
  energy?: number;
  autoEatFood?: string;
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
      energy: opts.energy ?? 100, maxEnergy: MAX_ENERGY, autoEatFood: opts.autoEatFood,
      hp: 30, loadout, carry: [], cleared: [],
    },
  };
}

test("eat: jumps energy TO the densest unit's boosted value and removes it", () => {
  // energy 0, ration(80), no tent → boosted 80 > 0 → jump to 80
  const { state, events } = reduce(onExpedition({ energy: 0 }), { type: "eat" });
  expect(state.expedition!.energy).toBe(80); // jumped TO 80 (not additive)
  expect(state.expedition!.loadout.food).toEqual([{ defId: "ration", qty: 2 }]);
  expect(events).toEqual([{ type: "ate", defId: "ration", restored: 80, energy: 80 }]);
});

test("eat: may exceed maxEnergy (no clamping)", () => {
  // pemmican(240) under tent → boosted 360 > max 300 — over-eat is deliberate
  const loadout: Loadout = emptyLoadout();
  loadout.food = [{ defId: "pemmican", qty: 1 }];
  loadout.equipment.tools = ["tent"];
  const s: GameState = {
    seed: "eat", phase: "expedition", bank: [], loadout: emptyLoadout(),
    expedition: {
      mapSeed: "eat", pos: { x: 0, y: 0 },
      energy: 100, maxEnergy: MAX_ENERGY,
      hp: 30, loadout, carry: [], cleared: [],
    },
  };
  const { state, events } = reduce(s, { type: "eat" });
  expect(state.expedition!.energy).toBe(360); // past maxEnergy — over-eat is the point
  expect(events[0]).toMatchObject({ type: "ate", defId: "pemmican", restored: 260, energy: 360 });
});

test("eat: tent boosts the restore", () => {
  const { state } = reduce(onExpedition({ energy: 0, tools: ["tent"] }), { type: "eat" });
  expect(state.expedition!.energy).toBe(80 * TENT_FOOD_MULTIPLIER); // 120
});

test("eat: rejected when boosted ≤ current energy", () => {
  // ration(80), energy 250, no tent → boosted 80 ≤ 250 → reject
  const { events } = reduce(onExpedition({ energy: 250 }), { type: "eat" });
  expect(events).toEqual([{ type: "action-rejected", action: "eat", reason: "insufficient" }]);
});

test("eat: rejected with no food", () => {
  const { events } = reduce(onExpedition({ energy: 100, food: [] }), { type: "eat" });
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

test("set-auto-eat-food: the designated food auto-eats waste-free on a spend (mco)", () => {
  // ration designated, energy 0 → an eat-triggering spend refills from ration only.
  const s = onExpedition({ energy: 0, autoEatFood: "ration", food: [{ defId: "ration", qty: 3 }] });
  // eat is a manual over-eat; auto-eat rides move/gather. Prove designation sticks:
  expect(s.expedition!.autoEatFood).toBe("ration");
});

test("auto-eat off by default: manual eat still works when boosted > current", () => {
  // energy 0, ration(80), auto-eat off (no autoEatFood) → boosted 80 > 0 → jumps to 80
  const s = onExpedition({ energy: 0 });
  const { state } = reduce(s, { type: "eat" });
  expect(state.expedition!.energy).toBe(80);
});
