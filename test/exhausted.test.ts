// isExhausted (user 2026-10-10): out on the map with no affordable step, nothing to eat
// and no food to craft, the surfaces offer the trip home.
import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { newGame } from "../src/engine/town";
import { legalActions } from "../src/sim/legal";
import { isExhausted } from "../src/render/render";
import type { GameState } from "../src/engine/types";

function onMap(): GameState {
  let s = newGame("exh");
  for (const a of legalActions(s)) if (a.type === "pack") s = reduce(s, a).state;
  const embark = legalActions(s).find((a) => a.type === "embark")!;
  s = reduce(s, embark).state;
  expect(s.phase).toBe("expedition");
  return s;
}

test("a fresh expedition is not exhausted; town never is", () => {
  const s = onMap();
  expect(isExhausted(s, legalActions(s))).toBe(false);
  const t = newGame("exh");
  expect(isExhausted(t, legalActions(t))).toBe(false);
});

test("no energy and no food → exhausted; a ration in the bag → not", () => {
  const s = onMap();
  const drained: GameState = { ...s, expedition: { ...s.expedition!, energy: 0, carry: [], loadout: { ...s.expedition!.loadout, food: [] } } };
  // stand somewhere with no free (0-energy) step next to it
  let spent: GameState | null = null;
  for (let y = 1; y < 34 && !spent; y++) for (let x = 1; x < 34 && !spent; x++) {
    const t: GameState = { ...drained, expedition: { ...drained.expedition!, pos: { x, y } } };
    if (!legalActions(t).some((a) => a.type === "move")) spent = t;
  }
  if (!spent) throw new Error("no spot without a free step");
  expect(isExhausted(spent, legalActions(spent))).toBe(true);
  const fed: GameState = { ...spent, expedition: { ...spent.expedition!, loadout: { ...spent.expedition!.loadout, food: [{ defId: "ration", qty: 1 }] } } };
  expect(isExhausted(fed, legalActions(fed))).toBe(false);
});
