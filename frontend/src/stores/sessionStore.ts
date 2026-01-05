import { makeAutoObservable } from 'mobx';
import type { ItemStack } from './playerStore';
import { ITEMS } from '../data/items';

/**
 * Game screens - the main navigation state
 */
export type GameScreen =
  | 'town'
  | 'expedition-prep'
  | 'active-expedition'
  | 'node-interaction'
  | 'minigame'
  | 'mining-minigame';

/**
 * Expedition play mode
 */
export type ExpeditionMode = 'active' | 'passive';

/**
 * Map node types
 */
export interface MapNode {
  x: number;
  y: number;
  type: 'empty' | 'mining' | 'herbs' | 'gems' | 'combat' | 'mountain' | 'player';
  icon?: string;
  cleared?: boolean;
}

/**
 * Expedition map definition
 */
export interface ExpeditionMap {
  id: string;
  name: string;
  tier: number;
  travelDays: number;
  terrain: string;
  danger: 'low' | 'medium' | 'high';
  nodes: MapNode[];
  width: number;
  height: number;
}

/**
 * Single item in a loadout slot (always count of 1)
 */
export interface LoadoutItem {
  itemId: string;
}

/**
 * Expedition loadout - what player is taking on the trip
 */
export interface ExpeditionLoadout {
  vehicle: ItemStack | null;
  food: (LoadoutItem | null)[];  // 6 slots, 1 item each
  misc: (ItemStack | null)[];    // 2 slots base, more with vehicle
  mode: ExpeditionMode;
}

/**
 * Active expedition state - runtime state during expedition
 */
export interface ActiveExpedition {
  map: ExpeditionMap;
  position: { x: number; y: number };
  actionsRemaining: number;
  actionsTotal: number;
  bag: ItemStack[];  // Loot collected during expedition
}

/**
 * SessionStore - Ephemeral session state
 *
 * Contains everything about the current session that doesn't persist:
 * - Current screen
 * - Active overlays/sheets
 * - Expedition loadout (during prep)
 * - Active expedition state (during expedition)
 */
class SessionStore {
  /**
   * Current screen being displayed
   */
  currentScreen: GameScreen = 'town';

  /**
   * Currently open bottom sheet (null = none)
   */
  activeSheet: string | null = null;

  /**
   * Expedition loadout being prepared
   * This is populated when entering expedition-prep screen
   */
  loadout: ExpeditionLoadout = {
    vehicle: null,
    food: [null, null, null, null, null, null],  // 6 slots
    misc: [null, null],
    mode: 'active',
  };

  /**
   * Active expedition (null when in town)
   */
  expedition: ActiveExpedition | null = null;

  /**
   * Available maps (would come from playerStore.unlocked in future)
   */
  availableMaps: ExpeditionMap[] = [];

  /**
   * Currently selected map for prep
   */
  selectedMapId: string | null = null;

  constructor() {
    makeAutoObservable(this);
    this.initializeTestData();
  }

  private initializeTestData() {
    // Generate a sample map for testing
    this.availableMaps = [this.generateSampleMap()];
    this.selectedMapId = 'iron-ridge';
  }

  private generateSampleMap(): ExpeditionMap {
    const width = 10;
    const height = 10;
    const nodes: MapNode[] = [];

    const layout = [
      ['player', 'empty', 'empty', 'mountain', 'mountain', 'empty', 'empty', 'empty', 'empty', 'empty'],
      ['empty', 'mining', 'empty', 'mountain', 'empty', 'mining', 'empty', 'herbs', 'empty', 'empty'],
      ['mining', 'empty', 'empty', 'empty', 'gems', 'empty', 'combat', 'empty', 'empty', 'empty'],
      ['empty', 'herbs', 'mountain', 'mountain', 'empty', 'herbs', 'empty', 'mining', 'empty', 'empty'],
      ['empty', 'combat', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty', 'mining', 'empty'],
      ['empty', 'empty', 'mining', 'empty', 'empty', 'mountain', 'empty', 'empty', 'empty', 'herbs'],
      ['herbs', 'empty', 'empty', 'empty', 'mining', 'empty', 'empty', 'combat', 'empty', 'empty'],
      ['empty', 'empty', 'mountain', 'mountain', 'empty', 'empty', 'empty', 'empty', 'gems', 'empty'],
      ['mining', 'empty', 'empty', 'empty', 'herbs', 'empty', 'empty', 'empty', 'empty', 'empty'],
      ['empty', 'empty', 'empty', 'empty', 'empty', 'mining', 'empty', 'herbs', 'empty', 'empty'],
    ];

    const icons: Record<string, string> = {
      mining: '⛏',
      herbs: '🌿',
      gems: '💎',
      combat: '🐺',
      mountain: '▲',
      player: '🚩',
    };

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const type = layout[y][x] as MapNode['type'];
        nodes.push({
          x,
          y,
          type,
          icon: icons[type] || undefined,
        });
      }
    }

