import { makeAutoObservable, runInAction } from 'mobx';
import { ITEMS } from '../data/items';
import { DEFAULT_BANK, DEFAULT_SKILLS, DEFAULT_UNLOCKS } from '../data/defaults';
import { api } from '../api/client';
import type { ItemStack, PlayerSkill, ItemDefinition } from '../types';

// Re-export types for backwards compatibility
export type { ItemStack, PlayerSkill };

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

  /**
   * Whether the store has been initialized from server
   */
  isLoaded: boolean = false;

  constructor() {
    makeAutoObservable(this);
  }

  /**
   * Initialize with default values for new players
   * Called when server returns empty state or on first load
   */
  initializeDefaults() {
    this.bank = [...DEFAULT_BANK];
    this.skills = DEFAULT_SKILLS.map(s => ({ ...s }));
    this.unlocked = new Set(DEFAULT_UNLOCKS);
    this.isLoaded = true;
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

  // === Serialization ===

  /**
   * Serialize state to JSON for cloud save
   */
  toJSON(): Record<string, unknown> {
    return {
      bank: this.bank,
      skills: this.skills,
      unlocked: Array.from(this.unlocked),
    };
  }

  /**
   * Load state from JSON (cloud save or local storage)
   */
  loadFromJSON(data: Record<string, unknown>) {
    if (data.bank && Array.isArray(data.bank)) {
      this.bank = data.bank as ItemStack[];
    }
    if (data.skills && Array.isArray(data.skills)) {
      this.skills = data.skills as PlayerSkill[];
    }
    if (data.unlocked && Array.isArray(data.unlocked)) {
      this.unlocked = new Set(data.unlocked as string[]);
    }
    this.isLoaded = true;
  }

  // === Cloud Sync ===

  /**
   * Save current state to server (fire and forget).
   * Skills are saved to the dedicated skills column; bank/unlocked to game_state.
   */
  syncToServer() {
    if (!api.hasToken) return;

    // Save skills to dedicated column
    api.saveSkills(this.skills).catch(err => {
      console.warn('Failed to sync skills to server:', err);
    });

    // Save bank and unlocks to game_state blob
    const gameState = {
      bank: this.bank,
      unlocked: Array.from(this.unlocked),
    };
    api.saveGameState(gameState).catch(err => {
      console.warn('Failed to sync game state to server:', err);
    });
  }

  /**
   * Load state from server.
   * Skills come from GET /api/player (dedicated skills column).
   * Bank and unlocks come from GET /api/game-state (game_state blob).
   */
  async loadFromServer(): Promise<boolean> {
    if (!api.hasToken) {
      runInAction(() => {
        this.initializeDefaults();
      });
      return true;
    }

    try {
      // Fetch in parallel — skills from dedicated column, bank/unlocked from game-state
      const [playerFull, gameState] = await Promise.all([
        api.getPlayerFull(),
        api.getGameState(),
      ]);

      runInAction(() => {
        // Skills from the structured column (authoritative)
        if (playerFull.skills && Array.isArray(playerFull.skills)) {
          this.skills = playerFull.skills as PlayerSkill[];
        } else {
          this.skills = DEFAULT_SKILLS.map(s => ({ ...s }));
        }

        // Bank and unlocks from game_state blob
        if (gameState.bank && Array.isArray(gameState.bank)) {
          this.bank = gameState.bank as ItemStack[];
        } else {
          this.bank = [...DEFAULT_BANK];
        }
        if (gameState.unlocked && Array.isArray(gameState.unlocked)) {
          this.unlocked = new Set(gameState.unlocked as string[]);
        } else {
          this.unlocked = new Set(DEFAULT_UNLOCKS);
        }

        this.isLoaded = true;
      });
      return true;
    } catch (err) {
      console.warn('Failed to load from server, using defaults:', err);
      runInAction(() => {
        this.initializeDefaults();
      });
      return false;
    }
  }
}

export const playerStore = new PlayerStore();

// DEV: Expose for debugging
if (import.meta.env.DEV) {
  (window as unknown as { playerStore: PlayerStore }).playerStore = playerStore;
}
