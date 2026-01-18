/**
 * Combat System Configuration
 *
 * Central configuration for all combat-related values.
 * All timing is based on the tick system (1 tick = 600ms).
 *
 * See docs/combat.md for full documentation.
 */

// ============================================
// Core Timing
// ============================================

/** Base tick duration in milliseconds */
export const TICK_MS = 600;

/** Convert ticks to milliseconds */
export const ticksToMs = (ticks: number): number => ticks * TICK_MS;

// ============================================
// Grid Configuration
// ============================================

/** Grid dimensions */
export const GRID_SIZE = 4;

/** Player starting position (center-ish of 4x4 grid) */
export const PLAYER_START = { x: 1, y: 1 };

// ============================================
// Player Combat Stats
// ============================================

/**
 * Player combat configuration
 * These will eventually be derived from equipment
 */
export const PLAYER_COMBAT = {
  /** Maximum HP (persists between combats, resets at expedition end) */
  maxHp: 10,

  /** Damage dealt per attack (future: derived from weapon) */
  damage: 1,

  /** Attack speed in ticks (future: derived from weapon) */
  attackSpeedTicks: 2, // 1.2 seconds

  /** Movement speed in ticks */
  moveSpeedTicks: 1, // 0.6 seconds

  /** Damage taken when using auto-combat */
  autoCombatDamage: 3,
};

// ============================================
// Attack Shapes
// ============================================

/**
 * Attack shape definitions
 * Each shape is an array of [x, y] offsets from the shape origin
 */
export type AttackShape = Array<[number, number]>;

export const ATTACK_SHAPES: Record<string, AttackShape> = {
  // Single tile
  single: [[0, 0]],

  // Lines
  lineH2: [[0, 0], [1, 0]],
  lineH3: [[0, 0], [1, 0], [2, 0]],
  lineV2: [[0, 0], [0, 1]],
  lineV3: [[0, 0], [0, 1], [0, 2]],

  // L-shapes
  lShape: [[0, 0], [0, 1], [0, 2], [1, 2]],
  lShapeFlip: [[0, 0], [0, 1], [0, 2], [-1, 2]],

  // T-shape
  tShape: [[0, 0], [1, 0], [2, 0], [1, 1]],

  // Square
  square: [[0, 0], [1, 0], [0, 1], [1, 1]],

  // Cross
  cross: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]],

  // Diagonal
  diagUp: [[0, 2], [1, 1], [2, 0]],
  diagDown: [[0, 0], [1, 1], [2, 2]],
};

// ============================================
// Enemy Definitions
// ============================================

export interface EnemyDefinition {
  id: string;
  name: string;
  icon: string;
  health: number;
  /** Attack speed in ticks */
  attackSpeedTicks: number;
  damage: number;
  /** Attack patterns this enemy can use (shape IDs from ATTACK_SHAPES) */
  attackPatterns: string[];
  /** Gold reward on victory */
  goldReward: number;
}

export const ENEMIES: Record<string, EnemyDefinition> = {
  skeleton: {
    id: 'skeleton',
    name: 'Skeleton',
    icon: '💀',
    health: 6,
    attackSpeedTicks: 3, // 1.8 seconds
    damage: 1,
    attackPatterns: ['lineH2', 'lineV2', 'single', 'lShape'],
    goldReward: 10,
  },

  goblin: {
    id: 'goblin',
    name: 'Goblin',
    icon: '👺',
    health: 4,
    attackSpeedTicks: 2, // 1.2 seconds (faster but weaker)
    damage: 1,
    attackPatterns: ['single', 'lineH2', 'diagUp'],
    goldReward: 8,
  },

  orc: {
    id: 'orc',
    name: 'Orc',
    icon: '👹',
    health: 10,
    attackSpeedTicks: 4, // 2.4 seconds (slower but tankier)
    damage: 2,
    attackPatterns: ['lineH3', 'lineV3', 'tShape', 'square'],
    goldReward: 15,
  },

  wraith: {
    id: 'wraith',
    name: 'Wraith',
    icon: '👻',
    health: 5,
    attackSpeedTicks: 3,
    damage: 1,
    attackPatterns: ['cross', 'diagUp', 'diagDown'],
    goldReward: 12,
  },
};

/**
 * Get enemy by map tier
 * Higher tiers have tougher enemies
 */
export function getEnemyForTier(tier: number): EnemyDefinition {
  switch (tier) {
    case 1:
      return ENEMIES.goblin;
    case 2:
      return ENEMIES.skeleton;
    case 3:
      return ENEMIES.orc;
    case 4:
      return ENEMIES.wraith;
    default:
      return ENEMIES.skeleton;
  }
}

// ============================================
// Combat Helpers
// ============================================

/**
 * Generate a random attack pattern for an enemy
 * Returns the absolute grid positions to be hit
 */
export function generateAttackPattern(
  enemy: EnemyDefinition
): Array<{ x: number; y: number }> {
  // Pick a random pattern from enemy's available patterns
  const patternId =
    enemy.attackPatterns[Math.floor(Math.random() * enemy.attackPatterns.length)];
  const shape = ATTACK_SHAPES[patternId];

  if (!shape) {
    return [{ x: 0, y: 0 }];
  }

  // Random origin position that keeps shape in bounds
  const maxOffset = {
    x: Math.max(...shape.map(([x]) => x)),
    y: Math.max(...shape.map(([, y]) => y)),
  };

  const originX = Math.floor(Math.random() * (GRID_SIZE - maxOffset.x));
  const originY = Math.floor(Math.random() * (GRID_SIZE - maxOffset.y));

  // Convert shape offsets to absolute positions
  return shape.map(([dx, dy]) => ({
    x: originX + dx,
    y: originY + dy,
  }));
}

/**
 * Check if a position is within the grid bounds
 */
export function isInBounds(x: number, y: number): boolean {
  return x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE;
}

/**
 * Get direction to move from current position toward target
 * Returns the next position (1 step in any of 8 directions)
 */
export function getMoveDirection(
  current: { x: number; y: number },
  target: { x: number; y: number }
): { x: number; y: number } {
  const dx = Math.sign(target.x - current.x);
  const dy = Math.sign(target.y - current.y);

  return {
    x: current.x + dx,
    y: current.y + dy,
  };
}
