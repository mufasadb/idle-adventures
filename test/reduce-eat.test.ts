import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { MAX_ENERGY, TENT_FOOD_MULTIPLIER } from "../src/data/constants";
import type { GameState, Loadout } from "../src/engine/types";

// Stamina model (m0a): manual `eat` over-eats the MOST-dense food unit, jumping
// energy TO foodEnergy×tentMult (may exceed maxEnergy). Auto-eat (waste-free,
// least-dense-first) is separate and unchanged. `toggle-auto-eat` flips it.

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
      energy: 100, maxEnergy: MAX_ENERGY, autoEat: true,
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

test("toggle-auto-eat: flips the flag", () => {
  const { state, events } = reduce(onExpedition({ autoEat: true }), { type: "toggle-auto-eat" });
  expect(state.expedition!.autoEat).toBe(false);
  expect(events).toEqual([{ type: "auto-eat-toggled", on: false }]);
  const back = reduce(state, { type: "toggle-auto-eat" });
  expect(back.state.expedition!.autoEat).toBe(true);
});

test("auto-eat off: manual eat still works when boosted > current", () => {
  // energy 0, ration(80), autoEat off → boosted 80 > 0 → jumps to 80
  const s = onExpedition({ energy: 0, autoEat: false });
  const { state } = reduce(s, { type: "eat" });
  expect(state.expedition!.energy).toBe(80);
});
