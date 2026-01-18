/**
 * Constants for the cooking minigame UI
 */

/** Visual constants */
export const FIRE_COLORS = {
  low: '#4a5568',      // Gray - cool
  medium: '#ed8936',   // Orange - warm
  high: '#f56565',     // Red - hot
} as const;

/** Heat zone visual boundaries (0-100 scale shown as bar) */
export const HEAT_ZONES = {
  low: { color: '#4a5568', label: 'Low' },
  medium: { color: '#ed8936', label: 'Med' },
  high: { color: '#f56565', label: 'High' },
} as const;

/** Spice bowl colors and names */
export const SPICE_VISUALS = {
  red: { color: '#ef4444', bgColor: '#7f1d1d' },
  green: { color: '#22c55e', bgColor: '#14532d' },
  yellow: { color: '#eab308', bgColor: '#713f12' },
} as const;

/** Fish cooking states */
export type FishState = 'raw' | 'cooking' | 'done' | 'burnt' | 'failed';

/** Visual feedback for recipe steps */
export const STEP_ICONS = {
  heat: {
    low: '🔥',
    medium: '🔥🔥',
    high: '🔥🔥🔥',
  },
  spice: {
    red: '🌶️',
    green: '🌿',
    yellow: '🟡',
  },
} as const;

/** Timeline bar visual constants */
export const TIMELINE = {
  height: 8,
  stepWidth: 24,
  activeColor: '#22c55e',
  pendingColor: '#374151',
  failedColor: '#ef4444',
} as const;

/** Animation durations */
export const ANIMATION = {
  heatChangeMs: 200,
  spiceApplyMs: 150,
  fishFlashMs: 100,
} as const;
