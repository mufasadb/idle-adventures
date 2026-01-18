/**
 * Constants and types for the rhythm-based mining minigame.
 */

/** Total hits required */
export const TOTAL_HITS = 10;

/** First N hits establish rhythm (can't fail) */
export const RHYTHM_ESTABLISH_HITS = 2;

/** Timing tolerance (±5%) */
export const TIMING_TOLERANCE = 0.05;

/** Perfect reward multiplier */
export const PERFECT_MULTIPLIER = 1.5;

/** Penalty per failed hit */
export const FAIL_PENALTY = 0.1;

/** Minimum reward multiplier */
export const MIN_MULTIPLIER = 0.7;

/** Delay before starting circle growth (ms) */
export const GROWTH_START_DELAY_MS = 50;

/** Feedback shown after a hit */
export interface HitFeedback {
  type: 'success' | 'fail';
  timestamp: number;
}
