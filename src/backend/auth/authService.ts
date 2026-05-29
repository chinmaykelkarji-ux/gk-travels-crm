// ============================================================
// GK TRAVELS CRM — Auth Service
//
// Wraps Supabase Auth with CRM-specific profile loading.
// All auth operations go through this service — never call
// supabase.auth.* directly from components.
// ============================================================

import { supabase } from '@/backend/supabase/client';
import type { AuthUser, LoginCredentials } from './types';
import type { DbProfile } from '@/backend/supabase/database.types';

class AuthService {

  // ── Sign In ─────────────────────────────────────────────────
  async signIn(credentials: LoginCredentials): Promise<AuthUser> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email:    credentials.email.trim().toLowerCase(),
      password: credentials.password,
    });
    if (error)      throw new AuthError(error.message, 'INVALID_CREDENTIALS');
    if (!data.user) throw new AuthError('No user returned', 'UNKNOWN');

    // Load profile (role, org, name)
    return this.loadProfile(data.user.id);
  }

  // ── Sign Out ─────────────────────────────────────────────────
  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) throw new AuthError(error.message, 'SIGN_OUT_FAILED');
  }

  // ── Get current session ──────────────────────────────────────
  async getSession() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw new AuthError(error.message, 'SESSION_ERROR');
    return session;
  }

  // ── Get current user (from session + profile) ────────────────
  async getCurrentUser(): Promise<AuthUser | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    try {
      return await this.loadProfile(user.id);
    } catch {
      // Profile not found — user may be new or org not set up
      return null;
    }
  }

  // ── Sign Up ─────────────────────────────────────────────────
  async signUp(email: string, password: string, name: string): Promise<void> {
    const { error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: { name },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) throw new AuthError(error.message, 'SIGN_UP_FAILED');
  }

  // ── Password reset ───────────────────────────────────────────
  async requestPasswordReset(email: string): Promise<void> {
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: `${window.location.origin}/auth/reset-password` },
    );
    if (error) throw new AuthError(error.message, 'RESET_FAILED');
  }

  async updatePassword(newPassword: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new AuthError(error.message, 'UPDATE_FAILED');
  }

  // ── Subscribe to auth changes ────────────────────────────────
  // Returns an unsubscribe function.
  onAuthChange(callback: (user: AuthUser | null) => void): () => void {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!session?.user) {
          callback(null);
          return;
        }
        try {
          const user = await this.loadProfile(session.user.id);
          callback(user);
        } catch {
          callback(null);
        }
      },
    );
    return () => subscription.unsubscribe();
  }

  // ── Internal: load profile from DB ──────────────────────────
  private async loadProfile(userId: string): Promise<AuthUser> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw new AuthError(`Profile load failed: ${error.message}`, 'PROFILE_NOT_FOUND');
    if (!data)  throw new AuthError('Profile not found', 'PROFILE_NOT_FOUND');

    return profileToAuthUser(data);
  }
}

// ─── Auth Error ───────────────────────────────────────────────

export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'PROFILE_NOT_FOUND'
  | 'SESSION_ERROR'
  | 'SIGN_OUT_FAILED'
  | 'SIGN_UP_FAILED'
  | 'RESET_FAILED'
  | 'UPDATE_FAILED'
  | 'UNKNOWN';

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: AuthErrorCode,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

// ─── Mappers ─────────────────────────────────────────────────

function profileToAuthUser(profile: DbProfile): AuthUser {
  return {
    id:          profile.id,
    orgId:       profile.org_id,
    email:       profile.email,
    name:        profile.name,
    role:        (profile.role as string).toUpperCase() as DbProfile['role'],
    avatar:      profile.avatar,
    phone:       profile.phone,
    isActive:    profile.is_active,
  };
}

// Singleton export — one instance for the whole app
export const authService = new AuthService();
