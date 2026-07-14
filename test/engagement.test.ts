import { test, expect } from "bun:test";
import { scanForPoi, isTier1Monster } from "./helpers";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import type { Poi } from "../src/engine/grid";
import { damageTaken } from "../src/engine/combat";
import { PLAYER_BASE_HP, MAP_HEIGHT, QUAFF_ENERGY } from "../src/data/constants";
import type { GameState, GameEvent } from "../src/engine/types";

// Tier-1 only (landing-fix robustness): the bare-sword victory-loop test below
// assumes a winnable matchup. Filtering to tier 1 keeps that assumption true
// even if future seed/data shifts move which monster a scan lands on first —
// a tier-3+ find could otherwise flip the loop to a defeat.
const monsterMap = (): { seed: string; poi: Poi } => scanForPoi("eng-scan", isTier1Monster);

function onMonster(seed: string, poi: Poi, opts: { hp?: number; potions?: { defId: string; qty: number }[] } = {}): GameState {
  const loadout = emptyLoadout();
  loadout.equipment.weapon = "sword";
  loadout.potions = opts.potions ?? [];
  return {
    seed: "g", phase: "expedition", bank: [], loadout: emptyLoadout(),
    expedition: {
      mapSeed: seed, pos: { x: poi.x, y: poi.y }, energy: 300,
      hp: opts.hp ?? PLAYER_BASE_HP, loadout, carry: [], cleared: [],
    },
  };
}

const types = (evs: GameEvent[]) => evs.map((e) => e.type);

test("fight (not engaged) engages without an exchange", () => {
  const { seed, poi } = monsterMap();
  const { state, events } = reduce(onMonster(seed, poi), { type: "fight" });
  expect(types(events)).toEqual(["engaged"]);
  const combat = state.expedition!.combat!;
  expect(combat.creature).toBe(poi.creature!);
  expect(state.expedition!.hp).toBe(PLAYER_BASE_HP); // no blood yet
});

test("fight (engaged) runs exactly one exchange; loop reaches victory with loot", () => {
  const { seed, poi } = monsterMap();
  let s = reduce(onMonster(seed, poi), { type: "fight" }).state;
  let guard = 0;
  for (;;) {
    const r = reduce(s, { type: "fight" });
    s = r.state;
    expect(r.events[0]!.type).toBe("exchanged");
    if (types(r.events).includes("fought")) {
      const fought = r.events.find((e) => e.type === "fought") as Extract<GameEvent, { type: "fought" }>;
      expect(fought.victory).toBe(true);
      break;
    }
    if (++guard > 50) throw new Error("engagement never resolved");
  }
  expect(s.expedition!.combat).toBeUndefined();
  expect(s.expedition!.cleared).toContainEqual({ x: poi.x, y: poi.y });
});

test("non-combat actions reject 'engaged'; toggles stay legal", () => {
  const { seed, poi } = monsterMap();
  const s = reduce(onMonster(seed, poi), { type: "fight" }).state;
  for (const a of [{ type: "gather" }, { type: "eat" }, { type: "return" }, { type: "move", to: { x: poi.x, y: poi.y + 1 } }] as const) {
    const { events } = reduce(s, a as never);
    expect(events[0]).toMatchObject({ type: "action-rejected", reason: "engaged" });
  }
  expect(types(reduce(s, { type: "set-auto-eat-food", defId: "ration" }).events)).toEqual(["auto-eat-set"]);
  expect(types(reduce(s, { type: "toggle-auto-quaff" }).events)).toEqual(["auto-quaff-toggled"]);
});

