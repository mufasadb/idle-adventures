export type GameScreen =
  | 'town'
  | 'stash'
  | 'expedition-prep'
  | 'active-expedition'
  | 'smithing'
  | 'cooking'
  | 'node-interaction'
  | 'minigame'
  | 'mining-minigame'
  | 'herb-minigame'
  | 'combat-minigame'
  | 'fishing-minigame';

export type ExpeditionMode = 'active' | 'passive';

export interface ItemStack {
  itemId: string;
  count: number;
}

export interface LoadoutItem {
  itemId: string;
}

export interface ItemDefinition {
  id: string;
  name: string;
  icon: string;
  category: string; // 'food' | 'animal' | 'misc' | 'tool' | 'map' | 'material' | etc.
  stackable: boolean;
  tier?: number;
  ap_value?: number;   // food items: AP per filled slot
  tags?: string[];     // e.g. ['desert-protection'] for Desert Cloak
  bagSlots?: number;   // vehicle items: bonus misc slots
  actions?: number;    // legacy alias for ap_value
}

export interface PlayerSkill {
  id: string;
  name: string;
  level: number;
  xp: number;
  xpToNext: number;
}

export interface Coord {
  x: number;
  y: number;
}

export interface MapNode {
  coord: Coord;
  terrain: string;
  activity?: string;
}

export interface ExpeditionMap {
  id: string;
  name: string;
  biome: string; // 'forest' | 'desert' | 'plains' | 'mountain' | etc.
  tier: number;
  width: number;
  height: number;
  nodes: MapNode[];
  startPos: Coord;
}

export interface ExpeditionLoadout {
  vehicle: ItemStack | null;         // the animal
  food: (LoadoutItem | null)[];      // 6 slots
  misc: (ItemStack | null)[];        // 4 slots
  mode: ExpeditionMode;
}

export interface ActiveExpedition {
  map: ExpeditionMap;
  position: Coord;
  actionsRemaining: number;
  actionsTotal: number;
  bag: ItemStack[];
  combatHp: number;
}

// API types (used by api/client.ts)
export interface Player {
  id: string;
  username: string;
  created_at?: string;
  last_online?: string;
  updated_at?: string;
}

export interface AuthResponse {
  token: string;
  player: Player;
}

export interface MeResponse {
  id: string;
  username: string;
  created_at?: string;
}

export interface PlayerFullResponse {
  id: string;
  username: string;
  skills: PlayerSkill[];
}
