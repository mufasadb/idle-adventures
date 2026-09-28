// si7.6.9.1 (D97): alchemist flasks — the throw action.
import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { slotOf } from "../src/engine/catalog";
import { generateGrid } from "../src/engine/grid";
import { FLASK, FLASK_EFFECT, MONSTER_TIER_HP_CURVE, MONSTERS, MAP_WIDTH, MAP_HEIGHT } from "../src/data/constants";
import type { GameState, GameEvent, Engagement, Loadout } from "../src/engine/types";

const exchanged = (evs: GameEvent[]) => evs.filter((e) => e.type === "exchanged") as Extract<GameEvent, { type: "exchanged" }>[];

function state(opts: { combat?: Engagement; mapSeed?: string; pos?: { x: number; y: number }; mutate?: (l: Loadout) => void } = {}): GameState {
  const loadout = emptyLoadout();
  loadout.equipment.weapon = "sword";
  loadout.flasks = [{ defId: "fire-flask", qty: 4 }];
  opts.mutate?.(loadout);
  return {
    seed: "g", phase: "expedition", bank: [], loadout: emptyLoadout(),
    expedition: {
      mapSeed: opts.mapSeed ?? "m", pos: opts.pos ?? { x: 1, y: 1 }, energy: 100, hp: 30, loadout, carry: [], cleared: [],
      ...(opts.combat ? { combat: opts.combat } : {}),
    },
  };
}
const engagedOn = (creature: string, extra: Partial<Engagement> = {}): Engagement => ({
  at: { x: 1, y: 1 }, creature, monsterHp: MONSTER_TIER_HP_CURVE[MONSTERS[creature]!.tier]!, moveOnWin: false,
  damageAdd: 0, mitigationAdd: 0, startHp: 30, potionsUsed: 0, ...extra,
});

test("constants: every FLASK has an effect and packs as `flask`", () => {
  for (const id of FLASK) {
    expect(FLASK_EFFECT[id]).toBeDefined();
    expect(slotOf(id)).toBe("flask");
  }
});

test("throw: the fight's first strike, thrown, is a free opener — flat dmg, no retaliation, one flask spent", () => {
  const { state: s, events } = reduce(state({ combat: engagedOn("werewolf") }), { type: "throw", itemId: "fire-flask" });
  const [ex] = exchanged(events);
  expect(ex!.thrown).toBe("fire-flask");
  expect(ex!.dmgDealt).toBe(FLASK_EFFECT["fire-flask"]!.dmg);
  expect(ex!.dmgTaken).toBe(0);
  expect(s.expedition!.hp).toBe(30);
  expect(s.expedition!.loadout.flasks).toEqual([{ defId: "fire-flask", qty: 3 }]);
  expect(s.expedition!.combat!.struck).toBe(true);
});

test("throw: after the first strike a throw trades blows like a swing", () => {
  const { state: s, events } = reduce(state({ combat: engagedOn("werewolf", { struck: true }) }), { type: "throw", itemId: "fire-flask" });
  expect(exchanged(events)[0]!.dmgTaken).toBeGreaterThan(0);
  expect(s.expedition!.hp).toBeLessThan(30);
});

test("throw: a swing first spends the opener — the next throw is not free", () => {
  const swung = reduce(state({ combat: engagedOn("werewolf") }), { type: "fight" }).state;
  const { events } = reduce(swung, { type: "throw", itemId: "fire-flask" });
  expect(exchanged(events)[0]!.dmgTaken).toBeGreaterThan(0);
});

test("throw: ignores the weapon's coating — no charge spent — and the armour matrix", () => {
  const s0 = state({ combat: engagedOn("giant-scorpion") }); // plate
  s0.expedition!.weaponBuff = { id: "whetstone", charges: 3 };
  const { state: s, events } = reduce(s0, { type: "throw", itemId: "fire-flask" });
  expect(exchanged(events)[0]!.dmgDealt).toBe(FLASK_EFFECT["fire-flask"]!.dmg);
  expect(s.expedition!.weaponBuff).toEqual({ id: "whetstone", charges: 3 });
});

test("throw: a T1 falls to one fire flask; a flask-only fighter needs no weapon", () => {
  const s0 = state({ combat: engagedOn("forest-boar"), mutate: (l) => { l.equipment.weapon = null; } });
  const { state: s, events } = reduce(s0, { type: "throw", itemId: "fire-flask" });
  expect(events.some((e) => e.type === "fought" && e.victory)).toBe(true);
  expect(s.expedition!.combat).toBeUndefined();
});

test("throw: rejects with no flask held, a non-flask id, or a different tile while engaged", () => {
  const none = state({ combat: engagedOn("werewolf"), mutate: (l) => { l.flasks = []; } });
  expect(reduce(none, { type: "throw", itemId: "fire-flask" }).events[0]).toMatchObject({ type: "action-rejected", reason: "insufficient" });
  expect(reduce(state(), { type: "throw", itemId: "whetstone" }).events[0]).toMatchObject({ type: "action-rejected", reason: "wrong-slot" });
  expect(reduce(state({ combat: engagedOn("werewolf") }), { type: "throw", itemId: "fire-flask", at: { x: 2, y: 2 } }).events[0])
    .toMatchObject({ type: "action-rejected", reason: "engaged" });
});

test("throw: unengaged, it engages an ADJACENT monster from range (no step) and lands the free opener", () => {
  // find a live monster with a walkable neighbour on a real map
  for (let i = 0; i < 40; i++) {
    const mapSeed = `throw-${i}`;
    const g = generateGrid(mapSeed, "woodland");
    const poi = g.pois.find((p) => p.kind === "monster" && MONSTERS[p.creature!]!.tier >= 2 && p.x > 0 && p.y > 0 && p.x < MAP_WIDTH - 1 && p.y < MAP_HEIGHT - 1);
    if (!poi) continue;
    const from = { x: poi.x - 1, y: poi.y };
    const { state: s, events } = reduce(state({ mapSeed, pos: from }), { type: "throw", itemId: "fire-flask", at: { x: poi.x, y: poi.y } });
    expect(events[0]).toMatchObject({ type: "engaged", creature: poi.creature });
    expect(exchanged(events)[0]).toMatchObject({ thrown: "fire-flask", dmgTaken: 0 });
    expect(s.expedition!.pos).toEqual(from);
    // two tiles away is out of reach
    const far = reduce(state({ mapSeed, pos: { x: poi.x - 2, y: poi.y } }), { type: "throw", itemId: "fire-flask", at: { x: poi.x, y: poi.y } });
    expect(far.events[0]).toMatchObject({ type: "action-rejected", reason: "no-monster" });
    return;
  }
  throw new Error("no T2 monster found in scan range");
});
