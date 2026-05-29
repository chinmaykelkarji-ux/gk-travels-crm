// ============================================================
// GK TRAVELS CRM — CENTRALIZED FINANCIAL UTILITIES
//
// P0 FIX: All financial status and balance calculations
// MUST go through this module. Never compute payment status
// or balance inline anywhere in the UI.
//
// Key invariants enforced here:
//   1. totalPayable === null  → financialStatus is ALWAYS 'unpriced'
//   2. paidAmount > 0 with null totalPayable → still 'unpriced'
//   3. Balance = totalPayable - paidAmount (not totalAmount)
//   4. GST is collected & remitted — not kept as profit
//   5. Gross Margin = Revenue - Supplier Cost (not minus GST)
//
// NAMING CONTRACT:
//   - TripStatus / BookingStatus → workflow/lifecycle state (e.g. 'confirmed', 'pending')
//   - FinancialStatus             → payment state (e.g. 'paid', 'unpriced')
//   - These MUST NOT share a field name on any entity.
//   - Finance results use `financialStatus`, never `status`.
// ============================================================

import type { FinancialStatus } from '@/shared/types';

// ─── Status Resolution ───────────────────────────────────────

/**
 * Single source of truth for deriving FinancialStatus from raw numbers.
 *
 * Rule table:
 *   totalPayable === null   → 'unpriced'   (price not set; NEVER show 'Paid')
 *   totalPayable <= 0       → 'unpriced'   (zero price treated as unset)
 *   paidAmount <= 0         → 'unpaid'
 *   paidAmount < totalPayable → 'partial'
 *   paidAmount >= totalPayable → 'paid'
 */
export function getFinancialStatus(
  totalPayable: number | null | undefined,
  paidAmount:   number | null | undefined,
): FinancialStatus {
  const payable = totalPayable ?? null;
  const paid    = paidAmount   ?? 0;

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
  totalAmount:      number;
  gstRate:          number;
  gstAmount:        number;
  totalPayable:     number | null;
  paidAmount:       number;
  balanceDue:       number;
  supplierCost:     number;
  grossMargin:      number;
  marginPct:        number;
  // Renamed from `status` to avoid colliding with Trip.status: TripStatus
  financialStatus:  FinancialStatus;
}

export function calcTripFinance(opts: {
  totalAmount:            number | null | undefined;
  gstRate?:               number;
  paidAmount?:            number;
  customerPaymentsTotal:  number;
  supplierPaymentsTotal:  number;
  bookingSupplierTotal:   number;
}): TripFinanceResult {
  const base    = opts.totalAmount ?? null;
  const gstRate = opts.gstRate    ?? 5;

  // Supplier cost = max(supplier payment records, booking supplier costs)
  // Avoids double-counting when bookings are later paid via supplier payments.
  const supplierCost = Math.max(opts.supplierPaymentsTotal, opts.bookingSupplierTotal);

  if (base === null || base === 0) {
    const paidAmount = opts.customerPaymentsTotal;
    return {
      totalAmount:     0,
      gstRate,
      gstAmount:       0,
      totalPayable:    null,
      paidAmount,
      balanceDue:      0,
      supplierCost,
      grossMargin:     0,
      marginPct:       0,
      financialStatus: 'unpriced',
    };
  }

  const gstAmount    = Math.round(base * gstRate / 100);
  const totalPayable = base + gstAmount;
  const paidAmount   = Math.max(opts.paidAmount ?? 0, opts.customerPaymentsTotal);
  const balanceDue   = Math.max(0, totalPayable - paidAmount);

  // GST is NOT deducted from gross margin — it is collected from the customer
  // and remitted to government. Deducting it would understate profitability.
  const grossMargin     = base - supplierCost;
  const marginPct       = base > 0 ? Math.round((grossMargin / base) * 1000) / 10 : 0;
  const financialStatus = getFinancialStatus(totalPayable, paidAmount);

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
    financialStatus,
  };
}

// ─── Booking Finance Calculation ─────────────────────────────

export interface BookingFinanceResult {
  gstAmount:        number;
  totalPayable:     number | null;
  balanceDue:       number;
  supplierPending:  number;
  grossMargin:      number;
  marginPct:        number;
  // Renamed from `status` to avoid colliding with Booking.status: BookingStatus
  financialStatus:  FinancialStatus;
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
      gstAmount:       0,
      totalPayable:    null,
      balanceDue:      0,
      supplierPending,
      grossMargin:     0,
      marginPct:       0,
      financialStatus: 'unpriced',
    };
  }

  const gstAmount       = Math.round(base * gstRate / 100);
  const totalPayable    = base + gstAmount;
  const balanceDue      = Math.max(0, totalPayable - advance);
  const grossMargin     = base - supplierCost;
  const marginPct       = base > 0 ? Math.round((grossMargin / base) * 1000) / 10 : 0;
  const financialStatus = getFinancialStatus(totalPayable, advance);

  return {
    gstAmount,
    totalPayable,
    balanceDue,
    supplierPending,
    grossMargin,
    marginPct,
    financialStatus,
  };
}

