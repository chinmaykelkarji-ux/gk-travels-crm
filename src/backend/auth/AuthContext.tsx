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
  signUp:          (email: string, password: string, name: string) => Promise<void>;
  signOut:         () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Default admin user — no login required ────────────────────

const DEFAULT_USER: AuthUser = {
  id:       'local-admin',
  orgId:    'local',
  email:    'admin@gktravels.com',
  name:     'GK Travels Admin',
  role:     'ADMIN',
  avatar:   null,
  phone:    null,
  isActive: true,
};

// ─── Provider ──────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const signIn  = useCallback(async (_email: string, _password: string) => {}, []);
  const signUp  = useCallback(async (_email: string, _password: string, _name: string) => {}, []);
  const signOut = useCallback(async () => {}, []);

  return (
    <AuthContext.Provider value={{
      user:            DEFAULT_USER,
      isLoading:       false,
      isAuthenticated: true,
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
