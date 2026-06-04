import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { UserProfile } from '../types';

interface AuthState {
  user: UserProfile | null;
  session: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: UserProfile | null) => void;
  isAdmin: () => boolean;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: true,

  login: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle();

    set({
      session: data.session?.access_token ?? null,
      user: profile ? { id: profile.id, email: data.user.email ?? '', role: profile.role, ten: profile.ten } : null,
    });
  },

  logout: async () => {
    await supabase.auth.signOut();
    set({ user: null, session: null });
  },

  setUser: (user) => set({ user }),

  isAdmin: () => get().user?.role === 'admin',

  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();

        set({
          session: session.access_token,
          user: profile ? { id: profile.id, email: session.user.email ?? '', role: profile.role, ten: profile.ten } : null,
          loading: false,
        });
      } else {
        set({ loading: false });
      }
    } catch {
      set({ loading: false });
    }
  },
}));
