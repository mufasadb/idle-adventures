// Deterministic combat (M4, D11). Pure math — no RNG: the outcome is a
// function of (loadout, hp, monsterId). Spyglass "pre-computes the exact
// outcome" by literally calling this.
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
  POTION_HEAL,
  POTION_HEAL_BY,
  AUTO_POTION_THRESHOLD,
  UNARMED_DAMAGE,
  CHIP_DAMAGE_MIN,
  COMBAT_BUFF,
} from "../data/constants";
import type { DmgType } from "../data/constants";
import type { Loadout, ItemStack } from "./types";
import { rand } from "./rng";

export type CombatResult = {
  victory: boolean;
  hpAfter: number;
  hpLost: number;
  potionsUsed: number;
  potionsAfter: ItemStack[];
  battleItemsAfter: ItemStack[]; // battle items are all consumed at fight start (bzd) → []
};

// Sum the packed battle-item buffs (bzd). All are consumed at fight start, so
// their damageAdd/mitigationAdd apply to THIS fight and nothing banks back.
function battleBuff(battleItems: ItemStack[]): { damageAdd: number; mitigationAdd: number } {
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
  for (const entry of LOOT_TABLE[creature] ?? []) {
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

const ARMOUR_SLOTS = ["helmet", "chest", "legs", "boots", "gloves"] as const;

// Damage per player strike: weapon × visible matrix (vs the monster's hide
// class) × hidden affinity (×AFFINITY_MULTIPLIER on any tag pairing).
export function playerDamage(loadout: Loadout, monsterId: string): number {
  const monster = MONSTERS[monsterId];
  if (!monster) throw new Error(`unknown monster: ${monsterId}`);
  const weaponId = loadout.equipment.weapon;
  // An equipped defId missing from WEAPONS (e.g. stale after catalog changes)
  // degrades to bare hands rather than throwing — same spirit as unknown
  // armour pieces contributing 0 mitigation.
  const weapon = weaponId === null ? undefined : WEAPONS[weaponId];
  const base = weapon
    ? weapon.damage * DMG_ARMOUR_MATRIX[weapon.dmgType][monster.armourType]
    : UNARMED_DAMAGE;
  const tags = weapon?.tags ?? [];
  const affine = AFFINITIES.some(
    (a) => monster.tags.includes(a.monsterTag) && tags.includes(a.itemTag),
  );
  return Math.max(CHIP_DAMAGE_MIN, base * (affine ? AFFINITY_MULTIPLIER : 1));
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

export function resolveCombat(
  loadout: Loadout,
  hp: number,
  monsterId: string,
): CombatResult {
  const monster = MONSTERS[monsterId];
  if (!monster) throw new Error(`unknown monster: ${monsterId}`);
  // Battle items (bzd): consumed at fight start, buffing only this fight.
  const buff = battleBuff(loadout.battleItems ?? []);
  const dmgOut = playerDamage(loadout, monsterId) + buff.damageAdd;
  const dmgIn = Math.max(
    CHIP_DAMAGE_MIN,
    MONSTER_TIER_DMG_CURVE[monster.tier]! - mitigation(loadout, monster.dmgType) - buff.mitigationAdd,
  );
  let current = hp;
  let monsterHp = MONSTER_TIER_HP_CURVE[monster.tier]!;
  // Flat queue of potion defIds in stack order — quaffed front-to-back so heal
  // amount tracks WHICH potion is drunk (2026-07-04 tiered consumables). The
  // post-hoc consumption below drains the same stacks in the same order.
  const potionQueue = loadout.potions.flatMap((p) => Array<string>(p.qty).fill(p.defId));
  let potionsUsed = 0;
  // Player strikes first. dmgOut ≥ CHIP_DAMAGE_MIN > 0 guarantees termination.
  for (;;) {
    monsterHp -= dmgOut;
    if (monsterHp <= 0) break; // victory — monster dies before retaliating
    current -= dmgIn;
    if (current <= 0) {
      current = 0; // soft-fail floor
      break;
    }
    if (current <= AUTO_POTION_THRESHOLD * PLAYER_BASE_HP && potionsUsed < potionQueue.length) {
      const heal = POTION_HEAL_BY[potionQueue[potionsUsed]!] ?? POTION_HEAL;
      current = Math.min(PLAYER_BASE_HP, current + heal);
      potionsUsed += 1;
    }
  }
  const victory = monsterHp <= 0;
  let toConsume = potionsUsed;
  const potionsAfter: ItemStack[] = [];
  for (const stack of loadout.potions) {
    const take = Math.min(stack.qty, toConsume);
    toConsume -= take;
    if (stack.qty - take > 0) potionsAfter.push({ defId: stack.defId, qty: stack.qty - take });
  }
  return {
    victory,
    hpAfter: current,
    hpLost: hp - current,
    potionsUsed,
    potionsAfter,
    battleItemsAfter: [], // all battle items consumed at fight start (bzd)
  };
}
