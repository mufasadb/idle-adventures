// Deterministic combat (M4, D11). Pure math — no RNG: the outcome is a
// function of (loadout, hp, monsterId). Spyglass "pre-computes the exact
// outcome" by literally calling this.
// ⚠ balance surface: changing this requires `bun run sim:tables` (test/balance-tables.test.ts enforces)
import {
  PLAYER_POISON_FLOOR,
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
  MITIGATION_K,
  CAMP_DMG_BY_MAP_TIER,
  WEAPON_ENHANCEMENT,
  AMMO_FOR,
  AMMO_POISON,
} from "../data/constants";
import type { DmgType, Venom } from "../data/constants";
import type { Loadout, ItemStack } from "./types";
import { rand } from "./rng";
import { ARMOUR_SLOTS } from "./pack";
import { consumeOne } from "./carry";

export type CombatResult = {
  victory: boolean;
  hpAfter: number;
  hpLost: number;
  potionsUsed: number;
  potionsAfter: ItemStack[];
};

// Deterministic loot roll (2026-07-05, t07). Loot lives OUTSIDE resolveCombat
// because it needs a seed and resolveCombat is pure fight-math. `chance` entries
// (e.g. the Wyrm's dragonheart @0.2) roll per-encounter; absent chance = always.
// The roll is keyed by (seed, creature, tile, defId) so it's replayable (D14)
// and multiple chance drops on one creature stay independent (defId disambiguates
// beyond the spec's bare context). The engagement path (engage's fit-check,
// fightRound's victory) calls this.
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
// The ammo defIds the wielded weapon shoots (si7.6.6): AMMO_FOR, else arrows.
function ammoFor(weaponId: string | null): string[] {
  return (weaponId !== null && AMMO_FOR[weaponId]) || ["arrows"];
}
// Index of the first ammo stack the wielded weapon can shoot, or -1 (si7.6.6).
// Fights spend from THIS stack, so a mixed quiver never burns the wrong ammo.
export function loadedAmmoIndex(loadout: Loadout): number {
  const usable = ammoFor(loadout.equipment.weapon);
  return (loadout.ammo ?? []).findIndex((s) => s.qty > 0 && usable.includes(s.defId));
}
export function hasAmmo(loadout: Loadout): boolean {
  return loadedAmmoIndex(loadout) !== -1;
}

// D45 arrows-out: a ranged weapon with no ammo held swings as a club (no matrix, no tags).
function isClubbed(loadout: Loadout): boolean {
  return wieldsRanged(loadout) && !hasAmmo(loadout);
}

