// Deterministic combat (M4, D11). Pure math — no RNG: the outcome is a
// function of (loadout, hp, monsterId). Spyglass "pre-computes the exact
// outcome" by literally calling this.
// ⚠ balance surface: changing this requires `bun run sim:tables` (test/balance-tables.test.ts enforces)
import {
  DMG_ARMOUR_MATRIX,
  PLAYER_BASE_HP,
  MONSTERS,
  WEAPONS,
  ARMOUR,
  AFFINITIES,
  AFFINITY_MULTIPLIER,
  MONSTER_TIER_HP_CURVE,
  MONSTER_TIER_DMG_CURVE,
  LOOT_TABLE,
  CATEGORY_LOOT_TABLE,
  POTION_HEAL,
  POTION_HEAL_BY,
  AUTO_POTION_THRESHOLD,
  UNARMED_DAMAGE,
  CHIP_DAMAGE_MIN,
  COMBAT_BUFF,
  MITIGATION_K,
  WEAPON_ENHANCEMENT,
} from "../data/constants";
import type { DmgType } from "../data/constants";
import type { Loadout, ItemStack } from "./types";
import { rand } from "./rng";
import { ARMOUR_SLOTS } from "./pack";

export type CombatResult = {
  victory: boolean;
  hpAfter: number;
  hpLost: number;
  potionsUsed: number;
  potionsAfter: ItemStack[];
};

// Sum the packed battle-item buffs (bzd). Kept as the canonical buff-value helper
// (COMBAT_BUFF summing) — harness callers that want to model a fully-buffed fight
// pass battleBuff(kit.battleItems) into resolveCombat's damageAdd/mitigationAdd
// (yoo: resolveCombat no longer applies these automatically — see its header).
export function battleBuff(battleItems: ItemStack[]): { damageAdd: number; mitigationAdd: number } {
  let damageAdd = 0;
  let mitigationAdd = 0;
  for (const stack of battleItems) {
    const buff = COMBAT_BUFF[stack.defId];
    if (!buff) continue;
    damageAdd += (buff.damageAdd ?? 0) * stack.qty;
    mitigationAdd += (buff.mitigationAdd ?? 0) * stack.qty;
  }
  return { damageAdd, mitigationAdd };
}

// Deterministic loot roll (2026-07-05, t07). Loot lives OUTSIDE resolveCombat
// because it needs a seed and resolveCombat is pure fight-math. `chance` entries
// (e.g. the Wyrm's dragonheart @0.2) roll per-encounter; absent chance = always.
// The roll is keyed by (seed, creature, tile, defId) so it's replayable (D14)
// and multiple chance drops on one creature stay independent (defId disambiguates
// beyond the spec's bare context). fightAt calls this on victory only.
export function rollLoot(
  seed: string,
  creature: string,
  at: { x: number; y: number },
): ItemStack[] {
  const loot: ItemStack[] = [];
  // Category entries (8ec) roll alongside the monster's own; the rand key
  // already includes defId, so monster + category drops stay independent.
  // Unknown test creatures fall back to the empty beast table.
  const entries = [
    ...(LOOT_TABLE[creature] ?? []),
    ...(CATEGORY_LOOT_TABLE[MONSTERS[creature]?.category ?? "beast"] ?? []),
  ];
  for (const entry of entries) {
    if (
      entry.chance !== undefined &&
      rand(seed, "loot", creature, at.x, at.y, entry.defId) >= entry.chance
    ) {
      continue;
    }
    loot.push({ defId: entry.defId, qty: entry.qty });
  }
  return loot;
}

// Ranged style helpers (D45). A "bow" is any weapon whose dmgType is ranged —
// data-driven, so future ranged weapons join the ammo economy for free.
export function wieldsRanged(loadout: Loadout): boolean {
  const w = loadout.equipment.weapon;
  return w !== null && WEAPONS[w]?.dmgType === "ranged";
}
export function hasAmmo(loadout: Loadout): boolean {
  return (loadout.ammo ?? []).some((s) => s.qty > 0);
}

