/**
 * API Types
 *
 * Types for API requests and responses.
 */

import type { PlayerSkill } from './player';

export interface Player {
  id: string;
  username: string;
  last_online: string;
  created_at: string;
  updated_at: string;
}

export interface MeResponse {
  id: string;
  username: string;
  created_at: string;
}

export interface AuthResponse {
  token: string;
  player: Player;
}

/** Shape returned by GET /api/player */
export interface PlayerFullResponse extends Player {
  skills: PlayerSkill[];
  stash: StashItemResponse[];
}

/** Shape of a single stash item from GET /api/player */
export interface StashItemResponse {
  id: string;
  player_id: string;
  item_def_id: string;
  quantity: number;
  stash_position: number | null;
  seed: number | null;
  created_at: string;
  definition: {
    id: string;
    name: string;
    category: string;
    subcategory: string | null;
    icon: string;
    stackable: boolean;
    slot_type: string | null;
    created_at: string;
  };
}

export interface ApiError {
  error: string;
}
