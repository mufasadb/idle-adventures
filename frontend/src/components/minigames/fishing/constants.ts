/**
 * Fishing Minigame Constants
 *
 * Harpoon-based fishing minigame configuration.
 */

/** Total harpoons player can throw */
export const TOTAL_HARPOONS = 5;

/** Milliseconds between fish spawns */
export const FISH_SPAWN_INTERVAL = 800;

/** Milliseconds for fish to swim across screen */
export const FISH_SWIM_DURATION = 4000;

/** Milliseconds for harpoon to reach target */
export const HARPOON_FLY_DURATION = 300;

/** Pixel radius for hitting fish */
export const HIT_RADIUS = 40;

/** Total game duration in milliseconds */
export const GAME_DURATION = 10000;

/** Swimming fish state */
export interface SwimmingFish {
  id: number;
  startTime: number;
  y: number; // vertical position (0-1)
  speed: number; // speed multiplier (0.7 - 1.3)
  direction: 'left' | 'right';
  caught: boolean;
}

/** Flying harpoon state */
export interface FlyingHarpoon {
  id: number;
  startX: number;
  startY: number;
  targetX: number; // Click position (for hit detection)
  targetY: number;
  endX: number; // Edge of screen (where harpoon travels to)
  endY: number;
  angle: number; // Pre-calculated angle for consistent rendering
  startTime: number;
}
