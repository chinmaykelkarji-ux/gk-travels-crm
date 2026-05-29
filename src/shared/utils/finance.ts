// ============================================================
// GK TRAVELS CRM — CENTRALIZED FINANCIAL UTILITIES
//
// P0 FIX: All financial status and balance calculations
// MUST go through this module. Never compute payment status
// or balance inline anywhere in the UI.
//
// Key invariants enforced here:
//   1. totalPayable === null  → status is ALWAYS "unpriced"
//      (price not set; must NEVER show "Paid" or "Unpaid")
//   2. paidAmount > 0 with null totalPayable → still "unpriced"
//   3. Balance = totalPayable - paidAmount (not totalAmount)
//   4. GST is collected & remitted — not kept as profit
//   5. Gross Margin = Revenue - Supplier Cost (not minus GST)
// ============================================================

import type { FinancialStatus } from '@/shared/types';

// ─── Status Resolution ───────────────────────────────────────

/**
 * Determine payment status from totalPayable and paidAmount.
 * This is the ONLY place where FinancialStatus is computed.
 *
 * Rule table:
 *   totalPayable === null   → "unpriced"  (price not set)
 *   totalPayable <= 0       → "unpriced"  (zero price is treated as unpriced)
 *   paidAmount <= 0         → "unpaid"
 *   paidAmount < totalPayable → "partial"
 *   paidAmount >= totalPayable → "paid"
 */
export function getFinancialStatus(
  totalPayable: number | null | undefined,
  paidAmount: number | null | undefined,
): FinancialStatus {
  const payable = totalPayable ?? null;
  const paid    = paidAmount  ?? 0;

  if (payable === null || payable <= 0) return 'unpriced';
  if (paid <= 0)                         return 'unpaid';
  if (paid < payable)                    return 'partial';
  return 'paid';
}

// ─── Label & Style Maps ──────────────────────────────────────

export const FINANCIAL_STATUS_LABEL: Record<FinancialStatus, string> = {
  unpriced: '⚠ Price Not Set',
  unpaid:   'Unpaid',
  partial:  'Partially Paid',
  paid:     'Paid',
};

export const FINANCIAL_STATUS_CLASS: Record<FinancialStatus, string> = {
  unpriced: 'bg-yellow-50 text-yellow-700 border border-yellow-200 ring-0',
  unpaid:   'bg-red-50 text-red-700 border border-red-200 ring-0',
  partial:  'bg-orange-50 text-orange-700 border border-orange-200 ring-0',
  paid:     'bg-green-50 text-green-700 border border-green-200 ring-0',
};

// ─── Trip Finance Calculation ────────────────────────────────

export interface TripFinanceResult {
  totalAmount:  number;
  gstRate:      number;
  gstAmount:    number;
  totalPayable: number | null;
  paidAmount:   number;
  balanceDue:   number;
  supplierCost: number;
  grossMargin:  number;   // Revenue - Supplier Cost (GST excluded: collected & remitted)
  marginPct:    number;
  status:       FinancialStatus;
}

export function calcTripFinance(opts: {
  totalAmount:           number | null | undefined;
  gstRate?:              number;
  paidAmount?:           number;
  customerPaymentsTotal: number;  // sum of received customer payments for this trip
  supplierPaymentsTotal: number;  // sum of paid supplier payments for this trip
  bookingSupplierTotal:  number;  // sum of supplier costs on linked bookings
}): TripFinanceResult {
  const base    = opts.totalAmount ?? null;
  const gstRate = opts.gstRate ?? 5;

  // Supplier cost: take the larger of payment records vs booking records
  // (avoids double-counting when bookings are later paid via supplier payments)
  const supplierCost = Math.max(opts.supplierPaymentsTotal, opts.bookingSupplierTotal);

  if (base === null || base === 0) {
    const paidAmount = opts.customerPaymentsTotal;
    return {
      totalAmount:  0,
      gstRate,
      gstAmount:    0,
      totalPayable: null,
      paidAmount,
      balanceDue:   0,
      supplierCost,
      grossMargin:  0,
      marginPct:    0,
      status:       'unpriced',
    };
  }

  const gstAmount    = Math.round(base * gstRate / 100);
  const totalPayable = base + gstAmount;

  // Use the higher of stored paidAmount vs sum of verified payments
  const paidAmount = Math.max(opts.paidAmount ?? 0, opts.customerPaymentsTotal);
  const balanceDue = Math.max(0, totalPayable - paidAmount);

  // Gross margin = revenue - supplier cost
  // GST is NOT deducted here: it is collected from the customer and remitted to govt.
  // Deducting GST from margin would understate profitability.
  const grossMargin = base - supplierCost;
  const marginPct   = base > 0 ? Math.round((grossMargin / base) * 1000) / 10 : 0;
  const status      = getFinancialStatus(totalPayable, paidAmount);

  return {
    totalAmount: base,
    gstRate,
    gstAmount,
    totalPayable,
    paidAmount,
    balanceDue,
    supplierCost,
    grossMargin,
    marginPct,
    status,
  };
}