// Damage per player strike: weapon × visible matrix (vs the monster's hide
// class) × hidden affinity (×AFFINITY_MULTIPLIER on any tag pairing).
// Arrows-out (D45): a ranged weapon with no ammo held swings as a club —
// UNARMED_DAMAGE, no matrix, no tags — so an empty quiver never soft-locks a
// fight; it just makes ammo a pack-time judgment.
// weaponBuff (D60): an OPTIONAL active enhancement — absent = today's behaviour
// exactly (all existing callers untouched, all combat numbers byte-identical).
// When present: `flatDamage` adds to base (after the ×matrix/affinity scaling),
// and `affinityTag` is a MONSTER tag the coating checks directly against the
// creature — matched-or-not, never double (if the weapon already fires the
// multiplier, the coating can't push past ×AFFINITY_MULTIPLIER; §4 double-dip guard).
export function playerDamage(
  loadout: Loadout,
  monsterId: string,
  weaponBuff?: { id: string },
): number {
  const monster = MONSTERS[monsterId];
  if (!monster) throw new Error(`unknown monster: ${monsterId}`);
  const weaponId = loadout.equipment.weapon;
  // An equipped defId missing from WEAPONS (e.g. stale after catalog changes)
  // degrades to bare hands rather than throwing — same spirit as unknown
  // armour pieces contributing 0 mitigation.
  const weapon = weaponId === null ? undefined : WEAPONS[weaponId];
  const clubbed = weapon?.dmgType === "ranged" && !hasAmmo(loadout); // D45 arrows-out
  const base = weapon && !clubbed
    ? weapon.damage * DMG_ARMOUR_MATRIX[weapon.dmgType][monster.armourType]
    : UNARMED_DAMAGE;
  const tags = clubbed ? [] : weapon?.tags ?? [];
  const enh = weaponBuff ? WEAPON_ENHANCEMENT[weaponBuff.id] : undefined;
  // Affinity fires if the WEAPON's tag pairs with the monster (existing path) OR
  // the coating's affinityTag matches a monster tag directly (the oil path). It's
  // a boolean OR, so it never stacks past ×AFFINITY_MULTIPLIER.
  const affine =
    AFFINITIES.some((a) => monster.tags.includes(a.monsterTag) && tags.includes(a.itemTag)) ||
    (enh?.affinityTag !== undefined && monster.tags.includes(enh.affinityTag));
  const flat = enh?.flatDamage ?? 0; // whetstone: flat add, after the ×matrix/affinity scaling
  return Math.max(CHIP_DAMAGE_MIN, base * (affine ? AFFINITY_MULTIPLIER : 1) + flat);
}

// Per-piece mitigation: defense ÷ matrix[dmgType][pieceArmour]. Division is
// what makes plate strong where its matrix damage-multiplier is low (ranged
// 0.5 → ×2 effective defense) and weak vs magic (1.5 → ×0.67).
export function mitigation(loadout: Loadout, dmgType: DmgType): number {
  let total = 0;
  for (const slot of ARMOUR_SLOTS) {
    const pieceId = loadout.equipment[slot];
    if (pieceId === null) continue;
    const piece = ARMOUR[pieceId];
    if (!piece) continue;
    total += piece.defense / DMG_ARMOUR_MATRIX[dmgType][piece.armourType];
  }
  return total;
}

// Incoming damage per hit (si7.1, % model): the monster's tier damage scaled by
// K/(K + D), floored at chip. D is the matrix-adjusted defense sum (mitigation)
// plus any battle-item mitigationAdd — temporary armour under the same curve.
export function damageTaken(loadout: Loadout, monsterId: string, mitigationAdd = 0): number {
  const monster = MONSTERS[monsterId];
  if (!monster) throw new Error(`unknown monster: ${monsterId}`);
  const d = mitigation(loadout, monster.dmgType) + mitigationAdd;
  return Math.max(
    CHIP_DAMAGE_MIN,
    MONSTER_TIER_DMG_CURVE[monster.tier]! * (MITIGATION_K / (MITIGATION_K + d)),
  );
}

