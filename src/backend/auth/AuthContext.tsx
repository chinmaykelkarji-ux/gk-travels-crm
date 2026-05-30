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

// ─── Shape helper ──────────────────────────────────────────────

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
//
// Bootstrap flow (no login screen):
//   1. Check localStorage for an existing JWT.
//   2. If found, call GET /auth/me to verify it's still valid.
//   3. If not found (or expired/invalid), call POST /auth/setup.
//      /auth/setup idempotently creates the admin user if needed
//      and returns a fresh JWT — no credentials required.
//   4. Store the JWT in localStorage so apiClient attaches it to
//      every subsequent request (Authorization: Bearer <token>).
//
// This guarantees that every API call — including fetchAll() in the
// Zustand store — carries a valid token, so the backend requireAuth
// middleware lets them through and data persists to PostgreSQL.

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,      setUser]      = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void bootstrap();
  }, []);

  async function bootstrap() {
    const existingToken = tokenStorage.get();

    if (existingToken) {
      try {
        // Token present — verify it's still accepted by the backend
        const res = await apiClient.get('/auth/me');
        setUser(toAuthUser(res.data.user));
        setIsLoading(false);
        return;
      } catch {
        // Token invalid or expired — clear it and fall through to setup
        tokenStorage.clear();
      }
    }

    // No valid token — call /auth/setup to get one
    // This creates the admin user if it doesn't exist yet (idempotent)
    try {
      const res = await apiClient.post('/auth/setup');
      tokenStorage.set(res.data.token);
      setUser(toAuthUser(res.data.user));
    } catch (err) {
      // Backend unreachable (DB down, server not started, etc.)
      // Set a minimal local user so the UI renders; data will be empty
      // but the app won't crash.
      console.error('[auth] bootstrap failed — running in offline mode', err);
      setUser({
        id:       'local-admin',
        orgId:    'local',
        email:    'admin@gktravels.local',
        name:     'GK Admin (offline)',
        role:     'ADMIN' as UserRole,
        avatar:   null,
        phone:    null,
        isActive: true,
      });
    } finally {
      setIsLoading(false);
    }
  }

  // signIn kept for future use / Settings page password change flow
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

  const signUp = useCallback(async (_e: string, _p: string, _n: string) => {}, []);

  const signOut = useCallback(async () => {
    tokenStorage.clear();
    // Re-bootstrap immediately so a new token is fetched
    await bootstrap();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
