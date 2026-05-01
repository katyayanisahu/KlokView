import { create } from 'zustand';

import { loginRequest, meRequest, registerRequest } from '@/api/auth';
import type { User } from '@/types';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isHydrating: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (params: {
    email: string;
    full_name: string;
    password: string;
    company_name?: string;
  }) => Promise<void>;
  setSession: (params: { user: User; access: string; refresh: string }) => void;
  logout: () => void;
  hydrate: () => Promise<void>;
}

const ACCESS_KEY = 'access_token';
const REFRESH_KEY = 'refresh_token';

function persistTokens(access: string, refresh: string) {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: localStorage.getItem(ACCESS_KEY),
  refreshToken: localStorage.getItem(REFRESH_KEY),
  isHydrating: Boolean(localStorage.getItem(ACCESS_KEY)),

  login: async (email, password) => {
    const { access, refresh, user } = await loginRequest(email, password);
    persistTokens(access, refresh);
    set({ accessToken: access, refreshToken: refresh, user, isHydrating: false });
  },

  register: async (params) => {
    const { access, refresh, user } = await registerRequest(params);
    persistTokens(access, refresh);
    set({ accessToken: access, refreshToken: refresh, user, isHydrating: false });
  },

  setSession: ({ user, access, refresh }) => {
    persistTokens(access, refresh);
    set({ accessToken: access, refreshToken: refresh, user, isHydrating: false });
  },

  logout: () => {
    clearTokens();
    set({ user: null, accessToken: null, refreshToken: null, isHydrating: false });
  },

  hydrate: async () => {
    if (!get().accessToken) {
      set({ isHydrating: false });
      return;
    }
    try {
      const user = await meRequest();
      set({ user, isHydrating: false });
    } catch {
      clearTokens();
      set({ user: null, accessToken: null, refreshToken: null, isHydrating: false });
    }
  },
}));
