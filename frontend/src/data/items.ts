/**
 * Item Definitions
 *
 * Static game data defining all items in the game.
 * Categories determine which loadout slots items can be placed in.
 */

export type ItemCategory =
  | 'ingredient'  // Raw materials for cooking - cannot go in food slots
  | 'food'        // Cooked/prepared food - goes in food slots, provides actions
  | 'water'       // Water containers - future: separate hydration system
  | 'tool'        // Equipment that aids gathering/combat - misc slots
  | 'potion'      // Consumable buffs - misc slots
  | 'vehicle'     // Transport - vehicle slot, affects bag size/speed
  | 'material'    // Gathered resources (ore, wood, etc) - loot only
  | 'gem'         // Valuable items - loot only
  | 'currency';   // Gold, tokens - special handling

export interface ItemDefinition {
  id: string;
  name: string;
  icon: string;
  category: ItemCategory;
  stackSize: number;
  description?: string;

  // Optional properties based on category
  actions?: number;        // For food: how many actions this provides
  bagSlots?: number;       // For vehicles: extra misc slots provided
  speedBonus?: number;     // For vehicles: % bonus to travel (future)
  effect?: string;         // For potions: what buff it provides (future)
}

/**
 * All item definitions in the game.
 * Keyed by item ID for easy lookup.
 */
export const ITEMS: Record<string, ItemDefinition> = {
  // === FOOD (goes in food slots, provides actions) ===
  'cooked-fish': {
    id: 'cooked-fish',
    name: 'Cooked Fish',
    icon: '🐟',
    category: 'food',
    stackSize: 10,
    actions: 3,
    description: 'A hearty meal. Provides 3 actions.',
  },
  'bread': {
    id: 'bread',
    name: 'Bread',
    icon: '🍞',
    category: 'food',
    stackSize: 10,
    actions: 2,
    description: 'Simple but filling. Provides 2 actions.',
  },
  'stew': {
    id: 'stew',
    name: 'Hearty Stew',
    icon: '🍲',
    category: 'food',
    stackSize: 5,
    actions: 5,
    description: 'A rich stew. Provides 5 actions.',
  },

  // === INGREDIENTS (raw materials, cannot go in food slots) ===
  'raw-fish': {
    id: 'raw-fish',
    name: 'Raw Fish',
    icon: '🐠',
    category: 'ingredient',
    stackSize: 20,
    description: 'Needs cooking before eating.',
  },
  'wheat': {
    id: 'wheat',
    name: 'Wheat',
    icon: '🌾',
    category: 'ingredient',
    stackSize: 50,
    description: 'Can be milled into flour.',
  },

  // === TOOLS (misc slots) ===
  'iron-pickaxe': {
    id: 'iron-pickaxe',
    name: 'Iron Pickaxe',
    icon: '⛏️',
    category: 'tool',
    stackSize: 1,
    description: 'Improves mining yield by 15%.',
  },
  'herbalist-kit': {
    id: 'herbalist-kit',
    name: 'Herbalist Kit',
    icon: '🧰',
    category: 'tool',
    stackSize: 1,
    description: 'Improves herb gathering yield by 15%.',
  },
  'rope': {
    id: 'rope',
    name: 'Rope',
    icon: '🪢',
    category: 'tool',
    stackSize: 1,
    description: 'Access cliff and ravine nodes.',
  },

  // === POTIONS (misc slots, consumable buffs) ===
  'health-potion': {
    id: 'health-potion',
    name: 'Health Potion',
    icon: '🧪',
    category: 'potion',
    stackSize: 5,
    effect: 'heal',
    description: 'Restores health in combat.',
  },
  'speed-potion': {
    id: 'speed-potion',
    name: 'Speed Potion',
    icon: '💨',
    category: 'potion',
    stackSize: 5,
    effect: 'speed',
    description: 'Reduces action cost by 1 for 3 nodes.',
  },

  // === VEHICLES (vehicle slot) ===
  'cart': {
    id: 'cart',
    name: 'Wooden Cart',
    icon: '🛒',
    category: 'vehicle',
    stackSize: 1,
    bagSlots: 6,
    speedBonus: -10,
    description: 'Adds 6 misc slots but slows travel by 10%.',
  },
  'horse': {
    id: 'horse',
    name: 'Horse',
    icon: '🐴',
    category: 'vehicle',
    stackSize: 1,
    bagSlots: 2,
    speedBonus: 25,
    description: 'Adds 2 misc slots and speeds travel by 25%.',
  },

  // === MATERIALS (loot from gathering) ===
  'iron-ore': {
    id: 'iron-ore',
    name: 'Iron Ore',
    icon: '🪨',
    category: 'material',
    stackSize: 50,
    description: 'Raw ore, needs smelting.',
  },
  'copper-ore': {
    id: 'copper-ore',
    name: 'Copper Ore',
    icon: '🪨',
    category: 'material',
    stackSize: 50,
    description: 'Raw ore, needs smelting.',
  },
  'alpine-herbs': {
    id: 'alpine-herbs',
    name: 'Alpine Herbs',
    icon: '🌿',
    category: 'material',
    stackSize: 30,
    description: 'Medicinal herbs from the mountains.',
  },
  'oak-log': {
    id: 'oak-log',
    name: 'Oak Log',
    icon: '🪵',
    category: 'material',
    stackSize: 30,
    description: 'Sturdy wood for crafting.',
  },

  // === GEMS (valuable loot) ===
  'raw-ruby': {
    id: 'raw-ruby',
    name: 'Raw Ruby',
    icon: '💎',
    category: 'gem',
    stackSize: 20,
    description: 'Uncut gemstone. Can be refined.',
  },
  'raw-sapphire': {
    id: 'raw-sapphire',
    name: 'Raw Sapphire',
    icon: '💎',
    category: 'gem',
    stackSize: 20,
    description: 'Uncut gemstone. Can be refined.',
  },

  // === CURRENCY ===
  'gold': {
    id: 'gold',
    name: 'Gold',
    icon: '🪙',
    category: 'currency',
    stackSize: 999999,
    description: 'The universal currency.',
  },
};

/**
 * Helper to get item definition by ID
 */
export function getItem(id: string): ItemDefinition | undefined {
  return ITEMS[id];
}

/**
 * Helper to check if item can go in a specific slot type
 */
export function canItemGoInSlot(
  itemId: string,
  slotType: 'vehicle' | 'food' | 'misc'
): boolean {
  const item = ITEMS[itemId];
  if (!item) return false;

  switch (slotType) {
    case 'vehicle':
      return item.category === 'vehicle';
    case 'food':
      return item.category === 'food';
    case 'misc':
      return item.category === 'tool' || item.category === 'potion';
    default:
      return false;
  }
}
