import { create } from 'zustand';

import {
  getAccountSettings,
  type AccountSettings,
  type ModuleFlags,
} from '@/api/accountSettings';

interface AccountSettingsState {
  settings: AccountSettings | null;
  loading: boolean;
  load: () => Promise<void>;
  setSettings: (next: AccountSettings) => void;
  isModuleEnabled: (key: keyof ModuleFlags, def?: boolean) => boolean;
  reset: () => void;
}

export const useAccountSettingsStore = create<AccountSettingsState>((set, get) => ({
  settings: null,
  loading: false,

  load: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const s = await getAccountSettings();
      set({ settings: s, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  setSettings: (next) => set({ settings: next }),

  isModuleEnabled: (key, def = true) => {
    const flags = get().settings?.enabled_modules;
    if (!flags || flags[key] === undefined) return def;
    return !!flags[key];
  },

  reset: () => set({ settings: null, loading: false }),
}));
