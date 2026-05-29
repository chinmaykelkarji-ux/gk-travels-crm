import type { UserRole } from '@/backend/supabase/database.types';

// ─── Auth User ────────────────────────────────────────────────
// Merges Supabase auth.users with the crm profiles table.
// This is what AuthContext.user contains after login.

export interface AuthUser {
  id:          string;   // Supabase auth UID
  orgId:       string;
  email:       string;
  name:        string;
  role:        UserRole;
  avatar:      string | null;
  phone:       string | null;
  isActive:    boolean;
}

// ─── Auth State ───────────────────────────────────────────────

export interface AuthState {
  user:        AuthUser | null;
  isLoading:   boolean;
  isAuthenticated: boolean;
}

// ─── Credentials ─────────────────────────────────────────────

export interface LoginCredentials {
  email:    string;
  password: string;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword:     string;
}
