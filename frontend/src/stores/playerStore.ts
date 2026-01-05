import { makeAutoObservable } from 'mobx';
import { ITEMS, type ItemDefinition } from '../data/items';

/**
 * Represents a stack of items in a slot
 */
export interface ItemStack {
  itemId: string;
  count: number;
}

/**
 * Skill data for the player
 */
export interface PlayerSkill {
  id: string;
  name: string;
  level: number;
  xp: number;
  xpToNext: number;
  category: 'gathering' | 'combat' | 'crafting' | 'support';
}

/**
 * PlayerStore - Persistent player data
 *
 * Contains everything that persists about the player:
 * - Bank (all items when in town)
 * - Skills and XP
 * - Unlocked content
 *
 * Note: Gold is stored as an item in the bank with id 'gold'
 */
class PlayerStore {
  /**
   * The bank stores all player items when in town.
   * This is a flat array of item stacks.
   * When on expedition, items stay here - only loadout items are "taken".
   */
  bank: ItemStack[] = [];

  /**
   * Player skills with levels and XP
   */
  skills: PlayerSkill[] = [];

  /**
   * IDs of unlocked content (buildings, recipes, areas, etc.)
   */
  unlocked: Set<string> = new Set();

  constructor() {
    makeAutoObservable(this);
    this.initializeTestData();
  }

  /**
   * Initialize with test data for development
   */
  private initializeTestData() {
    // Starting bank items
    this.bank = [
      { itemId: 'gold', count: 1234 },
      { itemId: 'cooked-fish', count: 5 },
      { itemId: 'bread', count: 3 },
      { itemId: 'iron-pickaxe', count: 1 },
      { itemId: 'herbalist-kit', count: 1 },
      { itemId: 'health-potion', count: 3 },
      { itemId: 'rope', count: 1 },
      { itemId: 'cart', count: 1 },
      { itemId: 'iron-ore', count: 45 },
      { itemId: 'alpine-herbs', count: 12 },
      { itemId: 'raw-ruby', count: 2 },
      { itemId: 'raw-fish', count: 8 },
    ];

    // Starting skills
    this.skills = [
      { id: 'mining', name: 'Mining', level: 28, xp: 4230, xpToNext: 6500, category: 'gathering' },
      { id: 'woodcutting', name: 'Woodcutting', level: 15, xp: 1200, xpToNext: 4000, category: 'gathering' },
      { id: 'herbalism', name: 'Herbalism', level: 12, xp: 890, xpToNext: 2000, category: 'gathering' },
      { id: 'melee', name: 'Melee', level: 22, xp: 3900, xpToNext: 5000, category: 'combat' },
      { id: 'ranged', name: 'Ranged', level: 8, xp: 450, xpToNext: 1500, category: 'combat' },
      { id: 'smithing', name: 'Smithing', level: 18, xp: 2750, xpToNext: 5000, category: 'crafting' },
      { id: 'cooking', name: 'Cooking', level: 15, xp: 1800, xpToNext: 3600, category: 'crafting' },
      { id: 'cartography', name: 'Cartography', level: 28, xp: 4100, xpToNext: 6200, category: 'support' },
    ];

    // Starting unlocks
    this.unlocked = new Set(['smithy', 'kitchen', 'library']);
  }

  // === Computed Properties ===

  /**
   * Get gold amount (gold is stored as an item)
   */
  get gold(): number {
    const goldStack = this.bank.find(s => s.itemId === 'gold');
    return goldStack?.count ?? 0;
  }

  /**
   * Get skill by ID
   */
  getSkill(skillId: string): PlayerSkill | undefined {
    return this.skills.find(s => s.id === skillId);
  }

  /**
   * Get all items of a specific category from bank
   */
  getItemsByCategory(category: string): Array<ItemStack & { item: ItemDefinition }> {
    return this.bank
      .filter(stack => {
        const item = ITEMS[stack.itemId];
        return item && item.category === category;
      })
      .map(stack => ({
        ...stack,
        item: ITEMS[stack.itemId],
      }));
  }

  /**
   * Get item count in bank
   */
  getItemCount(itemId: string): number {
    const stack = this.bank.find(s => s.itemId === itemId);
    return stack?.count ?? 0;
  }

  // === Actions ===

  /**
   * Add items to bank (stacks with existing)
   */
  addToBank(itemId: string, count: number) {
    const existing = this.bank.find(s => s.itemId === itemId);
    if (existing) {
      existing.count += count;
    } else {
      this.bank.push({ itemId, count });
    }
  }

  /**
   * Remove items from bank
   * Returns true if successful, false if not enough items
   */
  removeFromBank(itemId: string, count: number): boolean {
    const existing = this.bank.find(s => s.itemId === itemId);
    if (!existing || existing.count < count) {
      return false;
    }

    existing.count -= count;
    if (existing.count === 0) {
      this.bank = this.bank.filter(s => s.itemId !== itemId);
    }
    return true;
  }

  /**
   * Add XP to a skill
   */
  addXp(skillId: string, amount: number) {
    const skill = this.skills.find(s => s.id === skillId);
    if (!skill) return;

    skill.xp += amount;

    // Level up check
    while (skill.xp >= skill.xpToNext) {
      skill.xp -= skill.xpToNext;
      skill.level += 1;
      // Simple XP curve: each level needs 10% more XP
      skill.xpToNext = Math.floor(skill.xpToNext * 1.1);
    }
  }

  /**
   * Unlock content by ID
   */
  unlock(id: string) {
    this.unlocked.add(id);
  }

  /**
   * Check if content is unlocked
   */
  isUnlocked(id: string): boolean {
    return this.unlocked.has(id);
  }
}

export const playerStore = new PlayerStore();

// DEV: Expose for debugging
if (import.meta.env.DEV) {
  (window as unknown as { playerStore: PlayerStore }).playerStore = playerStore;
}
