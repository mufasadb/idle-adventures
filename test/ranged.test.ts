// Ranged combat — bow + ammo (D45). Covers the spec's Testing section:
import { scanForPoi, isTier1Monster, isInterior } from "./helpers";
// docs/superpowers/specs/2026-07-07-ranged-combat-bow-ammo-design.md
import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { generateGrid, rollBiome } from "../src/engine/grid";
import type { Poi } from "../src/engine/grid";
import { playerDamage, damageTaken } from "../src/engine/combat";
import { consumableSlots, stackCapOf } from "../src/engine/carry";
import { packItem, reserveLoadout } from "../src/engine/pack";
import { endExpedition } from "../src/engine/bank";
import { legalActions } from "../src/sim/legal";
import { localMap } from "../src/engine/town";
import {
  PLAYER_BASE_HP,
  MAP_WIDTH,
  MAP_HEIGHT,
  MONSTERS,
  WEAPONS,
  DMG_ARMOUR_MATRIX,
  UNARMED_DAMAGE,
  CHIP_DAMAGE_MIN,
  ARROW_STACK_CAP,
  ARROWS_PER_CRAFT,
  RECIPE,
  MAX_ENERGY,
} from "../src/data/constants";
import type { GameState, GameEvent, ItemStack } from "../src/engine/types";

// Seed-scan for a tier-1 monster with all 8 neighbours IN BOUNDS (we stand on
// each of them in the adjacency sweep) — mirrors monsterMap in engagement.test.ts.
const monsterMap = (): { seed: string; poi: Poi } => scanForPoi("ranged-scan", (p) => isTier1Monster(p) && isInterior(p));

// Hand-built state standing ADJACENT to the monster (default: below it) with a
// bow wielded and arrows held — the ranged-engage fixture.
function bowman(
  seed: string,
  poi: Poi,
  opts: { pos?: { x: number; y: number }; weapon?: string | null; ammo?: ItemStack[]; hp?: number } = {},
): GameState {
  const loadout = emptyLoadout();
  loadout.equipment.weapon = opts.weapon === undefined ? "bow" : opts.weapon;
  loadout.ammo = opts.ammo ?? [{ defId: "arrows", qty: 10 }];
  return {
    seed: "g", phase: "expedition", bank: [], loadout: emptyLoadout(),
    expedition: {
      mapSeed: seed, pos: opts.pos ?? { x: poi.x, y: poi.y + 1 }, energy: MAX_ENERGY,
      hp: opts.hp ?? PLAYER_BASE_HP, loadout, carry: [], cleared: [],
    },
  };
}

test("ranged engage works from every adjacent direction; no relocation, no blood", () => {
  const { seed, poi } = monsterMap();
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const pos = { x: poi.x + dx, y: poi.y + dy };
      const { state, events } = reduce(bowman(seed, poi, { pos }), { type: "fight", at: { x: poi.x, y: poi.y } });
      expect(events[0]).toMatchObject({ type: "engaged", creature: poi.creature!, ranged: true });
      const combat = state.expedition!.combat!;
      expect(combat.ranged).toBe(true);
      expect(combat.opener).toBe(true);
      expect(combat.moveOnWin).toBe(false); // you never stepped in
      expect(state.expedition!.pos).toEqual(pos); // did not move
      expect(state.expedition!.hp).toBe(PLAYER_BASE_HP); // engage draws no blood
    }
  }
});

test("opener skips exactly ONE retaliation, then exchanges bite as normal", () => {
  const { seed, poi } = monsterMap();
  const engaged = reduce(bowman(seed, poi), { type: "fight", at: { x: poi.x, y: poi.y } }).state;
  // Tier-1 HP (8) survives one bow hit vs any hide (max 3 × 1.5 = 4.5), so the
  // first exchange always has a retaliation TO skip.
  const first = reduce(engaged, { type: "fight" });
  expect(first.events[0]).toMatchObject({ type: "exchanged", dmgTaken: 0, arrowSpent: true });
  expect(first.state.expedition!.hp).toBe(PLAYER_BASE_HP); // untouched through the opener
  expect(first.state.expedition!.combat!.opener).toBe(false); // spent
  const second = reduce(first.state, { type: "fight" });
  const ex = second.events[0] as Extract<GameEvent, { type: "exchanged" }>;
  expect(ex.type).toBe("exchanged");
  if (second.state.expedition?.combat) {
    // monster still alive after round 2 → it answered this time
    expect(ex.dmgTaken).toBe(damageTaken(engaged.expedition!.loadout, poi.creature!, 0));
  }
});

