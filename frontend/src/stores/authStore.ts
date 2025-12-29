import { makeAutoObservable, runInAction } from 'mobx';
import { api } from '../api/client';
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
    } catch {
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
    } catch (err) {
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
