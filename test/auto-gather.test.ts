import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import type { GameState } from "../src/engine/types";

// eot.1: autoGather is the persistent toggle that gates auto-interaction on the
// walk (default ON, read `?? true`, mirroring autoQuaff). toggle-auto-gather flips
// it and emits auto-gather-toggled{on}. Off ⇒ the walk crosses nodes untouched.

const onExpedition = (over: Partial<GameState["expedition"]> = {}): GameState => ({
  seed: "g",
  phase: "expedition",
  bank: [],
  loadout: emptyLoadout(),
  expedition: {
    mapSeed: "s",
    pos: { x: 1, y: 1 },
    energy: 100,
    hp: 300,
    loadout: emptyLoadout(),
    carry: [],
    cleared: [],
    ...over,
  },
});

test("autoGather defaults ON: first toggle turns it OFF", () => {
  const { state, events } = reduce(onExpedition(), { type: "toggle-auto-gather" });
  expect(events.map((e) => e.type)).toEqual(["auto-gather-toggled"]);
  expect(events[0]).toMatchObject({ type: "auto-gather-toggled", on: false });
  expect(state.expedition!.autoGather).toBe(false);
});

test("toggle-auto-gather flips a stored value back ON", () => {
  const { state, events } = reduce(onExpedition({ autoGather: false }), { type: "toggle-auto-gather" });
  expect(events[0]).toMatchObject({ type: "auto-gather-toggled", on: true });
  expect(state.expedition!.autoGather).toBe(true);
});

test("toggle-auto-gather off-expedition is rejected", () => {
  const townState: GameState = { seed: "g", phase: "town", bank: [], loadout: emptyLoadout(), expedition: null };
  const { events } = reduce(townState, { type: "toggle-auto-gather" });
  expect(events[0]).toMatchObject({ type: "action-rejected", reason: "not-on-expedition" });
});
