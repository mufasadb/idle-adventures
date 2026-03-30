/**
 * Default game state for new players
 *
 * This file contains the initial state for new players.
 * Used by both frontend (initialization) and can be synced with backend.
 */

import type { ItemStack, PlayerSkill } from '../types';

/**
 * Starting inventory for new players
 */
export const DEFAULT_BANK: ItemStack[] = [
  { itemId: 'gold', count: 500 },
  { itemId: 'bread', count: 5 },
  { itemId: 'iron-pickaxe', count: 1 },
  { itemId: 'herbalist-kit', count: 1 },
  { itemId: 'health-potion', count: 2 },
];

/**
 * Starting skills for new players — all 20 skills at level 1 / 0 XP.
 * Must stay in sync with DefaultSkills() in backend/internal/models/defaults.go.
 */
export const DEFAULT_SKILLS: PlayerSkill[] = [
  // Gathering
  { id: 'mining', name: 'Mining', level: 1, xp: 0, xpToNext: 100, category: 'gathering' },
  { id: 'woodcutting', name: 'Woodcutting', level: 1, xp: 0, xpToNext: 100, category: 'gathering' },
  { id: 'herbalism', name: 'Herbalism', level: 1, xp: 0, xpToNext: 100, category: 'gathering' },
  { id: 'fishing', name: 'Fishing', level: 1, xp: 0, xpToNext: 100, category: 'gathering' },
  { id: 'hunting', name: 'Hunting', level: 1, xp: 0, xpToNext: 100, category: 'gathering' },
  { id: 'farming', name: 'Farming', level: 1, xp: 0, xpToNext: 100, category: 'gathering' },
  { id: 'archaeology', name: 'Archaeology', level: 1, xp: 0, xpToNext: 100, category: 'gathering' },
  // Combat
  { id: 'melee', name: 'Melee', level: 1, xp: 0, xpToNext: 100, category: 'combat' },
  { id: 'ranged', name: 'Ranged', level: 1, xp: 0, xpToNext: 100, category: 'combat' },
  { id: 'magic', name: 'Magic', level: 1, xp: 0, xpToNext: 100, category: 'combat' },
  // Crafting
  { id: 'smithing', name: 'Smithing', level: 1, xp: 0, xpToNext: 100, category: 'crafting' },
  { id: 'cooking', name: 'Cooking', level: 1, xp: 0, xpToNext: 100, category: 'crafting' },
  { id: 'alchemy', name: 'Alchemy', level: 1, xp: 0, xpToNext: 100, category: 'crafting' },
  { id: 'tailoring', name: 'Tailoring', level: 1, xp: 0, xpToNext: 100, category: 'crafting' },
  { id: 'jewelcrafting', name: 'Jewelcrafting', level: 1, xp: 0, xpToNext: 100, category: 'crafting' },
  { id: 'carpentry', name: 'Carpentry', level: 1, xp: 0, xpToNext: 100, category: 'crafting' },
  { id: 'engineering', name: 'Engineering', level: 1, xp: 0, xpToNext: 100, category: 'crafting' },
  // Support
  { id: 'arcana', name: 'Arcana', level: 1, xp: 0, xpToNext: 100, category: 'support' },
  { id: 'beastcraft', name: 'Beastcraft', level: 1, xp: 0, xpToNext: 100, category: 'support' },
  { id: 'cartography', name: 'Cartography', level: 1, xp: 0, xpToNext: 100, category: 'support' },
];

/**
 * Starting unlocks for new players
 */
export const DEFAULT_UNLOCKS: string[] = ['smithy', 'kitchen'];

/**
 * Complete default player state
 */
export const DEFAULT_PLAYER_STATE = {
  bank: DEFAULT_BANK,
  skills: DEFAULT_SKILLS,
  unlocked: DEFAULT_UNLOCKS,
};
