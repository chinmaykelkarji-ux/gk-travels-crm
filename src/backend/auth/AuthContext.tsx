// ============================================================
// GK TRAVELS CRM — Auth Context & Provider
//
// Wraps Supabase Auth with CRM-specific profile state.
// All authentication state flows through this context — never
// read supabase.auth.* directly from components or pages.
//
// Flow on mount:
//   1. getCurrentUser() restores any persisted Supabase session.
//   2. onAuthChange listener keeps state in sync for the lifetime
//      of the app (JWT refresh, sign-out from another tab, etc.).
//
// Session persistence is handled by the Supabase client
// (persistSession: true, storageKey: 'gkcrm_session').
// ============================================================

import {
  createContext, useContext, useEffect, useState, useCallback, type ReactNode,
} from 'react';
import { authService } from './authService';
import { hasPermission, isAtLeast } from './permissions';
import type { AuthUser } from './types';
import type { Permission } from './permissions';
import type { UserRole } from '@/backend/supabase/database.types';

// ─── Context shape ────────────────────────────────────────────

interface AuthContextValue {
  user:            AuthUser | null;
  isLoading:       boolean;
  isAuthenticated: boolean;
  signIn:          (email: string, password: string) => Promise<void>;
  signUp:          (email: string, password: string, name: string) => Promise<void>;
  signOut:         () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,      setUser]      = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Restore session on mount, then subscribe to future auth events.
    authService.getCurrentUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));

    const unsubscribe = authService.onAuthChange((authUser) => {
      setUser(authUser);
      setIsLoading(false);
    });

    return unsubscribe;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const authUser = await authService.signIn({ email, password });
      setUser(authUser);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string, name: string) => {
    await authService.signUp(email, password, name);
  }, []);

  const signOut = useCallback(async () => {
    await authService.signOut();
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

// ─── Hooks ───────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Returns true if the current user has the given permission. */
export function usePermission(permission: Permission): boolean {
  const { user } = useAuth();
  return hasPermission(user?.role ?? null, permission);
}

/** Returns true if the current user's role is at least the minimum required role. */
export function useIsAtLeast(minRole: UserRole): boolean {
  const { user } = useAuth();
  return isAtLeast(user?.role ?? null, minRole);
}
