import { makeAutoObservable } from 'mobx';

export type Theme = 'light' | 'dark';

class ThemeStore {
  theme: Theme = 'dark';

  constructor() {
    makeAutoObservable(this);
    this.loadTheme();
  }

  private loadTheme() {
    const saved = localStorage.getItem('theme') as Theme | null;
    if (saved) {
      this.theme = saved;
    } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
      this.theme = 'light';
    }
  }

  toggle() {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', this.theme);
  }

  get isDark() {
    return this.theme === 'dark';
  }
}

export const themeStore = new ThemeStore();

// DEV: Expose for debugging
if (import.meta.env.DEV) {
  (window as unknown as { themeStore: ThemeStore }).themeStore = themeStore;
}
