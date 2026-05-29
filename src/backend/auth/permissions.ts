// ============================================================
// GK TRAVELS CRM — RBAC Permission Definitions
//
// Two layers of enforcement:
//   1. Frontend: permission checks gate UI elements
//   2. Database: RLS policies enforce at PostgreSQL level
//
// Never rely on frontend checks alone for security.
// ============================================================

import type { UserRole } from '@/backend/supabase/database.types';

// ─── Permission Keys ──────────────────────────────────────────

export const PERMISSIONS = {
  // Trips
  TRIPS_VIEW:          'trips:view',
  TRIPS_CREATE:        'trips:create',
  TRIPS_EDIT:          'trips:edit',
  TRIPS_DELETE:        'trips:delete',
  TRIPS_CONFIRM:       'trips:confirm',

  // Leads
  LEADS_VIEW:          'leads:view',
  LEADS_CREATE:        'leads:create',
  LEADS_EDIT:          'leads:edit',
  LEADS_DELETE:        'leads:delete',
  LEADS_CONVERT:       'leads:convert',

  // Finance — sensitive, restricted to ADMIN+
  FINANCE_VIEW:        'finance:view',
  FINANCE_PAYMENTS:    'finance:payments',
  FINANCE_REPORTS:     'finance:reports',
  FINANCE_EXPORT:      'finance:export',
  FINANCE_DELETE_PAYMENT: 'finance:delete_payment',

  // Customers
  CUSTOMERS_VIEW:      'customers:view',
  CUSTOMERS_CREATE:    'customers:create',
  CUSTOMERS_EDIT:      'customers:edit',
  CUSTOMERS_DELETE:    'customers:delete',
  CUSTOMERS_DOCS:      'customers:documents',

  // Operations
  OPS_VIEW:            'ops:view',
  OPS_TASKS:           'ops:tasks',
  OPS_REMINDERS:       'ops:reminders',

  // Settings — ADMIN only
  SETTINGS_VIEW:       'settings:view',
  SETTINGS_USERS:      'settings:users',
  SETTINGS_ORG:        'settings:organisation',
  SETTINGS_INTEGRATIONS: 'settings:integrations',

  // Bookings
  BOOKINGS_VIEW:       'bookings:view',
  BOOKINGS_CREATE:     'bookings:create',
  BOOKINGS_EDIT:       'bookings:edit',
  BOOKINGS_DELETE:     'bookings:delete',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// ─── Role → Permissions Map ───────────────────────────────────

const ALL_PERMISSIONS = Object.values(PERMISSIONS) as Permission[];

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,

  ADMIN: ALL_PERMISSIONS,

  MANAGER: [
    PERMISSIONS.TRIPS_VIEW,
    PERMISSIONS.TRIPS_CREATE,
    PERMISSIONS.TRIPS_EDIT,
    PERMISSIONS.TRIPS_CONFIRM,
    PERMISSIONS.LEADS_VIEW,
    PERMISSIONS.LEADS_CREATE,
    PERMISSIONS.LEADS_EDIT,
    PERMISSIONS.LEADS_CONVERT,
    PERMISSIONS.FINANCE_VIEW,
    PERMISSIONS.FINANCE_PAYMENTS,
    PERMISSIONS.FINANCE_REPORTS,
    PERMISSIONS.FINANCE_EXPORT,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.CUSTOMERS_CREATE,
    PERMISSIONS.CUSTOMERS_EDIT,
    PERMISSIONS.CUSTOMERS_DOCS,
    PERMISSIONS.OPS_VIEW,
    PERMISSIONS.OPS_TASKS,
    PERMISSIONS.OPS_REMINDERS,
    PERMISSIONS.BOOKINGS_VIEW,
    PERMISSIONS.BOOKINGS_CREATE,
    PERMISSIONS.BOOKINGS_EDIT,
    PERMISSIONS.SETTINGS_VIEW,
  ],

  STAFF: [
    PERMISSIONS.TRIPS_VIEW,
    PERMISSIONS.TRIPS_CREATE,
    PERMISSIONS.TRIPS_EDIT,
    PERMISSIONS.LEADS_VIEW,
    PERMISSIONS.LEADS_CREATE,
    PERMISSIONS.LEADS_EDIT,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.CUSTOMERS_CREATE,
    PERMISSIONS.CUSTOMERS_EDIT,
    PERMISSIONS.OPS_VIEW,
    PERMISSIONS.OPS_TASKS,
    PERMISSIONS.OPS_REMINDERS,
    PERMISSIONS.BOOKINGS_VIEW,
    PERMISSIONS.BOOKINGS_CREATE,
  ],
};

// ─── Permission Checkers ─────────────────────────────────────

export function hasPermission(role: UserRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function hasAnyPermission(role: UserRole | null | undefined, permissions: Permission[]): boolean {
  return permissions.some(p => hasPermission(role, p));
}

export function hasAllPermissions(role: UserRole | null | undefined, permissions: Permission[]): boolean {
  return permissions.every(p => hasPermission(role, p));
}

export function isAtLeast(role: UserRole | null | undefined, minRole: UserRole): boolean {
  const hierarchy: UserRole[] = ['STAFF', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'];
  const userIdx = role ? hierarchy.indexOf(role) : -1;
  const minIdx  = hierarchy.indexOf(minRole);
  return userIdx >= minIdx;
}

// ─── Role labels for display ─────────────────────────────────

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN:       'Admin',
  MANAGER:     'Manager',
  STAFF:       'Staff',
};
