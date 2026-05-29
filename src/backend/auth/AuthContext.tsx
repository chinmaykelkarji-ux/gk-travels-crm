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
  createContext, useContext, useState, useCallback, type ReactNode,
} from 'react';
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

// ─── DEV MODE — skip all Supabase auth ───────────────────────
const DEV_USER: AuthUser = {
  id:       'dev-admin',
  orgId:    'dev-org',
  email:    'gktravels8249@gmail.com',
  name:     'Admin',
  role:     'ADMIN',
  avatar:   null,
  phone:    null,
  isActive: true,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,      setUser]      = useState<AuthUser | null>(DEV_USER);
  const [isLoading, setIsLoading] = useState(false);

  const signIn  = useCallback(async (_email: string, _password: string) => { setUser(DEV_USER); }, []);
  const signUp  = useCallback(async (_email: string, _password: string, _name: string) => {}, []);
  const signOut = useCallback(async () => { setUser(null); }, []);

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
