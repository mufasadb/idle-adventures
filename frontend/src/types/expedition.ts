/**
 * Expedition Types
 *
 * Types for expedition maps, nodes, and runtime expedition state.
 */

import type { Coord } from './coordinates';
import type { TerrainType } from './terrain';
import type { ActivityType } from './activities';
import type { ItemStack } from './items';

/**
 * A single tile on the expedition map
 * Uses the engine structure with separated terrain and activity
 */
export interface MapNode {
  coord: Coord;
  terrain: TerrainType;
  activity?: ActivityType;
  /** Whether this node has been cleared/completed */
  cleared?: boolean;
}

/**
 * Expedition map definition
 */
export interface ExpeditionMap {
  id: string;
  name: string;
  tier: number;
  travelDays: number;
  terrain: string;
  danger: 'low' | 'medium' | 'high';
  nodes: MapNode[];
  width: number;
  height: number;
}

/**
 * Single item in a loadout slot (always count of 1)
 */
export interface LoadoutItem {
  itemId: string;
}

/**
 * Expedition play mode
 */
export type ExpeditionMode = 'active' | 'passive';

/**
 * Expedition loadout - what player is taking on the trip
 */
export interface ExpeditionLoadout {
  vehicle: ItemStack | null;
  food: (LoadoutItem | null)[];  // 6 slots, 1 item each
  misc: (ItemStack | null)[];    // 2 slots base, more with vehicle
  mode: ExpeditionMode;
}

/**
 * Active expedition state - runtime state during expedition
 */
export interface ActiveExpedition {
  map: ExpeditionMap;
  position: Coord;
  actionsRemaining: number;
  actionsTotal: number;
  bag: ItemStack[];  // Loot collected during expedition
  /** Combat HP - persists between fights, resets at expedition end */
  combatHp: number;
}

/**
 * Resource earned during expedition (for floating animation)
 */
export interface ResourceEarned {
  id: string;
  itemId: string;
  count: number;
  timestamp: number;
}

/**
 * Execution state for expedition runner
 */
export type ExecutionState = 'idle' | 'running' | 'paused' | 'completed' | 'minigame';

/**
 * Pending minigame info
 */
export interface PendingMinigame {
  type: ActivityType;
  nodeCoord: Coord;
}
