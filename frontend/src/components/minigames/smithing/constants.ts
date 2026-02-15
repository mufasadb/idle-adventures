/**
 * Constants for the smithing minigame UI
 */

/** Furnace glow colors based on heat */
export const FURNACE_COLORS = {
  cold: '#374151',      // Gray - cold
  warm: '#f97316',      // Orange - warming up
  hot: '#ef4444',       // Red - hot
  blazing: '#fbbf24',   // Yellow/white - blazing
} as const;

/** Heat thresholds for visual states */
export const HEAT_THRESHOLDS = {
  cold: 20,
  warm: 45,
  hot: 70,
  blazing: 90,
} as const;

/** Get furnace color based on heat level */
export function getFurnaceColor(heat: number): string {
  if (heat >= HEAT_THRESHOLDS.blazing) return FURNACE_COLORS.blazing;
  if (heat >= HEAT_THRESHOLDS.hot) return FURNACE_COLORS.hot;
  if (heat >= HEAT_THRESHOLDS.warm) return FURNACE_COLORS.warm;
  return FURNACE_COLORS.cold;
}

/** Bellows visual constants */
export const BELLOWS = {
  minHeight: 40,        // Compressed height
  maxHeight: 80,        // Extended height
  handleSize: 24,       // Handle grip size
} as const;

/** Crucible visual constants */
export const CRUCIBLE = {
  width: 80,
  height: 60,
  pourAngle: 45,        // Degrees to tilt when pouring
} as const;

/** Mold visual constants */
export const MOLD = {
  width: 100,
  height: 40,
  fillColor: '#fbbf24', // Molten metal color
} as const;

/** Animation durations */
export const ANIMATION = {
  heatGlowMs: 300,
  pourMs: 100,
  hammerMs: 150,
  sparkMs: 200,
} as const;

/** Smithing phases */
export type SmithingPhase =
  | 'select'      // Choose recipe
  | 'loading'     // Adding ores to crucible
  | 'heating'     // Pumping bellows
  | 'pouring'     // Pouring into mold
  | 'hammering'   // Finishing taps
  | 'results';    // Show outcome
