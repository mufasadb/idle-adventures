/**
 * Custom hooks for game functionality
 */

// Animation and timing hooks
export { useGameLoop, useTickLoop } from './useGameLoop';
export { useAnimationDelay, useFlashState } from './useAnimationDelay';

// Base minigame hook (for creating new minigames)
export {
  useMinigameBase,
  calculateAutoModeResults,
  awardXp,
  hasItems,
  consumeItems,
  rewardItems,
} from './useMinigameBase';
export type {
  MinigameConfig,
  MinigameBaseState,
  MinigameBaseActions,
  UseMinigameBaseReturn,
} from './useMinigameBase';

// Minigame state hooks
export { useSmithingGame } from './useSmithingGame';
export type {
  SmithingGameState,
  SmithingGameActions,
  UseSmithingGameReturn,
} from './useSmithingGame';

export { useCookingGame } from './useCookingGame';
export type {
  CookingFish,
  CookingPhase,
  CookingResults,
  CookableItem,
  CookingGameState,
  CookingGameActions,
  UseCookingGameReturn,
} from './useCookingGame';
