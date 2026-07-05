import { test, expect } from "bun:test";
import { townActions, expeditionActions, legalActions } from "../src/sim/legal";
import { reduce } from "../src/engine/reduce";
import { newGame, candidateMaps } from "../src/engine/town";
const OFFER_S = candidateMaps("s", 0)[0]!.mapSeed; // offered map for seed "s" (9u9.3)
import { play } from "../src/sim/play";
import { generateGrid, rollBiome } from "../src/engine/grid";
import type { Poi } from "../src/engine/grid";
import { emptyLoadout } from "../src/engine/loadout";
import { MATERIAL_TIER } from "../src/data/constants";
import type { Action, GameState } from "../src/engine/types";

const accepts = (state: GameState, action: Action) =>
  reduce(state, action).events.every((e) => e.type !== "action-rejected");

test("townActions: offers pack + embark on a fresh game, never move/gather", () => {
  const state = newGame("s");
  const actions = townActions(state);
  expect(actions.length).toBeGreaterThan(0);
  // every offered action is genuinely accepted by reduce (D29: no drift)
  for (const a of actions) expect(accepts(state, a)).toBe(true);
  // packing a starter item is offered
  expect(actions).toContainEqual({ type: "pack", slot: "tool", itemId: "pick" });
  // embark on each candidate map is offered
  for (const m of candidateMaps("s")) {
    expect(actions).toContainEqual({ type: "embark", mapSeed: m.mapSeed });
  }
  // no expedition-only actions leak in
  expect(actions.some((a) => a.type === "move" || a.type === "gather" || a.type === "return")).toBe(false);
});

test("townActions: empty when not in town", () => {
  const onMap = play("s", [
    { type: "pack", slot: "food", itemId: "ration" },
    { type: "embark", mapSeed: OFFER_S },
  ]).state;
  expect(townActions(onMap)).toEqual([]);
});

test("expeditionActions: offers return (always) + some moves, never craft/pack", () => {
  const onMap = play("s", [
    { type: "pack", slot: "food", itemId: "ration" },
    { type: "pack", slot: "food", itemId: "ration" },
    { type: "embark", mapSeed: OFFER_S },
  ]).state;
  const actions = expeditionActions(onMap);
  for (const a of actions) expect(accepts(onMap, a)).toBe(true);
  expect(actions).toContainEqual({ type: "return" }); // always legal (bead note a)
  expect(actions.some((a) => a.type === "move")).toBe(true); // at least one legal neighbour
  expect(actions.some((a) => a.type === "craft" || a.type === "pack")).toBe(false);
});

test("expeditionActions: return is offered even at zero energy (never a dead end)", () => {
  // Drain to a genuine 0 (embark now floors energy at BASE_ENERGY_FLOOR, qrl):
  // moves are all unaffordable, but return must still stand.
  const embarked = play("s", [{ type: "embark", mapSeed: OFFER_S }]).state;
  const zero: GameState = { ...embarked, expedition: { ...embarked.expedition!, energy: 0 } };
  expect(expeditionActions(zero)).toContainEqual({ type: "return" });
});

test("expeditionActions: empty when not on expedition", () => {
  expect(expeditionActions(newGame("s"))).toEqual([]);
});

test("legalActions: dispatches by phase", () => {
  const town = newGame("s");
  expect(legalActions(town)).toEqual(townActions(town));
  const onMap = play("s", [
    { type: "pack", slot: "food", itemId: "ration" },
    { type: "embark", mapSeed: OFFER_S },
  ]).state;
  expect(legalActions(onMap)).toEqual(expeditionActions(onMap));
});

// Tier gate (2026-07-04): a node whose material out-tiers your tool is "visible
// but locked" — legalActions must NOT offer gather there. This is the D29 "free"
// property: no parallel logic, the speculative reduce filters it.
test("expeditionActions: a tier-locked node is not offered gather (D29 free)", () => {
  // find a T2+ gatherable node
  let seed = "";
  let poi: Poi | undefined;
  for (let i = 0; i < 300 && !poi; i++) {
    const s = `lock-${i}`;
    const g = generateGrid(s, rollBiome(s));
    poi = g.pois.find((p) => p.material !== null && (MATERIAL_TIER[p.material] ?? 1) >= 2);
    if (poi) seed = s;
  }
  expect(poi).toBeTruthy();
  const loadout = emptyLoadout();
  loadout.equipment.tools = ["pick", "axe", "knife"]; // all T1 — too weak for the locked node
  const state: GameState = {
    seed: "g", phase: "expedition", bank: [], loadout: emptyLoadout(),
    expedition: { mapSeed: seed, pos: { x: poi!.x, y: poi!.y }, energy: 100, hp: 30, loadout, carry: [], cleared: [] },
  };
  const actions = expeditionActions(state);
  for (const a of actions) expect(accepts(state, a)).toBe(true); // nothing offered is rejected
  expect(actions.some((a) => a.type === "gather")).toBe(false); // the locked node is not workable
});
