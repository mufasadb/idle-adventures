import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { generateGrid, rollBiome } from "../src/engine/grid";
import type { Grid, Poi } from "../src/engine/grid";
import { resolveCombat, rollLoot, explainMatchup } from "../src/engine/combat";
import { PLAYER_BASE_HP, BASE_CARRY_SLOTS } from "../src/data/constants";
import type { GameState, GameEvent, Loadout } from "../src/engine/types";

// Combat is no longer atomic (si7.1): `fight` engages, then each subsequent
// `fight` runs ONE exchange via strikeExchange. This loops fight-to-resolution
// so these tests can keep asserting on the terminal outcome exactly as the old
// atomic API did — the accumulated events are all exposed for callers that
// want to inspect the engage/exchange trail too.
function fightToEnd(state: GameState): { state: GameState; events: GameEvent[] } {
  let s = reduce(state, { type: "fight" });
  const all = [...s.events];
  let guard = 0;
  while (s.state.expedition?.combat && ++guard < 100) {
    s = reduce(s.state, { type: "fight" });
    all.push(...s.events);
  }
  return { state: s.state, events: all };
}

function mapWithMonster(creature?: string): { seed: string; grid: Grid; poi: Poi } {
  for (let i = 0; i < 500; i++) {
    const seed = `m4-scan-${i}`;
    const grid = generateGrid(seed, rollBiome(seed));
    const poi = grid.pois.find(
      (p) => p.kind === "monster" && (creature === undefined || p.creature === creature),
    );
    if (poi) return { seed, grid, poi };
  }
  throw new Error(`no map with monster ${creature ?? "(any)"} in scan range`);
}

function atMonster(seed: string, poi: Poi, mutate?: (loadout: Loadout) => void, hp = PLAYER_BASE_HP): GameState {
  const loadout = emptyLoadout();
  loadout.equipment.weapon = "sword";
  mutate?.(loadout);
  return {
    seed: "g",
    phase: "expedition",
    bank: [],
    loadout: emptyLoadout(),
    expedition: {
      mapSeed: seed,
      pos: { x: poi.x, y: poi.y },
      energy: 50,
      hp,
      loadout,
      carry: [],
      cleared: [],
    },
  };
}

test("fight: victory drains HP, consumes the monster, loots into carry", () => {
  const { seed, poi } = mapWithMonster("forest-boar"); // tier 1 — a sword wins this
  const before = atMonster(seed, poi);
  const expected = resolveCombat(before.expedition!.loadout, PLAYER_BASE_HP, poi.creature!);
  const loot = rollLoot(before.seed, poi.creature!, { x: poi.x, y: poi.y });
  expect(expected.victory).toBe(true);
  const { state, events } = fightToEnd(before);
  expect(state.phase).toBe("expedition");
  expect(state.expedition!.hp).toBe(expected.hpAfter);
  expect(state.expedition!.carry).toEqual(loot);
  expect(state.expedition!.cleared).toEqual([{ x: poi.x, y: poi.y }]);
  expect(state.expedition!.energy).toBe(50); // fight costs no energy
  expect(state.expedition!.combat).toBeUndefined();
  const fought = events.find((e) => e.type === "fought") as Extract<GameEvent, { type: "fought" }>;
  expect(fought).toEqual({
    type: "fought",
    at: { x: poi.x, y: poi.y },
    creature: poi.creature!,
    victory: true,
    hpLost: expected.hpLost,
    potionsUsed: 0,
    loot,
    hp: expected.hpAfter,
    matchup: explainMatchup(before.expedition!.loadout, poi.creature!),
  });
});

test("fight: a cleared monster is gone", () => {
  const { seed, poi } = mapWithMonster("forest-boar"); // must WIN the first fight to test re-fighting
  const won = fightToEnd(atMonster(seed, poi)).state;
  const { events } = reduce(won, { type: "fight" });
  expect(events).toEqual([
    { type: "action-rejected", action: "fight", reason: "no-monster" },
  ]);
});

