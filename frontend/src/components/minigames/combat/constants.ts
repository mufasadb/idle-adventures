/**
 * Combat Minigame UI Constants
 *
 * UI-specific constants for the combat minigame.
 * Core game values are in src/data/combat.ts
 */

/** Grid cell size in pixels */
export const CELL_SIZE = 64;

/** Gap between grid cells */
export const CELL_GAP = 4;

/** Animation durations */
export const ATTACK_TELEGRAPH_MS = 300; // How long attack indicator shows before damage
export const DAMAGE_FLASH_MS = 200; // Red flash when player takes damage
export const HIT_FLASH_MS = 150; // Flash when enemy takes damage
export const SWORD_SWING_MS = 300; // Sword swing animation duration

/** Attack indicator styling */
export const ATTACK_INDICATOR_COLOR = 'rgba(239, 68, 68, 0.6)'; // red-500 with opacity
export const ATTACK_INDICATOR_DOT_COLOR = 'rgba(239, 68, 68, 0.9)';
