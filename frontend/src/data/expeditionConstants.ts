export const EXPEDITION_CONSTANTS = {
  FOOD_SLOT_COUNT: 6,
  MISC_SLOT_COUNT: 4,
  FOOD_SLOT_ITEM_CAP: 10,          // max stacks per food slot (display only)
  ANIMAL_AP_MULTIPLIER: 0.5,        // animal.tier × beastcraft_level × this
  DESERT_PENALTY: 5,                // AP penalty: desert map + no Desert Cloak
  DESERT_CLOAK_TAG: 'desert-protection',
  DESERT_BIOME: 'desert',
} as const;
