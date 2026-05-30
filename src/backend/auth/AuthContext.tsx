import {
  createContext, useContext, useEffect, useState, useCallback, type ReactNode,
} from 'react';
import { apiClient, tokenStorage } from '@/lib/apiClient';
import { hasPermission, isAtLeast } from './permissions';
import type { AuthUser } from './types';
import type { Permission } from './permissions';
import type { UserRole } from '@/backend/supabase/database.types';

// ─── Context shape ─────────────────────────────────────────────

interface AuthContextValue {
  user:            AuthUser | null;
  isLoading:       boolean;
  isAuthenticated: boolean;
  signIn:          (email: string, password: string) => Promise<void>;
  signUp:          (email: string, password: string, name: string) => Promise<void>;
  signOut:         () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Helper: map API user to AuthUser shape ─────────────────────

function toAuthUser(u: { id: string; email: string; name: string; role: string }): AuthUser {
  return {
    id:       u.id,
    orgId:    'local',
    email:    u.email,
    name:     u.name,
    role:     (u.role as UserRole) ?? 'ADMIN',
    avatar:   null,
    phone:    null,
    isActive: true,
  };
}

// ─── Provider ──────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,      setUser]      = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount: restore session from stored JWT
  useEffect(() => {
    const token = tokenStorage.get();
    if (!token) { setIsLoading(false); return; }

    apiClient.get('/auth/me')
      .then(res => setUser(toAuthUser(res.data.user)))
      .catch(() => { tokenStorage.clear(); setUser(null); })
      .finally(() => setIsLoading(false));
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await apiClient.post('/auth/login', { email, password });
      tokenStorage.set(res.data.token);
      setUser(toAuthUser(res.data.user));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signUp = useCallback(async (_email: string, _password: string, _name: string) => {
    // Not implemented for local single-user setup.
    // Add user via DB seed or Prisma Studio.
  }, []);

  const signOut = useCallback(async () => {
    tokenStorage.clear();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated: user !== null,
      signIn,
      signUp,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hooks ─────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export function usePermission(permission: Permission): boolean {
  const { user } = useAuth();
  return hasPermission(user?.role ?? null, permission);
}

export function useIsAtLeast(minRole: UserRole): boolean {
  const { user } = useAuth();
  return isAtLeast(user?.role ?? null, minRole);
}
