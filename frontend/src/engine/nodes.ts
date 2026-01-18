/**
 * Node and Terrain Definitions
 *
 * Defines the types of tiles on expedition maps, their traversal costs,
 * and any activities that can be performed at each location.
 */

import {
  Pickaxe,
  Leaf,
  Gem,
  Swords,
  Mountain,
  Waves,
  Trees,
  Flag,
  Fish,
  type LucideIcon,
} from 'lucide-react';

import type {
  Coord,
  TerrainType,
  TerrainDefinition,
  ActivityType,
  ActivityUIDefinition,
  MapNode,
} from '../types';

// Re-export types for backwards compatibility during migration
export type { Coord, TerrainType, TerrainDefinition, ActivityType, MapNode };
export { coordKey, parseCoordKey, coordsEqual } from '../types';

export const TERRAINS: Record<TerrainType, TerrainDefinition> = {
  ground: {
    type: 'ground',
    name: 'Ground',
    baseCost: 1,
    icon: Flag, // Ground doesn't really show an icon, this is fallback
  },
  water: {
    type: 'water',
    name: 'Water',
    baseCost: 2,
    icon: Waves,
    modifiers: [{ itemId: 'raft', costOverride: 1 }],
  },
  mountain: {
    type: 'mountain',
    name: 'Mountain',
    baseCost: 2,
    icon: Mountain,
    modifiers: [{ itemId: 'climbing-boots', costOverride: 1 }],
  },
  forest: {
    type: 'forest',
    name: 'Forest',
    baseCost: 1,
    icon: Trees,
  },
};

// ============================================
// Activity UI Definitions
// ============================================

export const ACTIVITIES: Record<ActivityType, ActivityUIDefinition> = {
  mining: {
    type: 'mining',
    name: 'Mining',
    icon: Pickaxe,
    actionCost: 1,
  },
  herbs: {
    type: 'herbs',
    name: 'Herb Gathering',
    icon: Leaf,
    actionCost: 1,
  },
  gems: {
    type: 'gems',
    name: 'Gem Mining',
    icon: Gem,
    actionCost: 1,
  },
  combat: {
    type: 'combat',
    name: 'Combat',
    icon: Swords,
    actionCost: 1,
  },
  fishing: {
    type: 'fishing',
    name: 'Fishing',
    icon: Fish,
    actionCost: 1,
  },
};

// ============================================
// Map Node Helpers
// ============================================

/**
 * Special node types that map to the old system
 * Used for backward compatibility during migration
 */
export function legacyTypeToNode(
  type: string,
  x: number,
  y: number
): MapNode {
  const coord = { x, y };

  switch (type) {
    case 'mining':
      return { coord, terrain: 'ground', activity: 'mining' };
    case 'herbs':
      return { coord, terrain: 'ground', activity: 'herbs' };
    case 'gems':
      return { coord, terrain: 'ground', activity: 'gems' };
    case 'combat':
      return { coord, terrain: 'ground', activity: 'combat' };
    case 'fishing':
      return { coord, terrain: 'water', activity: 'fishing' };
    case 'mountain':
      return { coord, terrain: 'mountain' };
    case 'water':
      return { coord, terrain: 'water' };
    case 'forest':
      return { coord, terrain: 'forest' };
    case 'player':
    case 'empty':
    default:
      return { coord, terrain: 'ground' };
  }
}

/**
 * Get the icon for a node (activity icon takes precedence)
 */
export function getNodeIcon(node: MapNode): LucideIcon {
  if (node.activity) {
    return ACTIVITIES[node.activity].icon;
  }
  // Only show terrain icon for special terrains
  if (node.terrain !== 'ground') {
    return TERRAINS[node.terrain].icon;
  }
  // Ground with no activity has no icon
  return Flag; // Fallback, shouldn't render
}

/**
 * Check if a node has an activity
 */
export function hasActivity(node: MapNode): boolean {
  return node.activity !== undefined;
}
