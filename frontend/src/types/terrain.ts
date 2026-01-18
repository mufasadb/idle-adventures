/**
 * Terrain Types
 *
 * Terrain affects movement cost on expedition maps.
 */

import type { LucideIcon } from 'lucide-react';

/**
 * Available terrain types
 */
export type TerrainType = 'ground' | 'water' | 'mountain' | 'forest';

/**
 * Terrain definition with movement costs and modifiers
 */
export interface TerrainDefinition {
  type: TerrainType;
  name: string;
  baseCost: number;
  icon: LucideIcon;
  /** Items that reduce movement cost on this terrain */
  modifiers?: {
    itemId: string;
    costOverride: number;
  }[];
}
