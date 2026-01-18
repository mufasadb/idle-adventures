/**
 * Cooking System Configuration
 *
 * Defines recipes, level requirements, and minigame parameters for cooking.
 */

import { TICK_MS } from './combat';

/** Heat levels for the cooking minigame */
export type HeatLevel = 'low' | 'medium' | 'high';

/** Spice colors available */
export type SpiceColor = 'red' | 'green' | 'yellow';

/** A single step in a cooking recipe */
export interface RecipeStep {
  type: 'heat' | 'spice';
  /** For heat steps, the required heat level */
  heat?: HeatLevel;
  /** For spice steps, the spice color to apply */
  spice?: SpiceColor;
  /** Duration of this step in ticks */
  durationTicks: number;
}

/** Recipe definition for a cookable item */
export interface CookingRecipe {
  /** Raw ingredient item ID */
  inputId: string;
  /** Cooked result item ID */
  outputId: string;
  /** Fishing/cooking tier (1-4) */
  tier: number;
  /** Minimum cooking level required (tier * 7) */
  levelRequired: number;
  /** Sequence of steps to complete */
  steps: RecipeStep[];
  /** Base success rate at minimum level (0-1) */
  baseSuccessRate: number;
}

/** Cooking minigame constants */
export const COOKING_CONSTANTS = {
  /** Tick duration in ms (same as combat) */
  TICK_MS,
  /** How fast heat decays per tick (0-100 scale) */
  HEAT_DECAY_PER_TICK: 2,
  /** Heat added per log click */
  HEAT_PER_LOG: 15,
  /** Heat thresholds for levels */
  HEAT_THRESHOLDS: {
    low: { min: 0, max: 33 },
    medium: { min: 34, max: 66 },
    high: { min: 67, max: 100 },
  },
  /** Success rate bonus per level above requirement (5% per level) */
  SUCCESS_BONUS_PER_LEVEL: 0.05,
  /** Maximum success rate */
  MAX_SUCCESS_RATE: 0.95,
  /** Base success rate at minimum level */
  BASE_SUCCESS_RATE: 0.50,
  /** Tolerance window for heat steps (can be slightly off) */
  HEAT_TOLERANCE_TICKS: 2,
  /** Max fish that can be cooked at once */
  MAX_FISH_SLOTS: 5,
};

/** Spice definitions */
export const SPICES: Record<SpiceColor, { name: string; icon: string }> = {
  red: { name: 'Paprika', icon: '🌶️' },
  green: { name: 'Herbs', icon: '🌿' },
  yellow: { name: 'Turmeric', icon: '🟡' },
};

/**
 * All cooking recipes
 * Level requirement = tier * 7
 */
export const COOKING_RECIPES: CookingRecipe[] = [
  // Tier 1: Sardines (level 7)
  {
    inputId: 'raw-sardines',
    outputId: 'sardines',
    tier: 1,
    levelRequired: 7,
    baseSuccessRate: 0.50,
    steps: [
      { type: 'heat', heat: 'high', durationTicks: 3 },
      { type: 'spice', spice: 'green', durationTicks: 2 },
      { type: 'heat', heat: 'medium', durationTicks: 4 },
    ],
  },
  // Tier 2: Trout (level 14)
  {
    inputId: 'raw-trout',
    outputId: 'trout',
    tier: 2,
    levelRequired: 14,
    baseSuccessRate: 0.50,
    steps: [
      { type: 'heat', heat: 'high', durationTicks: 3 },
      { type: 'spice', spice: 'red', durationTicks: 2 },
      { type: 'heat', heat: 'medium', durationTicks: 3 },
      { type: 'spice', spice: 'green', durationTicks: 2 },
      { type: 'heat', heat: 'low', durationTicks: 3 },
    ],
  },
  // Tier 3: Salmon (level 21)
  {
    inputId: 'raw-salmon',
    outputId: 'salmon',
    tier: 3,
    levelRequired: 21,
    baseSuccessRate: 0.50,
    steps: [
      { type: 'heat', heat: 'high', durationTicks: 4 },
      { type: 'spice', spice: 'yellow', durationTicks: 2 },
      { type: 'heat', heat: 'medium', durationTicks: 3 },
      { type: 'spice', spice: 'red', durationTicks: 2 },
      { type: 'heat', heat: 'medium', durationTicks: 3 },
      { type: 'spice', spice: 'green', durationTicks: 2 },
      { type: 'heat', heat: 'low', durationTicks: 2 },
    ],
  },
  // Tier 4: Lobster (level 28)
  {
    inputId: 'raw-lobster',
    outputId: 'lobster',
    tier: 4,
    levelRequired: 28,
    baseSuccessRate: 0.50,
    steps: [
      { type: 'heat', heat: 'high', durationTicks: 5 },
      { type: 'spice', spice: 'red', durationTicks: 2 },
      { type: 'heat', heat: 'high', durationTicks: 3 },
      { type: 'spice', spice: 'yellow', durationTicks: 2 },
      { type: 'heat', heat: 'medium', durationTicks: 4 },
      { type: 'spice', spice: 'green', durationTicks: 2 },
      { type: 'heat', heat: 'medium', durationTicks: 3 },
      { type: 'spice', spice: 'red', durationTicks: 2 },
      { type: 'heat', heat: 'low', durationTicks: 3 },
    ],
  },
];

/**
 * Get recipe by raw ingredient ID
 */
export function getRecipeByInput(inputId: string): CookingRecipe | undefined {
  return COOKING_RECIPES.find((r) => r.inputId === inputId);
}

/**
 * Get all recipes the player can cook at their level
 */
export function getAvailableRecipes(cookingLevel: number): CookingRecipe[] {
  return COOKING_RECIPES.filter((r) => r.levelRequired <= cookingLevel);
}

/**
 * Calculate success rate based on player level vs recipe requirement
 * Base 50% at min level, +5% per level above, max 95%
 */
export function calculateSuccessRate(
  cookingLevel: number,
  recipe: CookingRecipe
): number {
  const levelsAbove = Math.max(0, cookingLevel - recipe.levelRequired);
  const bonus = levelsAbove * COOKING_CONSTANTS.SUCCESS_BONUS_PER_LEVEL;
  return Math.min(
    COOKING_CONSTANTS.MAX_SUCCESS_RATE,
    recipe.baseSuccessRate + bonus
  );
}

/**
 * Get the current heat level from a numeric heat value (0-100)
 */
export function getHeatLevel(heat: number): HeatLevel {
  const { HEAT_THRESHOLDS } = COOKING_CONSTANTS;
  if (heat >= HEAT_THRESHOLDS.high.min) return 'high';
  if (heat >= HEAT_THRESHOLDS.medium.min) return 'medium';
  return 'low';
}

/**
 * Get total duration of a recipe in ticks
 */
export function getRecipeDuration(recipe: CookingRecipe): number {
  return recipe.steps.reduce((sum, step) => sum + step.durationTicks, 0);
}
