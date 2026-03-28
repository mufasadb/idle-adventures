/**
 * Equipment Items
 *
 * Tools, potions, and vehicles.
 * Each gathering skill has a tiered set of tools (T1–T5).
 * Tier = the resource tier they unlock/improve gathering for.
 */

import type { ItemDefinition } from '../../types';

// === Woodcutting Axes (Woodcutting T1–T5) ===
export const AXE_ITEMS: Record<string, ItemDefinition> = {
  'bronze-axe': {
    id: 'bronze-axe',
    name: 'Bronze Axe',
    icon: '🪓',
    category: 'tool',
    stackSize: 1,
    tier: 1,
    skillType: 'woodcutting',
    craftingComponents: [
      { itemId: 'basic-handle', count: 1 },
      { itemId: 'bronze-bar', count: 1 },
    ],
    description: 'Entry-level axe for felling pine and oak. Slow but reliable.',
  },
  'iron-axe': {
    id: 'iron-axe',
    name: 'Iron Axe',
    icon: '🪓',
    category: 'tool',
    stackSize: 1,
    tier: 2,
    skillType: 'woodcutting',
    craftingComponents: [
      { itemId: 'sturdy-handle', count: 1 },
      { itemId: 'iron-bar', count: 1 },
    ],
    description: 'Standard axe. Handles willow with ease.',
  },
  'steel-axe': {
    id: 'steel-axe',
    name: 'Steel Axe',
    icon: '🪓',
    category: 'tool',
    stackSize: 1,
    tier: 3,
    skillType: 'woodcutting',
    craftingComponents: [
      { itemId: 'reinforced-handle', count: 1 },
      { itemId: 'steel-bar', count: 1 },
    ],
    description: 'Sharp steel head cuts through hardwoods cleanly.',
  },
  'mithril-axe': {
    id: 'mithril-axe',
    name: 'Mithril Axe',
    icon: '🪓',
    category: 'tool',
    stackSize: 1,
    tier: 4,
    skillType: 'woodcutting',
    craftingComponents: [
      { itemId: 'masterwork-handle', count: 1 },
      { itemId: 'mithril-bar', count: 1 },
    ],
    description: 'Lightweight and razor-keen. Fells ironbark like pine.',
  },
  'adamant-axe': {
    id: 'adamant-axe',
    name: 'Adamant Axe',
    icon: '🪓',
    category: 'tool',
    stackSize: 1,
    tier: 5,
    skillType: 'woodcutting',
    craftingComponents: [
      { itemId: 'ironbark-handle', count: 1 },
      { itemId: 'adamant-bar', count: 1 },
    ],
    description: 'The finest axe. Even ebony and yew offer no resistance.',
  },
};

// === Mining Pickaxes (Mining T1–T5) ===
export const PICKAXE_ITEMS: Record<string, ItemDefinition> = {
  'bronze-pickaxe': {
    id: 'bronze-pickaxe',
    name: 'Bronze Pickaxe',
    icon: '⛏️',
    category: 'tool',
    stackSize: 1,
    tier: 1,
    skillType: 'mining',
    craftingComponents: [
      { itemId: 'basic-handle', count: 1 },
      { itemId: 'bronze-bar', count: 1 },
    ],
    description: 'Starter pickaxe. Mines copper and tin ore.',
  },
  'iron-pickaxe': {
    id: 'iron-pickaxe',
    name: 'Iron Pickaxe',
    icon: '⛏️',
    category: 'tool',
    stackSize: 1,
    tier: 2,
    skillType: 'mining',
    craftingComponents: [
      { itemId: 'sturdy-handle', count: 1 },
      { itemId: 'iron-bar', count: 1 },
    ],
    description: 'Reliable pickaxe. Improves mining yield by 15%.',
  },
  'steel-pickaxe': {
    id: 'steel-pickaxe',
    name: 'Steel Pickaxe',
    icon: '⛏️',
    category: 'tool',
    stackSize: 1,
    tier: 3,
    skillType: 'mining',
    craftingComponents: [
      { itemId: 'reinforced-handle', count: 1 },
      { itemId: 'steel-bar', count: 1 },
    ],
    description: 'Mines gold and silver efficiently.',
  },
  'mithril-pickaxe': {
    id: 'mithril-pickaxe',
    name: 'Mithril Pickaxe',
    icon: '⛏️',
    category: 'tool',
    stackSize: 1,
    tier: 4,
    skillType: 'mining',
    craftingComponents: [
      { itemId: 'masterwork-handle', count: 1 },
      { itemId: 'mithril-bar', count: 1 },
    ],
    description: 'Magical pickaxe that reveals mithril veins.',
  },
  'adamant-pickaxe': {
    id: 'adamant-pickaxe',
    name: 'Adamant Pickaxe',
    icon: '⛏️',
    category: 'tool',
    stackSize: 1,
    tier: 5,
    skillType: 'mining',
    craftingComponents: [
      { itemId: 'ironbark-handle', count: 1 },
      { itemId: 'adamant-bar', count: 1 },
    ],
    description: 'Mines adamant ore with ease. Near-unbreakable head.',
  },
};

