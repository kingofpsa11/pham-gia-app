import { create } from 'zustand';
import type { UserProfile } from '../types';

const TOKEN_KEY = 'token';
const USER_KEY = 'user';

interface LoginApiUser {
  id: number | string;
  email: string;
  role: 'admin' | 'staff';
  full_name?: string;
  ten?: string;
}

interface LoginApiResponse {
  token: string;
  user: LoginApiUser;
}

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

function mapApiUserToProfile(apiUser: LoginApiUser): UserProfile {
  return {
    id: String(apiUser.id),
    email: apiUser.email,
    role: apiUser.role,
    ten: apiUser.full_name ?? apiUser.ten ?? '',
  };
}

function isValidUserProfile(value: unknown): value is UserProfile {
  if (!value || typeof value !== 'object') return false;
  const u = value as Record<string, unknown>;
  return (
    typeof u.id === 'string' &&
    typeof u.email === 'string' &&
    (u.role === 'admin' || u.role === 'staff')
  );
}

function clearStoredAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function persistAuth(token: string, user: UserProfile) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: true,

  login: async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || data.message || 'Đăng nhập thất bại');
    }

    const { token, user: apiUser } = data as LoginApiResponse;
    if (!token || !apiUser) {
      throw new Error('Phản hồi đăng nhập không hợp lệ');
    }

    const user = mapApiUserToProfile(apiUser);
    persistAuth(token, user);
    set({ session: token, user });
  },

  logout: async () => {
    clearStoredAuth();
    set({ user: null, session: null });
  },

  setUser: (user) => set({ user }),

  isAdmin: () => get().user?.role === 'admin',

  initialize: async () => {
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const userRaw = localStorage.getItem(USER_KEY);

      if (!token || !userRaw) {
        clearStoredAuth();
        set({ user: null, session: null, loading: false });
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(userRaw);
      } catch {
        clearStoredAuth();
        set({ user: null, session: null, loading: false });
        return;
      }

      if (!isValidUserProfile(parsed)) {
        clearStoredAuth();
        set({ user: null, session: null, loading: false });
        return;
      }

      set({ session: token, user: parsed, loading: false });
    } catch {
      clearStoredAuth();
      set({ user: null, session: null, loading: false });
    }
  },
}));
