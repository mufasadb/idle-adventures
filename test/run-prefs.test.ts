// seyh.31 (owner playtest 2026-10-10): the auto-finish / auto-potion / auto-gather
// toggles stick across runs — the last choice rides GameState.prefs into the next embark.
import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { localMap, newGame } from "../src/engine/town";
import type { Action, GameState } from "../src/engine/types";

const run = (s: GameState, ...actions: Action[]): GameState => {
  for (const a of actions) s = reduce(s, a).state;
  return s;
};
const embark = (s: GameState): GameState => run(s, { type: "embark", mapSeed: localMap(s.seed, s.runs ?? 0).mapSeed });

test("a fresh game embarks with the documented defaults (finish off, quaff on, gather on)", () => {
  const e = embark(newGame("prefs")).expedition!;
  expect(e.autoFinish ?? false).toBe(false);
  expect(e.autoQuaff ?? true).toBe(true);
  expect(e.autoGather ?? true).toBe(true);
});

test("toggles persist across two embarks", () => {
  let s = embark(newGame("prefs"));
  s = run(s, { type: "toggle-auto-finish" }, { type: "toggle-auto-quaff" }, { type: "toggle-auto-gather" });
  expect(s.prefs).toEqual({ autoFinish: true, autoQuaff: false, autoGather: false });
  for (let i = 0; i < 2; i++) {
    s = run(s, { type: "return" });
    expect(s.phase).toBe("town");
    s = embark(s);
    expect(s.phase).toBe("expedition");
    expect(s.expedition!.autoFinish).toBe(true);
    expect(s.expedition!.autoQuaff).toBe(false);
    expect(s.expedition!.autoGather).toBe(false);
  }
  // turning it back off sticks too
  s = run(s, { type: "toggle-auto-finish" }, { type: "return" });
  expect(embark(s).expedition!.autoFinish).toBe(false);
});

test("a rejected toggle (in town) writes no pref", () => {
  const s = newGame("prefs");
  expect(reduce(s, { type: "toggle-auto-finish" }).state.prefs).toBeUndefined();
});
