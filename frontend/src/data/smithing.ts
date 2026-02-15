/**
 * Smithing System Configuration
 *
 * Defines recipes, level requirements, and minigame parameters for smithing.
 * Smithing transforms ores into bars through a multi-step active process.
 */

import { TICK_MS } from './combat';

/** Ore types that can be smelted */
export type OreType =
  | 'copper-ore'
  | 'tin-ore'
  | 'iron-ore'
  | 'coal'
  | 'silver-ore'
  | 'gold-ore'
  | 'mithril-ore'
  | 'adamant-ore';

/** Bar types produced by smelting */
export type BarType =
  | 'copper-bar'
  | 'bronze-bar'
  | 'iron-bar'
  | 'steel-bar'
  | 'silver-bar'
  | 'gold-bar'
  | 'mithril-bar'
  | 'adamant-bar';

/** Mold types for shaping metal */
export type MoldType = 'bar' | 'pickaxe-head' | 'axe-head' | 'sword-blade';

/** A single ingredient in a smithing recipe */
export interface SmithingIngredient {
  oreId: OreType;
  count: number;
}

/** Smithing recipe definition */
export interface SmithingRecipe {
  /** Unique recipe ID */
  id: string;
  /** Output item ID */
  outputId: string;
  /** How many items produced */
  outputCount: number;
  /** Required ore ingredients */
  ingredients: SmithingIngredient[];
  /** Mold type needed */
  moldType: MoldType;
  /** Recipe tier (1-5) */
  tier: number;
  /** Minimum smithing level required */
  levelRequired: number;
  /** Target heat level (0-100) */
  heatTarget: number;
  /** Acceptable deviation from target */
  heatTolerance: number;
  /** Number of hammer hits to finish */
  hammerHits: number;
}

/** Smithing minigame constants */
export const SMITHING_CONSTANTS = {
  /** Tick duration in ms (same as combat/cooking) */
  TICK_MS,

  // === Bellows ===
  /** Heat gained per full pump cycle (up + down) */
  HEAT_GAIN_PER_PUMP: 8,
  /** Heat lost per tick when not pumping */
  HEAT_DECAY_PER_TICK: 1.5,
  /** Minimum time (ms) for a full pump cycle */
  MIN_PUMP_CYCLE_MS: 300,
  /** Maximum pump speed bonus */
  MAX_PUMP_SPEED_BONUS: 1.5,

  // === Pouring ===
  /** Pour rate when dragging at optimal speed */
  POUR_RATE_OPTIMAL: 0.02, // 2% fill per frame at optimal
  /** Below this speed = too slow (metal cools) */
  POUR_SPEED_MIN: 0.3,
  /** Above this speed = spill */
  POUR_SPEED_MAX: 0.85,
  /** Optimal pour speed */
  POUR_SPEED_OPTIMAL: 0.55,
  /** Quality penalty per spill event */
  SPILL_PENALTY: 0.1,

  // === Quality ===
  /** Weight of heat accuracy in final quality (0-1) */
  QUALITY_HEAT_WEIGHT: 0.4,
  /** Weight of pour accuracy in final quality (0-1) */
  QUALITY_POUR_WEIGHT: 0.4,
  /** Weight of hammer accuracy in final quality (0-1) */
  QUALITY_HAMMER_WEIGHT: 0.2,

  // === XP ===
  /** Base XP for completing a bar */
  BASE_XP_PER_BAR: 25,
  /** XP multiplier per tier */
  XP_MULTIPLIER_PER_TIER: 1.5,
  /** Bonus XP for high quality */
  QUALITY_XP_BONUS: 0.25,

  // === Misc ===
  /** How long heat stays "locked in" after reaching target */
  HEAT_LOCK_TICKS: 3,
};