test("arrow spend: one per exchange, FIFO off the front stack (walk-in fights included)", () => {
  const { seed, poi } = monsterMap();
  // Standing ON the monster tile (walk-in style engage): the bow still shoots.
  const s0 = bowman(seed, poi, { pos: { x: poi.x, y: poi.y }, ammo: [{ defId: "arrows", qty: 1 }, { defId: "arrows", qty: 3 }] });
  const engaged = reduce(s0, { type: "fight" }).state;
  expect(engaged.expedition!.combat!.ranged).toBeUndefined(); // own-tile engage is NOT ranged — no opener
  const { state, events } = reduce(engaged, { type: "fight" });
  expect(events[0]).toMatchObject({ type: "exchanged", arrowSpent: true });
  // front stack (qty 1) emptied and shifted; second stack untouched — FIFO
  expect(state.expedition!.loadout.ammo).toEqual([{ defId: "arrows", qty: 3 }]);
});

test("arrows out: the bow is a club (UNARMED_DAMAGE), fight never soft-locks", () => {
  const { seed, poi } = monsterMap();
  const noAmmo = emptyLoadout();
  noAmmo.equipment.weapon = "bow";
  expect(playerDamage(noAmmo, poi.creature!)).toBe(Math.max(CHIP_DAMAGE_MIN, UNARMED_DAMAGE));
  // Last arrow: the exchange that spends it deals full bow damage; the NEXT one clubs.
  const engaged = reduce(bowman(seed, poi, { ammo: [{ defId: "arrows", qty: 1 }] }), { type: "fight", at: { x: poi.x, y: poi.y } }).state;
  const first = reduce(engaged, { type: "fight" });
  const bowDmg = WEAPONS.bow!.damage * DMG_ARMOUR_MATRIX.ranged[MONSTERS[poi.creature!]!.armourType];
  expect(first.events[0]).toMatchObject({ type: "exchanged", dmgDealt: Math.max(CHIP_DAMAGE_MIN, bowDmg), arrowSpent: true });
  expect(first.state.expedition!.loadout.ammo).toEqual([]);
  if (first.state.expedition?.combat) {
    const second = reduce(first.state, { type: "fight" });
    const ex = second.events[0] as Extract<GameEvent, { type: "exchanged" }>;
    expect(ex.dmgDealt).toBe(Math.max(CHIP_DAMAGE_MIN, UNARMED_DAMAGE)); // club
    expect(ex.arrowSpent).toBeUndefined(); // nothing left to spend
  }
});

test("ranged-engage rejections: no bow / no arrows → missing-tool; non-adjacent or empty tile → no-monster", () => {
  const { seed, poi } = monsterMap();
  const at = { x: poi.x, y: poi.y };
  // sword + arrows: not a bow
  const sworded = reduce(bowman(seed, poi, { weapon: "sword" }), { type: "fight", at });
  expect(sworded.events[0]).toMatchObject({ type: "action-rejected", action: "fight", reason: "missing-tool" });
  // bow + empty quiver
  const dry = reduce(bowman(seed, poi, { ammo: [] }), { type: "fight", at });
  expect(dry.events[0]).toMatchObject({ type: "action-rejected", action: "fight", reason: "missing-tool" });
  // rejected actions return the ORIGINAL state (same reference, no mutation)
  const before = bowman(seed, poi, { ammo: [] });
  expect(reduce(before, { type: "fight", at }).state).toBe(before);
  // non-adjacent target (2 tiles away)
  const far = bowman(seed, poi, { pos: { x: poi.x, y: poi.y + 1 } });
  expect(reduce(far, { type: "fight", at: { x: poi.x, y: poi.y - 1 } }).events[0]).toMatchObject({ type: "action-rejected", reason: "no-monster" });
  // adjacent but no monster there: aim back at our own previous tile's neighbour
  const grid = generateGrid(seed, rollBiome(seed));
  const empty = [{ dx: -1, dy: 1 }, { dx: 1, dy: 1 }, { dx: 0, dy: 1 }].find(({ dx, dy }) => {
    const x = poi.x + dx, y = poi.y + dy;
    return x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT && !grid.pois.some((p) => p.x === x && p.y === y);
  });
  if (empty) {
    const target = { x: poi.x + empty.dx, y: poi.y + empty.dy };
    const st = bowman(seed, poi, { pos: { x: poi.x, y: poi.y + 1 } });
    // only test when actually adjacent to our fixture position
    if (Math.max(Math.abs(target.x - poi.x), Math.abs(target.y - (poi.y + 1))) <= 1) {
      expect(reduce(st, { type: "fight", at: target }).events[0]).toMatchObject({ type: "action-rejected", reason: "no-monster" });
    }
  }
});

