// isExhausted (user 2026-10-10): out on the map with no affordable step, nothing to eat
// and no food to craft, the surfaces offer the trip home.
import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { newGame } from "../src/engine/town";
import { legalActions } from "../src/sim/legal";
import { isExhausted, stuckOptions } from "../src/render/render";
import { expeditionView } from "../src/web/expedition-view";
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

// seyh.3: the exhausted card must not dismiss into a dead end. "Not yet" appears only
// when something besides the free trip home is still legal and worth doing here.
test("exhausted with nothing left to do: stuckOptions is empty and the card offers home only", () => {
  const s = onMap();
  const drained: GameState = { ...s, expedition: { ...s.expedition!, energy: 0, carry: [], loadout: { ...s.expedition!.loadout, food: [] } } };
  let spent: GameState | null = null;
  for (let y = 1; y < 34 && !spent; y++) for (let x = 1; x < 34 && !spent; x++) {
    const t: GameState = { ...drained, expedition: { ...drained.expedition!, pos: { x, y } } };
    const legal = legalActions(t);
    if (isExhausted(t, legal) && stuckOptions(legal).length === 0) spent = t;
  }
  if (!spent) throw new Error("no exhausted spot with nothing to do");
  // only settings toggles / the auto-eat pick / return remain, and none of them count
  expect(legalActions(spent).every((a) => a.type === "return" || a.type.startsWith("toggle-") || a.type === "set-auto-eat-food")).toBe(true);
  const html = expeditionView(spent, [], { drawerOpen: false, tab: "here", logHtml: "" });
  expect(html).toContain("You're exhausted");
  expect(html).toContain("data-act=\"return\"");
  expect(html).not.toContain("Not yet");
  expect(html).not.toContain("data-home-cancel");

  // something to drop out here → "Not yet" comes back, and the card says what's left
  const holding: GameState = { ...spent, expedition: { ...spent.expedition!, carry: [{ defId: "oak-log", qty: 2 }] } };
  expect(stuckOptions(legalActions(holding))).toContain("drop things");
  const html2 = expeditionView(holding, [], { drawerOpen: false, tab: "here", logHtml: "" });
  expect(html2).toContain("Not yet");
  expect(html2).toContain("drop things");
});
