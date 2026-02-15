/**
 * Equipment Items
 *
 * Tools, potions, and vehicles.
 */

import type { ItemDefinition } from '../../types';

export const TOOL_ITEMS: Record<string, ItemDefinition> = {
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
