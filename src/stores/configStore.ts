import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { Config } from '../types/config';

interface ConfigState {
  config: Config | null;
  isLoading: boolean;
  loadConfig: () => Promise<void>;
  updateConfig: (config: Config) => void;
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  config: null,
  isLoading: false,

  loadConfig: async () => {
    // If already loaded, don't reload
    if (get().config !== null) {
      return;
    }

    set({ isLoading: true });
    try {
      const cfg = await invoke<Config>('get_config');
      set({ config: cfg, isLoading: false });
    } catch (error) {
      console.error('Failed to load config:', error);
      set({ isLoading: false });
    }
  },

  updateConfig: (config: Config) => {
    set({ config });
  },
}));
