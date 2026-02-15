/**
 * Currency Items
 */

import type { ItemDefinition } from '../../types';

export const CURRENCY_ITEMS: Record<string, ItemDefinition> = {
  'gold': {
    id: 'gold',
    name: 'Gold',
    icon: '🪙',
    category: 'currency',
    stackSize: 999999,
    description: 'The universal currency.',
  },
};
