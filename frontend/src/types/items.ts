/**
 * Item Types
 *
 * Types for items, inventory, and item categories.
 */

/**
 * Item categories determine which loadout slots items can be placed in
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

/**
 * Static item definition (game data)
 */
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

  // Tier system — higher = rarer/better
  tier?: number;           // 1 = lowest, 8 = highest (follows timber scale)
  skillType?: string;      // Which skill this item belongs to (e.g. 'woodcutting', 'mining')
  craftingComponents?: Array<{ itemId: string; count: number }>; // For tools: required crafting parts
}

/**
 * Runtime item stack (in inventory/bank)
 */
export interface ItemStack {
  itemId: string;
  count: number;
}

/**
 * Slot types for loadout
 */
export type LoadoutSlotType = 'vehicle' | 'food' | 'misc';
