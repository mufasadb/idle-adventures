import { test, expect } from "bun:test";
import { townActions, expeditionActions, legalActions } from "../src/sim/legal";
import { reduce } from "../src/engine/reduce";
import { newGame, candidateMaps } from "../src/engine/town";
import { play } from "../src/sim/play";
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
    { type: "embark", mapSeed: "s:map:0" },
  ]).state;
  expect(townActions(onMap)).toEqual([]);
});

test("expeditionActions: offers return (always) + some moves, never craft/pack", () => {
  const onMap = play("s", [
    { type: "pack", slot: "food", itemId: "ration" },
    { type: "pack", slot: "food", itemId: "ration" },
    { type: "embark", mapSeed: "s:map:0" },
  ]).state;
  const actions = expeditionActions(onMap);
  for (const a of actions) expect(accepts(onMap, a)).toBe(true);
  expect(actions).toContainEqual({ type: "return" }); // always legal (bead note a)
  expect(actions.some((a) => a.type === "move")).toBe(true); // at least one legal neighbour
  expect(actions.some((a) => a.type === "craft" || a.type === "pack")).toBe(false);
});

test("expeditionActions: return is offered even at zero energy (never a dead end)", () => {
  // embark with no food → 0 energy; moves may all be unaffordable, but return stands
  const zero = play("s", [{ type: "embark", mapSeed: "s:map:0" }]).state;
  expect(zero.expedition!.energy).toBe(0);
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
    { type: "embark", mapSeed: "s:map:0" },
  ]).state;
  expect(legalActions(onMap)).toEqual(expeditionActions(onMap));
});
