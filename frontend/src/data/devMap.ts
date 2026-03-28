/**
 * Dev Map — Hardcoded 8×8 fixture for development and testing.
 *
 * Includes a variety of terrain types and activities so every tile variant
 * can be exercised without map generation. Easily swappable: just replace
 * the import in sessionStore.ts when real generation is wired up.
 */

import { legacyTypeToNode } from '../engine/nodes';
import type { ExpeditionMap } from '../types';

/**
 * Layout key:
 *   '.'  = ground (empty)
 *   'M'  = mountain
 *   'W'  = water
 *   'F'  = forest
 *   'mi' = mining
 *   'h'  = herbs
 *   'g'  = gems
 *   'c'  = combat
 *   'fi' = fishing (water tile + activity)
 *
 * Player starts at (0,0) by convention.
 */
const LAYOUT: string[][] = [
  ['.', '.', 'F',  'F',  'M',  '.',  '.',  '.'],
  ['.', 'mi','.',  'F',  'M',  'mi', '.',  'h'],
  ['W', 'W', '.',  '.',  '.',  '.',  'g',  '.'],
  ['fi','W', 'M',  'M',  '.',  'h',  '.',  '.'],
  ['.', '.', '.',  '.',  '.',  '.',  'mi', '.'],
  ['F', '.', 'h',  '.',  'c',  '.',  '.',  'F'],
  ['.', '.', '.',  'mi', '.',  '.',  'g',  '.'],
  ['.', 'c', '.',  '.',  'F',  'mi', '.',  '.'],
];

const WIDTH = 8;
const HEIGHT = 8;

function buildDevMap(): ExpeditionMap {
  const nodes = [];
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const cell = LAYOUT[y][x];
      // Map short codes to legacyTypeToNode keys
      const type =
        cell === '.' ? 'empty' :
        cell === 'M' ? 'mountain' :
        cell === 'W' ? 'water' :
        cell === 'F' ? 'forest' :
        cell === 'mi' ? 'mining' :
        cell === 'h' ? 'herbs' :
        cell === 'g' ? 'gems' :
        cell === 'c' ? 'combat' :
        cell === 'fi' ? 'fishing' :
        'empty';
      nodes.push(legacyTypeToNode(type, x, y));
    }
  }

  return {
    id: 'dev-map-8x8',
    name: 'Dev Valley',
    tier: 1,
    travelDays: 1,
    terrain: 'Mixed',
    danger: 'low',
    nodes,
    width: WIDTH,
    height: HEIGHT,
  };
}

export const DEV_MAP: ExpeditionMap = buildDevMap();
