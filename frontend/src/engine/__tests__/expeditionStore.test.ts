/**
 * Expedition Store Workflow Tests
 *
 * Tests the core workflows:
 * 1. Normal mode path drawing
 * 2. Eraser mode path erasing
 * 3. Activity toggle (long-press simulation)
 * 4. Path visualization (affordable vs unaffordable)
 * 5. Clear path
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  extendPath,
  erasePathTo,
  calculatePathCost,
  trimPathToActionBudget,
  isOnPath,
  getDirectPath,
} from '../pathfinding';
import { coordKey, legacyTypeToNode, type Coord, type MapNode } from '../nodes';

// Helper to create a test map
function createTestNodeMap(): Map<string, MapNode> {
  const nodeMap = new Map<string, MapNode>();

  // Create a 5x5 grid
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      let type = 'empty';

      // Add some activities
      if (x === 1 && y === 1) type = 'mining';
      if (x === 2 && y === 2) type = 'herbs';
      if (x === 3 && y === 1) type = 'gems';

      // Add terrain
      if (x === 4 && y === 0) type = 'mountain';
      if (x === 0 && y === 4) type = 'water';

      const node = legacyTypeToNode(type, x, y);
      nodeMap.set(coordKey(node.coord), node);
    }
  }

  return nodeMap;
}

describe('Workflow 1: Normal mode path drawing', () => {
  it('draws path from start to destination (horizontal first)', () => {
    const path = getDirectPath({ x: 0, y: 0 }, { x: 2, y: 1 });

    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
    ]);
  });

  it('extends existing path to new destination', () => {
    const startPosition = { x: 0, y: 0 };
    let path: Coord[] = [];

    // First tap
    path = extendPath(path, { x: 2, y: 0 }, startPosition);
    expect(path.length).toBe(3);
    expect(path[path.length - 1]).toEqual({ x: 2, y: 0 });

    // Second tap - extends from end
    path = extendPath(path, { x: 2, y: 2 }, startPosition);
    expect(path.length).toBe(5);
    expect(path[path.length - 1]).toEqual({ x: 2, y: 2 });
  });

  it('allows backtracking/loops in path', () => {
    const startPosition = { x: 0, y: 0 };
    let path: Coord[] = [];

    // Go right
    path = extendPath(path, { x: 2, y: 0 }, startPosition);
    // Then go back left (creates loop)
    path = extendPath(path, { x: 0, y: 0 }, startPosition);

    // Path should contain the loop
    expect(path.length).toBe(5);
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[path.length - 1]).toEqual({ x: 0, y: 0 });
  });
});

describe('Workflow 2: Eraser mode path erasing', () => {
  it('erases path back to clicked point', () => {
    const path: Coord[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
    ];

    // Erase back to (2, 0)
    const newPath = erasePathTo(path, { x: 2, y: 0 });

    expect(newPath).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
  });

  it('does nothing when clicking off-path in eraser mode', () => {
    const path: Coord[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];

    // Try to erase to a point not on the path
    const newPath = erasePathTo(path, { x: 5, y: 5 });

    // Path should be unchanged
    expect(newPath).toEqual(path);
  });

  it('can erase to start position', () => {
    const path: Coord[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];

    const newPath = erasePathTo(path, { x: 0, y: 0 });

    expect(newPath).toEqual([{ x: 0, y: 0 }]);
  });
});

describe('Workflow 3: Activity toggle', () => {
  const nodeMap = createTestNodeMap();

  it('calculates cost with active activity', () => {
    const path: Coord[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 }, // Mining activity
    ];

    const activeActivities = new Set(['1,1']);
    const cost = calculatePathCost(path, nodeMap, activeActivities);

    // 2 tiles movement (1 each) + 1 activity = 3
    expect(cost.totalCost).toBe(3);
    expect(cost.activitiesOnPath).toEqual([{ x: 1, y: 1 }]);
  });

  it('calculates cost with skipped activity', () => {
    const path: Coord[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 }, // Mining activity
    ];

    const activeActivities = new Set<string>(); // Activity NOT active
    const cost = calculatePathCost(path, nodeMap, activeActivities);

    // 2 tiles movement only = 2
    expect(cost.totalCost).toBe(2);
    expect(cost.activitiesOnPath).toEqual([{ x: 1, y: 1 }]);
  });

  it('tracks activities on path regardless of active state', () => {
    const path: Coord[] = [
      { x: 0, y: 0 },
      { x: 1, y: 1 }, // Mining
      { x: 2, y: 2 }, // Herbs
      { x: 3, y: 1 }, // Gems
    ];

    const cost = calculatePathCost(path, nodeMap, new Set());

    expect(cost.activitiesOnPath.length).toBe(3);
  });
});

describe('Workflow 4: Path visualization (affordable vs unaffordable)', () => {
  const nodeMap = createTestNodeMap();

  it('trims path to fit action budget', () => {
    const path: Coord[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 }, // Mountain - costs 2
    ];

    const actionBudget = 3;
    const result = trimPathToActionBudget(path, nodeMap, new Set(), actionBudget);

    // Should stop before mountain (would exceed budget)
    expect(result.isComplete).toBe(false);
    expect(result.path.length).toBe(4); // Start + 3 tiles
    expect(result.cost).toBe(3);
    expect(result.actionsRemaining).toBe(0);
  });

  it('returns full path when affordable', () => {
    const path: Coord[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];

    const actionBudget = 5;
    const result = trimPathToActionBudget(path, nodeMap, new Set(), actionBudget);

    expect(result.isComplete).toBe(true);
    expect(result.path).toEqual(path);
    expect(result.cost).toBe(2);
    expect(result.actionsRemaining).toBe(3);
  });

  it('accounts for activities in budget calculation', () => {
    const path: Coord[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 }, // Mining
    ];

    const activeActivities = new Set(['1,1']);
    const actionBudget = 2; // Only enough for 2 tiles, not the activity

    const result = trimPathToActionBudget(path, nodeMap, activeActivities, actionBudget);

    // Mining tile costs 1 (terrain) + 1 (activity) = 2
    // Budget is 2, first tile costs 1, so can't afford the mining tile
    expect(result.isComplete).toBe(false);
    expect(result.path.length).toBe(2); // Start + 1 tile
  });
});

describe('Workflow 5: Clear path', () => {
  it('isOnPath returns false for empty path', () => {
    const path: Coord[] = [];

    expect(isOnPath(path, { x: 0, y: 0 })).toBe(false);
    expect(isOnPath(path, { x: 1, y: 1 })).toBe(false);
  });

  it('isOnPath correctly identifies tiles on path', () => {
    const path: Coord[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];

    expect(isOnPath(path, { x: 1, y: 0 })).toBe(true);
    expect(isOnPath(path, { x: 3, y: 0 })).toBe(false);
  });
});

describe('Terrain cost modifiers', () => {
  const nodeMap = createTestNodeMap();

  it('mountain costs 2 without climbing boots', () => {
    const path: Coord[] = [
      { x: 3, y: 0 },
      { x: 4, y: 0 }, // Mountain
    ];

    const cost = calculatePathCost(path, nodeMap, new Set(), []);
    expect(cost.totalCost).toBe(2);
  });

  it('mountain costs 1 with climbing boots', () => {
    const path: Coord[] = [
      { x: 3, y: 0 },
      { x: 4, y: 0 }, // Mountain
    ];

    const cost = calculatePathCost(path, nodeMap, new Set(), ['climbing-boots']);
    expect(cost.totalCost).toBe(1);
  });

  it('water costs 2 without raft', () => {
    const path: Coord[] = [
      { x: 0, y: 3 },
      { x: 0, y: 4 }, // Water
    ];

    const cost = calculatePathCost(path, nodeMap, new Set(), []);
    expect(cost.totalCost).toBe(2);
  });

  it('water costs 1 with raft', () => {
    const path: Coord[] = [
      { x: 0, y: 3 },
      { x: 0, y: 4 }, // Water
    ];

    const cost = calculatePathCost(path, nodeMap, new Set(), ['raft']);
    expect(cost.totalCost).toBe(1);
  });
});
