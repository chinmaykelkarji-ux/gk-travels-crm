// ============================================================
// GK TRAVELS CRM — Field-level redaction by permission
//
// The bootstrap endpoint and the list routes return whole rows.
// Some columns are commercial (supplier cost, margin, payables) or
// sensitive (bank accounts, PAN). This module strips them for roles
// that are not entitled to them, so a screen that renders a trip
// for OPERATIONS never receives the profit figures in the first place.
//
// Policy (see docs/travelos/01-audit.md E1/E11):
//   - customer-facing pricing (selling price, GST, paid, balance) is
//     visible to any role that can read trips
//   - profitability and supplier-side figures need `finance:read` or
//     `trips:write` (ADMIN, BOOKING, ACCOUNTS)
//   - bank details and PAN need `finance:read` (ADMIN, ACCOUNTS)
// ============================================================

import type { Role as UserRole } from '@prisma/client';
import { hasPermission } from './permissions.js';

/** Roles that price trips or do the accounts see cost and margin. */
export function canSeeCommercials(role: UserRole | string | undefined): boolean {
  if (!role) return false;
  const r = role as UserRole;
  return hasPermission(r, 'finance:read') || hasPermission(r, 'trips:write');
}

/** Bank accounts, PAN and payables are accounts-only. */
export function canSeeBankDetails(role: UserRole | string | undefined): boolean {
  if (!role) return false;
  return hasPermission(role as UserRole, 'finance:read');
}

// Columns that reveal supplier cost or profit. Numeric fields are zeroed
// rather than removed so client arithmetic never sees `undefined`.
const TRIP_PROFIT_FIELDS    = ['supplierCost', 'grossMargin', 'marginPct'] as const;
const BOOKING_PROFIT_FIELDS = ['supplierCost', 'supplierPaid', 'supplierPending', 'grossMargin', 'marginPct'] as const;

const COMPANY_SENSITIVE_FIELDS = [
  'pan', 'bankName', 'bankAccountName', 'bankAccountNumber', 'bankIfsc', 'bankBranch',
] as const;

// Activity entries whose before/after snapshots carry financial rows.
const FINANCE_ENTITY_TYPES = new Set([
  'invoice', 'payment', 'receivable', 'vendor_payment', 'credit_note', 'debit_note',
  'financial_transaction', 'company_settings',
]);

function zeroFields<T extends Record<string, unknown>>(row: T, fields: readonly string[]): T {
  const out: Record<string, unknown> = { ...row };
  for (const f of fields) if (f in out) out[f] = 0;
  return out as T;
}

export function redactTrip<T extends Record<string, unknown>>(row: T, role: string | undefined): T {
  return canSeeCommercials(role) ? row : zeroFields(row, TRIP_PROFIT_FIELDS);
}

export function redactBooking<T extends Record<string, unknown>>(row: T, role: string | undefined): T {
  return canSeeCommercials(role) ? row : zeroFields(row, BOOKING_PROFIT_FIELDS);
}

export function redactVendor<T extends Record<string, unknown>>(row: T, role: string | undefined): T {
  if (canSeeBankDetails(role)) return row;
  return { ...row, bankDetails: {} };
}

export function redactCompanySettings<T extends Record<string, unknown>>(row: T, role: string | undefined): T {
  if (canSeeBankDetails(role)) return row;
  const out: Record<string, unknown> = { ...row };
  for (const f of COMPANY_SENSITIVE_FIELDS) if (f in out) out[f] = null;
  return out as T;
}

export function redactActivity<T extends { entityType: string; before?: unknown; after?: unknown; metadata?: unknown }>(
  row: T,
  role: string | undefined,
): T {
  if (canSeeBankDetails(role)) return row;
  if (!FINANCE_ENTITY_TYPES.has(row.entityType)) return row;
  return { ...row, before: null, after: null, metadata: null };
}
