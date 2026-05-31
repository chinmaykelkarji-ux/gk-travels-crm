// ============================================================
// GK TRAVELS CRM — Auth Context
//
// Session flow:
//   Mount → GET /auth/me (browser sends HttpOnly cookie automatically)
//     ↳ 200 → user restored, app renders
//     ↳ 401 → no valid session, show login page
//
// Login:
//   POST /auth/login { email, password }
//     ↳ server validates credentials, sets HttpOnly cookie
//     ↳ returns { user } → stored in React state
//
// Logout:
//   POST /auth/logout
//     ↳ server clears the cookie
//     ↳ React state cleared → login page shown
//
// The JWT lives ONLY in an HttpOnly cookie — never in localStorage,
// sessionStorage, or JS-accessible memory.
// ============================================================

import {
  createContext, useContext, useEffect, useState, useCallback, type ReactNode,
} from 'react';
import apiClient from '@/lib/apiClient';
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
  signOut:         () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Shape helper ──────────────────────────────────────────────

function toAuthUser(u: {
  id: string; email: string; name: string; role: string; isActive?: boolean;
}): AuthUser {
  return {
    id:       u.id,
    orgId:    'gktravel',
    email:    u.email,
    name:     u.name,
    role:     u.role.toUpperCase() as UserRole,
    avatar:   null,
    phone:    null,
    isActive: u.isActive ?? true,
  };
}

// ─── Provider ──────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,      setUser]      = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount: restore session from the HttpOnly cookie.
  // In development, the dev-bypass issues a session automatically so the
  // login screen is never shown.
  //
  // DEVELOPMENT BYPASS
  // REMOVE BEFORE PRODUCTION
  useEffect(() => {
    const restore = import.meta.env.DEV
      // DEVELOPMENT BYPASS — auto-authenticate as admin@gktravels.local
      // REMOVE BEFORE PRODUCTION
      ? apiClient.post('/auth/dev-login')
      : apiClient.get('/auth/me');

    restore
      .then(res => setUser(toAuthUser(res.data.user)))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    // Server sets the HttpOnly cookie; we only need the user object
    const res = await apiClient.post('/auth/login', {
      email:    email.trim().toLowerCase(),
      password,
    });
    setUser(toAuthUser(res.data.user));
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Even if the server call fails, clear local state
    }
    setUser(null);
    window.location.href = '/login';
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated: user !== null,
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