export type Matchup = {
  weaponVsHide: number | null; // matrix multiplier of weapon type vs monster hide; null if unarmed
  affinityFired: boolean; // a hidden affinity triggered (the discovery channel)
  armourVsAttack: "resisted" | "neutral" | "exposed"; // how the player's armour fared vs monster dmgType
};

// Post-fight lesson facts (9u9.2). Pure — the render layer flavors these into
// "your blade skated off its hide" etc. Teaches the RPS system + affinity by playing.
export function explainMatchup(loadout: Loadout, monsterId: string): Matchup {
  const monster = MONSTERS[monsterId];
  if (!monster) throw new Error(`unknown monster: ${monsterId}`);
  const weaponId = loadout.equipment.weapon;
  const weapon = weaponId === null ? undefined : WEAPONS[weaponId];
  const weaponVsHide = weapon
    ? DMG_ARMOUR_MATRIX[weapon.dmgType][monster.armourType]
    : null;
  const affinityFired = AFFINITIES.some(
    (a) => monster.tags.includes(a.monsterTag) && (weapon?.tags ?? []).includes(a.itemTag),
  );
  // Average how each equipped armour piece's class fares vs the incoming dmg type.
  let sum = 0;
  let n = 0;
  for (const slot of ARMOUR_SLOTS) {
    const pieceId = loadout.equipment[slot];
    if (pieceId === null) continue;
    const piece = ARMOUR[pieceId];
    if (!piece) continue;
    sum += DMG_ARMOUR_MATRIX[monster.dmgType][piece.armourType];
    n += 1;
  }
  const armourVsAttack: Matchup["armourVsAttack"] =
    n === 0 ? "neutral" : sum / n < 1 ? "resisted" : sum / n > 1 ? "exposed" : "neutral";
  return { weaponVsHide, affinityFired, armourVsAttack };
}

export type ExchangeResult = {
  monsterHp: number;
  hp: number;
  potionsAfter: ItemStack[];
  potionsUsed: number;
  dmgDealt: number; // the player's SWING (flat/affinity applied); poison is reported separately
  dmgTaken: number; // 0 when the strike killed before retaliation
  victory: boolean;
  defeated: boolean;
  weaponBuffAfter?: { id: string; charges: number }; // D60: charges after this strike (undefined = cleared/none)
  poisonAfter?: { dmg: number; rounds: number }; // D60: engagement poison after this round's tick (undefined = none)
  poisonDmg: number; // D60: poison damage dealt to the monster this round (0 = none)
};

