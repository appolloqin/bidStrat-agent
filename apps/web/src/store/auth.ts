import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Role } from '@bidstrat/shared';

export interface AuthState {
  token: string | null;
  user: { id: string; username: string; displayName: string; role: Role; tenantId: string } | null;
  setAuth: (token: string, user: AuthState['user']) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    { name: 'bidstrat.auth' },
  ),
);