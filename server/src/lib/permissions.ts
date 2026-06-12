// ============================================================
// GK TRAVELS CRM — RBAC permission map (server-side)
//
// Permissions are static resource:action strings, checked
// against the authenticated user's role (req.userRole).
// Mirrored on the frontend in src/hooks/usePermissions.ts —
// keep both lists in sync.
// ============================================================

import type { Response, NextFunction, RequestHandler } from 'express';
import type { Role as UserRole } from '@prisma/client';
import type { AuthRequest } from '../middleware/auth.js';

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

// ── hasPermission ──────────────────────────────────────────

export function hasPermission(role: UserRole, permission: string): boolean {
  if (role === 'ADMIN') return true;
  const perms = ROLE_PERMISSIONS[role] ?? [];
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
