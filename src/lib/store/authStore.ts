'use client';

import { create } from 'zustand';
import { Profile } from '@/types';

interface AuthState {
  profile: Profile | null;
  setProfile: (profile: Profile | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  profile: null,
  setProfile: (profile) => set({ profile }),
}));