test("fight: HP 0 soft-fails — run ends, carry is KEPT in the bank (bead acceptance)", () => {
  const { seed, poi } = mapWithMonster("ice-troll"); // tier 3
  const before = atMonster(seed, poi, (l) => { l.equipment.weapon = null; }, 3); // naked, 3 hp
  before.expedition!.carry = [{ defId: "silver-ore", qty: 3 }];
  const { state, events } = fightToEnd(before);
  expect(state.phase).toBe("town");
  expect(state.expedition).toBeNull();
  expect(state.bank.some((s) => s.defId === "silver-ore" && s.qty === 3)).toBe(true);
  const types = events.map((e) => e.type);
  expect(types[types.length - 2]).toBe("fought");
  expect(types[types.length - 1]).toBe("run-ended");
  const fought = events.find((e) => e.type === "fought");
  expect(fought).toMatchObject({ victory: false, loot: [] });
  const runEnded = events.find((e) => e.type === "run-ended");
  expect(runEnded).toEqual({ type: "run-ended", reason: "defeated" });
});

test("fight: pre-fight carry check — full slots reject before any HP is spent", () => {
  const { seed, poi } = mapWithMonster();
  const before = atMonster(seed, poi, (l) => {
    l.food = Array.from({ length: BASE_CARRY_SLOTS }, (_, i) => ({ defId: `r-${i}`, qty: 1 }));
  });
  const { state, events } = reduce(before, { type: "fight" });
  expect(state).toEqual(before);
  expect(events).toEqual([
    { type: "action-rejected", action: "fight", reason: "carry-full" },
  ]);
});

test("fight: empty tile / non-monster tile rejects", () => {
  const { seed, grid, poi } = mapWithMonster();
  const state = atMonster(seed, poi);
  let empty: { x: number; y: number } | null = null;
  outer: for (let y = 0; y < grid.terrain.length; y++) {
    for (let x = 0; x < grid.terrain.length; x++) {
      if (!grid.pois.some((p) => p.x === x && p.y === y)) { empty = { x, y }; break outer; }
    }
  }
  state.expedition!.pos = empty!;
  const { events } = reduce(state, { type: "fight" });
  expect(events).toEqual([
    { type: "action-rejected", action: "fight", reason: "no-monster" },
  ]);
});

test("fight: rejected in town", () => {
  const town: GameState = { seed: "g", phase: "town", bank: [], loadout: emptyLoadout(), expedition: null };
  const { events } = reduce(town, { type: "fight" });
  expect(events).toEqual([
    { type: "action-rejected", action: "fight", reason: "not-on-expedition" },
  ]);
});

test("fight: defeat banks only the UNSPENT potions (quaffed ones are gone)", () => {
  const { seed, poi } = mapWithMonster("ice-troll"); // lethal without gear
  const before = atMonster(seed, poi, (l) => {
    l.equipment.weapon = null; // unarmed → guaranteed defeat
    l.equipment.backpack = "leather"; // room for loot so the fit-check passes (pqp: potions now cost slots)
    l.potions = [{ defId: "healing-potion", qty: 3 }];
  }); // si7.1: starting at 12 HP now dies on the FIRST hit (14 dmgIn, bare
  // kit) before the auto-quaff check runs. PLAYER_BASE_HP (the atMonster
  // default) still crosses the threshold mid-fight so potionsUsed > 0, while
  // unarmed-vs-ice-troll remains a guaranteed eventual defeat.
  const expected = resolveCombat(before.expedition!.loadout, PLAYER_BASE_HP, "ice-troll");
  expect(expected.victory).toBe(false);
  expect(expected.potionsUsed).toBeGreaterThan(0);
  const { state } = fightToEnd(before);
  expect(state.phase).toBe("town");
  const banked = state.bank.find((s) => s.defId === "healing-potion");
  expect(banked?.qty ?? 0).toBe(3 - expected.potionsUsed);
});

test("fight: same seed same outcome; input not mutated (bead acceptance)", () => {
  const { seed, poi } = mapWithMonster();
  const a = atMonster(seed, poi);
  const before = structuredClone(a);
  const r1 = reduce(a, { type: "fight" });
  expect(a).toEqual(before);
  expect(r1).toEqual(reduce(atMonster(seed, poi), { type: "fight" }));
});