// Does the hidden affinity (×AFFINITY_MULTIPLIER) fire for this strike? The ONE
// resolution shared by playerDamage and explainMatchup so the post-fight lesson can
// never disagree with the damage actually dealt. Fires if the WEAPON's tag pairs
// with the monster (a clubbed bow has no tags) OR an active coating's affinityTag
// (D60 oil path) matches a monster tag directly. Boolean OR — never stacks.
export function affinityFires(
  loadout: Loadout,
  monsterId: string,
  weaponBuff?: { id: string },
): boolean {
  const monster = MONSTERS[monsterId];
  if (!monster) throw new Error(`unknown monster: ${monsterId}`);
  const weaponId = loadout.equipment.weapon;
  const weapon = weaponId === null ? undefined : WEAPONS[weaponId];
  const tags = isClubbed(loadout) ? [] : weapon?.tags ?? [];
  const enh = weaponBuff ? WEAPON_ENHANCEMENT[weaponBuff.id] : undefined;
  return (
    AFFINITIES.some((a) => monster.tags.includes(a.monsterTag) && tags.includes(a.itemTag)) ||
    (enh?.affinityTag !== undefined && monster.tags.includes(enh.affinityTag))
  );
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
  const clubbed = isClubbed(loadout);
  const base = weapon && !clubbed
    ? weapon.damage * DMG_ARMOUR_MATRIX[weapon.dmgType][monster.armourType]
    : UNARMED_DAMAGE;
  const enh = weaponBuff ? WEAPON_ENHANCEMENT[weaponBuff.id] : undefined;
  const affine = affinityFires(loadout, monsterId, weaponBuff);
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
// D102: humanoid camps hit harder on deeper maps (CAMP_DMG_BY_MAP_TIER) — mapTier is
// the run's map tier (absent = 1, unscaled).
export function damageTaken(loadout: Loadout, monsterId: string, mitigationAdd = 0, mapTier = 1): number {
  const monster = MONSTERS[monsterId];
  if (!monster) throw new Error(`unknown monster: ${monsterId}`);
  const d = mitigation(loadout, monster.dmgType) + mitigationAdd;
  const camp = monster.category === "humanoid" ? CAMP_DMG_BY_MAP_TIER[mapTier] ?? 1 : 1;
  return Math.max(
    CHIP_DAMAGE_MIN,
    MONSTER_TIER_DMG_CURVE[monster.tier]! * camp * (MITIGATION_K / (MITIGATION_K + d)),
  );
}

export type Matchup = {
  weaponVsHide: number | null; // matrix multiplier of weapon type vs monster hide; null if unarmed
  affinityFired: boolean; // a hidden affinity triggered (the discovery channel)
  armourVsAttack: "resisted" | "neutral" | "exposed"; // how the player's armour fared vs monster dmgType
};

// Post-fight lesson facts (9u9.2). Pure — the render layer flavors these into
// "your blade skated off its hide" etc. Teaches the RPS system + affinity by playing.
// weaponBuff: the coating active on the strike being explained — affinity resolves
// exactly as playerDamage does (affinityFires), so an oil's affinityTag counts.
export function explainMatchup(loadout: Loadout, monsterId: string, weaponBuff?: { id: string }): Matchup {
  const monster = MONSTERS[monsterId];
  if (!monster) throw new Error(`unknown monster: ${monsterId}`);
  const weaponId = loadout.equipment.weapon;
  const weapon = weaponId === null ? undefined : WEAPONS[weaponId];
  const weaponVsHide = weapon
    ? DMG_ARMOUR_MATRIX[weapon.dmgType][monster.armourType]
    : null;
  const affinityFired = affinityFires(loadout, monsterId, weaponBuff);
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
  playerPoisonAfter?: { dmg: number; ticks: number }; // si7.6.9.2: your poison after this round
  poisonTaken: number; // si7.6.9.2: HP your poison cost you this round
  envenomed: boolean; // si7.6.9.2: a venomous hit poisoned you this round
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
  opts: {
    damageAdd?: number;
    mitigationAdd?: number;
    autoQuaff?: boolean;
    skipRetaliation?: boolean;
    weaponBuff?: { id: string; charges: number };
    poison?: { dmg: number; rounds: number };
    thrown?: { dmg: number; poison?: { dmg: number; rounds: number } }; // si7.6.9.1: a flask replaces the swing
    playerPoison?: { dmg: number; ticks: number }; // si7.6.9.2: your poison, ticks at round end
    venom?: Venom & { roll: number }; // si7.6.9.2: the monster's venom + this round's [0,1) roll
    mapTier?: number; // D102: the run's map tier — scales humanoid camp damage (absent = 1)
  } = {},
): ExchangeResult {
  const { damageAdd = 0, mitigationAdd = 0, autoQuaff = true, skipRetaliation = false, weaponBuff, poison, thrown, playerPoison, venom } = opts;
  // si7.6.9.1: a thrown flask IS the strike — flat dmg, no weapon/elixir/coating, no charge spent, no dart.
  const dmgDealt = thrown ? thrown.dmg : playerDamage(loadout, monsterId, weaponBuff) + damageAdd;
  // Weapon-enhancement bookkeeping (D60). The strike always spends one charge; at
  // 0 the coating clears. A poison coating set/refreshes the engagement's poison on
  // this hit (before it wears off), so a fresh coat also ticks this same round.
  const enh = weaponBuff && !thrown ? WEAPON_ENHANCEMENT[weaponBuff.id] : undefined;
  const weaponBuffAfter = thrown ? weaponBuff :
    weaponBuff && weaponBuff.charges - 1 > 0 ? { id: weaponBuff.id, charges: weaponBuff.charges - 1 } : undefined;
  // si7.6.6: a poisoned dart (the loaded ammo of a wielded ranged weapon) sets/refreshes
  // poison too — unless what's already ticking hits harder. A coating's poison wins.
  const dart = thrown ? thrown.poison : wieldsRanged(loadout) && hasAmmo(loadout) ? AMMO_POISON[loadout.ammo![loadedAmmoIndex(loadout)]!.defId] : undefined;
  const carried = dart && (!poison || dart.dmg >= poison.dmg) ? dart : poison;
  const poisonState = enh?.poison ? { ...enh.poison } : carried ? { ...carried } : undefined;
  // Round-end poison tick: the monster loses poison.dmg (dealt with the strike so
  // it can land the kill), rounds decrements, clears at 0. INDEPENDENT of charges.
  let poisonDmg = 0;
  let poisonAfter: { dmg: number; rounds: number } | undefined = poisonState;
  if (poisonState) {
    poisonDmg = poisonState.dmg;
    poisonAfter = poisonState.rounds - 1 > 0 ? { dmg: poisonState.dmg, rounds: poisonState.rounds - 1 } : undefined;
  }
  let potions = loadout.potions.map((p) => ({ ...p }));
  let potionsUsed = 0;
  let current = hp;
  const monsterAfter = monsterHp - dmgDealt - poisonDmg;
  let dmgTaken = 0;
  let playerPoisonAfter = playerPoison;
  let poisonTaken = 0;
  let envenomed = false;
  if (monsterAfter > 0) {
    if (!skipRetaliation) dmgTaken = damageTaken(loadout, monsterId, mitigationAdd, opts.mapTier);
    current -= dmgTaken;
    if (current <= 0) current = 0; // soft-fail floor
    else {
      // si7.6.9.2: poison already in you ticks at round end (never below the floor); a
      // landed venomous hit then (re)poisons you — refreshed to the stronger, not stacked.
      if (playerPoison) {
        const t = poisonTick(current, playerPoison);
        poisonTaken = t.taken; current = t.hp; playerPoisonAfter = t.after;
      }
      if (venom && dmgTaken > 0 && venom.roll < venom.chance) {
        envenomed = true;
        playerPoisonAfter = { dmg: Math.max(venom.dmg, playerPoisonAfter?.dmg ?? 0), ticks: Math.max(venom.ticks, playerPoisonAfter?.ticks ?? 0) };
      }
    }
    if (current > 0 && autoQuaff && current <= AUTO_POTION_THRESHOLD * PLAYER_BASE_HP && potions.length > 0) {
      const heal = POTION_HEAL_BY[potions[0]!.defId] ?? POTION_HEAL;
      current = Math.min(PLAYER_BASE_HP, current + heal);
      potions = consumeOne(potions);
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
    playerPoisonAfter,
    poisonTaken,
    envenomed,
  };
}

// One tick of YOUR poison (si7.6.9.2): lose `dmg`, but never below PLAYER_POISON_FLOOR
// (already below it = no loss). Shared by the combat round and the map step.
export function poisonTick(hp: number, p: { dmg: number; ticks: number }): { hp: number; taken: number; after?: { dmg: number; ticks: number } } {
  const next = Math.max(Math.min(hp, PLAYER_POISON_FLOOR), hp - p.dmg);
  return { hp: next, taken: hp - next, ...(p.ticks - 1 > 0 ? { after: { dmg: p.dmg, ticks: p.ticks - 1 } } : {}) };
}

// Atomic combat (sim/harness API). Reads Expedition.weaponBuff at fight start (D60)
// and models it strike-by-strike EXACTLY as the interactive fight does — charges
// spent per strike, poison ticking each round — so atomic == interactive.
//
// yoo: battle-item buffs are NO LONGER auto-applied. The interactive game (90j)
// starts engagements at damageAdd/mitigationAdd 0 and only buffs when the player
// spends a battle item mid-fight via use-item — auto-buffing every strike modelled
// a stronger player than the game delivers. Callers that WANT to model a buffed
// fight pass damageAdd/mitigationAdd explicitly.
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
      { damageAdd, mitigationAdd, weaponBuff: coating, poison },
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
