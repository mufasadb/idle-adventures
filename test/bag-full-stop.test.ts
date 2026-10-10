// seyh.32: a walk that stops on a node because the bag is full says to make room and
// GATHER here — walking on never picks up the tile you're already standing on.
import { test, expect } from "bun:test";
import { route } from "../src/sim/play";
import { legalActions } from "../src/sim/legal";
import { reduce } from "../src/engine/reduce";
import { freeLootStacks } from "../src/engine/carry";
import { emptyLoadout } from "../src/engine/loadout";
import { bagFullStopNote, GATHER_VERB } from "../src/render/render";
import { expeditionView } from "../src/web/expedition-view";
import type { GameState } from "../src/engine/types";
import { scanForPoi } from "./helpers";

const FILLER = ["oak-log", "iron-ore", "copper-ore", "deer-hide", "silver-ore", "wolf-pelt", "leather", "coal"];
const ui = { drawerOpen: false, tab: "here" as const, logHtml: "" };

test("bag-full stop → drop one → Gather is legal and its button shows; the note points at Gather, not Walk", () => {
  // a flint/deadwood forage node (bare hands can work it) with a plains tile beside it to walk in from
  let from = { x: 0, y: 0 };
  const { seed, poi } = scanForPoi("bfs", (p, grid) => {
    if (p.kind !== "herb" || (p.material !== "flint" && p.material !== "deadwood")) return false; // one loot stack (food forage takes a slot per unit)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const n = { x: p.x + dx, y: p.y + dy };
      if (grid.terrain[n.y]?.[n.x] === "plains" && !grid.pois.some((q) => q.x === n.x && q.y === n.y)) { from = n; return true; }
    }
    return false;
  });
  const loadout = emptyLoadout();
  const carry = FILLER.slice(0, freeLootStacks(loadout)).map((defId) => ({ defId, qty: 1 }));
  expect(carry.some((c) => c.defId === poi.material)).toBe(false); // the haul can't top up a stack already held
  const s: GameState = { seed: "g", phase: "expedition", bank: [], loadout: emptyLoadout(), expedition: { mapSeed: seed, pos: from, energy: 100, hp: 30, loadout, carry, cleared: [] } };

  const r = route(s, [{ x: poi.x, y: poi.y }]);
  expect(r.halt).toEqual({ kind: "bag-full" });
  expect(r.state.expedition!.pos).toEqual({ x: poi.x, y: poi.y }); // stopped ON the node
  expect(legalActions(r.state).some((a) => a.type === "gather")).toBe(false);

  const note = bagFullStopNote(r.state.expedition!.pos, poi.kind);
  expect(note).toContain(`${GATHER_VERB.herb!.label} here`);
  expect(note).toMatch(/drop or eat/);
  expect(note).not.toMatch(/Walk to resume/);

  const dropped = reduce(r.state, { type: "drop", itemId: carry[0]!.defId }).state;
  expect(legalActions(dropped)).toContainEqual({ type: "gather" });
  expect(expeditionView(dropped, r.remaining, ui)).toContain(`<button data-act="gather">${GATHER_VERB.herb!.label}</button>`);
  expect(reduce(dropped, { type: "gather" }).events.some((e) => e.type === "gathered")).toBe(true); // and it lands
});
