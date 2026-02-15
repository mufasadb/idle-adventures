/**
 * Item Definitions
 *
 * Static game data defining all items in the game.
 * Categories determine which loadout slots items can be placed in.
 */

import type { ItemDefinition, LoadoutSlotType, ItemCategory } from '../../types';
import { FOOD_ITEMS } from './food';
import { INGREDIENT_ITEMS } from './ingredients';
import { EQUIPMENT_ITEMS, TOOL_ITEMS, POTION_ITEMS, VEHICLE_ITEMS } from './equipment';
import { MATERIAL_ITEMS, ORE_ITEMS, HERB_ITEMS, COMBAT_DROP_ITEMS, BAR_ITEMS } from './materials';
import { GEM_ITEMS } from './gems';
import { CURRENCY_ITEMS } from './currency';

// Re-export ItemCategory for consumers that import from data/items
export type { ItemCategory };

// Re-export category-specific items for direct access
export {
  FOOD_ITEMS,
  INGREDIENT_ITEMS,
  EQUIPMENT_ITEMS,
  TOOL_ITEMS,
  POTION_ITEMS,
  VEHICLE_ITEMS,
  MATERIAL_ITEMS,
  ORE_ITEMS,
  HERB_ITEMS,
  COMBAT_DROP_ITEMS,
  BAR_ITEMS,
  GEM_ITEMS,
  CURRENCY_ITEMS,
};

/**
 * All item definitions in the game.
 * Keyed by item ID for easy lookup.
 */
export const ITEMS: Record<string, ItemDefinition> = {
  ...FOOD_ITEMS,
  ...INGREDIENT_ITEMS,
  ...EQUIPMENT_ITEMS,
  ...MATERIAL_ITEMS,
  ...GEM_ITEMS,
  ...CURRENCY_ITEMS,
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
  slotType: LoadoutSlotType
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