test("ranged win clears the tile, rolls loot, and does NOT relocate", () => {
  const { seed, poi } = monsterMap();
  const pos = { x: poi.x, y: poi.y + 1 };
  let s = reduce(bowman(seed, poi, { pos }), { type: "fight", at: { x: poi.x, y: poi.y } }).state;
  let guard = 0;
  for (;;) {
    const r = reduce(s, { type: "fight" });
    s = r.state;
    const fought = r.events.find((e) => e.type === "fought") as Extract<GameEvent, { type: "fought" }> | undefined;
    if (fought) {
      expect(fought.victory).toBe(true); // opener + ranged vs tier-1 with 10 arrows is winnable
      break;
    }
    if (++guard > 50) throw new Error("ranged engagement never resolved");
  }
  expect(s.expedition!.pos).toEqual(pos); // stayed put — you never stepped in
  expect(s.expedition!.cleared).toContainEqual({ x: poi.x, y: poi.y });
  expect(s.expedition!.combat).toBeUndefined();
});

test("a fight at a DIFFERENT tile mid-engagement is rejected 'engaged'; same tile just swings", () => {
  const { seed, poi } = monsterMap();
  const engaged = reduce(bowman(seed, poi), { type: "fight", at: { x: poi.x, y: poi.y } }).state;
  const elsewhere = reduce(engaged, { type: "fight", at: { x: poi.x - 1, y: poi.y } });
  expect(elsewhere.events[0]).toMatchObject({ type: "action-rejected", action: "fight", reason: "engaged" });
  expect(elsewhere.state).toBe(engaged);
  const same = reduce(engaged, { type: "fight", at: { x: poi.x, y: poi.y } });
  expect(same.events[0]!.type).toBe("exchanged");
});

test("ammo slot math: ceil(units/ARROW_STACK_CAP); stackCapOf(arrows) = ARROW_STACK_CAP", () => {
  expect(stackCapOf("arrows")).toBe(ARROW_STACK_CAP);
  const l = emptyLoadout();
  expect(consumableSlots(l)).toBe(0);
  l.ammo = [{ defId: "arrows", qty: ARROW_STACK_CAP }];
  expect(consumableSlots(l)).toBe(1); // exactly one full stack = 1 slot
  l.ammo = [{ defId: "arrows", qty: ARROW_STACK_CAP + 1 }];
  expect(consumableSlots(l)).toBe(2); // one over → second slot opens
  l.ammo = [{ defId: "arrows", qty: 2 * ARROW_STACK_CAP }];
  expect(consumableSlots(l)).toBe(2);
  l.food = [{ defId: "ration", qty: 3 }]; // other consumables still 1 unit = 1 slot
  expect(consumableSlots(l)).toBe(5);
});

test("pack: 'ammo' slot packs like potions (unit-append, merged stack), validated against bank", () => {
  const l = emptyLoadout();
  const bank = [{ defId: "arrows", qty: 2 }];
  const once = packItem(l, bank, "ammo", "arrows");
  expect(once.ok).toBe(true);
  if (!once.ok) return;
  expect(once.loadout.ammo).toEqual([{ defId: "arrows", qty: 1 }]);
  const twice = packItem(once.loadout, bank, "ammo", "arrows");
  expect(twice.ok).toBe(true);
  if (!twice.ok) return;
  expect(twice.loadout.ammo).toEqual([{ defId: "arrows", qty: 2 }]); // merged, not a new stack
  expect(packItem(twice.loadout, bank, "ammo", "arrows")).toEqual({ ok: false, reason: "insufficient" }); // bank has 2
  expect(packItem(l, bank, "ammo", "potion")).toEqual({ ok: false, reason: "wrong-slot" }); // only AMMO defIds
  expect(reserveLoadout(twice.loadout)).toContainEqual({ defId: "arrows", qty: 2 }); // embark will debit them
});

