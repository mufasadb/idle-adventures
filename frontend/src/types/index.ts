/**
 * Type Exports
 *
 * Central export point for all shared types.
 * Import from '@/types' or '../types' for any type needs.
 */

// API types
export type { Player, AuthResponse, MeResponse, ApiError, PlayerFullResponse, StashItemResponse } from './api';

// Coordinate types and helpers
export type { Coord } from './coordinates';
export { coordKey, parseCoordKey, coordsEqual } from './coordinates';

// Terrain types
export type { TerrainType, TerrainDefinition } from './terrain';

// Activity types
export type {
  ActivityType,
  ActivityUIDefinition,
  ActivityReward,
  ActivityTier,
  ActivityDataDefinition,
} from './activities';

// Item types
export type {
  ItemCategory,
  ItemDefinition,
  ItemStack,
  LoadoutSlotType,
} from './items';

// Player types
export type { SkillCategory, PlayerSkill } from './player';

// Expedition types
export type {
  MapNode,
  ExpeditionMap,
  LoadoutItem,
  ExpeditionMode,
  ExpeditionLoadout,
  ActiveExpedition,
  ResourceEarned,
  ExecutionState,
  PendingMinigame,
} from './expedition';

// Session types
export type { GameScreen } from './session';