/** Visual info for ore types */
export const ORE_INFO: Record<OreType, { name: string; icon: string; color: string }> = {
  'copper-ore': { name: 'Copper', icon: '🟤', color: '#b87333' },
  'tin-ore': { name: 'Tin', icon: '⚪', color: '#d3d3d3' },
  'iron-ore': { name: 'Iron', icon: '🪨', color: '#a19d94' },
  'coal': { name: 'Coal', icon: '⬛', color: '#2d2d2d' },
  'silver-ore': { name: 'Silver', icon: '🔘', color: '#c0c0c0' },
  'gold-ore': { name: 'Gold', icon: '🟡', color: '#ffd700' },
  'mithril-ore': { name: 'Mithril', icon: '💠', color: '#4169e1' },
  'adamant-ore': { name: 'Adamant', icon: '💚', color: '#228b22' },
};

/** Visual info for bar types */
export const BAR_INFO: Record<BarType, { name: string; icon: string; color: string }> = {
  'copper-bar': { name: 'Copper Bar', icon: '🟫', color: '#b87333' },
  'bronze-bar': { name: 'Bronze Bar', icon: '🟤', color: '#cd7f32' },
  'iron-bar': { name: 'Iron Bar', icon: '⬜', color: '#a19d94' },
  'steel-bar': { name: 'Steel Bar', icon: '🔲', color: '#71797e' },
  'silver-bar': { name: 'Silver Bar', icon: '⬜', color: '#c0c0c0' },
  'gold-bar': { name: 'Gold Bar', icon: '🟨', color: '#ffd700' },
  'mithril-bar': { name: 'Mithril Bar', icon: '🟦', color: '#4169e1' },
  'adamant-bar': { name: 'Adamant Bar', icon: '🟩', color: '#228b22' },
};

/**
 * All smithing recipes
 * Level requirement roughly = tier * 7-8
 */
export const SMITHING_RECIPES: SmithingRecipe[] = [
  // Tier 1: Copper (level 1) - Pure metal, intro
  {
    id: 'smelt-copper',
    outputId: 'copper-bar',
    outputCount: 1,
    ingredients: [{ oreId: 'copper-ore', count: 1 }],
    moldType: 'bar',
    tier: 1,
    levelRequired: 1,
    heatTarget: 45,
    heatTolerance: 25,
    hammerHits: 2,
  },

  // Tier 2: Bronze (level 7) - First alloy!
  {
    id: 'smelt-bronze',
    outputId: 'bronze-bar',
    outputCount: 1,
    ingredients: [
      { oreId: 'copper-ore', count: 3 },
      { oreId: 'tin-ore', count: 1 },
    ],
    moldType: 'bar',
    tier: 2,
    levelRequired: 7,
    heatTarget: 55,
    heatTolerance: 20,
    hammerHits: 2,
  },

  // Tier 2: Iron (level 10) - Pure but needs more heat
  {
    id: 'smelt-iron',
    outputId: 'iron-bar',
    outputCount: 1,
    ingredients: [{ oreId: 'iron-ore', count: 1 }],
    moldType: 'bar',
    tier: 2,
    levelRequired: 10,
    heatTarget: 65,
    heatTolerance: 18,
    hammerHits: 2,
  },

  // Tier 3: Steel (level 18) - Iron + Coal alloy
  {
    id: 'smelt-steel',
    outputId: 'steel-bar',
    outputCount: 1,
    ingredients: [
      { oreId: 'iron-ore', count: 1 },
      { oreId: 'coal', count: 1 },
    ],
    moldType: 'bar',
    tier: 3,
    levelRequired: 18,
    heatTarget: 75,
    heatTolerance: 15,
    hammerHits: 3,
  },

  // Tier 3: Silver (level 22) - Precious metal
  {
    id: 'smelt-silver',
    outputId: 'silver-bar',
    outputCount: 1,
    ingredients: [{ oreId: 'silver-ore', count: 1 }],
    moldType: 'bar',
    tier: 3,
    levelRequired: 22,
    heatTarget: 60,
    heatTolerance: 15,
    hammerHits: 2,
  },

  // Tier 3: Gold (level 25) - Needs coal for heat
  {
    id: 'smelt-gold',
    outputId: 'gold-bar',
    outputCount: 1,
    ingredients: [
      { oreId: 'gold-ore', count: 1 },
      { oreId: 'coal', count: 1 },
    ],
    moldType: 'bar',
    tier: 3,
    levelRequired: 25,
    heatTarget: 70,
    heatTolerance: 15,
    hammerHits: 2,
  },

  // Tier 4: Mithril (level 35) - Magical metal
  {
    id: 'smelt-mithril',
    outputId: 'mithril-bar',
    outputCount: 1,
    ingredients: [
      { oreId: 'mithril-ore', count: 1 },
      { oreId: 'coal', count: 2 },
    ],
    moldType: 'bar',
    tier: 4,
    levelRequired: 35,
    heatTarget: 85,
    heatTolerance: 12,
    hammerHits: 3,
  },

  // Tier 5: Adamant (level 50) - Hardest metal
  {
    id: 'smelt-adamant',
    outputId: 'adamant-bar',
    outputCount: 1,
    ingredients: [
      { oreId: 'adamant-ore', count: 1 },
      { oreId: 'coal', count: 3 },
    ],
    moldType: 'bar',
    tier: 5,
    levelRequired: 50,
    heatTarget: 95,
    heatTolerance: 8,
    hammerHits: 3,
  },
];

