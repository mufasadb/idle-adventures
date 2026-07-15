import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { localMap } from "../src/engine/town";

import type { GameState, Action } from "../src/engine/types";

// Embark a run with a given food loadout + tools, then drain energy to `energy`.
function onMap(food: { defId: string; qty: number }[], tools: string[], energy: number): GameState {
  const seed = localMap("oe", 0).mapSeed;
  const bank = [...tools.map((d) => ({ defId: d, qty: 1 })), ...food];
  let s: GameState = { seed: "oe", phase: "town", bank, loadout: emptyLoadout(), expedition: null, runs: 0 };
  for (const t of tools) s = reduce(s, { type: "pack", slot: "tool", itemId: t } as Action).state;
  for (const f of food) for (let i = 0; i < f.qty; i++) s = reduce(s, { type: "pack", slot: "food", itemId: f.defId } as Action).state;
  s = reduce(s, { type: "embark", mapSeed: seed } as Action).state;
  s = { ...s, expedition: { ...s.expedition!, energy } };
  return s;
}

test("manual eat over-eats the MOST-dense unit up to food×tentMult, past max", () => {
  // tent (×1.5), pemmican(240)→boosted 360, ration behind. energy 100, max 300.
  const s = onMap([{ defId: "pemmican", qty: 1 }, { defId: "ration", qty: 2 }], ["tent"], 100);
  const r = reduce(s, { type: "eat" } as Action);
  expect(r.events.some((e) => e.type === "action-rejected")).toBe(false);
  expect(r.state.expedition!.energy).toBe(360);   // jumped to pemmican's boosted value, over max
  expect(r.state.expedition!.loadout.food.find((f) => f.defId === "pemmican")).toBeUndefined();
});

test("manual eat without a tent uses raw density; rejects when boosted ≤ current", () => {
  // no tent, ration(80). energy 250, boosted 80 ≤ 250 → reject (pointless).
  const s = onMap([{ defId: "ration", qty: 2 }], [], 250);
  const r = reduce(s, { type: "eat" } as Action);
  expect(r.events.some((e) => e.type === "action-rejected")).toBe(true);
  expect(r.state.expedition!.energy).toBe(250);   // unchanged
});

test("manual eat sets energy TO the boosted value (not additive)", () => {
  // smoked-venison(200)→boosted 300 under tent. energy 100 → 300 (your example).
  const s = onMap([{ defId: "smoked-venison", qty: 1 }], ["tent"], 100);
  const r = reduce(s, { type: "eat" } as Action);
  expect(r.state.expedition!.energy).toBe(300);
});
