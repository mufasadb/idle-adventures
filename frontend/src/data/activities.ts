/**
 * Activity Definitions
 *
 * Centralized configuration for all gathering activities (mining, herbs, gems, combat).
 * This file defines what resources each activity yields at different tiers.
 */

import type { ActivityType, ActivityTier, ActivityDataDefinition, ActivityReward } from '../types';

/**
 * All activity definitions
 * Add new activities or tiers here
 */
export const ACTIVITIES: Record<ActivityType, ActivityDataDefinition> = {
  mining: {
    type: 'mining',
    name: 'Mining',
    icon: '⛏',
    tiers: [
      {
        tier: 1,
        rewards: [
          { itemId: 'copper-ore', baseCount: 10, weight: 70 },
          { itemId: 'tin-ore', baseCount: 10, weight: 30 },
        ],
      },
      {
        tier: 2,
        rewards: [
          { itemId: 'iron-ore', baseCount: 10, weight: 60 },
          { itemId: 'coal', baseCount: 8, weight: 40 },
        ],
      },
      {
        tier: 3,
        rewards: [
          { itemId: 'iron-ore', baseCount: 10, weight: 50 },
          { itemId: 'gold-ore', baseCount: 8, weight: 30 },
          { itemId: 'silver-ore', baseCount: 8, weight: 20 },
        ],
      },
      {
        tier: 4,
        rewards: [
          { itemId: 'mithril-ore', baseCount: 10, weight: 50 },
          { itemId: 'gold-ore', baseCount: 10, weight: 30 },
          { itemId: 'adamant-ore', baseCount: 8, weight: 20 },
        ],
      },
    ],
  },

  herbs: {
    type: 'herbs',
    name: 'Herbalism',
    icon: '🌿',
    tiers: [
      {
        tier: 1,
        rewards: [
          { itemId: 'curaweed', baseCount: 10, weight: 70 },
          { itemId: 'mendaloe', baseCount: 8, weight: 30 },
        ],
      },
      {
        tier: 2,
        rewards: [
          { itemId: 'vitalroot', baseCount: 10, weight: 60 },
          { itemId: 'soothebloom', baseCount: 8, weight: 40 },
        ],
      },
      {
        tier: 3,
        rewards: [
          { itemId: 'restoria', baseCount: 10, weight: 50 },
          { itemId: 'glacial-mint', baseCount: 8, weight: 30 },
          { itemId: 'luminleaf', baseCount: 8, weight: 20 },
        ],
      },
      {
        tier: 4,
        rewards: [
          { itemId: 'emberheart', baseCount: 10, weight: 50 },
          { itemId: 'lifebane', baseCount: 8, weight: 30 },
          { itemId: 'phoenixwort', baseCount: 8, weight: 20 },
        ],
      },
    ],
  },

  gems: {
    type: 'gems',
    name: 'Gem Mining',
    icon: '💎',
    tiers: [
      {
        tier: 1,
        rewards: [
          { itemId: 'rough-quartz', baseCount: 10, weight: 70 },
          { itemId: 'raw-amethyst', baseCount: 8, weight: 30 },
        ],
      },
      {
        tier: 2,
        rewards: [
          { itemId: 'raw-topaz', baseCount: 10, weight: 60 },
          { itemId: 'raw-sapphire', baseCount: 8, weight: 40 },
        ],
      },
      {
        tier: 3,
        rewards: [
          { itemId: 'raw-ruby', baseCount: 10, weight: 50 },
          { itemId: 'raw-emerald', baseCount: 8, weight: 30 },
          { itemId: 'raw-diamond', baseCount: 8, weight: 20 },
        ],
      },
      {
        tier: 4,
        rewards: [
          { itemId: 'raw-diamond', baseCount: 10, weight: 50 },
          { itemId: 'star-ruby', baseCount: 8, weight: 30 },
          { itemId: 'void-gem', baseCount: 8, weight: 20 },
        ],
      },
    ],
  },

  combat: {
    type: 'combat',
    name: 'Combat',
    icon: '🐺',
    tiers: [
      {
        tier: 1,
        rewards: [
          { itemId: 'gold', baseCount: 10, weight: 50 },
          { itemId: 'leather-scraps', baseCount: 10, weight: 30 },
          { itemId: 'wolf-fang', baseCount: 8, weight: 20 },
        ],
      },
      {
        tier: 2,
        rewards: [
          { itemId: 'gold', baseCount: 15, weight: 50 },
          { itemId: 'beast-hide', baseCount: 10, weight: 30 },
          { itemId: 'monster-bone', baseCount: 8, weight: 20 },
        ],
      },
      {
        tier: 3,
        rewards: [
          { itemId: 'gold', baseCount: 20, weight: 40 },
          { itemId: 'beast-hide', baseCount: 10, weight: 30 },
          { itemId: 'rare-drop', baseCount: 8, weight: 20 },
          { itemId: 'monster-gem', baseCount: 8, weight: 10 },
        ],
      },
      {
        tier: 4,
        rewards: [
          { itemId: 'gold', baseCount: 30, weight: 40 },
          { itemId: 'dragon-scale', baseCount: 10, weight: 25 },
          { itemId: 'rare-drop', baseCount: 10, weight: 20 },
          { itemId: 'legendary-essence', baseCount: 8, weight: 15 },
        ],
      },
    ],
  },

  fishing: {
    type: 'fishing',
    name: 'Fishing',
    icon: '🎣',
    tiers: [
      {
        tier: 1,
        rewards: [{ itemId: 'raw-sardines', baseCount: 10, weight: 100 }],
      },
      {
        tier: 2,
        rewards: [
          { itemId: 'raw-sardines', baseCount: 8, weight: 60 },
          { itemId: 'raw-trout', baseCount: 8, weight: 40 },
        ],
      },
      {
        tier: 3,
        rewards: [
          { itemId: 'raw-trout', baseCount: 8, weight: 50 },
          { itemId: 'raw-salmon', baseCount: 8, weight: 50 },
        ],
      },
      {
        tier: 4,
        rewards: [
          { itemId: 'raw-salmon', baseCount: 8, weight: 60 },
          { itemId: 'raw-lobster', baseCount: 6, weight: 40 },
        ],
      },
    ],
  },
};

