/**
 * Pathfinding - Pure Functions
 *
 * All functions here are pure - no state, no side effects.
 * They calculate paths and costs based on input data.
 */

import { coordsEqual, coordKey } from '../types';
import type { Coord, MapNode, TerrainType } from '../types';
import { TERRAINS, ACTIVITIES } from './nodes';

// ============================================
// Path Calculation
// ============================================

/**
 * Calculate the direct path between two points.
 * Moves horizontal first, then vertical (no diagonals).
 *
 * @param from Starting coordinate
 * @param to Ending coordinate
 * @returns Array of coordinates forming the path (includes from and to)
 */
export function getDirectPath(from: Coord, to: Coord): Coord[] {
  const path: Coord[] = [{ ...from }];

  let current = { ...from };

  // Move horizontally first
  while (current.x !== to.x) {
    current = {
      x: current.x + (to.x > current.x ? 1 : -1),
      y: current.y,
    };
    path.push({ ...current });
  }

  // Then move vertically
  while (current.y !== to.y) {
    current = {
      x: current.x,
      y: current.y + (to.y > current.y ? 1 : -1),
    };
    path.push({ ...current });
  }

  return path;
}

/**
 * Get the movement cost for a single tile based on terrain and player items.
 *
 * @param terrain The terrain type of the tile
 * @param playerItems Array of item IDs the player has equipped
 * @returns Action cost to traverse this tile
 */
export function getTerrainCost(
  terrain: TerrainType,
  playerItems: string[] = []
): number {
  const terrainDef = TERRAINS[terrain];
  if (!terrainDef) return 1;

  // Check if player has an item that reduces cost
  if (terrainDef.modifiers) {
    for (const mod of terrainDef.modifiers) {
      if (playerItems.includes(mod.itemId)) {
        return mod.costOverride;
      }
    }
  }

  return terrainDef.baseCost;
}

// ============================================
// Cost Calculation
// ============================================

export interface PathCostResult {
  /** Total action cost for the entire path */
  totalCost: number;
  /** Cost breakdown per tile */
  tileCosts: {
    coord: Coord;
    terrainCost: number;
    activityCost: number;
    totalTileCost: number;
  }[];
  /** Activities along the path */
  activitiesOnPath: Coord[];
}

/**
 * Calculate the total cost of traversing a path.
 *
 * @param path Array of coordinates to traverse
 * @param nodes Map of coord keys to MapNode data
 * @param activeActivities Set of coord keys where player will "use" the activity
 * @param playerItems Items the player has equipped (affects terrain cost)
 * @returns Detailed cost breakdown
 */
export function calculatePathCost(
  path: Coord[],
  nodes: Map<string, MapNode>,
  activeActivities: Set<string>,
  playerItems: string[] = []
): PathCostResult {
  const tileCosts: PathCostResult['tileCosts'] = [];
  const activitiesOnPath: Coord[] = [];
  let totalCost = 0;

  // Skip the first tile (starting position) - you're already there
  for (let i = 1; i < path.length; i++) {
    const coord = path[i];
    const key = coordKey(coord);
    const node = nodes.get(key);

    // Default to ground if node not found
    const terrain = node?.terrain ?? 'ground';
    const terrainCost = getTerrainCost(terrain, playerItems);

    // Check if there's an activity and if it's active
    let activityCost = 0;
    if (node?.activity) {
      activitiesOnPath.push(coord);
      if (activeActivities.has(key)) {
        activityCost = ACTIVITIES[node.activity].actionCost;
      }
    }

    const totalTileCost = terrainCost + activityCost;
    totalCost += totalTileCost;

    tileCosts.push({
      coord,
      terrainCost,
      activityCost,
      totalTileCost,
    });
  }

  return {
    totalCost,
    tileCosts,
    activitiesOnPath,
  };
}

// ============================================
// Path Trimming
// ============================================

