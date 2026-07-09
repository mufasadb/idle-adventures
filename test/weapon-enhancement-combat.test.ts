import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { generateGrid, rollBiome } from "../src/engine/grid";
import type { Grid, Poi } from "../src/engine/grid";
import { playerDamage, resolveCombat } from "../src/engine/combat";
import { PLAYER_BASE_HP, WEAPON_ENHANCEMENT, MONSTERS, AFFINITY_MULTIPLIER } from "../src/data/constants";
import type { GameState, GameEvent, Loadout } from "../src/engine/types";

// --- playerDamage with a coating (§8) ---------------------------------------

test("playerDamage: flatDamage raises the swing; absent buff is byte-identical (D59)", () => {
  const l = emptyLoadout();
  l.equipment.weapon = "sword";
  const base = playerDamage(l, "forest-boar");
  const whetted = playerDamage(l, "forest-boar", { id: "whetstone" });
  expect(whetted).toBe(base + WEAPON_ENHANCEMENT.whetstone!.flatDamage!);
  // the 2-arg call (all existing callers) is unchanged
  expect(playerDamage(l, "forest-boar")).toBe(base);
});

test("playerDamage: affinityTag coating fires ×AFFINITY_MULTIPLIER vs a matching monster tag (D59)", () => {
  const l = emptyLoadout();
  l.equipment.weapon = "sword"; // plain, no tags
  // frost-hatchling carries the "dragon" tag; drake-oil's affinityTag is "dragon"
  expect(MONSTERS["frost-hatchling"]!.tags.includes("dragon")).toBe(true);
  const base = playerDamage(l, "frost-hatchling");
  const oiled = playerDamage(l, "frost-hatchling", { id: "drake-oil" });
  expect(oiled).toBe(base * AFFINITY_MULTIPLIER);
});

test("playerDamage: coating affinity does NOT double when the weapon already matches — matched-or-not (D59)", () => {
  const l = emptyLoadout();
  l.equipment.weapon = "silver-sword"; // silver tag → ×2 vs werewolf already
  const withoutCoat = playerDamage(l, "werewolf");
  const withCoat = playerDamage(l, "werewolf", { id: "silver-oil" }); // silver-oil also targets werewolf
  expect(withCoat).toBe(withoutCoat); // still exactly ×AFFINITY_MULTIPLIER, no stacking
});

// --- atomic == interactive parity (the critical test, §8) -------------------

function fightToEndWithBuff(state: GameState): GameState {
  let s = reduce(state, { type: "fight" });
  let guard = 0;
  while (s.state.expedition?.combat && ++guard < 200) s = reduce(s.state, { type: "fight" });
  return s.state;
}

function mapWithMonster(creature: string): { seed: string; poi: Poi; grid: Grid } {
  for (let i = 0; i < 800; i++) {
    const seed = `enh-scan-${i}`;
    const grid = generateGrid(seed, rollBiome(seed), 1);
    const poi = grid.pois.find((p) => p.kind === "monster" && p.creature === creature);
    if (poi) return { seed, poi, grid };
  }
  throw new Error(`no map with ${creature}`);
}

function atMonster(seed: string, poi: Poi, buffId: string, weapon: string, hp = PLAYER_BASE_HP): GameState {
  const loadout: Loadout = emptyLoadout();
  loadout.equipment.weapon = weapon;
  return {
    seed: "g", phase: "expedition", bank: [], loadout: emptyLoadout(),
    expedition: {
      mapSeed: seed, pos: { x: poi.x, y: poi.y }, energy: 100, hp, loadout, carry: [], cleared: [],
      weaponBuff: { id: buffId, charges: WEAPON_ENHANCEMENT[buffId]!.charges },
    },
  };
}

