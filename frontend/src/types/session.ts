/**
 * Session Types
 *
 * Types for UI session state (screens, navigation).
 */

/**
 * Game screens - the main navigation state
 */
export type GameScreen =
  | 'town'
  | 'expedition-prep'
  | 'active-expedition'
  | 'node-interaction'
  | 'minigame'
  | 'mining-minigame'
  | 'herbs-minigame'
  | 'combat-minigame'
  | 'fishing-minigame'
  | 'cooking';
