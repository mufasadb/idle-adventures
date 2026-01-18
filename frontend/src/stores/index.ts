/**
 * Store exports
 *
 * Architecture:
 * - sessionStore: Ephemeral session state (screens, loadout, active expedition)
 * - playerStore: Persistent player data (bank, skills, unlocks)
 * - themeStore: UI preferences (theme)
 * - authStore: Authentication state
 *
 * The old gameStore is deprecated - use sessionStore + playerStore instead.
 *
 * Note: Types are now centralized in src/types/. Import types from '../types' or '@/types'.
 */

export { sessionStore } from './sessionStore';
export { playerStore } from './playerStore';
export { themeStore } from './themeStore';
export { authStore } from './authStore';

// Re-export commonly used types for convenience (from central types)
export type {
  GameScreen,
  ExpeditionMode,
  MapNode,
  ExpeditionMap,
  ExpeditionLoadout,
  ActiveExpedition,
  ItemStack,
  PlayerSkill,
} from '../types';
