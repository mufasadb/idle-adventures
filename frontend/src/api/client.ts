import type { AuthResponse, MeResponse, Player, PlayerFullResponse, PlayerSkill } from '../types';

const BASE_URL = '/api';

class ApiClient {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('token');
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Request failed');
    }

    return response.json();
  }

  async register(username: string, password: string): Promise<AuthResponse> {
    return this.request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  }

  async login(username: string, password: string): Promise<AuthResponse> {
    return this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  }

  async getMe(): Promise<MeResponse> {
    return this.request<MeResponse>('/me');
  }

  async getPlayer(): Promise<Player> {
    return this.request<Player>('/player');
  }

  /** GET /api/player — full player: profile + skills + stash */
  async getPlayerFull(): Promise<PlayerFullResponse> {
    return this.request<PlayerFullResponse>('/player');
  }

  async saveSkills(skills: PlayerSkill[]): Promise<{ saved: boolean }> {
    return this.request<{ saved: boolean }>('/player/skills', {
      method: 'POST',
      body: JSON.stringify(skills),
    });
  }

  async getGameState(): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>('/game-state');
  }

  async saveGameState(state: Record<string, unknown>): Promise<{ saved: boolean }> {
    return this.request<{ saved: boolean }>('/game-state', {
      method: 'POST',
      body: JSON.stringify(state),
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getStash(): Promise<{ items: any[] }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.request<{ items: any[] }>('/player/stash');
  }

  async moveStashItem(itemId: string, newPosition: number | null): Promise<{ moved: boolean }> {
    return this.request<{ moved: boolean }>('/player/stash/move', {
      method: 'POST',
      body: JSON.stringify({ item_id: itemId, new_position: newPosition }),
    });
  }

  async swapStashItems(itemIdA: string, itemIdB: string): Promise<{ swapped: boolean }> {
    return this.request<{ swapped: boolean }>('/player/stash/swap', {
      method: 'POST',
      body: JSON.stringify({ item_id_a: itemIdA, item_id_b: itemIdB }),
    });
  }

  async destroyStashItem(itemId: string): Promise<{ destroyed: boolean }> {
    return this.request<{ destroyed: boolean }>(`/player/stash/${itemId}`, {
      method: 'DELETE',
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async addRandomStashItem(): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.request<any>('/player/stash/add-random', {
      method: 'POST',
    });
  }

  get hasToken(): boolean {
    return this.token !== null;
  }
}

export const api = new ApiClient();