    return {
      id: 'iron-ridge',
      name: 'Iron Ridge',
      tier: 3,
      travelDays: 2,
      terrain: 'Mountain',
      danger: 'medium',
      nodes,
      width,
      height,
    };
  }

  // === Computed Properties ===

  /**
   * Get the currently selected map
   */
  get selectedMap(): ExpeditionMap | null {
    return this.availableMaps.find(m => m.id === this.selectedMapId) ?? null;
  }

  /**
   * Calculate total actions from food loadout
   * Each slot is 1 item, so we sum the actions for each
   */
  get totalActions(): number {
    let actions = 0;
    for (const slot of this.loadout.food) {
      if (slot) {
        const item = ITEMS[slot.itemId];
        if (item?.actions) {
          actions += item.actions;  // 1 item per slot
        }
      }
    }
    return actions;
  }

  /**
   * Count how many of a specific item are in the food loadout
   */
  getFoodLoadoutCount(itemId: string): number {
    return this.loadout.food.filter(slot => slot?.itemId === itemId).length;
  }

  /**
   * Get number of misc slots (base + vehicle bonus)
   */
  get miscSlotCount(): number {
    const baseSlots = 2;
    if (this.loadout.vehicle) {
      const vehicle = ITEMS[this.loadout.vehicle.itemId];
      return baseSlots + (vehicle?.bagSlots ?? 0);
    }
    return baseSlots;
  }

  /**
   * Check if loadout is valid for starting expedition
   */
  get canStartExpedition(): boolean {
    // Must have at least 1 food item
    const hasFood = this.loadout.food.some(f => f !== null);
    // Must have selected a map
    const hasMap = this.selectedMapId !== null;
    return hasFood && hasMap;
  }

  // === Navigation Actions ===

  navigateTo(screen: GameScreen) {
    this.currentScreen = screen;
    this.activeSheet = null;

    // Reset loadout when entering prep screen
    if (screen === 'expedition-prep') {
      this.resetLoadout();
    }
  }

  openSheet(sheetId: string) {
    this.activeSheet = sheetId;
  }

  closeSheet() {
    this.activeSheet = null;
  }

  // === Loadout Actions ===

  /**
   * Reset loadout to empty state
   */
  resetLoadout() {
    this.loadout = {
      vehicle: null,
      food: [null, null, null, null, null, null],  // 6 slots
      misc: [null, null],
      mode: 'active',
    };
  }

  /**
   * Set vehicle in loadout
   */
  setVehicle(item: ItemStack | null) {
    this.loadout.vehicle = item;

    // Adjust misc slots based on vehicle
    const newSlotCount = this.miscSlotCount;
    const currentSlots = this.loadout.misc;

    if (newSlotCount > currentSlots.length) {
      // Add more slots
      while (this.loadout.misc.length < newSlotCount) {
        this.loadout.misc.push(null);
      }
    } else if (newSlotCount < currentSlots.length) {
      // Remove slots (items return to bank - handled by UI)
      this.loadout.misc = this.loadout.misc.slice(0, newSlotCount);
    }
  }

  /**
   * Set food in a specific slot (single item, no count)
   */
  setFood(slotIndex: number, item: LoadoutItem | null) {
    if (slotIndex >= 0 && slotIndex < this.loadout.food.length) {
      this.loadout.food[slotIndex] = item;
    }
  }

  /**
   * Set misc item in a specific slot
   */
  setMisc(slotIndex: number, item: ItemStack | null) {
    if (slotIndex >= 0 && slotIndex < this.loadout.misc.length) {
      this.loadout.misc[slotIndex] = item;
    }
  }

  /**
   * Toggle expedition mode
   */
  setMode(mode: ExpeditionMode) {
    this.loadout.mode = mode;
  }

  /**
   * Select a map for the expedition
   */
  selectMap(mapId: string) {
    this.selectedMapId = mapId;
  }

  // === Expedition Actions ===

  /**
   * Start the expedition with current loadout
   */
  startExpedition() {
    if (!this.canStartExpedition || !this.selectedMap) return;

    // Find starting position (player node)
    const startNode = this.selectedMap.nodes.find(n => n.type === 'player');
    const startPos = startNode
      ? { x: startNode.x, y: startNode.y }
      : { x: 0, y: 0 };

    this.expedition = {
      map: this.selectedMap,
      position: startPos,
      actionsRemaining: this.totalActions,
      actionsTotal: this.totalActions,
      bag: [],
    };

    this.navigateTo('active-expedition');
  }

  /**
   * End expedition and return to town
   */
  endExpedition() {
    // TODO: Transfer bag contents to bank
    this.expedition = null;
    this.navigateTo('town');
  }

  /**
   * Move player on map
   */
  movePlayer(x: number, y: number) {
    if (!this.expedition) return;
    this.expedition.position = { x, y };
  }

  /**
   * Use an action
   */
  useAction(cost: number = 1) {
    if (!this.expedition) return;
    this.expedition.actionsRemaining = Math.max(0, this.expedition.actionsRemaining - cost);
  }

  /**
   * Add loot to expedition bag
   */
  addToBag(itemId: string, count: number) {
    if (!this.expedition) return;

    const existing = this.expedition.bag.find(s => s.itemId === itemId);
    if (existing) {
      existing.count += count;
    } else {
      this.expedition.bag.push({ itemId, count });
    }
  }
}

export const sessionStore = new SessionStore();

// DEV: Expose for debugging
if (import.meta.env.DEV) {
  (window as unknown as { sessionStore: SessionStore }).sessionStore = sessionStore;
}