// ─── Portfolio Finance Input ──────────────────────────────────
// A normalized view of any financial entity (Trip or Booking) suitable
// for aggregation. Callers must compute financialStatus before calling
// calcPortfolioFinance — raw Trip/Booking entities are NOT accepted
// because Trip.status is TripStatus, not FinancialStatus.

export interface PortfolioItem {
  totalPayable:    number | null;
  paidAmount:      number;
  balanceDue:      number;
  supplierCost:    number;
  grossMargin:     number;
  financialStatus: FinancialStatus;
}

// ─── Aggregate Portfolio Finance ─────────────────────────────

export interface PortfolioFinance {
  totalRevenue:     number;
  totalCollected:   number;
  totalPending:     number;
  totalBalance:     number;
  totalSupplier:    number;
  totalGrossMargin: number;
  avgMarginPct:     number;
  unpricedCount:    number;
}

/**
 * Aggregate financial metrics across a set of normalized portfolio items.
 *
 * IMPORTANT: Do NOT pass raw Trip[] here. Map trips to PortfolioItem[] first:
 *
 *   const items = trips.map(t => ({
 *     totalPayable:    t.totalPayable,
 *     paidAmount:      t.paidAmount,
 *     balanceDue:      t.balanceDue,
 *     supplierCost:    t.supplierCost,
 *     grossMargin:     t.grossMargin,
 *     financialStatus: getFinancialStatus(t.totalPayable, t.paidAmount),
 *   }));
 *   const portfolio = calcPortfolioFinance(items);
 */
export function calcPortfolioFinance(items: PortfolioItem[]): PortfolioFinance {
  let totalRevenue      = 0;
  let totalCollected    = 0;
  let totalBalance      = 0;
  let totalSupplier     = 0;
  let totalGrossMargin  = 0;
  let unpricedCount     = 0;

  for (const item of items) {
    if (item.totalPayable !== null) totalRevenue += item.totalPayable;
    totalCollected   += item.paidAmount;
    totalBalance     += item.balanceDue;
    totalSupplier    += item.supplierCost;
    totalGrossMargin += item.grossMargin;
    if (item.financialStatus === 'unpriced') unpricedCount++;
  }

  const pricedItems  = items.filter(i => i.totalPayable !== null && i.totalPayable > 0);
  const avgMarginPct = pricedItems.length > 0
    ? Math.round(
        (pricedItems.reduce((s, i) => s + i.grossMargin, 0) /
         pricedItems.reduce((s, i) => s + (i.totalPayable ?? 0), 0)) * 1000,
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

// ─── Normalization Adapters ───────────────────────────────────
// These are the ONLY legitimate path for converting domain entities into
// the PortfolioItem shape accepted by calcPortfolioFinance().
//
// Never pass raw Trip or Booking entities into calcPortfolioFinance() directly.
// Trip.status  → TripStatus  (workflow).  FinancialStatus is DERIVED, never stored.
// Booking.status → BookingStatus (workflow). financialStatus is computed separately.

/**
 * Normalize a Trip's financial fields into a PortfolioItem.
 * Derives FinancialStatus from (totalPayable, paidAmount) — does NOT use Trip.status.
 */
export function normalizeTripFinance(trip: {
  totalPayable: number | null;
  paidAmount:   number;
  balanceDue:   number;
  supplierCost: number;
  grossMargin:  number;
}): PortfolioItem {
  return {
    totalPayable:    trip.totalPayable,
    paidAmount:      trip.paidAmount,
    balanceDue:      trip.balanceDue,
    supplierCost:    trip.supplierCost,
    grossMargin:     trip.grossMargin,
    financialStatus: getFinancialStatus(trip.totalPayable, trip.paidAmount),
  };
}

/**
 * Normalize a Booking's financial fields into a PortfolioItem.
 * Uses advance (customer-paid amount) as paidAmount proxy for bookings.
 * Does NOT use Booking.status (BookingStatus) for FinancialStatus.
 */
export function normalizeBookingFinance(booking: {
  totalPayable: number | null;
  advance:      number;
  balanceDue:   number;
  supplierCost: number;
  grossMargin:  number;
}): PortfolioItem {
  return {
    totalPayable:    booking.totalPayable,
    paidAmount:      booking.advance,
    balanceDue:      booking.balanceDue,
    supplierCost:    booking.supplierCost,
    grossMargin:     booking.grossMargin,
    financialStatus: getFinancialStatus(booking.totalPayable, booking.advance),
  };
}

/** @deprecated Use normalizeTripFinance() */
export const tripToPortfolioItem = normalizeTripFinance;
