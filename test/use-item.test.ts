import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { generateGrid, rollBiome } from "../src/engine/grid";
import type { Poi } from "../src/engine/grid";
import { newGame } from "../src/engine/town";
import { PLAYER_BASE_HP, MONSTERS, COMBAT_BUFF } from "../src/data/constants";
import type { GameState, GameEvent } from "../src/engine/types";

const types = (evs: GameEvent[]) => evs.map((e) => e.type);

function monsterMap(): { seed: string; poi: Poi } {
  for (let i = 0; i < 400; i++) {
    const seed = `use-scan-${i}`;
    const grid = generateGrid(seed, rollBiome(seed));
    const poi = grid.pois.find((p) => p.kind === "monster" && p.creature !== null && MONSTERS[p.creature!]?.tier === 1);
    if (poi) return { seed, poi };
  }
  throw new Error("no monster POI in scan range");
}

// An expedition standing on a live monster with battle items packed, NOT yet engaged.
function withBattleItems(items: { defId: string; qty: number }[]): { state: GameState; poi: Poi } {
  const { seed, poi } = monsterMap();
  const loadout = emptyLoadout();
  loadout.equipment.weapon = "sword";
  loadout.battleItems = items;
  return {
    poi,
    state: {
      seed: "g", phase: "expedition", bank: [], loadout: emptyLoadout(),
      expedition: {
        mapSeed: seed, pos: { x: poi.x, y: poi.y }, energy: 300,
        hp: PLAYER_BASE_HP, loadout, carry: [], cleared: [],
      },
    } as GameState,
  };
}

test("engage no longer auto-consumes battle items — buff starts at zero, items still packed", () => {
  const { state } = withBattleItems([{ defId: "elixir-of-power", qty: 1 }]);
  const { state: after } = reduce(state, { type: "fight" });
  const combat = after.expedition!.combat!;
  expect(combat.damageAdd).toBe(0);
  expect(combat.mitigationAdd).toBe(0);
  expect(after.expedition!.loadout.battleItems).toEqual([{ defId: "elixir-of-power", qty: 1 }]);
});

test("use-item mid-engagement applies the buff for this fight and consumes one unit", () => {
  const { state } = withBattleItems([{ defId: "elixir-of-power", qty: 1 }]);
  const engaged = reduce(state, { type: "fight" }).state;
  const { state: after, events } = reduce(engaged, { type: "use-item", itemId: "elixir-of-power" });
  expect(types(events)).toEqual(["item-used"]);
  const ev = events[0] as Extract<GameEvent, { type: "item-used" }>;
  expect(ev.defId).toBe("elixir-of-power");
  expect(ev.damageAdd).toBe(COMBAT_BUFF["elixir-of-power"]!.damageAdd ?? 0);
  const combat = after.expedition!.combat!;
  expect(combat.damageAdd).toBe(COMBAT_BUFF["elixir-of-power"]!.damageAdd ?? 0);
  expect(after.expedition!.loadout.battleItems).toEqual([]); // last unit spent
  expect(after.expedition!.hp).toBe(PLAYER_BASE_HP); // no exchange ran
});

test("use-item buffs stack additively across two different items", () => {
  const { state } = withBattleItems([
    { defId: "elixir-of-power", qty: 1 },
    { defId: "warding-draught", qty: 1 },
  ]);
  let s = reduce(state, { type: "fight" }).state;
  s = reduce(s, { type: "use-item", itemId: "elixir-of-power" }).state;
  s = reduce(s, { type: "use-item", itemId: "warding-draught" }).state;
  const combat = s.expedition!.combat!;
  expect(combat.damageAdd).toBe(COMBAT_BUFF["elixir-of-power"]!.damageAdd ?? 0);
  expect(combat.mitigationAdd).toBe(COMBAT_BUFF["warding-draught"]!.mitigationAdd ?? 0);
});

test("use-item rejected when not engaged", () => {
  const { state } = withBattleItems([{ defId: "elixir-of-power", qty: 1 }]);
  const { state: after, events } = reduce(state, { type: "use-item", itemId: "elixir-of-power" });
  expect(events.find((e) => e.type === "action-rejected")).toMatchObject({ reason: "not-engaged" });
  expect(after).toBe(state); // original state on rejection
});

test("use-item rejected in town (not on expedition)", () => {
  const { events } = reduce(newGame("g"), { type: "use-item", itemId: "elixir-of-power" });
  expect(events.find((e) => e.type === "action-rejected")).toMatchObject({ reason: "not-on-expedition" });
});

test("use-item rejected when the item isn't held (insufficient)", () => {
  const { state } = withBattleItems([{ defId: "elixir-of-power", qty: 1 }]);
  const engaged = reduce(state, { type: "fight" }).state;
  const { events } = reduce(engaged, { type: "use-item", itemId: "warding-draught" });
  expect(events.find((e) => e.type === "action-rejected")).toMatchObject({ reason: "insufficient" });
});

test("use-item rejected for a non-battle-item id (wrong-slot)", () => {
  const { state } = withBattleItems([{ defId: "elixir-of-power", qty: 1 }]);
  const engaged = reduce(state, { type: "fight" }).state;
  const { events } = reduce(engaged, { type: "use-item", itemId: "potion" });
  expect(events.find((e) => e.type === "action-rejected")).toMatchObject({ reason: "wrong-slot" });
});

test("unused battle items bank back on return", () => {
  const { state } = withBattleItems([{ defId: "elixir-of-power", qty: 2 }]);
  // engage, use one, flee — one should survive to bank
  let s = reduce(state, { type: "fight" }).state;
  s = reduce(s, { type: "use-item", itemId: "elixir-of-power" }).state;
  s = reduce(s, { type: "flee" }).state; // disengage (hp survives the parting hit)
  s = reduce(s, { type: "return" }).state; // walk home to bank
  expect(s.phase).toBe("town");
  const banked = s.bank.find((b) => b.defId === "elixir-of-power");
  expect(banked?.qty).toBe(1);
});