// The heart of the spec: a coated fight run strike-by-strike through the reducer
// must land EXACTLY where the atomic resolveCombat lands (same weaponBuff seed).
for (const [label, buffId, weapon, creature] of [
  ["flat (whetstone)", "whetstone", "sword", "forest-boar"],
  ["affinity (drake-oil)", "drake-oil", "sword", "frost-hatchling"],
  ["poison (venom-oil)", "venom-oil", "sword", "giant-scorpion"],
] as const) {
  test(`atomic resolveCombat == interactive fight for a coated fight — ${label} (D59)`, () => {
    const { seed, poi } = mapWithMonster(creature);
    const before = atMonster(seed, poi, buffId, weapon);
    const atomic = resolveCombat(
      before.expedition!.loadout, PLAYER_BASE_HP, creature,
      before.expedition!.weaponBuff,
    );
    const after = fightToEndWithBuff(before);
    if (atomic.victory) {
      expect(after.expedition!.hp).toBe(atomic.hpAfter);
      expect(after.expedition!.cleared).toContainEqual({ x: poi.x, y: poi.y });
    } else {
      // downed → run ended; interactive banks the haul, HP floors 0
      expect(after.expedition?.hp ?? 0).toBe(atomic.hpAfter);
    }
  });
}

// --- charges + poison mechanics through the reducer (§8) --------------------

test("charges decrement per strike and clear at 0 (D59)", () => {
  // Hand-built engagement against a big HP pool so the fight outlasts the 6
  // whetstone charges: a plain sword vs a fresh giant-scorpion (tier-2 plate hide).
  const loadout: Loadout = emptyLoadout();
  loadout.equipment.weapon = "sword";
  const creature = "giant-scorpion";
  const state: GameState = {
    seed: "g", phase: "expedition", bank: [], loadout: emptyLoadout(),
    expedition: {
      mapSeed: "enh-charges", pos: { x: 1, y: 1 }, energy: 100, hp: 300, autoQuaff: false, loadout, carry: [], cleared: [],
      weaponBuff: { id: "whetstone", charges: WEAPON_ENHANCEMENT.whetstone!.charges }, // 6
      combat: {
        at: { x: 1, y: 1 }, creature, moveOnWin: false,
        monsterHp: 1000, // never dies within 6 rounds
        damageAdd: 0, mitigationAdd: 0, startHp: 30, potionsUsed: 0,
      },
    },
  };
  let s = state;
  const charges: (number | undefined)[] = [];
  for (let i = 0; i < 6; i++) {
    s = reduce(s, { type: "fight" }).state;
    charges.push(s.expedition?.weaponBuff?.charges);
    if (!s.expedition?.combat) break; // player might die first — don't loop past run end
  }
  expect(charges[0]).toBe(5); // after the 1st strike
  expect(charges[4]).toBe(1); // after the 5th
  expect(charges[5]).toBeUndefined(); // the 6th strike clears the coating
});

test("poison ticks each round on the engagement and lands a kill the swing alone wouldn't (D59)", () => {
  const p = WEAPON_ENHANCEMENT["venom-oil"]!.poison!;
  const loadout: Loadout = emptyLoadout();
  loadout.equipment.weapon = "sword";
  const creature = "forest-boar";
  const swing = playerDamage(loadout, creature); // the plain swing
  // Monster HP sits ABOVE the swing but AT swing+poison — so the swing alone
  // leaves it alive and the round-end poison tick is what drops it.
  const monsterHp = swing + p.dmg;
  const base: GameState = {
    seed: "g", phase: "expedition", bank: [], loadout: emptyLoadout(),
    expedition: {
      mapSeed: "enh-poison", pos: { x: 1, y: 1 }, energy: 100, hp: 30, loadout, carry: [], cleared: [],
      weaponBuff: { id: "venom-oil", charges: 5 },
      combat: {
        at: { x: 1, y: 1 }, creature, moveOnWin: false, monsterHp,
        damageAdd: 0, mitigationAdd: 0, startHp: 30, potionsUsed: 0,
      },
    },
  };
  const { state, events } = reduce(base, { type: "fight" });
  const ex = events.find((e) => e.type === "exchanged") as Extract<GameEvent, { type: "exchanged" }>;
  expect(ex.poisonDmg).toBe(p.dmg); // poison dealt this round
  const fought = events.find((e) => e.type === "fought") as Extract<GameEvent, { type: "fought" }> | undefined;
  expect(fought?.victory).toBe(true); // the poison landed the kill
  expect(state.expedition!.combat).toBeUndefined();
  // sanity: swing alone (< monsterHp) would NOT have won — poison was decisive
  expect(swing).toBeLessThan(monsterHp);
});
