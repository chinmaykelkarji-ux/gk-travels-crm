// ============================================================
// GK TRAVELS CRM — RBAC Permission Definitions
//
// Roles (matches Prisma UserRole enum):
//   ADMIN      — full access
//   SALES      — leads, trips, quotations, customers
//   OPERATIONS — trips, bookings, tasks, vendors, itineraries, vouchers
//   ACCOUNTS   — finance, payments, vendor payments, reports
//
// Two enforcement layers:
//   1. Frontend — gates UI elements (never trust alone)
//   2. Backend  — requireRole() middleware on sensitive routes
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

  // Finance — ACCOUNTS + ADMIN only
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

  // ADMIN — everything
  ADMIN: ALL_PERMISSIONS,

  // SALES — lead/trip/quotation/customer workflow, no finance, no settings users
  SALES: [
    PERMISSIONS.TRIPS_VIEW,
    PERMISSIONS.TRIPS_CREATE,
    PERMISSIONS.TRIPS_EDIT,
    PERMISSIONS.TRIPS_CONFIRM,
    PERMISSIONS.LEADS_VIEW,
    PERMISSIONS.LEADS_CREATE,
    PERMISSIONS.LEADS_EDIT,
    PERMISSIONS.LEADS_DELETE,
    PERMISSIONS.LEADS_CONVERT,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.CUSTOMERS_CREATE,
    PERMISSIONS.CUSTOMERS_EDIT,
    PERMISSIONS.CUSTOMERS_DOCS,
    PERMISSIONS.OPS_VIEW,
    PERMISSIONS.OPS_TASKS,
    PERMISSIONS.OPS_REMINDERS,
    PERMISSIONS.BOOKINGS_VIEW,
    PERMISSIONS.BOOKINGS_CREATE,
    PERMISSIONS.SETTINGS_VIEW,
  ],

  // OPERATIONS — day-to-day trip execution, no finance, no leads
  OPERATIONS: [
    PERMISSIONS.TRIPS_VIEW,
    PERMISSIONS.TRIPS_CREATE,
    PERMISSIONS.TRIPS_EDIT,
    PERMISSIONS.TRIPS_CONFIRM,
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

  // ACCOUNTS — finance only, read-only on trips
  ACCOUNTS: [
    PERMISSIONS.TRIPS_VIEW,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.FINANCE_VIEW,
    PERMISSIONS.FINANCE_PAYMENTS,
    PERMISSIONS.FINANCE_REPORTS,
    PERMISSIONS.FINANCE_EXPORT,
    PERMISSIONS.FINANCE_DELETE_PAYMENT,
    PERMISSIONS.BOOKINGS_VIEW,
    PERMISSIONS.SETTINGS_VIEW,
  ],
};

// ─── Normaliser ───────────────────────────────────────────────

function normalise(role: string): UserRole {
  return role.toUpperCase() as UserRole;
}

// ─── Permission Checkers ─────────────────────────────────────

export function hasPermission(
  role: UserRole | string | null | undefined,
  permission: Permission,
): boolean {
  if (!role) return false;
  const r = normalise(role as string);
  if (r === 'ADMIN') return true;   // ADMIN always passes
  return ROLE_PERMISSIONS[r]?.includes(permission) ?? false;
}

export function hasAnyPermission(
  role: UserRole | null | undefined,
  permissions: Permission[],
): boolean {
  return permissions.some(p => hasPermission(role, p));
}

export function hasAllPermissions(
  role: UserRole | null | undefined,
  permissions: Permission[],
): boolean {
  return permissions.every(p => hasPermission(role, p));
}

// Role hierarchy for isAtLeast checks: ACCOUNTS < OPERATIONS < SALES < ADMIN
const HIERARCHY: UserRole[] = ['ACCOUNTS', 'OPERATIONS', 'SALES', 'ADMIN'];

export function isAtLeast(
  role: UserRole | string | null | undefined,
  minRole: UserRole,
): boolean {
  const normalised = role ? normalise(role as string) : null;
  const userIdx    = normalised ? HIERARCHY.indexOf(normalised) : -1;
  const minIdx     = HIERARCHY.indexOf(minRole);
  return userIdx >= minIdx;
}

// ─── Display labels ───────────────────────────────────────────

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN:      'Admin',
  SALES:      'Sales',
  OPERATIONS: 'Operations',
  ACCOUNTS:   'Accounts',
};

export const ROLE_COLORS: Record<UserRole, string> = {
  ADMIN:      'bg-indigo-100 text-indigo-700',
  SALES:      'bg-emerald-100 text-emerald-700',
  OPERATIONS: 'bg-blue-100 text-blue-700',
  ACCOUNTS:   'bg-amber-100 text-amber-700',
};