export interface TrimmedPathResult {
  /** The path trimmed to what player can afford */
  path: Coord[];
  /** Total cost of the trimmed path */
  cost: number;
  /** Whether the full path was affordable */
  isComplete: boolean;
  /** How many actions would be left after this path */
  actionsRemaining: number;
}

/**
 * Trim a path to fit within an action budget.
 * Returns as much of the path as the player can afford.
 *
 * @param path Full desired path
 * @param nodes Map of coord keys to MapNode data
 * @param activeActivities Set of coord keys where player will "use" the activity
 * @param actionBudget Maximum actions available
 * @param playerItems Items the player has equipped
 * @returns Trimmed path and cost info
 */
export function trimPathToActionBudget(
  path: Coord[],
  nodes: Map<string, MapNode>,
  activeActivities: Set<string>,
  actionBudget: number,
  playerItems: string[] = []
): TrimmedPathResult {
  if (path.length === 0) {
    return {
      path: [],
      cost: 0,
      isComplete: true,
      actionsRemaining: actionBudget,
    };
  }

  const trimmedPath: Coord[] = [path[0]]; // Always include starting position
  let runningCost = 0;

  for (let i = 1; i < path.length; i++) {
    const coord = path[i];
    const key = coordKey(coord);
    const node = nodes.get(key);

    const terrain = node?.terrain ?? 'ground';
    const terrainCost = getTerrainCost(terrain, playerItems);

    let activityCost = 0;
    if (node?.activity && activeActivities.has(key)) {
      activityCost = ACTIVITIES[node.activity].actionCost;
    }

    const tileCost = terrainCost + activityCost;

    if (runningCost + tileCost > actionBudget) {
      // Can't afford this tile, stop here
      return {
        path: trimmedPath,
        cost: runningCost,
        isComplete: false,
        actionsRemaining: actionBudget - runningCost,
      };
    }

    runningCost += tileCost;
    trimmedPath.push(coord);
  }

  return {
    path: trimmedPath,
    cost: runningCost,
    isComplete: true,
    actionsRemaining: actionBudget - runningCost,
  };
}

// ============================================
// Path Extension (for building paths incrementally)
// ============================================

/**
 * Extend an existing path to a new destination.
 * Calculates direct path from the end of current path to the new point.
 *
 * @param currentPath Existing path (can be empty)
 * @param destination New destination to extend to
 * @param startPosition Starting position if currentPath is empty
 * @returns New extended path
 */
export function extendPath(
  currentPath: Coord[],
  destination: Coord,
  startPosition: Coord
): Coord[] {
  // If no current path, start from the start position
  if (currentPath.length === 0) {
    return getDirectPath(startPosition, destination);
  }

  // Get the end of current path
  const pathEnd = currentPath[currentPath.length - 1];

  // If destination is the same as path end, return current path
  if (coordsEqual(pathEnd, destination)) {
    return currentPath;
  }

  // Calculate path from current end to new destination
  const extension = getDirectPath(pathEnd, destination);

  // Remove first element of extension (it's the same as pathEnd)
  // and append to current path
  return [...currentPath, ...extension.slice(1)];
}

/**
 * Erase path backwards from end to a specific point.
 * If the point is on the path, keeps everything up to and including that point.
 * If the point is not on the path, returns the original path.
 *
 * @param currentPath Current path
 * @param eraseToPoint Point to erase back to
 * @returns Trimmed path
 */
export function erasePathTo(
  currentPath: Coord[],
  eraseToPoint: Coord
): Coord[] {
  // Find the index of the erase point in the path
  const index = currentPath.findIndex((c) => coordsEqual(c, eraseToPoint));

  if (index === -1) {
    // Point not on path, return original
    return currentPath;
  }

  // Keep everything up to and including this point
  return currentPath.slice(0, index + 1);
}

/**
 * Check if a coordinate is on a path
 */
export function isOnPath(path: Coord[], coord: Coord): boolean {
  return path.some((c) => coordsEqual(c, coord));
}