// ─── Booking Finance Calculation ─────────────────────────────

export interface BookingFinanceResult {
  gstAmount:       number;
  totalPayable:    number | null;
  balanceDue:      number;
  supplierPending: number;
  grossMargin:     number;
  marginPct:       number;
  status:          FinancialStatus;
}

export function calcBookingFinance(opts: {
  sellingPrice:  number | null | undefined;
  gstRate?:      number;
  advance?:      number;
  supplierCost?: number;
  supplierPaid?: number;
}): BookingFinanceResult {
  const base         = opts.sellingPrice ?? null;
  const gstRate      = opts.gstRate      ?? 0;
  const advance      = opts.advance      ?? 0;
  const supplierCost = opts.supplierCost ?? 0;
  const supplierPaid = opts.supplierPaid ?? 0;

  const supplierPending = Math.max(0, supplierCost - supplierPaid);

  if (base === null || base === 0) {
    return {
      gstAmount:    0,
      totalPayable: null,
      balanceDue:   0,
      supplierPending,
      grossMargin:  0,
      marginPct:    0,
      status:       'unpriced',
    };
  }

  const gstAmount    = Math.round(base * gstRate / 100);
  const totalPayable = base + gstAmount;
  const balanceDue   = Math.max(0, totalPayable - advance);
  const grossMargin  = base - supplierCost;
  const marginPct    = base > 0 ? Math.round((grossMargin / base) * 1000) / 10 : 0;
  const status       = getFinancialStatus(totalPayable, advance);

  return {
    gstAmount,
    totalPayable,
    balanceDue,
    supplierPending,
    grossMargin,
    marginPct,
    status,
  };
}

// ─── Aggregate Portfolio Finance ─────────────────────────────

export interface PortfolioFinance {
  totalRevenue:    number;
  totalCollected:  number;
  totalPending:    number;
  totalBalance:    number;
  totalSupplier:   number;
  totalGrossMargin: number;
  avgMarginPct:    number;
  unpricedCount:   number;
}

export function calcPortfolioFinance(
  trips: Array<{
    totalPayable: number | null;
    paidAmount:   number;
    balanceDue:   number;
    supplierCost: number;
    grossMargin:  number;
    status:       FinancialStatus;
  }>,
): PortfolioFinance {
  let totalRevenue     = 0;
  let totalCollected   = 0;
  let totalBalance     = 0;
  let totalSupplier    = 0;
  let totalGrossMargin = 0;
  let unpricedCount    = 0;

  for (const t of trips) {
    if (t.totalPayable !== null) totalRevenue += t.totalPayable;
    totalCollected   += t.paidAmount;
    totalBalance     += t.balanceDue;
    totalSupplier    += t.supplierCost;
    totalGrossMargin += t.grossMargin;
    if (t.status === 'unpriced') unpricedCount++;
  }

  const pricedTrips  = trips.filter(t => t.totalPayable !== null && t.totalPayable > 0);
  const avgMarginPct = pricedTrips.length > 0
    ? Math.round(
        (pricedTrips.reduce((s, t) => s + t.grossMargin, 0) /
         pricedTrips.reduce((s, t) => s + (t.totalPayable ?? 0), 0)) * 1000
      ) / 10
    : 0;

  return {
    totalRevenue,
    totalCollected,
    totalPending:    totalRevenue - totalCollected,
    totalBalance,
    totalSupplier,
    totalGrossMargin,
    avgMarginPct,
    unpricedCount,
  };
}
