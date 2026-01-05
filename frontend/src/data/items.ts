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

  // === MATERIALS - Mining ===
  'copper-ore': {
    id: 'copper-ore',
    name: 'Copper Ore',
    icon: '🟤',
    category: 'material',
    stackSize: 50,
    description: 'Common ore, needs smelting.',
  },
  'tin-ore': {
    id: 'tin-ore',
    name: 'Tin Ore',
    icon: '⚪',
    category: 'material',
    stackSize: 50,
    description: 'Light ore, combines with copper.',
  },
  'iron-ore': {
    id: 'iron-ore',
    name: 'Iron Ore',
    icon: '🪨',
    category: 'material',
    stackSize: 50,
    description: 'Raw ore, needs smelting.',
  },
  'coal': {
    id: 'coal',
    name: 'Coal',
    icon: '⬛',
    category: 'material',
    stackSize: 50,
    description: 'Fuel for smelting.',
  },
  'gold-ore': {
    id: 'gold-ore',
    name: 'Gold Ore',
    icon: '🟡',
    category: 'material',
    stackSize: 50,
    description: 'Precious metal ore.',
  },
  'silver-ore': {
    id: 'silver-ore',
    name: 'Silver Ore',
    icon: '🔘',
    category: 'material',
    stackSize: 50,
    description: 'Shiny ore for jewelry.',
  },
  'mithril-ore': {
    id: 'mithril-ore',
    name: 'Mithril Ore',
    icon: '💠',
    category: 'material',
    stackSize: 50,
    description: 'Rare magical ore.',
  },
  'adamant-ore': {
    id: 'adamant-ore',
    name: 'Adamant Ore',
    icon: '💚',
    category: 'material',
    stackSize: 50,
    description: 'Extremely hard ore.',
  },

  // === MATERIALS - Herbs ===
  'meadow-herbs': {
    id: 'meadow-herbs',
    name: 'Meadow Herbs',
    icon: '🌱',
    category: 'material',
    stackSize: 30,
    description: 'Common herbs from the meadows.',
  },
  'healing-moss': {
    id: 'healing-moss',
    name: 'Healing Moss',
    icon: '🌿',
    category: 'material',
    stackSize: 30,
    description: 'Moss with healing properties.',
  },
  'forest-herbs': {
    id: 'forest-herbs',
    name: 'Forest Herbs',
    icon: '🌿',
    category: 'material',
    stackSize: 30,
    description: 'Herbs from the deep forest.',
  },
  'moonpetal': {
    id: 'moonpetal',
    name: 'Moonpetal',
    icon: '🌸',
    category: 'material',
    stackSize: 20,
    description: 'Blooms only at night.',
  },
  'alpine-herbs': {
    id: 'alpine-herbs',
    name: 'Alpine Herbs',
    icon: '🌿',
    category: 'material',
    stackSize: 30,
    description: 'Medicinal herbs from the mountains.',
  },
  'frostbloom': {
    id: 'frostbloom',
    name: 'Frostbloom',
    icon: '❄️',
    category: 'material',
    stackSize: 20,
    description: 'Cold-resistant flower.',
  },
  'starflower': {
    id: 'starflower',
    name: 'Starflower',
    icon: '⭐',
    category: 'material',
    stackSize: 20,
    description: 'Rare glowing flower.',
  },
  'volcanic-herbs': {
    id: 'volcanic-herbs',
    name: 'Volcanic Herbs',
    icon: '🔥',
    category: 'material',
    stackSize: 30,
    description: 'Heat-resistant herbs.',
  },
  'dragons-tongue': {
    id: 'dragons-tongue',
    name: "Dragon's Tongue",
    icon: '🐉',
    category: 'material',
    stackSize: 10,
    description: 'Fiery red flower.',
  },
  'phoenix-feather': {
    id: 'phoenix-feather',
    name: 'Phoenix Feather',
    icon: '🔶',
    category: 'material',
    stackSize: 10,
    description: 'Legendary crafting material.',
  },

  // === MATERIALS - Combat Drops ===
  'leather-scraps': {
    id: 'leather-scraps',
    name: 'Leather Scraps',
    icon: '🟫',
    category: 'material',
    stackSize: 50,
    description: 'Basic crafting material.',
  },
  'wolf-fang': {
    id: 'wolf-fang',
    name: 'Wolf Fang',
    icon: '🦷',
    category: 'material',
    stackSize: 30,
    description: 'Trophy from wolf.',
  },
  'beast-hide': {
    id: 'beast-hide',
    name: 'Beast Hide',
    icon: '🐾',
    category: 'material',
    stackSize: 30,
    description: 'Tough hide from beasts.',
  },
  'monster-bone': {
    id: 'monster-bone',
    name: 'Monster Bone',
    icon: '🦴',
    category: 'material',
    stackSize: 30,
    description: 'Hard bone from monsters.',
  },
  'rare-drop': {
    id: 'rare-drop',
    name: 'Rare Drop',
    icon: '✨',
    category: 'material',
    stackSize: 20,
    description: 'Uncommon monster loot.',
  },
  'monster-gem': {
    id: 'monster-gem',
    name: 'Monster Gem',
    icon: '💜',
    category: 'gem',
    stackSize: 20,
    description: 'Gem from inside a monster.',
  },
  'dragon-scale': {
    id: 'dragon-scale',
    name: 'Dragon Scale',
    icon: '🐲',
    category: 'material',
    stackSize: 10,
    description: 'Legendary crafting material.',
  },
  'legendary-essence': {
    id: 'legendary-essence',
    name: 'Legendary Essence',
    icon: '💫',
    category: 'material',
    stackSize: 5,
    description: 'Pure magical essence.',
  },
  'oak-log': {
    id: 'oak-log',
    name: 'Oak Log',
    icon: '🪵',
    category: 'material',
    stackSize: 30,
    description: 'Sturdy wood for crafting.',
  },

  // === GEMS ===
  'rough-quartz': {
    id: 'rough-quartz',
    name: 'Rough Quartz',
    icon: '🔳',
    category: 'gem',
    stackSize: 20,
    description: 'Common crystal.',
  },
  'raw-amethyst': {
    id: 'raw-amethyst',
    name: 'Raw Amethyst',
    icon: '🟣',
    category: 'gem',
    stackSize: 20,
    description: 'Purple gemstone.',
  },
  'raw-topaz': {
    id: 'raw-topaz',
    name: 'Raw Topaz',
    icon: '🟠',
    category: 'gem',
    stackSize: 20,
    description: 'Orange gemstone.',
  },
  'raw-sapphire': {
    id: 'raw-sapphire',
    name: 'Raw Sapphire',
    icon: '🔵',
    category: 'gem',
    stackSize: 20,
    description: 'Uncut blue gemstone.',
  },
  'raw-ruby': {
    id: 'raw-ruby',
    name: 'Raw Ruby',
    icon: '🔴',
    category: 'gem',
    stackSize: 20,
    description: 'Uncut red gemstone.',
  },
  'raw-emerald': {
    id: 'raw-emerald',
    name: 'Raw Emerald',
    icon: '🟢',
    category: 'gem',
    stackSize: 20,
    description: 'Uncut green gemstone.',
  },
  'raw-diamond': {
    id: 'raw-diamond',
    name: 'Raw Diamond',
    icon: '💎',
    category: 'gem',
    stackSize: 20,
    description: 'Uncut precious diamond.',
  },
  'star-ruby': {
    id: 'star-ruby',
    name: 'Star Ruby',
    icon: '⭐',
    category: 'gem',
    stackSize: 10,
    description: 'Rare ruby with star pattern.',
  },
  'void-gem': {
    id: 'void-gem',
    name: 'Void Gem',
    icon: '⚫',
    category: 'gem',
    stackSize: 5,
    description: 'Mysterious dark gem.',
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
