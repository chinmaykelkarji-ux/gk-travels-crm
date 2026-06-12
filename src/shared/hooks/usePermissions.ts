// ============================================================
// GK TRAVELS CRM — RBAC permission map (frontend)
//
// Mirrors server/src/lib/permissions.ts exactly — keep both
// lists in sync. Permissions are static resource:action strings,
// checked against the authenticated user's role.
// ============================================================

import { useAuth } from '@/backend/auth/AuthContext';
import type { UserRole } from '@/backend/auth/types';

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  ADMIN: ['*', 'users:read', 'users:write', 'ai:use'],

  BOOKING: [
    'customers:read', 'customers:write',
    'enquiries:read', 'enquiries:write',
    'sales-quotes:read', 'sales-quotes:write',
    'trips:read', 'trips:write',
    'trip-services:read', 'trip-services:write',
    'bookings:read', 'bookings:write',
    'messaging:read', 'messaging:write',
    'dashboard:read',
    'suppliers:read',
    'ai:use',
  ],

  ACCOUNTS: [
    'customers:read',
    'trips:read',
    'invoices:read', 'invoices:write',
    'payments:read', 'payments:write',
    'gst:read', 'gst:write',
    'finance:read', 'finance:write',
    'credit-notes:read', 'credit-notes:write',
    'debit-notes:read', 'debit-notes:write',
    'commissions:read', 'commissions:write',
    'reports:read',
  ],

  OPERATIONS: [
    'dashboard:read',
    'trips:read',
    'customers:read',
    'suppliers:read', 'suppliers:write',
    'trip-services:read', 'trip-services:status',
  ],
};

export function hasPermission(role: UserRole | null | undefined, permission: string): boolean {
  if (!role) return false;
  if (role === 'ADMIN') return true;
  const perms = ROLE_PERMISSIONS[role] ?? [];
  return perms.includes('*') || perms.includes(permission);
}

export function usePermissions() {
  const { user } = useAuth();
  const role = user?.role ?? null;

  return {
    role,
    can: (permission: string) => hasPermission(role, permission),
    isAdmin:      role === 'ADMIN',
    isBooking:    role === 'BOOKING',
    isAccounts:   role === 'ACCOUNTS',
    isOperations: role === 'OPERATIONS',
  };
}
