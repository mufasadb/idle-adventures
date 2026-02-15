/**
 * Gem Items
 *
 * Precious gems and crystals.
 */

import type { ItemDefinition } from '../../types';

export const GEM_ITEMS: Record<string, ItemDefinition> = {
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
  'monster-gem': {
    id: 'monster-gem',
    name: 'Monster Gem',
    icon: '💜',
    category: 'gem',
    stackSize: 20,
    description: 'Gem from inside a monster.',
  },
};
