/**
 * Constants and types for the herb picking minigame.
 */

/** Game duration in ms */
export const GAME_DURATION_MS = 6000;

/** Number of flowers on the field */
export const TOTAL_FLOWERS = 30;

/** Ratio of good flowers (~15% good, ~85% bad) */
export const GOOD_FLOWER_RATIO = 0.15;

/** Flower size in pixels (smaller to reduce overlap) */
export const FLOWER_SIZE = 48;

/** Maximum overlap allowed between flowers (0-1, where 0.3 = 30%) */
export const MAX_OVERLAP = 0.3;

/** Flower state in the minigame */
export interface Flower {
  id: number;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  isGood: boolean;
  state: 'active' | 'collected' | 'crumbled';
  scale: number; // for size variation
  rotation: number; // slight rotation for natural look
}

/**
 * Check if two flowers overlap more than the allowed amount.
 * Returns true if overlap exceeds MAX_OVERLAP.
 */
export function checkOverlap(
  f1: { x: number; y: number; scale: number },
  f2: { x: number; y: number; scale: number },
  containerWidth: number,
  containerHeight: number
): boolean {
  // Convert percentage positions to pixel distances
  const dx = ((f1.x - f2.x) / 100) * containerWidth;
  const dy = ((f1.y - f2.y) / 100) * containerHeight;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Calculate combined radius (each flower's radius is half its size * scale)
  const r1 = (FLOWER_SIZE * f1.scale) / 2;
  const r2 = (FLOWER_SIZE * f2.scale) / 2;
  const combinedRadius = r1 + r2;

  // If distance >= combinedRadius, no overlap
  if (distance >= combinedRadius) return false;

  // Calculate overlap percentage (how much of the smaller flower is covered)
  const overlap = combinedRadius - distance;
  const smallerRadius = Math.min(r1, r2);
  const overlapRatio = overlap / (smallerRadius * 2);

  return overlapRatio > MAX_OVERLAP;
}

/**
 * Check if a point (click) is within a flower's bounds.
 * Returns true if the point is inside the flower circle.
 */
export function isPointInFlower(
  pointX: number, // percentage
  pointY: number, // percentage
  flower: { x: number; y: number; scale: number },
  containerWidth: number,
  containerHeight: number
): boolean {
  const dx = ((pointX - flower.x) / 100) * containerWidth;
  const dy = ((pointY - flower.y) / 100) * containerHeight;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const radius = (FLOWER_SIZE * flower.scale) / 2;

  return distance <= radius;
}
