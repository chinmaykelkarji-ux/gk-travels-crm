// ============================================================
// GK TRAVELS CRM — RBAC permission map (server-side)
//
// Permissions are static resource:action strings, checked
// against the authenticated user's role (req.userRole).
// Mirrored on the frontend in src/shared/hooks/usePermissions.ts —
// keep both lists in sync.
//
// Policy summary (docs/travelos/01-audit.md E2):
//   ADMIN      — everything
//   BOOKING    — sales + pricing: customers, enquiries, quotes, trips,
//                bookings, services, vouchers, tasks, messaging
//   ACCOUNTS   — finance: invoices, payments, receivables/payables,
//                GST, reports; read-only trips/bookings/customers/vendors
//   OPERATIONS — execution: trips (read), services (status), vendors,
//                vouchers, tasks, messaging; no pricing/margins/payables
//
//   masters:*  — hotels, vehicles, drivers, activities (BOOKING, OPERATIONS);
//   rates:write — hotel rate sheets and activity prices (BOOKING); rates and
//                 prices are hidden from roles without commercial access
//   operations:* — hotel bookings, vehicle duties, activity bookings, tickets,
//                 trip workspace (write: BOOKING, OPERATIONS; read: all staff)
//   copilot:use — ask the copilot (all staff); what it can look up is each
//                 tool's own permission (modules/copilot/tools.ts)
//   insights:read — the insights feed (all staff); each insight is counted
//                 only for a role that could open its screen
//   DRIVER     — driver:duties only; requireAuth also fences a DRIVER session
//                to /api/v2/driver, /api/v2/me and /api/auth (middleware/auth.ts)
// ============================================================

import type { Response, NextFunction, RequestHandler } from 'express';
import type { Role as UserRole } from '@prisma/client';
import type { AuthRequest } from '../middleware/auth.js';
import { isPrincipalKey, permissionsOf } from '../core/principals.js';

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
    'operations:read', 'operations:write',
    'expenses:read',
    'ai:use', 'copilot:use', 'insights:read',
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
    'expenses:read', 'expenses:write',
    'credit-notes:read', 'credit-notes:write',
    'debit-notes:read', 'debit-notes:write',
    'commissions:read', 'commissions:write',
    'documents:read', 'documents:write',
    'reports:read',
    'copilot:use', 'insights:read',
    'masters:read',
    'operations:read',
  ],

  OPERATIONS: [
    'dashboard:read',
    'trips:read',
    'customers:read',
    'bookings:read',
    'suppliers:read', 'suppliers:write',
    'masters:read', 'masters:write',
    'operations:read', 'operations:write',
    'trip-services:read', 'trip-services:status',
    'expenses:read', 'expenses:write',
    'vouchers:write',
    'tasks:read', 'tasks:write',
    'messaging:read', 'messaging:write',
    'documents:read', 'documents:write',
    'copilot:use', 'insights:read',
  ],
  // Driver view only (/driver): their own confirmed duties and status updates.
  DRIVER: [
    'driver:duties',
  ],
};

// ── hasPermission ──────────────────────────────────────────

export function hasPermission(role: UserRole | string, permission: string): boolean {
  // A custom role or an API key: exactly the permissions stored for it (core/principals.ts).
  if (isPrincipalKey(role)) return permissionsOf(role)?.has(permission) ?? false;
  if (role === 'ADMIN') return true;
  const perms = ROLE_PERMISSIONS[role as UserRole] ?? [];
  return perms.includes('*') || perms.includes(permission);
}

// ── requirePermission ──────────────────────────────────────
// Must come AFTER requireAuth in the middleware chain.

export function requirePermission(permission: string): RequestHandler {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.userRole) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const role = req.userRole as UserRole;
    if (!hasPermission(role, permission)) {
      res.status(403).json({
        error:    'Access denied',
        required: permission,
        yourRole: role,
      });
      return;
    }

    next();
  };
}

// ── requireAnyPermission ───────────────────────────────────
// Passes when the role holds at least one of the listed permissions.

export function requireAnyPermission(...permissions: string[]): RequestHandler {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.userRole) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const role = req.userRole as UserRole;
    if (!permissions.some(p => hasPermission(role, p))) {
      res.status(403).json({
        error:    'Access denied',
        required: permissions.join(' | '),
        yourRole: role,
      });
      return;
    }

    next();
  };
}