// === Herbalist Kits (Herbalism T1–T4) ===
export const HERBALIST_ITEMS: Record<string, ItemDefinition> = {
  'basic-herbalist-kit': {
    id: 'basic-herbalist-kit',
    name: 'Basic Herbalist Kit',
    icon: '🧰',
    category: 'tool',
    stackSize: 1,
    tier: 1,
    skillType: 'herbalism',
    description: 'Simple cutting tools. Gathers common herbs.',
  },
  'herbalist-kit': {
    id: 'herbalist-kit',
    name: 'Herbalist Kit',
    icon: '🧰',
    category: 'tool',
    stackSize: 1,
    tier: 2,
    skillType: 'herbalism',
    description: 'Improves herb gathering yield by 15%.',
  },
  'silver-herbalist-kit': {
    id: 'silver-herbalist-kit',
    name: 'Silver Herbalist Kit',
    icon: '🧰',
    category: 'tool',
    stackSize: 1,
    tier: 3,
    skillType: 'herbalism',
    craftingComponents: [
      { itemId: 'silver-bar', count: 1 },
    ],
    description: 'Silver-tipped tools preserve herb potency. Gathers rare flora.',
  },
  'mithril-herbalist-kit': {
    id: 'mithril-herbalist-kit',
    name: 'Mithril Herbalist Kit',
    icon: '🧰',
    category: 'tool',
    stackSize: 1,
    tier: 4,
    skillType: 'herbalism',
    craftingComponents: [
      { itemId: 'mithril-bar', count: 1 },
    ],
    description: 'Magically attuned tools. Finds legendary herbs.',
  },
};

// === Fishing Rods (Fishing T1–T4) ===
export const FISHING_ROD_ITEMS: Record<string, ItemDefinition> = {
  'basic-fishing-rod': {
    id: 'basic-fishing-rod',
    name: 'Basic Fishing Rod',
    icon: '🎣',
    category: 'tool',
    stackSize: 1,
    tier: 1,
    skillType: 'fishing',
    craftingComponents: [
      { itemId: 'pine-log', count: 1 },
    ],
    description: 'A simple pine rod. Catches sardines.',
  },
  'fly-fishing-rod': {
    id: 'fly-fishing-rod',
    name: 'Fly Fishing Rod',
    icon: '🎣',
    category: 'tool',
    stackSize: 1,
    tier: 2,
    skillType: 'fishing',
    craftingComponents: [
      { itemId: 'oak-log', count: 1 },
    ],
    description: 'Willow and oak construction. Catches trout.',
  },
  'sturdy-fishing-rod': {
    id: 'sturdy-fishing-rod',
    name: 'Sturdy Fishing Rod',
    icon: '🎣',
    category: 'tool',
    stackSize: 1,
    tier: 3,
    skillType: 'fishing',
    craftingComponents: [
      { itemId: 'maple-log', count: 1 },
      { itemId: 'iron-bar', count: 1 },
    ],
    description: 'Iron-reinforced rod for deep-water salmon.',
  },
  'master-fishing-rod': {
    id: 'master-fishing-rod',
    name: 'Master Fishing Rod',
    icon: '🎣',
    category: 'tool',
    stackSize: 1,
    tier: 4,
    skillType: 'fishing',
    craftingComponents: [
      { itemId: 'yew-log', count: 1 },
      { itemId: 'mithril-bar', count: 1 },
    ],
    description: 'Yew-shaft rod with mithril guides. Hauls lobster from the deep.',
  },
};

// === Misc Tools ===
export const MISC_TOOL_ITEMS: Record<string, ItemDefinition> = {
  'rope': {
    id: 'rope',
    name: 'Rope',
    icon: '🪢',
    category: 'tool',
    stackSize: 1,
    description: 'Access cliff and ravine nodes.',
  },
};

export const TOOL_ITEMS: Record<string, ItemDefinition> = {
  ...AXE_ITEMS,
  ...PICKAXE_ITEMS,
  ...HERBALIST_ITEMS,
  ...FISHING_ROD_ITEMS,
  ...MISC_TOOL_ITEMS,
};

export const POTION_ITEMS: Record<string, ItemDefinition> = {
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
};

export const VEHICLE_ITEMS: Record<string, ItemDefinition> = {
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
};

export const EQUIPMENT_ITEMS: Record<string, ItemDefinition> = {
  ...TOOL_ITEMS,
  ...POTION_ITEMS,
  ...VEHICLE_ITEMS,
};
