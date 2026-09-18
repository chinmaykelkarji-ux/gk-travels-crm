// RBAC map — pins the policy summarised in server/src/lib/permissions.ts and
// guarantees the frontend mirror never drifts from the server.
import { describe, it, expect } from 'vitest';
import { ROLE_PERMISSIONS as SERVER_MAP, hasPermission } from '../../server/src/lib/permissions';
import { ROLE_PERMISSIONS as CLIENT_MAP } from '../../src/shared/hooks/usePermissions';

const ROLES = ['ADMIN', 'BOOKING', 'ACCOUNTS', 'OPERATIONS'] as const;

describe('permission maps', () => {
  it('frontend mirror is identical to the server map', () => {
    expect(CLIENT_MAP).toEqual(SERVER_MAP);
  });

  it('every role is defined and contains no duplicates', () => {
    for (const role of ROLES) {
      const perms = SERVER_MAP[role];
      expect(Array.isArray(perms)).toBe(true);
      expect(new Set(perms).size).toBe(perms.length);
    }
  });
});

describe('hasPermission — policy', () => {
  it('ADMIN can do everything, including things not listed', () => {
    expect(hasPermission('ADMIN', 'finance:write')).toBe(true);
    expect(hasPermission('ADMIN', 'something:new')).toBe(true);
  });

  it('OPERATIONS never has finance, pricing or sales-pipeline access', () => {
    for (const p of ['finance:read', 'finance:write', 'payments:read', 'invoices:read', 'sales-quotes:read', 'enquiries:read', 'trips:write', 'bookings:write', 'reports:read', 'users:read']) {
      expect(hasPermission('OPERATIONS', p), p).toBe(false);
    }
  });

  it('OPERATIONS can execute trips: read trips/bookings/customers, manage vendors, vouchers, tasks and messaging', () => {
    for (const p of ['trips:read', 'bookings:read', 'customers:read', 'suppliers:read', 'suppliers:write', 'trip-services:read', 'trip-services:status', 'vouchers:write', 'tasks:read', 'tasks:write', 'messaging:write', 'dashboard:read']) {
      expect(hasPermission('OPERATIONS', p), p).toBe(true);
    }
  });

  it('ACCOUNTS owns finance and reads the operational context, but cannot price or write trips', () => {
    for (const p of ['finance:read', 'finance:write', 'invoices:write', 'credit-notes:write', 'debit-notes:write', 'gst:read', 'reports:read', 'trips:read', 'bookings:read', 'customers:read', 'suppliers:read', 'tasks:write']) {
      expect(hasPermission('ACCOUNTS', p), p).toBe(true);
    }
    for (const p of ['trips:write', 'bookings:write', 'customers:write', 'sales-quotes:read', 'suppliers:write', 'users:read']) {
      expect(hasPermission('ACCOUNTS', p), p).toBe(false);
    }
  });

  it('BOOKING prices and sells but does not touch accounting records', () => {
    for (const p of ['customers:write', 'enquiries:write', 'sales-quotes:write', 'trips:write', 'bookings:write', 'trip-services:write', 'vouchers:write', 'messaging:write', 'ai:use']) {
      expect(hasPermission('BOOKING', p), p).toBe(true);
    }
    for (const p of ['finance:read', 'finance:write', 'invoices:read', 'payments:write', 'reports:read', 'users:write', 'suppliers:write']) {
      expect(hasPermission('BOOKING', p), p).toBe(false);
    }
  });

  it('unknown roles have no permissions', () => {
    expect(hasPermission('DRIVER' as never, 'trips:read')).toBe(false);
  });
});
