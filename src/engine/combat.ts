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
  AUTO_POTION_THRESHOLD,
  UNARMED_DAMAGE,
  CHIP_DAMAGE_MIN,
} from "../data/constants";
import type { DmgType } from "../data/constants";
import type { Loadout, ItemStack } from "./types";

export type CombatResult = {
  victory: boolean;
  hpAfter: number;
  hpLost: number;
  potionsUsed: number;
  potionsAfter: ItemStack[];
  loot: ItemStack[]; // empty on defeat
};

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
  const dmgOut = playerDamage(loadout, monsterId);
  const dmgIn = Math.max(
    CHIP_DAMAGE_MIN,
    MONSTER_TIER_DMG_CURVE[monster.tier]! - mitigation(loadout, monster.dmgType),
  );
  let current = hp;
  let monsterHp = MONSTER_TIER_HP_CURVE[monster.tier]!;
  let potionsLeft = loadout.potions.reduce((sum, p) => sum + p.qty, 0);
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
    if (current <= AUTO_POTION_THRESHOLD * PLAYER_BASE_HP && potionsLeft > 0) {
      current = Math.min(PLAYER_BASE_HP, current + POTION_HEAL);
      potionsLeft -= 1;
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
    loot: victory ? (LOOT_TABLE[monsterId] ?? []).map((s) => ({ ...s })) : [],
  };
}
