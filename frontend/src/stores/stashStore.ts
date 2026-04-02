import { makeAutoObservable, runInAction } from 'mobx';
import { api } from '../api/client';

export interface StashItemDef {
  id: string;
  name: string;
  icon: string;
  category: string;
  stackable: boolean;
  tier?: number;
}

export interface StashItem {
  id: string; // UUID
  itemDefId: string;
  quantity: number;
  stashPosition: number | null;
  definition: StashItemDef;
}

// ── Mock data seeded for testing without a real drop loop ────────────────────

const MOCK_STASH_ITEMS: StashItem[] = [
  // Tools
  {
    id: 'mock-tool-1',
    itemDefId: 'bronze-axe',
    quantity: 1,
    stashPosition: null,
    definition: { id: 'bronze-axe', name: 'Bronze Axe', icon: '🪓', category: 'tool', stackable: false, tier: 1 },
  },
  {
    id: 'mock-tool-2',
    itemDefId: 'iron-axe',
    quantity: 1,
    stashPosition: null,
    definition: { id: 'iron-axe', name: 'Iron Axe', icon: '🪓', category: 'tool', stackable: false, tier: 2 },
  },
  // Food
  {
    id: 'mock-food-1',
    itemDefId: 'sardines',
    quantity: 3,
    stashPosition: null,
    definition: { id: 'sardines', name: 'Cooked Sardines', icon: '🐟', category: 'food', stackable: true, tier: 1 },
  },
  {
    id: 'mock-food-2',
    itemDefId: 'dried-meat',
    quantity: 2,
    stashPosition: null,
    definition: { id: 'dried-meat', name: 'Dried Meat', icon: '🥩', category: 'food', stackable: true, tier: 0 },
  },
  // Maps
  {
    id: 'mock-map-1',
    itemDefId: 'local-map',
    quantity: 1,
    stashPosition: null,
    definition: { id: 'local-map', name: 'Local Map', icon: '🗺️', category: 'map', stackable: false, tier: 0 },
  },
  {
    id: 'mock-map-2',
    itemDefId: 'valley-map',
    quantity: 1,
    stashPosition: null,
    definition: { id: 'valley-map', name: 'Valley Map', icon: '🗺️', category: 'map', stackable: false, tier: 2 },
  },
  // Misc
  {
    id: 'mock-misc-1',
    itemDefId: 'healing-potion',
    quantity: 2,
    stashPosition: null,
    definition: { id: 'healing-potion', name: 'Healing Potion', icon: '🧪', category: 'misc', stackable: true, tier: 1 },
  },
  {
    id: 'mock-misc-2',
    itemDefId: 'rope',
    quantity: 1,
    stashPosition: null,
    definition: { id: 'rope', name: 'Rope', icon: '🪢', category: 'misc', stackable: false, tier: 0 },
  },
];

class StashStore {
  /** Unlimited flat list of stash items (no slot cap while in town). */
  items: StashItem[] = [...MOCK_STASH_ITEMS];
  isLoading = false;
  error: string | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  async loadFromServer() {
    runInAction(() => {
      this.isLoading = true;
      this.error = null;
    });

    try {
      const data = await api.getStash();
      runInAction(() => {
        if (data.items.length > 0) {
          // Server has real items — replace mock data with server state
          this.items = data.items.map((raw) => ({
            id: raw.id,
            itemDefId: raw.item_def_id,
            quantity: raw.quantity,
            stashPosition: raw.stash_position ?? null,
            definition: {
              id: raw.definition.id,
              name: raw.definition.name,
              icon: raw.definition.icon,
              category: raw.definition.category,
              stackable: raw.definition.stackable,
              tier: (raw.definition as { tier?: number }).tier,
            },
          }));
        }
        // If server returns empty, keep mock data so the stash is always populated
        this.isLoading = false;
      });
    } catch {
      runInAction(() => {
        // Keep mock data on error so the screen is always usable
        this.isLoading = false;
      });
    }
  }

  /** All distinct categories present in the stash, in display order. */
  get categories(): string[] {
    const ORDER = ['tool', 'food', 'map', 'misc'];
    const present = new Set(this.items.map((i) => i.definition.category));
    const ordered = ORDER.filter((c) => present.has(c));
    // Append any unknown categories not in the ordering list
    for (const c of present) {
      if (!ORDER.includes(c)) ordered.push(c);
    }
    return ordered;
  }

  /** Items for a specific category. */
  getByCategory(category: string): StashItem[] {
    return this.items.filter((i) => i.definition.category === category);
  }

  get itemCount(): number {
    return this.items.length;
  }

  /** Remove an item from the stash by id. */
  removeItem(itemId: string) {
    runInAction(() => {
      this.items = this.items.filter((i) => i.id !== itemId);
    });
  }
}

export const stashStore = new StashStore();