test("pack/bank round-trip: packed arrows debit at embark; unspent arrows bank back at return", () => {
  let s: GameState = { seed: "rt", phase: "town", bank: [{ defId: "arrows", qty: 5 }], loadout: emptyLoadout(), expedition: null };
  for (let i = 0; i < 3; i++) s = reduce(s, { type: "pack", slot: "ammo", itemId: "arrows" }).state;
  expect(s.loadout.ammo).toEqual([{ defId: "arrows", qty: 3 }]);
  const offer = localMap(s.seed, 0);
  s = reduce(s, { type: "embark", mapSeed: offer.mapSeed }).state;
  expect(s.bank).toContainEqual({ defId: "arrows", qty: 2 }); // 5 packed-3 = 2 left home
  expect(s.expedition!.loadout.ammo).toEqual([{ defId: "arrows", qty: 3 }]);
  s = reduce(s, { type: "return" }).state;
  expect(s.phase).toBe("town");
  expect(s.bank).toContainEqual({ defId: "arrows", qty: 5 }); // all unspent — full round trip
});

test("endExpedition banks unspent arrows on the soft-fail path too", () => {
  const l = emptyLoadout();
  l.ammo = [{ defId: "arrows", qty: 7 }];
  const s: GameState = {
    seed: "g", phase: "expedition", bank: [], loadout: emptyLoadout(),
    expedition: { mapSeed: "m", pos: { x: 0, y: 0 }, energy: 0, hp: 0, loadout: l, carry: [], cleared: [] },
  };
  const ended = endExpedition(s, s.expedition!);
  expect(ended.bank).toContainEqual({ defId: "arrows", qty: 7 });
});

test("legalActions surfaces `fight at` for the adjacent monster (and only with bow + arrows)", () => {
  const { seed, poi } = monsterMap();
  const armed = bowman(seed, poi);
  const shot = legalActions(armed).find((a) => a.type === "fight" && a.at !== undefined);
  expect(shot).toEqual({ type: "fight", at: { x: poi.x, y: poi.y } });
  const unarmed = bowman(seed, poi, { weapon: "sword" });
  expect(legalActions(unarmed).some((a) => a.type === "fight" && a.at !== undefined)).toBe(false);
  const dry = bowman(seed, poi, { ammo: [] });
  expect(legalActions(dry).some((a) => a.type === "fight" && a.at !== undefined)).toBe(false);
});

// --- Recipes (D45): the pick-free acquisition line -------------------------
test("recipes: bowstring ← stringybark×2; arrows craft in ARROWS_PER_CRAFT batches from three pick-free inputs", () => {
  expect(RECIPE.bowstring!.inputs).toEqual([{ defId: "stringybark", qty: 2 }]);
  expect(RECIPE.arrows!.output).toEqual({ defId: "arrows", qty: ARROWS_PER_CRAFT });
  expect(RECIPE.arrows!.inputs).toEqual([
    { defId: "pine-log", qty: 1 },
    { defId: "flint", qty: 1 },
    { defId: "feather", qty: 1 },
  ]);
});

test("recipes: bow/composite-bow REWORKED — bowstring replaces deer-hide (D45 spec input swap)", () => {
  // Premise change per docs/superpowers/specs/2026-07-07-ranged-combat-bow-ammo-design.md:
  // string replaces hide so the whole bow line never runs through the pick ladder.
  expect(RECIPE.bow!.inputs).toEqual([{ defId: "oak-log", qty: 2 }, { defId: "bowstring", qty: 1 }]);
  expect(RECIPE["composite-bow"]!.inputs).toEqual([{ defId: "ironwood-log", qty: 2 }, { defId: "bowstring", qty: 1 }]);
});

test("craft chain: bark → bowstring → bow, end to end through reduce", () => {
  let s: GameState = { seed: "c", phase: "town", bank: [{ defId: "stringybark", qty: 2 }, { defId: "oak-log", qty: 2 }], loadout: emptyLoadout(), expedition: null };
  s = reduce(s, { type: "craft", recipeId: "bowstring" }).state;
  expect(s.bank).toContainEqual({ defId: "bowstring", qty: 1 });
  s = reduce(s, { type: "craft", recipeId: "bow" }).state;
  expect(s.bank).toEqual([{ defId: "bow", qty: 1 }]);
});
