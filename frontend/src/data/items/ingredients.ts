/**
 * Ingredient Items
 *
 * Raw materials that can be processed into other items.
 */

import type { ItemDefinition } from '../../types';

export const INGREDIENT_ITEMS: Record<string, ItemDefinition> = {
  'raw-sardines': {
    id: 'raw-sardines',
    name: 'Raw Sardines',
    icon: '🐠',
    category: 'ingredient',
    stackSize: 20,
    description: 'Small fish. Can be cooked.',
  },
  'raw-trout': {
    id: 'raw-trout',
    name: 'Raw Trout',
    icon: '🐟',
    category: 'ingredient',
    stackSize: 20,
    description: 'Freshwater fish. Can be cooked.',
  },
  'raw-salmon': {
    id: 'raw-salmon',
    name: 'Raw Salmon',
    icon: '🐟',
    category: 'ingredient',
    stackSize: 20,
    description: 'Pink-fleshed fish. Can be cooked.',
  },
  'raw-lobster': {
    id: 'raw-lobster',
    name: 'Raw Lobster',
    icon: '🦞',
    category: 'ingredient',
    stackSize: 15,
    description: 'Prized crustacean. Can be cooked.',
  },
  'wheat': {
    id: 'wheat',
    name: 'Wheat',
    icon: '🌾',
    category: 'ingredient',
    stackSize: 50,
    description: 'Can be milled into flour.',
  },
};
