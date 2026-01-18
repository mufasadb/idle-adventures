/**
 * Coordinate Types
 *
 * Grid coordinate system used throughout the expedition system.
 */

/**
 * Grid coordinate
 */
export interface Coord {
  x: number;
  y: number;
}

/**
 * Create a string key from coordinates (for Set/Map lookups)
 */
export function coordKey(c: Coord): string {
  return `${c.x},${c.y}`;
}

/**
 * Parse a coord key back to Coord
 */
export function parseCoordKey(key: string): Coord {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

/**
 * Check if two coordinates are equal
 */
export function coordsEqual(a: Coord, b: Coord): boolean {
  return a.x === b.x && a.y === b.y;
}
