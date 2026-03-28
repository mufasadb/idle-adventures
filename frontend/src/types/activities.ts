/**
 * Activity Types
 *
 * Activities are optional interactions at map nodes (mining, herbs, etc.).
 */

import type { LucideIcon } from 'lucide-react';

/**
 * Available activity types
 */
export type ActivityType = 'mining' | 'herbs' | 'gems' | 'combat' | 'fishing' | 'woodcutting';

/**
 * UI definition for an activity (icon, name, action cost)
 */
export interface ActivityUIDefinition {
  type: ActivityType;
  name: string;
  icon: LucideIcon;
  /** Extra action cost to perform this activity */
  actionCost: number;
}

/**
 * A possible reward from an activity
 */
export interface ActivityReward {
  itemId: string;
  /** Base count before multipliers */
  baseCount: number;
  /** Weight for random selection (higher = more common) */
  weight: number;
}

/**
 * Activity tier configuration (rewards at different map tiers)
 */
export interface ActivityTier {
  /** Map tier this applies to */
  tier: number;
  /** Possible rewards at this tier */
  rewards: ActivityReward[];
}

/**
 * Full activity data definition (for reward calculation)
 */
export interface ActivityDataDefinition {
  type: ActivityType;
  /** Display name */
  name: string;
  /** Emoji icon for UI */
  icon: string;
  /** Tiers and their rewards */
  tiers: ActivityTier[];
}
