import type { ExpeditionMap } from '../types';

export const THORNWOOD_MAP: ExpeditionMap = {
  id: 'thornwood',
  name: 'Thornwood Valley',
  biome: 'forest',
  tier: 1,
  width: 7,
  height: 7,
  nodes: [],
  startPos: { x: 0, y: 0 },
};

export const DUSTPEAK_MAP: ExpeditionMap = {
  id: 'dustpeak',
  name: 'Dustpeak Wastes',
  biome: 'desert',
  tier: 1,
  width: 7,
  height: 7,
  nodes: [],
  startPos: { x: 0, y: 0 },
};

// Alias for backwards-compat with sessionStore
export const DEV_MAP = THORNWOOD_MAP;
