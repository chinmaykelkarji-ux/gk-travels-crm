// UserRole matches the Prisma Role enum: ADMIN | BOOKING | OPERATIONS | ACCOUNTS
export type UserRole = 'ADMIN' | 'BOOKING' | 'OPERATIONS' | 'ACCOUNTS';

// ─── Auth User ────────────────────────────────────────────────
// What AuthContext.user contains after a successful session check.

export interface AuthUser {
  id:       string;
  orgId:    string;   // always 'gktravel' for this single-org CRM
  email:    string;
  name:     string;
  role:     UserRole;
  avatar:   string | null;
  phone:    string | null;
  isActive: boolean;
}

// ─── Auth State ───────────────────────────────────────────────

export interface AuthState {
  user:            AuthUser | null;
  isLoading:       boolean;
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
