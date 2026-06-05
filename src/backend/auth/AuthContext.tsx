// ============================================================
// GK TRAVELS CRM — Auth Context
//
// Uses the Express JWT + HttpOnly cookie backend.
// No Supabase. No localStorage. Cookies only.
//
// Flow:
//   1. On mount — GET /api/auth/me to restore session from cookie
//   2. signIn   — POST /api/auth/login  → backend sets HttpOnly cookie
//   3. signOut  — POST /api/auth/logout → backend clears cookie
// ============================================================

import {
  createContext, useContext, useCallback,
  useState, useEffect, type ReactNode,
} from 'react';
import apiClient                  from '@/lib/apiClient';
import { hasPermission, isAtLeast } from './permissions';
import type { AuthUser }           from './types';
import type { UserRole }           from './types';
import type { Permission }         from './permissions';

// ─── Context shape ─────────────────────────────────────────────

interface AuthContextValue {
  user:            AuthUser | null;
  isLoading:       boolean;
  isAuthenticated: boolean;
  signIn:          (email: string, password: string) => Promise<void>;
  signOut:         () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── API response → AuthUser ───────────────────────────────────

interface ApiUser {
  id:       string;
  email:    string;
  name:     string;
  role:     string;
  isActive: boolean;
}

function apiUserToAuthUser(u: ApiUser): AuthUser {
  return {
    id:       u.id,
    orgId:    'gktravel',
    email:    u.email,
    name:     u.name,
    role:     u.role.toUpperCase() as UserRole,
    avatar:   null,
    phone:    null,
    isActive: u.isActive,
  };
}

// ─── Provider ──────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,      setUser]      = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ── Session restore on mount ──────────────────────────────────
  // Call /api/auth/me to check if a valid JWT cookie already exists.
  // Uses the apiClient but note the 401 interceptor does NOT redirect
  // for /auth/* endpoints, so a missing session is handled gracefully here.
  useEffect(() => {
    let cancelled = false;

    apiClient
      .get<{ user: ApiUser }>('/auth/me')
      .then(res => {
        if (cancelled) return;
        setUser(apiUserToAuthUser(res.data.user));
      })
      .catch(() => {
        // No valid session — user must sign in
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  // ── signIn ────────────────────────────────────────────────────
  // Throws on failure so LoginPage can display the error message.
  const signIn = useCallback(async (email: string, password: string) => {
    const res = await apiClient.post<{ user: ApiUser }>('/auth/login', {
      email:    email.trim().toLowerCase(),
      password,
    });
    setUser(apiUserToAuthUser(res.data.user));
  }, []);

  // ── signOut ───────────────────────────────────────────────────
  // Clears local state regardless of whether the API call succeeds.
  const signOut = useCallback(async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch (err) {
      console.warn('[auth] Logout API call failed (clearing state anyway):', err);
    } finally {
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated: !isLoading && user !== null,
      signIn,
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
