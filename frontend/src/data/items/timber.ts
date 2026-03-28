/**
 * Timber Items
 *
 * Tiered wood logs from Woodcutting, plus axe handle components.
 * Tier progression: pine(1) < oak(2) < willow(3) < maple(4) <
 *                   ironbark(5) < ebony(6) < yew(7) < eucalyptus(8)
 */

import type { ItemDefinition } from '../../types';

// === Tiered Wood Logs (Woodcutting resources) ===
export const TIMBER_ITEMS: Record<string, ItemDefinition> = {
  'pine-log': {
    id: 'pine-log',
    name: 'Pine Log',
    icon: '🪵',
    category: 'material',
    stackSize: 50,
    tier: 1,
    skillType: 'woodcutting',
    description: 'Soft, common pine. Good for kindling and basic handles.',
  },
  'oak-log': {
    id: 'oak-log',
    name: 'Oak Log',
    icon: '🪵',
    category: 'material',
    stackSize: 40,
    tier: 2,
    skillType: 'woodcutting',
    description: 'Sturdy hardwood. Used in crafting and construction.',
  },
  'willow-log': {
    id: 'willow-log',
    name: 'Willow Log',
    icon: '🪵',
    category: 'material',
    stackSize: 35,
    tier: 3,
    skillType: 'woodcutting',
    description: 'Flexible wood, excellent for tool handles.',
  },
  'maple-log': {
    id: 'maple-log',
    name: 'Maple Log',
    icon: '🪵',
    category: 'material',
    stackSize: 30,
    tier: 4,
    skillType: 'woodcutting',
    description: 'Dense hardwood prized for quality tools.',
  },
  'ironbark-log': {
    id: 'ironbark-log',
    name: 'Ironbark Log',
    icon: '🪵',
    category: 'material',
    stackSize: 25,
    tier: 5,
    skillType: 'woodcutting',
    description: 'Exceptionally hard wood, nearly as strong as iron.',
  },
  'ebony-log': {
    id: 'ebony-log',
    name: 'Ebony Log',
    icon: '🪵',
    category: 'material',
    stackSize: 20,
    tier: 6,
    skillType: 'woodcutting',
    description: 'Rare black-grained wood of legendary hardness.',
  },
  'yew-log': {
    id: 'yew-log',
    name: 'Yew Log',
    icon: '🪵',
    category: 'material',
    stackSize: 15,
    tier: 7,
    skillType: 'woodcutting',
    description: 'Ancient wood imbued with natural magic.',
  },
  'eucalyptus-log': {
    id: 'eucalyptus-log',
    name: 'Eucalyptus Log',
    icon: '🪵',
    category: 'material',
    stackSize: 10,
    tier: 8,
    skillType: 'woodcutting',
    description: 'The rarest timber. Its bark shimmers with elemental energy.',
  },
};

// === Axe Handles (Woodcutting tool components) ===
// Crafted from logs; combined with a metal head to form a tiered axe.
export const HANDLE_ITEMS: Record<string, ItemDefinition> = {
  'basic-handle': {
    id: 'basic-handle',
    name: 'Basic Handle',
    icon: '🟫',
    category: 'material',
    stackSize: 20,
    tier: 1,
    skillType: 'woodcutting',
    craftingComponents: [{ itemId: 'pine-log', count: 2 }],
    description: 'A rough pine handle. Gets the job done.',
  },
  'sturdy-handle': {
    id: 'sturdy-handle',
    name: 'Sturdy Handle',
    icon: '🟫',
    category: 'material',
    stackSize: 20,
    tier: 2,
    skillType: 'woodcutting',
    craftingComponents: [{ itemId: 'oak-log', count: 2 }],
    description: 'Solid oak handle. Well-balanced.',
  },
  'reinforced-handle': {
    id: 'reinforced-handle',
    name: 'Reinforced Handle',
    icon: '🟫',
    category: 'material',
    stackSize: 15,
    tier: 3,
    skillType: 'woodcutting',
    craftingComponents: [{ itemId: 'willow-log', count: 3 }],
    description: 'Willow handle wrapped in cord. Absorbs impact well.',
  },
  'masterwork-handle': {
    id: 'masterwork-handle',
    name: 'Masterwork Handle',
    icon: '🟫',
    category: 'material',
    stackSize: 10,
    tier: 4,
    skillType: 'woodcutting',
    craftingComponents: [{ itemId: 'maple-log', count: 3 }],
    description: 'Precisely crafted maple handle. Excellent grip.',
  },
  'ironbark-handle': {
    id: 'ironbark-handle',
    name: 'Ironbark Handle',
    icon: '🟫',
    category: 'material',
    stackSize: 10,
    tier: 5,
    skillType: 'woodcutting',
    craftingComponents: [{ itemId: 'ironbark-log', count: 4 }],
    description: 'Near-indestructible handle forged from ironbark.',
  },
};
