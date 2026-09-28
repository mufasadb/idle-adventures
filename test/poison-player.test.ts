// si7.6.9.2 (D98): venomous monsters poison YOU — gently, self-expiring, antidote cures.
import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { strikeExchange, poisonTick } from "../src/engine/combat";
import { PLAYER_POISON_FLOOR } from "../src/data/constants";
import type { GameState, GameEvent, Engagement } from "../src/engine/types";

const venom = { chance: 0.5, dmg: 1, ticks: 5 };

test("poisonTick: loses dmg, counts down, clears at 0, never drops below the floor", () => {
  expect(poisonTick(10, { dmg: 2, ticks: 3 })).toEqual({ hp: 8, taken: 2, after: { dmg: 2, ticks: 2 } });
  expect(poisonTick(10, { dmg: 2, ticks: 1 })).toEqual({ hp: 8, taken: 2 });
  expect(poisonTick(2, { dmg: 5, ticks: 3 }).hp).toBe(PLAYER_POISON_FLOOR);
  expect(poisonTick(PLAYER_POISON_FLOOR, { dmg: 5, ticks: 3 }).taken).toBe(0);
});

test("strikeExchange: a landed venomous hit poisons on a roll under the chance, not over it", () => {
  const lo = emptyLoadout(); lo.equipment.weapon = "sword";
  const hit = strikeExchange(lo, 30, 100, "werewolf", { venom: { ...venom, roll: 0.1 } });
  expect(hit.envenomed).toBe(true);
  expect(hit.playerPoisonAfter).toEqual({ dmg: 1, ticks: 5 });
  const miss = strikeExchange(lo, 30, 100, "werewolf", { venom: { ...venom, roll: 0.9 } });
  expect(miss.envenomed).toBe(false);
  expect(miss.playerPoisonAfter).toBeUndefined();
  // no retaliation (an opener) = no bite
  expect(strikeExchange(lo, 30, 100, "werewolf", { skipRetaliation: true, venom: { ...venom, roll: 0 } }).envenomed).toBe(false);
});

test("strikeExchange: poison already in you ticks each round; a new bite refreshes, never stacks", () => {
  const lo = emptyLoadout(); lo.equipment.weapon = "sword";
  const r = strikeExchange(lo, 30, 100, "werewolf", { playerPoison: { dmg: 1, ticks: 2 }, venom: { ...venom, roll: 0 } });
  expect(r.poisonTaken).toBe(1);
  expect(r.playerPoisonAfter).toEqual({ dmg: 1, ticks: 5 });
});

function onMap(poisoned?: { dmg: number; ticks: number }, battleItems = [{ defId: "antidote", qty: 1 }], combat?: Engagement): GameState {
  const loadout = emptyLoadout();
  loadout.battleItems = battleItems;
  return {
    seed: "g", phase: "expedition", bank: [], loadout: emptyLoadout(),
    expedition: { mapSeed: "poison-walk", pos: { x: 17, y: 17 }, energy: 300, hp: 20, loadout, carry: [], cleared: [], ...(poisoned ? { poisoned } : {}), ...(combat ? { combat } : {}) },
  };
}

test("move: your poison ticks once per step and wears off", () => {
  let s = onMap({ dmg: 1, ticks: 2 });
  let hpLost = 0;
  for (const to of [{ x: 18, y: 17 }, { x: 19, y: 17 }, { x: 20, y: 17 }, { x: 21, y: 17 }]) {
    const r = reduce(s, { type: "move", to });
    if (r.events[0]!.type !== "moved") continue; // blocked tile — try the next
    const mv = r.events[0] as Extract<GameEvent, { type: "moved" }>;
    hpLost += mv.poisonTaken ?? 0;
    s = r.state;
  }
  expect(hpLost).toBe(2);
  expect(s.expedition!.poisoned).toBeUndefined();
});

test("antidote: cures on the map (unengaged), rejects when not poisoned", () => {
  const r = reduce(onMap({ dmg: 1, ticks: 4 }), { type: "use-item", itemId: "antidote" });
  expect(r.events[0]).toMatchObject({ type: "item-used", defId: "antidote", cured: true });
  expect(r.state.expedition!.poisoned).toBeUndefined();
  expect(r.state.expedition!.loadout.battleItems).toEqual([]);
  expect(reduce(onMap(), { type: "use-item", itemId: "antidote" }).events[0]).toMatchObject({ type: "action-rejected", reason: "not-poisoned" });
});

test("antidote: mid-fight it cures without costing a turn", () => {
  const combat: Engagement = { at: { x: 17, y: 17 }, creature: "werewolf", monsterHp: 16, moveOnWin: false, damageAdd: 0, mitigationAdd: 0, startHp: 20, potionsUsed: 0 };
  const r = reduce(onMap({ dmg: 1, ticks: 4 }, undefined, combat), { type: "use-item", itemId: "antidote" });
  expect(r.state.expedition!.poisoned).toBeUndefined();
  expect(r.state.expedition!.hp).toBe(20);
  expect(r.events.some((e) => e.type === "provoked")).toBe(false);
});
