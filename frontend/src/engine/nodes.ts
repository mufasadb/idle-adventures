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
  type LucideIcon,
} from 'lucide-react';

// ============================================
// Core Types
// ============================================

/**
 * Grid coordinate - used throughout the expedition system
 */
export interface Coord {
  x: number;
  y: number;
}

/**
 * Helper to create a string key from coordinates (for Set/Map lookups)
 */
export function coordKey(c: Coord): string {
  return `${c.x},${c.y}`;
}

/**
 * Helper to parse a coord key back to Coord
 */
export function parseCoordKey(key: string): Coord {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

/**
 * Check if two coordinates are equal
 */
export function coordsEqual(a: Coord, b: Coord): boolean {
  return a.x === b.x && a.y === b.y;
}

// ============================================
// Terrain Types
// ============================================

/**
 * Terrain affects movement cost
 */
export type TerrainType = 'ground' | 'water' | 'mountain' | 'forest';

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
// Activity Types
// ============================================

/**
 * Activities are optional interactions at a node
 * Player can choose to "use" them (+1 action) or pass through
 */
export type ActivityType = 'mining' | 'herbs' | 'gems' | 'combat';

export interface ActivityDefinition {
  type: ActivityType;
  name: string;
  icon: LucideIcon;
  /** Extra action cost to perform this activity */
  actionCost: number;
}

export const ACTIVITIES: Record<ActivityType, ActivityDefinition> = {
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
};

// ============================================
// Map Node (combines terrain + optional activity)
// ============================================

/**
 * A single tile on the expedition map
 */
export interface MapNode {
  coord: Coord;
  terrain: TerrainType;
  activity?: ActivityType;
  /** Whether this node has been cleared/completed */
  cleared?: boolean;
}

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