// One combat round (si7.1): player strike → weapon-enhancement bookkeeping (D60:
// spend a charge, set/refresh poison) → round-end poison tick (can land the kill)
// → if the monster lives, retaliation → waste-tolerant auto-quaff at the threshold.
// Pure; the reducer holds the engagement state between rounds, resolveCombat loops
// this for the atomic API — both paths thread weaponBuff+poison IDENTICALLY.
// skipRetaliation (D45): the ranged opener — the monster's answer to THIS round
// is skipped (dmgTaken 0); melee callers never set it, so melee math is untouched.
// weaponBuff/poison (D60): absent = today's behaviour exactly (all combat numbers
// byte-identical, the harness passes un-edited).
export function strikeExchange(
  loadout: Loadout,
  hp: number,
  monsterHp: number,
  monsterId: string,
  damageAdd = 0,
  mitigationAdd = 0,
  autoQuaff = true,
  skipRetaliation = false,
  weaponBuff?: { id: string; charges: number },
  poison?: { dmg: number; rounds: number },
): ExchangeResult {
  const dmgDealt = playerDamage(loadout, monsterId, weaponBuff) + damageAdd;
  // Weapon-enhancement bookkeeping (D60). The strike always spends one charge; at
  // 0 the coating clears. A poison coating set/refreshes the engagement's poison on
  // this hit (before it wears off), so a fresh coat also ticks this same round.
  const enh = weaponBuff ? WEAPON_ENHANCEMENT[weaponBuff.id] : undefined;
  const weaponBuffAfter =
    weaponBuff && weaponBuff.charges - 1 > 0 ? { id: weaponBuff.id, charges: weaponBuff.charges - 1 } : undefined;
  const poisonState = enh?.poison ? { ...enh.poison } : poison ? { ...poison } : undefined;
  // Round-end poison tick: the monster loses poison.dmg (dealt with the strike so
  // it can land the kill), rounds decrements, clears at 0. INDEPENDENT of charges.
  let poisonDmg = 0;
  let poisonAfter: { dmg: number; rounds: number } | undefined = poisonState;
  if (poisonState) {
    poisonDmg = poisonState.dmg;
    poisonAfter = poisonState.rounds - 1 > 0 ? { dmg: poisonState.dmg, rounds: poisonState.rounds - 1 } : undefined;
  }
  const potions = loadout.potions.map((p) => ({ ...p }));
  let potionsUsed = 0;
  let current = hp;
  const monsterAfter = monsterHp - dmgDealt - poisonDmg;
  let dmgTaken = 0;
  if (monsterAfter > 0) {
    if (!skipRetaliation) dmgTaken = damageTaken(loadout, monsterId, mitigationAdd);
    current -= dmgTaken;
    if (current <= 0) current = 0; // soft-fail floor
    else if (autoQuaff && current <= AUTO_POTION_THRESHOLD * PLAYER_BASE_HP && potions.length > 0) {
      const heal = POTION_HEAL_BY[potions[0]!.defId] ?? POTION_HEAL;
      current = Math.min(PLAYER_BASE_HP, current + heal);
      potions[0]!.qty -= 1;
      if (potions[0]!.qty <= 0) potions.shift();
      potionsUsed = 1;
    }
  }
  return {
    monsterHp: Math.max(0, monsterAfter),
    hp: current,
    potionsAfter: potions,
    potionsUsed,
    dmgDealt,
    dmgTaken,
    victory: monsterAfter <= 0,
    defeated: monsterAfter > 0 && current <= 0,
    weaponBuffAfter,
    poisonAfter,
    poisonDmg,
  };
}

// Atomic combat (sim/harness API). Reads Expedition.weaponBuff at fight start (D60)
// and models it strike-by-strike EXACTLY as the interactive fight does — charges
// spent per strike, poison ticking each round — so atomic == interactive.
//
// yoo: battle-item buffs are NO LONGER auto-applied. The interactive game (90j)
// starts engagements at damageAdd/mitigationAdd 0 and only buffs when the player
// spends a battle item mid-fight via use-item — auto-buffing every strike modelled
// a stronger player than the game delivers. Callers that WANT to model a buffed
// fight pass damageAdd/mitigationAdd explicitly (e.g. battleBuff(kit.battleItems)).
export function resolveCombat(
  loadout: Loadout,
  hp: number,
  monsterId: string,
  weaponBuff?: { id: string; charges: number },
  damageAdd = 0,
  mitigationAdd = 0,
): CombatResult {
  const monster = MONSTERS[monsterId];
  if (!monster) throw new Error(`unknown monster: ${monsterId}`);
  let current = hp;
  let monsterHp = MONSTER_TIER_HP_CURVE[monster.tier]!;
  let potions = loadout.potions;
  let potionsUsed = 0;
  let coating = weaponBuff;
  let poison: { dmg: number; rounds: number } | undefined;
  // dmgDealt ≥ CHIP_DAMAGE_MIN > 0 guarantees termination (monster HP strictly
  // decreases each round).
  for (;;) {
    const round = strikeExchange(
      { ...loadout, potions }, current, monsterHp, monsterId,
      damageAdd, mitigationAdd, true, false, coating, poison,
    );
    current = round.hp;
    monsterHp = round.monsterHp;
    potions = round.potionsAfter;
    potionsUsed += round.potionsUsed;
    coating = round.weaponBuffAfter;
    poison = round.poisonAfter;
    if (round.victory || round.defeated) {
      return {
        victory: round.victory,
        hpAfter: current,
        hpLost: hp - current,
        potionsUsed,
        potionsAfter: potions,
      };
    }
  }
}
