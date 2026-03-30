/**
 * API Types
 *
 * Types for API requests and responses.
 */

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

export interface ApiError {
  error: string;
}
