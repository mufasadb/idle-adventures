import type { ItemStack, PlayerSkill } from '../types';

export const DEFAULT_BANK: ItemStack[] = [
  { itemId: 'gold', count: 1000 },
  { itemId: 'cooked-fish', count: 15 },
  { itemId: 'cooked-bread', count: 10 },
  { itemId: 'pack-horse', count: 1 },
  { itemId: 'mule', count: 1 },
  { itemId: 'desert-cloak', count: 1 },
  { itemId: 'healing-potion', count: 3 },
  { itemId: 'rope', count: 2 },
  { itemId: 'bronze-axe', count: 1 },
];

export const DEFAULT_SKILLS: PlayerSkill[] = [
  { id: 'beastcraft', name: 'Beastcraft', level: 2, xp: 0, xpToNext: 100 },
  { id: 'fishing', name: 'Fishing', level: 1, xp: 0, xpToNext: 100 },
  { id: 'cooking', name: 'Cooking', level: 1, xp: 0, xpToNext: 100 },
  { id: 'mining', name: 'Mining', level: 1, xp: 0, xpToNext: 100 },
  { id: 'herbalism', name: 'Herbalism', level: 1, xp: 0, xpToNext: 100 },
];

export const DEFAULT_UNLOCKS: string[] = ['thornwood', 'dustpeak'];
