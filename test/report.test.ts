import { test, expect } from "bun:test";
import { summarize } from "../src/sim/report";
import { newGame } from "../src/engine/town";
import { play } from "../src/sim/play";

test("summarize: town snapshot shows phase and bank, no expedition block", () => {
  const s = summarize(newGame("s"));
  expect(s.phase).toBe("town");
  expect(s.bank).toEqual(newGame("s").bank);
  expect(s.expedition).toBeNull();
});

test("summarize: expedition snapshot shows pos/energy/hp/carry", () => {
  const state = play("s", [
    { type: "pack", slot: "food", itemId: "ration" },
    { type: "embark", mapSeed: "s:map:0" },
  ]).state;
  const s = summarize(state);
  expect(s.phase).toBe("expedition");
  expect(s.expedition).not.toBeNull();
  expect(typeof s.expedition!.energy).toBe("number");
  expect(s.expedition!.pos).toEqual(state.expedition!.pos);
  expect(s.expedition!.carry).toEqual([]);
});

test("summarize: is JSON-serializable", () => {
  expect(() => JSON.stringify(summarize(newGame("s")))).not.toThrow();
});
