import { test, expect } from "bun:test";
import { play } from "../src/sim/play";
import { newGame } from "../src/engine/town";

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
    { type: "embark", mapSeed: "s:map:0" } as const,
  ];
  expect(play("s", actions)).toEqual(play("s", actions));
});
