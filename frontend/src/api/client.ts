import type { AuthResponse, MeResponse, Player } from '../types';

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

  async getGameState(): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>('/game-state');
  }

  async saveGameState(state: Record<string, unknown>): Promise<{ saved: boolean }> {
    return this.request<{ saved: boolean }>('/game-state', {
      method: 'POST',
      body: JSON.stringify(state),
    });
  }

  get hasToken(): boolean {
    return this.token !== null;
  }
}

export const api = new ApiClient();
