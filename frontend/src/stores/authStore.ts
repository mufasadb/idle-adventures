import { makeAutoObservable, runInAction } from 'mobx';
import { api } from '../api/client';
import { playerStore } from './playerStore';
import type { Player } from '../types';

class AuthStore {
  player: Player | null = null;
  isLoading = false;
  error: string | null = null;

  constructor() {
    makeAutoObservable(this);
    this.checkAuth();
  }

  get isAuthenticated() {
    return this.player !== null;
  }

  async checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) return;

    this.isLoading = true;
    try {
      const player = await api.getPlayer();
      runInAction(() => {
        this.player = player;
      });
      // Try to load game state from server
      await playerStore.loadFromServer();
    } catch {
      // DEV MODE: If backend unavailable but token exists, use mock
      if (import.meta.env.DEV && token === 'dev-token') {
        runInAction(() => {
          this.player = {
            id: '1',
            email: 'dev@dev.com',
            username: 'DevPlayer',
            gold: 1234,
            last_online: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
        });
        return;
      }
      api.setToken(null);
    } finally {
      runInAction(() => {
        this.isLoading = false;
      });
    }
  }

  async register(email: string, username: string, password: string) {
    this.isLoading = true;
    this.error = null;

    try {
      const response = await api.register(email, username, password);
      api.setToken(response.token);
      runInAction(() => {
        this.player = response.player;
      });
    } catch (err) {
      // DEV MODE: If backend is unavailable, use mock data
      if (import.meta.env.DEV) {
        runInAction(() => {
          this.player = {
            id: '1',
            email,
            username,
            gold: 1234,
            last_online: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
        });
        localStorage.setItem('token', 'dev-token');
        return;
      }
      runInAction(() => {
        this.error = err instanceof Error ? err.message : 'Registration failed';
      });
      throw err;
    } finally {
      runInAction(() => {
        this.isLoading = false;
      });
    }
  }

  async login(email: string, password: string) {
    this.isLoading = true;
    this.error = null;

    try {
      const response = await api.login(email, password);
      api.setToken(response.token);
      runInAction(() => {
        this.player = response.player;
      });
      // Try to load game state from server
      await playerStore.loadFromServer();
    } catch (err) {
      // DEV MODE: If backend is unavailable, use mock data
      if (import.meta.env.DEV) {
        runInAction(() => {
          this.player = {
            id: '1',
            email,
            username: 'DevPlayer',
            gold: 1234,
            last_online: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
        });
        localStorage.setItem('token', 'dev-token');
        return;
      }
      runInAction(() => {
        this.error = err instanceof Error ? err.message : 'Login failed';
      });
      throw err;
    } finally {
      runInAction(() => {
        this.isLoading = false;
      });
    }
  }

  logout() {
    api.setToken(null);
    this.player = null;
  }
}

export const authStore = new AuthStore();