test("flee: parting hit, monster resets, tile still blocked", () => {
  const { seed, poi } = monsterMap();
  const engaged = reduce(onMonster(seed, poi), { type: "fight" }).state;
  const expected = damageTaken(engaged.expedition!.loadout, poi.creature!, 0);
  const { state, events } = reduce(engaged, { type: "flee" });
  expect(events[0]).toMatchObject({ type: "fled", creature: poi.creature!, partingHit: expected });
  expect(state.expedition!.combat).toBeUndefined();
  expect(state.expedition!.hp).toBeCloseTo(PLAYER_BASE_HP - expected, 5);
  expect(state.expedition!.cleared).toEqual([]); // not cleared — still blocks
  const re = reduce(state, { type: "fight" }).state; // re-engaging finds FULL monster HP
  expect(re.expedition!.combat!.monsterHp).toBe(reduce(onMonster(seed, poi), { type: "fight" }).state.expedition!.combat!.monsterHp);
});

test("flee at low HP can soft-fail the run", () => {
  const { seed, poi } = monsterMap();
  const engaged = reduce(onMonster(seed, poi, { hp: 1 }), { type: "fight" }).state;
  const { state, events } = reduce(engaged, { type: "flee" });
  expect(types(events)).toEqual(["fled", "run-ended"]);
  expect(state.phase).toBe("town");
});

test("quaff heals mid-engagement without an exchange; works on the map for energy (82r)", () => {
  const { seed, poi } = monsterMap();
  const engaged = reduce(onMonster(seed, poi, { hp: 10, potions: [{ defId: "potion", qty: 1 }] }), { type: "fight" }).state;
  const { state, events } = reduce(engaged, { type: "quaff" });
  expect(events[0]).toMatchObject({ type: "quaffed", defId: "potion", healed: 10, hp: 20 });
  expect(state.expedition!.combat!.monsterHp).toBe(engaged.expedition!.combat!.monsterHp); // no exchange
  expect((events[0] as { energy?: number }).energy).toBeUndefined(); // in-combat quaff spends no energy (its cost is tempo)
  // Out of combat (82r): quaff heals between fights and costs QUAFF_ENERGY.
  const hurt = onMonster(seed, poi, { hp: 10, potions: [{ defId: "potion", qty: 1 }] });
  // auto-eat off by default (no autoEatFood) — energy arithmetic stays bare
  const before = hurt.expedition!.energy;
  const outside = reduce(hurt, { type: "quaff" });
  expect(outside.events[0]).toMatchObject({ type: "quaffed", defId: "potion", healed: 10, hp: 20, energy: before - QUAFF_ENERGY });
  expect(outside.state.expedition!.energy).toBe(before - QUAFF_ENERGY);
  expect(outside.state.expedition!.combat).toBeUndefined();
  // Full HP still rejects; an exhausted player can't quaff on the map.
  const full = reduce(onMonster(seed, poi, { potions: [{ defId: "potion", qty: 1 }] }), { type: "quaff" });
  expect(full.events[0]).toMatchObject({ type: "action-rejected", reason: "insufficient" });
  const tired = onMonster(seed, poi, { hp: 10, potions: [{ defId: "potion", qty: 1 }] });
  tired.expedition!.energy = QUAFF_ENERGY - 1;
  expect(reduce(tired, { type: "quaff" }).events[0]).toMatchObject({ type: "action-rejected", reason: "exhausted" });
});

test("move onto a live monster engages (moveOnWin) instead of resolving", () => {
  const { seed, poi } = monsterMap();
  const s = onMonster(seed, poi);
  s.expedition!.pos = { x: poi.x, y: poi.y + 1 }; // stand adjacent (may be off-map bottom edge — see check below)
  if (poi.y + 1 >= MAP_HEIGHT) throw new Error(`pathological POI placement: y=${poi.y} has no tile below (MAP_HEIGHT=${MAP_HEIGHT}) — re-seed monsterMap`);
  const { state, events } = reduce(s, { type: "move", to: { x: poi.x, y: poi.y } });
  expect(types(events)).toEqual(["engaged"]);
  expect(state.expedition!.pos).toEqual({ x: poi.x, y: poi.y + 1 }); // did not move
  expect(state.expedition!.combat!.moveOnWin).toBe(true);
});
