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
 */

export { sessionStore } from './sessionStore';
export type {
  GameScreen,
  ExpeditionMode,
  MapNode,
  ExpeditionMap,
  ExpeditionLoadout,
  ActiveExpedition,
} from './sessionStore';

export { playerStore } from './playerStore';
export type { ItemStack, PlayerSkill } from './playerStore';

export { themeStore } from './themeStore';
export type { Theme } from './themeStore';

export { authStore } from './authStore';
