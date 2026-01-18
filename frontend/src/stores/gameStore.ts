/**
 * @deprecated This store is legacy code.
 * Use sessionStore for UI state and playerStore for player data.
 *
 * Types have been moved to src/types/:
 * - GameScreen -> types/session.ts
 * - MapNode, ExpeditionMap -> types/expedition.ts
 */
import { makeAutoObservable } from 'mobx';

export type GameScreen = 'town' | 'expedition-prep' | 'active-expedition' | 'node-interaction' | 'minigame';

export interface InventoryItem {
  id: string;
  icon: string;
  name: string;
  count: number;
  weight: number;
  description?: string;
}

export interface Skill {
  id: string;
  name: string;
  level: number;
  xp: number;
  xpToNext: number;
  category: 'gathering' | 'combat' | 'crafting' | 'support';
}

export interface MapNode {
  x: number;
  y: number;
  type: 'empty' | 'mining' | 'herbs' | 'gems' | 'combat' | 'fishing' | 'mountain' | 'water' | 'player';
  icon?: string;
  cleared?: boolean;
}

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

class GameStore {
  currentScreen: GameScreen = 'town';
  activeSheet: string | null = null;

  // Player stats
  gold: number = 1234;
  rations: number = 8;
  maxCarrySlots: number = 30;

  // Inventory (slot-based)
  inventory: (InventoryItem | null)[] = [];

  // Skills
  skills: Skill[] = [];

  // Current expedition
  selectedMap: ExpeditionMap | null = null;
  packedRations: number = 6;
  expeditionDay: number = 1;
  hoursRemaining: number = 10;
  playerPosition: { x: number; y: number } = { x: 0, y: 0 };

  constructor() {
    makeAutoObservable(this);
    this.initializeData();
  }

  private initializeData() {
    // Initialize inventory with some items
    const items: InventoryItem[] = [
      { id: '1', icon: '🪨', name: 'Iron Ore', count: 12, weight: 1, description: 'Raw ore, needs smelting' },
      { id: '2', icon: '🪨', name: 'Iron Ore', count: 9, weight: 1, description: 'Raw ore, needs smelting' },
      { id: '3', icon: '🌿', name: 'Alpine Herbs', count: 4, weight: 0.5, description: 'Medicinal herbs' },
      { id: '4', icon: '🌿', name: 'Alpine Herbs', count: 4, weight: 0.5, description: 'Medicinal herbs' },
      { id: '5', icon: '🧱', name: 'Copper Ingot', count: 8, weight: 2, description: 'Processed copper' },
      { id: '6', icon: '🧱', name: 'Copper Ingot', count: 7, weight: 2, description: 'Processed copper' },
      { id: '7', icon: '💎', name: 'Raw Gem', count: 2, weight: 0.5, description: 'Uncut gemstone' },
      { id: '8', icon: '🎯', name: 'Wolf Pelt', count: 2, weight: 3, description: 'Quality fur' },
      { id: '9', icon: '🦴', name: 'Wolf Fangs', count: 4, weight: 0.2, description: 'Sharp teeth' },
    ];

    this.inventory = new Array(this.maxCarrySlots).fill(null);
    items.forEach((item, i) => {
      this.inventory[i] = item;
    });

    // Initialize skills
    this.skills = [
      { id: 'mining', name: 'Mining', level: 28, xp: 4230, xpToNext: 6500, category: 'gathering' },
      { id: 'woodcutting', name: 'Woodcutting', level: 15, xp: 1200, xpToNext: 4000, category: 'gathering' },
      { id: 'herbalism', name: 'Herbalism', level: 12, xp: 890, xpToNext: 2000, category: 'gathering' },
      { id: 'melee', name: 'Melee', level: 22, xp: 3900, xpToNext: 5000, category: 'combat' },
      { id: 'ranged', name: 'Ranged', level: 8, xp: 450, xpToNext: 1500, category: 'combat' },
      { id: 'smithing', name: 'Smithing', level: 18, xp: 2750, xpToNext: 5000, category: 'crafting' },
      { id: 'tailoring', name: 'Tailoring', level: 12, xp: 600, xpToNext: 2400, category: 'crafting' },
      { id: 'cooking', name: 'Cooking', level: 15, xp: 1800, xpToNext: 3600, category: 'crafting' },
      { id: 'cartography', name: 'Cartography', level: 28, xp: 4100, xpToNext: 6200, category: 'support' },
    ];

    // Initialize a sample map
    this.selectedMap = this.generateSampleMap();
  }

  private generateSampleMap(): ExpeditionMap {
    const width = 10;
    const height = 10;
    const nodes: MapNode[] = [];

    const layout = [
      ['player', 'empty', 'empty', 'mountain', 'mountain', 'empty', 'empty', 'empty', 'empty', 'empty'],
      ['empty', 'mining', 'empty', 'mountain', 'empty', 'mining', 'empty', 'herbs', 'empty', 'fishing'],
      ['mining', 'empty', 'empty', 'empty', 'empty', 'empty', 'combat', 'empty', 'empty', 'water'],
      ['empty', 'herbs', 'mountain', 'mountain', 'empty', 'herbs', 'empty', 'mining', 'empty', 'fishing'],
      ['empty', 'combat', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty', 'mining', 'empty'],
      ['empty', 'empty', 'mining', 'empty', 'empty', 'mountain', 'empty', 'empty', 'empty', 'herbs'],
      ['herbs', 'empty', 'empty', 'empty', 'mining', 'empty', 'empty', 'combat', 'empty', 'empty'],
      ['fishing', 'water', 'mountain', 'mountain', 'empty', 'empty', 'empty', 'empty', 'empty', 'empty'],
      ['mining', 'fishing', 'empty', 'empty', 'herbs', 'empty', 'empty', 'empty', 'empty', 'empty'],
      ['empty', 'empty', 'empty', 'empty', 'empty', 'mining', 'empty', 'herbs', 'empty', 'empty'],
    ];

    const icons: Record<string, string> = {
      mining: '⛏',
      herbs: '🌿',
      gems: '💎',
      combat: '🐺',
      fishing: '🐟',
      water: '🌊',
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

        if (type === 'player') {
          this.playerPosition = { x, y };
        }
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

  // Navigation
  navigateTo(screen: GameScreen) {
    this.currentScreen = screen;
    this.activeSheet = null;
  }

  openSheet(sheetId: string) {
    this.activeSheet = sheetId;
  }

  closeSheet() {
    this.activeSheet = null;
  }

  // Expedition actions
  setPackedRations(amount: number) {
    this.packedRations = Math.max(0, Math.min(this.rations, amount));
  }

  get usedSlots(): number {
    return this.inventory.filter(Boolean).length;
  }

  get availableMaps(): ExpeditionMap[] {
    return this.selectedMap ? [this.selectedMap] : [];
  }
}

export const gameStore = new GameStore();

// DEV: Expose for debugging
if (import.meta.env.DEV) {
  (window as unknown as { gameStore: GameStore }).gameStore = gameStore;
}
