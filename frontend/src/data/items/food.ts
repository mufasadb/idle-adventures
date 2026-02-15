/**
 * Food Items
 *
 * Items that go in food slots and provide actions.
 */

import type { ItemDefinition } from '../../types';

export const FOOD_ITEMS: Record<string, ItemDefinition> = {
  'sardines': {
    id: 'sardines',
    name: 'Cooked Sardines',
    icon: '🐟',
    category: 'food',
    stackSize: 20,
    actions: 2,
    description: 'Small tasty fish. Provides 2 actions.',
  },
  'trout': {
    id: 'trout',
    name: 'Cooked Trout',
    icon: '🐟',
    category: 'food',
    stackSize: 20,
    actions: 3,
    description: 'Flaky freshwater fish. Provides 3 actions.',
  },
  'salmon': {
    id: 'salmon',
    name: 'Cooked Salmon',
    icon: '🍣',
    category: 'food',
    stackSize: 20,
    actions: 4,
    description: 'Rich pink fish. Provides 4 actions.',
  },
  'lobster': {
    id: 'lobster',
    name: 'Cooked Lobster',
    icon: '🦞',
    category: 'food',
    stackSize: 15,
    actions: 6,
    description: 'Luxurious shellfish. Provides 6 actions.',
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
};
