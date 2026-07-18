import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { localMap } from "../src/engine/town";
import { FOOD_ENERGY, TENT_FOOD_MULTIPLIER, MAX_ENERGY } from "../src/data/constants";
import type { GameState, Action } from "../src/engine/types";

// 7lr: the over-eat-past-max is now the TENT CAMP MEAL — a manual eat with a tent + an
// unspent charge (TENT_CAMP_MEALS/run). Tested through the REAL embark path so the
// per-run charge reset is exercised (hand-built states can't show a run boundary).

// Embark a run with a given food loadout + tools, then set energy to `energy`.
function onMap(food: { defId: string; qty: number }[], tools: string[], energy: number, runs = 0): GameState {
  const seed = localMap("oe", runs).mapSeed;
  const bank = [...tools.map((d) => ({ defId: d, qty: 1 })), ...food];
  let s: GameState = { seed: "oe", phase: "town", bank, loadout: emptyLoadout(), expedition: null, runs };
  for (const t of tools) s = reduce(s, { type: "pack", slot: "tool", itemId: t } as Action).state;
  for (const f of food) for (let i = 0; i < f.qty; i++) s = reduce(s, { type: "pack", slot: "food", itemId: f.defId } as Action).state;
  s = reduce(s, { type: "embark", mapSeed: seed } as Action).state;
  return { ...s, expedition: { ...s.expedition!, energy } };
}

test("camp meal: a tent lets a manual eat over-eat past max at ×TENT_FOOD_MULTIPLIER", () => {
  const s = onMap([{ defId: "pemmican", qty: 1 }, { defId: "ration", qty: 2 }], ["tent"], 100);
  const r = reduce(s, { type: "eat", defId: "pemmican" } as Action);
  expect(r.events.some((e) => e.type === "action-rejected")).toBe(false);
  expect(r.state.expedition!.energy).toBe(100 + FOOD_ENERGY.pemmican! * TENT_FOOD_MULTIPLIER); // 460, past max
  expect(r.state.expedition!.campMealsUsed).toBe(1);
});

test("camp meal: the charge RESETS on a fresh embark (one per run)", () => {
  // Run 1: spend the camp meal.
  const s1 = onMap([{ defId: "pemmican", qty: 1 }], ["tent"], 100, 0);
  const after1 = reduce(s1, { type: "eat", defId: "pemmican" } as Action).state;
  expect(after1.expedition!.campMealsUsed).toBe(1);
  // Run 2: a fresh embark — the charge is available again (campMealsUsed back to 0).
  const s2 = onMap([{ defId: "pemmican", qty: 1 }], ["tent"], 100, 1);
  expect(s2.expedition!.campMealsUsed ?? 0).toBe(0);
  const after2 = reduce(s2, { type: "eat", defId: "pemmican" } as Action);
  expect(after2.state.expedition!.energy).toBeGreaterThan(MAX_ENERGY); // over-eats again
});

test("no tent: a manual eat is additive and capped at max (no over-eat)", () => {
  const s = onMap([{ defId: "ration", qty: 2 }], [], 250);
  const r = reduce(s, { type: "eat", defId: "ration" } as Action);
  expect(r.state.expedition!.energy).toBe(MAX_ENERGY); // 250 + 80 capped at 300, not 330
  expect(r.events[0]).not.toHaveProperty("campMeal");
});
