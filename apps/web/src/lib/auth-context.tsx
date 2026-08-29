'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { PLATFORM_ROLES } from '@deska/shared';
import {
  apiFetch,
  clearTokens,
  withBasePath,
  type ApiFetchOptions,
} from './utils';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  avatarUrl?: string | null;
  isActive?: boolean;
  tenants?: TenantMembership[];
}

export interface TenantMembership {
  id: string;
  name: string;
  slug: string;
  plan: string;
  locale: string;
  memberRole: string;
  joinedAt: string;
}

interface LoginResponse {
  user: AuthUser;
}

interface RegisterInput {
  name: string;
  email: string;
  phone?: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isSuperAdmin: boolean;
  isPlatformAdmin: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (input: RegisterInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await apiFetch<AuthUser>('/auth/me');
      setUser(me);
    } catch {
      setUser(null);
      clearTokens();
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      clearTokens();
      await refresh();
      setIsLoading(false);
    };
    void init();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    await apiFetch<LoginResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
      skipAuth: true,
      skipTenant: true,
    });

    const me = await apiFetch<AuthUser>('/auth/me');
    setUser(me);
    return me;
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    await apiFetch<LoginResponse>('/auth/register', {
      method: 'POST',
      body: input,
      skipAuth: true,
      skipTenant: true,
    });

    const me = await apiFetch<AuthUser>('/auth/me');
    setUser(me);
    return me;
  }, []);

  const logout = useCallback(async () => {
    clearTokens();
    setUser(null);
    try {
      await fetch(withBasePath('/api/auth/logout'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: '{}',
      });
    } catch {
      // Local logout must still succeed when the API is temporarily unavailable.
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      isSuperAdmin: user?.role === PLATFORM_ROLES.SUPER_ADMIN,
      isPlatformAdmin:
        user?.role === PLATFORM_ROLES.SUPER_ADMIN || user?.role === PLATFORM_ROLES.ADMIN,
      login,
      register,
      logout,
      refresh,
    }),
    [user, isLoading, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export type { ApiFetchOptions };
