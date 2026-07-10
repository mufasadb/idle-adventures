import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { damageTaken } from "../src/engine/combat";
import { emptyLoadout } from "../src/engine/loadout";
import type { GameState, Action, Engagement, GameEvent } from "../src/engine/types";

// 67e: in-fight decision texture — an auto-finish toggle, and every non-flee action
// while engaged costs a turn (the monster lands one hit).

function engaged(opts: {
  hp?: number; monsterHp?: number; autoFinish?: boolean;
  carry?: { defId: string; qty: number }[];
  mutateLoadout?: (l: ReturnType<typeof emptyLoadout>) => void;
  combat?: Partial<Engagement>;
} = {}): GameState {
  const loadout = emptyLoadout();
  loadout.equipment.weapon = "sword";
  opts.mutateLoadout?.(loadout);
  const combat: Engagement = {
    at: { x: 5, y: 4 }, creature: "forest-boar", monsterHp: opts.monsterHp ?? 20,
    moveOnWin: false, damageAdd: 0, mitigationAdd: 0, startHp: opts.hp ?? 30, potionsUsed: 0,
    ...opts.combat,
  };
  return {
    seed: "ct", phase: "expedition", bank: [], loadout: emptyLoadout(),
    expedition: {
      mapSeed: "m", pos: { x: 5, y: 5 }, energy: 100, hp: opts.hp ?? 30, loadout,
      carry: opts.carry ?? [], cleared: [], combat,
      ...(opts.autoFinish !== undefined ? { autoFinish: opts.autoFinish } : {}),
    },
  } as GameState;
}
const ev = (r: { events: GameEvent[] }, t: string) => r.events.find((e) => e.type === t);

test("toggle-auto-finish: flips the flag + emits the event", () => {
  const r = reduce(engaged(), { type: "toggle-auto-finish" } as Action);
  expect(r.state.expedition!.autoFinish).toBe(true);
  expect(ev(r, "auto-finish-toggled")).toMatchObject({ on: true });
  const back = reduce(r.state, { type: "toggle-auto-finish" } as Action);
  expect(back.state.expedition!.autoFinish).toBe(false);
});

test("auto-finish ON: fight resolves the WHOLE fight to victory in one action", () => {
  const r = reduce(engaged({ autoFinish: true, monsterHp: 20, hp: 30 }), { type: "fight" });
  expect(r.state.expedition!.combat).toBeUndefined(); // fight is over
  const fought = ev(r, "fought") as Extract<GameEvent, { type: "fought" }>;
  expect(fought.victory).toBe(true);
  expect(fought.rounds).toBeGreaterThan(1); // it collapsed multiple rounds
  expect(r.events.filter((e) => e.type === "exchanged")).toHaveLength(0); // no per-round spam
});

test("auto-finish ON: an unwinnable fight resolves to defeat (soft-fail)", () => {
  // 1 HP vs a full-HP boar, no armour — the loop runs us to defeat, ON means ON.
  const r = reduce(engaged({ autoFinish: true, hp: 1, monsterHp: 999 }), { type: "fight" });
  expect(r.state.phase).toBe("town");
  expect(ev(r, "run-ended")).toMatchObject({ reason: "defeated" });
});

test("auto-finish OFF: fight is a single round (still engaged)", () => {
  const r = reduce(engaged({ autoFinish: false, monsterHp: 999 }), { type: "fight" });
  expect(r.state.expedition!.combat).toBeDefined(); // one exchange, not resolved
  expect(ev(r, "exchanged")).toBeDefined();
});

test("gear-swap while engaged: succeeds, changes gear, costs one monster hit", () => {
  const s = engaged({ hp: 30, carry: [{ defId: "light-helmet", qty: 1 }] });
  const r = reduce(s, { type: "don", itemId: "light-helmet" } as Action);
  expect(r.state.expedition!.loadout.equipment.helmet).toBe("light-helmet"); // swap applied
  const prov = ev(r, "provoked") as Extract<GameEvent, { type: "provoked" }>;
  expect(prov.creature).toBe("forest-boar"); // took a turn
  expect(prov.hit).toBeGreaterThan(0);
  expect(r.state.expedition!.hp).toBe(prov.hp); // hp is exactly what the retaliation left
  expect(r.state.expedition!.hp).toBeLessThan(30);
  expect(r.state.expedition!.combat).toBeDefined(); // still engaged
});

test("gear-swap while engaged can soft-fail if the hit downs you", () => {
  const r = reduce(engaged({ hp: 1, carry: [{ defId: "light-helmet", qty: 1 }] }), { type: "don", itemId: "light-helmet" } as Action);
  expect(r.state.phase).toBe("town");
  expect(ev(r, "run-ended")).toMatchObject({ reason: "defeated" });
});

test("coat (enhance) while engaged costs a turn (D60 reversal)", () => {
  const s = engaged({ hp: 30, mutateLoadout: (l) => { l.enhancements = [{ defId: "whetstone", qty: 1 }]; } });
  const boarHit = damageTaken(s.expedition!.loadout, "forest-boar", 0);
  const r = reduce(s, { type: "enhance", id: "whetstone" } as Action);
  expect(r.state.expedition!.weaponBuff?.id).toBe("whetstone"); // coating applied
  expect(ev(r, "provoked")).toBeDefined(); // now provokes (was free pre-67e)
  expect(r.state.expedition!.hp).toBe(Math.max(0, 30 - boarHit));
});

test("manual potion while engaged heals AND costs a turn", () => {
  const s = engaged({ hp: 10, mutateLoadout: (l) => { l.potions = [{ defId: "potion", qty: 1 }]; } });
  const r = reduce(s, { type: "quaff" });
  expect(ev(r, "quaffed")).toBeDefined();
  expect(ev(r, "provoked")).toBeDefined();
  expect(r.state.expedition!.hp).toBeLessThan(30); // healed then hit
});
