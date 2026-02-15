/**
 * Item Definitions
 *
 * Re-exports from items/ directory for backwards compatibility.
 * All item definitions are now split into categorical files.
 *
 * @see ./items/food.ts - Food items
 * @see ./items/ingredients.ts - Raw materials
 * @see ./items/equipment.ts - Tools, potions, vehicles
 * @see ./items/materials.ts - Ores, herbs, combat drops, bars
 * @see ./items/gems.ts - Gems
 * @see ./items/currency.ts - Gold and currency
 */

export {
  ITEMS,
  getItem,
  canItemGoInSlot,
  // Category exports
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
} from './items/index';

export type { ItemCategory } from './items/index';
