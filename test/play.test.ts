import { test, expect } from "bun:test";
import { play } from "../src/sim/play";
import { newGame, candidateMaps } from "../src/engine/town";
const OFFER_S = candidateMaps("s", 0)[0]!.mapSeed; // offered map for seed "s" (9u9.3)

test("play: no actions returns the fresh game unchanged", () => {
  const { state, events } = play("s", []);
  expect(state).toEqual(newGame("s"));
  expect(events).toEqual([]);
});

test("play: folds reduce and concatenates events in order", () => {
  const { state, events } = play("s", [
    { type: "pack", slot: "tool", itemId: "pick" },
    { type: "pack", slot: "food", itemId: "ration" },
  ]);
  expect(state.loadout.equipment.tools).toEqual(["pick"]);
  expect(state.loadout.food).toEqual([{ defId: "ration", qty: 1 }]);
  expect(events).toEqual([
    { type: "packed", slot: "tool", defId: "pick" },
    { type: "packed", slot: "food", defId: "ration" },
  ]);
});

test("play: a rejected action leaves state unchanged but records the rejection", () => {
  const { state, events } = play("s", [{ type: "gather" }]); // gather illegal in town
  expect(state).toEqual(newGame("s"));
  expect(events).toEqual([
    { type: "action-rejected", action: "gather", reason: "not-on-expedition" },
  ]);
});

test("play: deterministic — same seed + actions replays identically", () => {
  const actions = [
    { type: "pack", slot: "tool", itemId: "pick" } as const,
    { type: "embark", mapSeed: OFFER_S } as const,
  ];
  expect(play("s", actions)).toEqual(play("s", actions));
});