test("engagement: same seed same outcome across the WHOLE fight-to-end trail", () => {
  const { seed, poi } = mapWithMonster("forest-boar");
  const a = atMonster(seed, poi);
  const before = structuredClone(a);
  const r1 = fightToEnd(a);
  expect(a).toEqual(before); // engage-time reduce never mutates its input
  expect(r1).toEqual(fightToEnd(atMonster(seed, poi)));
});

// Move-into-monster (2026-07-05): monsters block their tile; walking onto a live
// monster forces the fight instead of a step, so routing around is a real choice.
// si7.1: the walk-in now ENGAGES (moveOnWin: true) rather than resolving inline —
// fightToEnd loops the engagement to the same terminal outcome.
test("move: walking onto a live monster engages (moveOnWin), win takes the tile", () => {
  const { seed, poi } = mapWithMonster();
  // stand one tile to the left of the monster, fully plated so we win
  const plate = (l: Loadout) => {
    l.equipment.helmet = "mithril-plate-helmet"; l.equipment.chest = "mithril-plate-chest";
    l.equipment.legs = "mithril-plate-legs"; l.equipment.boots = "mithril-plate-boots";
    l.equipment.gloves = "mithril-plate-gloves"; l.equipment.weapon = "mithril-sword";
  };
  const base = atMonster(seed, poi, plate);
  const adj: GameState = { ...base, expedition: { ...base.expedition!, pos: { x: poi.x - 1, y: poi.y } } };
  const engaged = reduce(adj, { type: "move", to: { x: poi.x, y: poi.y } });
  expect(engaged.events).toEqual([
    { type: "engaged", at: { x: poi.x, y: poi.y }, creature: poi.creature!, monsterHp: engaged.state.expedition!.combat!.monsterHp },
  ]);
  expect(engaged.state.expedition!.pos).toEqual({ x: poi.x - 1, y: poi.y }); // did not move yet
  expect(engaged.state.expedition!.energy).toBe(50); // no energy cost to engage
  let s = engaged.state;
  const all: GameEvent[] = [...engaged.events];
  let guard = 0;
  while (s.expedition?.combat && ++guard < 100) {
    const r = reduce(s, { type: "fight" });
    s = r.state;
    all.push(...r.events);
  }
  expect(all.some((e) => e.type === "fought")).toBe(true);
  expect(all.some((e) => e.type === "moved")).toBe(false); // it's a fight, not a step
  expect(s.expedition!.energy).toBe(50); // combat spends HP, not energy
  expect(s.expedition!.pos).toEqual({ x: poi.x, y: poi.y }); // won → now on the tile
  expect(s.expedition!.cleared).toContainEqual({ x: poi.x, y: poi.y });
});

test("move: losing the walk-in fight soft-fails the run (keeps the haul)", () => {
  const { seed, poi } = mapWithMonster("ice-troll"); // tier-3, lethal unarmoured
  const base = atMonster(seed, poi); // basic sword, no armour, no potions
  const adj: GameState = { ...base, expedition: { ...base.expedition!, pos: { x: poi.x - 1, y: poi.y }, carry: [{ defId: "iron-ore", qty: 2 }] } };
  const engaged = reduce(adj, { type: "move", to: { x: poi.x, y: poi.y } });
  expect(engaged.events).toEqual([
    { type: "engaged", at: { x: poi.x, y: poi.y }, creature: poi.creature!, monsterHp: engaged.state.expedition!.combat!.monsterHp },
  ]);
  let s = engaged.state;
  const all: GameEvent[] = [...engaged.events];
  let guard = 0;
  while (s.expedition?.combat && ++guard < 100) {
    const r = reduce(s, { type: "fight" });
    s = r.state;
    all.push(...r.events);
  }
  expect(all.some((e) => e.type === "run-ended")).toBe(true);
  expect(s.phase).toBe("town");
  expect(s.bank).toContainEqual({ defId: "iron-ore", qty: 2 }); // haul kept on soft-fail
});