/**
 * Get the reward configuration for an activity at a specific tier
 */
export function getActivityTier(activityType: ActivityType, tier: number): ActivityTier | null {
  const activity = ACTIVITIES[activityType];
  if (!activity) return null;

  // Find exact tier or fall back to highest available
  const exactTier = activity.tiers.find(t => t.tier === tier);
  if (exactTier) return exactTier;

  // Fall back to highest tier at or below requested
  const availableTiers = activity.tiers.filter(t => t.tier <= tier);
  if (availableTiers.length === 0) return activity.tiers[0];
  return availableTiers[availableTiers.length - 1];
}

/**
 * Select a random reward from an activity tier based on weights
 */
export function selectRandomReward(activityTier: ActivityTier): ActivityReward {
  const totalWeight = activityTier.rewards.reduce((sum, r) => sum + r.weight, 0);
  let random = Math.random() * totalWeight;

  for (const reward of activityTier.rewards) {
    random -= reward.weight;
    if (random <= 0) {
      return reward;
    }
  }

  // Fallback to first reward
  return activityTier.rewards[0];
}

/**
 * Get a reward for an activity at a specific tier
 * Returns the itemId and count for the reward
 */
export function getActivityReward(
  activityType: ActivityType,
  tier: number
): { itemId: string; count: number } {
  const activityTier = getActivityTier(activityType, tier);
  if (!activityTier) {
    // Fallback for unknown activity
    return { itemId: 'gold', count: 1 };
  }

  const reward = selectRandomReward(activityTier);
  return {
    itemId: reward.itemId,
    count: reward.baseCount,
  };
}
