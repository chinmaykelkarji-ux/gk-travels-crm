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
    'vouchers:write',
    'tasks:read', 'tasks:write',
    'messaging:read', 'messaging:write',
    'documents:read', 'documents:write',
    'dashboard:read',
    'suppliers:read',
    'masters:read', 'masters:write', 'rates:write',
    'ai:use',
  ],

  ACCOUNTS: [
    'customers:read',
    'trips:read',
    'bookings:read',
    'suppliers:read',
    'tasks:read', 'tasks:write',
    'invoices:read', 'invoices:write',
    'payments:read', 'payments:write',
    'gst:read', 'gst:write',
    'finance:read', 'finance:write',
    'credit-notes:read', 'credit-notes:write',
    'debit-notes:read', 'debit-notes:write',
    'commissions:read', 'commissions:write',
    'documents:read', 'documents:write',
    'reports:read',
    'masters:read',
  ],

  OPERATIONS: [
    'dashboard:read',
    'trips:read',
    'customers:read',
    'bookings:read',
    'suppliers:read', 'suppliers:write',
    'masters:read', 'masters:write',
    'trip-services:read', 'trip-services:status',
    'vouchers:write',
    'tasks:read', 'tasks:write',
    'messaging:read', 'messaging:write',
    'documents:read', 'documents:write',
  ],
};

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN:      'Admin',
  BOOKING:    'Booking',
  OPERATIONS: 'Operations',
  ACCOUNTS:   'Accounts',
};

export const ROLE_COLORS: Record<UserRole, string> = {
  ADMIN:      'bg-indigo-100 text-indigo-700',
  BOOKING:    'bg-emerald-100 text-emerald-700',
  OPERATIONS: 'bg-blue-100 text-blue-700',
  ACCOUNTS:   'bg-amber-100 text-amber-700',
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
