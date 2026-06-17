import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'fft.theme.mode';

interface ThemeState {
  mode: ThemeMode;
  hydrated: boolean;
  setMode: (mode: ThemeMode) => void;
  hydrate: () => Promise<void>;
}

// Theme preference is *client* state → Zustand (server state lives in React Query).
export const useThemeStore = create<ThemeState>((set) => ({
  mode: 'system',
  hydrated: false,
  setMode: (mode) => {
    set({ mode });
    void AsyncStorage.setItem(STORAGE_KEY, mode);
  },
  hydrate: async () => {
    const saved = (await AsyncStorage.getItem(STORAGE_KEY)) as ThemeMode | null;
    set({ mode: saved ?? 'system', hydrated: true });
  },
}));