/**
 * Get recipe by ID
 */
export function getRecipeById(recipeId: string): SmithingRecipe | undefined {
  return SMITHING_RECIPES.find((r) => r.id === recipeId);
}

/**
 * Get recipe by output item ID
 */
export function getRecipeByOutput(outputId: string): SmithingRecipe | undefined {
  return SMITHING_RECIPES.find((r) => r.outputId === outputId);
}

/**
 * Get all recipes available at a given smithing level
 */
export function getAvailableRecipes(smithingLevel: number): SmithingRecipe[] {
  return SMITHING_RECIPES.filter((r) => r.levelRequired <= smithingLevel);
}

/**
 * Check if player has required ores in bank
 */
export function hasRequiredOres(
  recipe: SmithingRecipe,
  getOreCount: (oreId: string) => number
): boolean {
  return recipe.ingredients.every(
    (ing) => getOreCount(ing.oreId) >= ing.count
  );
}

/**
 * Calculate XP reward for completing a bar
 */
export function calculateXpReward(recipe: SmithingRecipe, quality: number): number {
  const baseXp = SMITHING_CONSTANTS.BASE_XP_PER_BAR;
  const tierMultiplier = Math.pow(SMITHING_CONSTANTS.XP_MULTIPLIER_PER_TIER, recipe.tier - 1);
  const qualityBonus = 1 + quality * SMITHING_CONSTANTS.QUALITY_XP_BONUS;

  return Math.floor(baseXp * tierMultiplier * qualityBonus);
}

/**
 * Calculate quality from heat accuracy, pour accuracy, and hammer accuracy
 * Each is 0-1, combined with weights
 */
export function calculateQuality(
  heatAccuracy: number,
  pourAccuracy: number,
  hammerAccuracy: number
): number {
  const { QUALITY_HEAT_WEIGHT, QUALITY_POUR_WEIGHT, QUALITY_HAMMER_WEIGHT } =
    SMITHING_CONSTANTS;

  return (
    heatAccuracy * QUALITY_HEAT_WEIGHT +
    pourAccuracy * QUALITY_POUR_WEIGHT +
    hammerAccuracy * QUALITY_HAMMER_WEIGHT
  );
}

/**
 * Calculate heat accuracy based on how close to target
 */
export function calculateHeatAccuracy(
  heat: number,
  target: number,
  tolerance: number
): number {
  const deviation = Math.abs(heat - target);
  if (deviation <= tolerance * 0.3) return 1.0; // Perfect
  if (deviation <= tolerance) return 0.8; // Good
  if (deviation <= tolerance * 1.5) return 0.5; // Okay
  return 0.2; // Poor
}
