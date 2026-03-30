import { makeAutoObservable, runInAction } from 'mobx';
import { api } from '../api/client';

export interface StashItemDef {
  id: string;
  name: string;
  icon: string;
  category: string;
  stackable: boolean;
}

export interface StashItem {
  id: string; // UUID
  itemDefId: string;
  quantity: number;
  stashPosition: number | null;
  definition: StashItemDef;
}

const STASH_SIZE = 20;

class StashStore {
  /** 20-slot array, indexed by stash_position. null = empty slot. */
  slots: (StashItem | null)[] = Array(STASH_SIZE).fill(null);
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
        const newSlots: (StashItem | null)[] = Array(STASH_SIZE).fill(null);
        for (const raw of data.items) {
          const item: StashItem = {
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
            },
          };
          if (item.stashPosition !== null && item.stashPosition < STASH_SIZE) {
            newSlots[item.stashPosition] = item;
          }
        }
        this.slots = newSlots;
        this.isLoading = false;
      });
    } catch (err) {
      runInAction(() => {
        this.error = 'Failed to load stash';
        this.isLoading = false;
      });
    }
  }

  /** Move item to an empty slot. Optimistic update + API call. */
  async moveItem(itemId: string, fromPos: number, toPos: number) {
    const item = this.slots[fromPos];
    if (!item) return;

    // Optimistic update
    runInAction(() => {
      this.slots[fromPos] = null;
      this.slots[toPos] = { ...item, stashPosition: toPos };
    });

    try {
      await api.moveStashItem(itemId, toPos);
    } catch {
      // Rollback on failure
      runInAction(() => {
        this.slots[toPos] = null;
        this.slots[fromPos] = item;
      });
    }
  }

  /** Swap two filled slots. Optimistic update + API call. */
  async swapItems(itemIdA: string, posA: number, itemIdB: string, posB: number) {
    const itemA = this.slots[posA];
    const itemB = this.slots[posB];
    if (!itemA || !itemB) return;

    // Optimistic update
    runInAction(() => {
      this.slots[posA] = { ...itemB, stashPosition: posA };
      this.slots[posB] = { ...itemA, stashPosition: posB };
    });

    try {
      await api.swapStashItems(itemIdA, itemIdB);
    } catch {
      // Rollback on failure
      runInAction(() => {
        this.slots[posA] = itemA;
        this.slots[posB] = itemB;
      });
    }
  }

  /** Destroy an item (furnace). Removes from slot. */
  async destroyItem(itemId: string, pos: number) {
    const item = this.slots[pos];
    if (!item) return;

    // Optimistic update
    runInAction(() => {
      this.slots[pos] = null;
    });

    try {
      await api.destroyStashItem(itemId);
    } catch {
      // Rollback on failure
      runInAction(() => {
        this.slots[pos] = item;
      });
    }
  }

  /** Add a random item (dev/testing). */
  async addRandomItem() {
    try {
      const data = await api.addRandomStashItem();
      await this.loadFromServer(); // Reload to get updated state
      return data;
    } catch (err) {
      runInAction(() => {
        this.error = 'Failed to add random item';
      });
    }
  }

  get itemCount(): number {
    return this.slots.filter(Boolean).length;
  }
}

export const stashStore = new StashStore();
