import { test, expect } from "bun:test";
import { play } from "../src/sim/play";
import { newGame, localMap } from "../src/engine/town";
const OFFER_S = localMap("s", 0).mapSeed; // offered map for seed "s" (9u9.3)

test("play: no actions returns the fresh game unchanged", () => {
  const { state, events } = play("s", []);
  expect(state).toEqual(newGame("s"));
  expect(events).toEqual([]);
});

test("play: folds reduce and concatenates events in order", () => {
  // A fresh bank is FOOD-only now (xls/9az bootstrap: no pre-made tools), so this
  // folds two packs across two slots — ration (food) + potion (potion).
  const { state, events } = play("s", [
    { type: "pack", slot: "food", itemId: "ration" },
    { type: "pack", slot: "potion", itemId: "potion" },
  ]);
  expect(state.loadout.food).toEqual([{ defId: "ration", qty: 1 }]);
  expect(state.loadout.potions).toEqual([{ defId: "potion", qty: 1 }]);
  expect(events).toEqual([
    { type: "packed", slot: "food", defId: "ration" },
    { type: "packed", slot: "potion", defId: "potion" },
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
    { type: "pack", slot: "food", itemId: "ration" } as const,
    { type: "embark", mapSeed: OFFER_S } as const,
  ];
  expect(play("s", actions)).toEqual(play("s", actions));
});
