// ============================================================
// GK TRAVELS CRM — Auth Context (single-user stub)
//
// Authentication removed. Always authenticated as local admin.
// signIn / signOut are no-ops kept for interface compatibility.
// ============================================================

import {
  createContext, useContext, useCallback, type ReactNode,
} from 'react';
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

// ─── Hardcoded local user ──────────────────────────────────────

const LOCAL_USER: AuthUser = {
  id:       'local-admin',
  orgId:    'gktravel',
  email:    'chinmaykelkara@gmail.com',
  name:     'Chinmay',
  role:     'ADMIN',
  avatar:   null,
  phone:    null,
  isActive: true,
};

// ─── Provider ──────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const signIn  = useCallback(async () => {}, []);
  const signOut = useCallback(async () => {}, []);

  return (
    <AuthContext.Provider value={{
      user:            LOCAL_USER,
      isLoading:       false,
      isAuthenticated: true,
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
