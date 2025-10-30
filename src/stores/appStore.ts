import { create } from 'zustand';

export type Page = 'home' | 'settings' | 'tasks' | 'import';

interface AppState {
  currentPage: Page;
  setCurrentPage: (page: Page) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentPage: 'home',
  setCurrentPage: (page) => set({ currentPage: page }),
}));
