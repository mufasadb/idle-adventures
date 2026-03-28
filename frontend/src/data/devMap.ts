/**
 * Dev Map - Hardcoded 8x8 map for development and testing
 *
 * This is a handcrafted fixture intended for rapid iteration while
 * automated map generation is being built (see ia-qa3).
 *
 * To swap in a different map, replace the `DEV_MAP` export or
 * point `sessionStore.availableMaps` to any `ExpeditionMap[]`.
 *
 * Layout legend:
 *   G  = ground (standard, cost 1)
 *   M  = mountain (cost 2)
 *   W  = water / river tile (cost 2)
 *   F  = forest (cost 1)
 *   mi = mining activity   (on ground)
 *   he = herbs activity    (on ground or forest)
 *   ge = gems activity     (on ground)
 *   co = combat activity   (on ground)
 *   fi = fishing activity  (on water)
 *
 * Visual grid (x →, y ↓):
 *
 *       0    1    2    3    4    5    6    7
 *  y=0  G    G    F    F    G    M    M    G
 *  y=1  G   he    F    W    G    M    G   mi
 *  y=2  G    G    G    W    G    G   co   G
 *  y=3 mi    G    G    W    W    G    G    G
 *  y=4  G    G    G    G    W   fi    G   ge
 *  y=5  G   he    M    G    G    G    G    G
 *  y=6  G    G    M    G    F    F    G    G
 *  y=7  G    G    G   mi    F    G    G    G
 *
 * River path (connected): (3,1)→(3,2)→(3,3)→(4,3)→(4,4)→(5,4=fishing)
 * Mountain cluster NE corner: (5,0),(6,0),(5,1)
 * Mountain passes: (2,5),(2,6) — blocks central-west corridor
 */

import type { ExpeditionMap, MapNode } from '../types';

// ---------------------------------------------------------------------------
// Raw layout matrix
// Each cell is [terrain, activity?]
// Using shorthand strings that are decoded below.
// ---------------------------------------------------------------------------

type Cell = [
  terrain: 'G' | 'M' | 'W' | 'F',
  activity?: 'mining' | 'herbs' | 'gems' | 'combat' | 'fishing',
];

const LAYOUT: Cell[][] = [
  // y=0
  [['G'], ['G'], ['F'], ['F'], ['G'], ['M'], ['M'], ['G']],
  // y=1
  [['G'], ['G', 'herbs'], ['F'], ['W'], ['G'], ['M'], ['G'], ['G', 'mining']],
  // y=2
  [['G'], ['G'], ['G'], ['W'], ['G'], ['G'], ['G', 'combat'], ['G']],
  // y=3
  [['G', 'mining'], ['G'], ['G'], ['W'], ['W'], ['G'], ['G'], ['G']],
  // y=4
  [['G'], ['G'], ['G'], ['G'], ['W'], ['W', 'fishing'], ['G'], ['G', 'gems']],
  // y=5
  [['G'], ['G', 'herbs'], ['M'], ['G'], ['G'], ['G'], ['G'], ['G']],
  // y=6
  [['G'], ['G'], ['M'], ['G'], ['F'], ['F'], ['G'], ['G']],
  // y=7
  [['G'], ['G'], ['G'], ['G', 'mining'], ['F'], ['G'], ['G'], ['G']],
];

// ---------------------------------------------------------------------------
// Build node list
// ---------------------------------------------------------------------------

function buildNodes(layout: Cell[][]): MapNode[] {
  const nodes: MapNode[] = [];

  const terrainMap = {
    G: 'ground',
    M: 'mountain',
    W: 'water',
    F: 'forest',
  } as const;

  for (let y = 0; y < layout.length; y++) {
    const row = layout[y];
    for (let x = 0; x < row.length; x++) {
      const [terrainCode, activity] = row[x];
      const node: MapNode = {
        coord: { x, y },
        terrain: terrainMap[terrainCode],
      };
      if (activity) {
        node.activity = activity;
      }
      nodes.push(node);
    }
  }

  return nodes;
}

// ---------------------------------------------------------------------------
// Exported map fixture
// ---------------------------------------------------------------------------

export const DEV_MAP: ExpeditionMap = {
  id: 'dev-map-8x8',
  name: 'Dev Map (8×8)',
  tier: 1,
  travelDays: 1,
  terrain: 'Mixed',
  danger: 'low',
  width: 8,
  height: 8,
  nodes: buildNodes(LAYOUT),
};
