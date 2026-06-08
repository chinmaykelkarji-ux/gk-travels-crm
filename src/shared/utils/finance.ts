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

import type { FinancialStatus, GstMode, ReceivableStatus } from '../types/index.js';
import { today } from './date.js';

// ─── GST Calculation ─────────────────────────────────────────
//
// EXCLUDED (default): `amount` is the taxable base — GST is added on top.
//   taxableAmount = amount
//   gstAmount     = round(amount * rate / 100)
//   totalPayable  = amount + gstAmount
//
// INCLUDED: `amount` already contains GST — the taxable base is back-calculated.
//   taxableAmount = round(amount / (1 + rate/100))
//   gstAmount     = amount - taxableAmount
//   totalPayable  = amount   (the entered/customer-facing price never changes)

export interface GstBreakdown {
  gstMode:       GstMode;
  taxableAmount: number;
  gstAmount:     number;
  totalPayable:  number;
}

export function calcGst(amount: number, gstRate: number, gstMode: GstMode): GstBreakdown {
  if (gstMode === 'INCLUDED') {
    const taxableAmount = Math.round((amount / (1 + gstRate / 100)) * 100) / 100;
    const gstAmount     = Math.round((amount - taxableAmount) * 100) / 100;
    return { gstMode, taxableAmount, gstAmount, totalPayable: amount };
  }

  const gstAmount = Math.round(amount * gstRate / 100);
  return { gstMode, taxableAmount: amount, gstAmount, totalPayable: amount + gstAmount };
}

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
  gstMode:          GstMode;
  gstAmount:        number;
  taxableAmount:    number;
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
  gstMode?:               GstMode;
  paidAmount?:            number;
  customerPaymentsTotal:  number;
  supplierPaymentsTotal:  number;
  bookingSupplierTotal:   number;
}): TripFinanceResult {
  const base    = opts.totalAmount ?? null;
  const gstRate = opts.gstRate    ?? 5;
  const gstMode = opts.gstMode    ?? 'EXCLUDED';

  // Supplier cost = max(supplier payment records, booking supplier costs)
  // Avoids double-counting when bookings are later paid via supplier payments.
  const supplierCost = Math.max(opts.supplierPaymentsTotal, opts.bookingSupplierTotal);

  if (base === null || base === 0) {
    const paidAmount = opts.customerPaymentsTotal;
    return {
      totalAmount:     0,
      gstRate,
      gstMode,
      gstAmount:       0,
      taxableAmount:   0,
      totalPayable:    null,
      paidAmount,
      balanceDue:      0,
      supplierCost,
      grossMargin:     0,
      marginPct:       0,
      financialStatus: 'unpriced',
    };
  }

  const { taxableAmount, gstAmount, totalPayable } = calcGst(base, gstRate, gstMode);
  const paidAmount = Math.max(opts.paidAmount ?? 0, opts.customerPaymentsTotal);
  const balanceDue = Math.max(0, totalPayable - paidAmount);

  // GST is NOT deducted from gross margin — it is collected from the customer
  // and remitted to government. Deducting it would understate profitability.
  // Margin is based on the taxable amount (actual revenue, net of tax) in both modes.
  const grossMargin     = taxableAmount - supplierCost;
  const marginPct       = taxableAmount > 0 ? Math.round((grossMargin / taxableAmount) * 1000) / 10 : 0;
  const financialStatus = getFinancialStatus(totalPayable, paidAmount);

  return {
    totalAmount: base,
    gstRate,
    gstMode,
    gstAmount,
    taxableAmount,
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
  gstMode:           GstMode;
  gstAmount:         number;
  taxableAmount:     number;
  totalPayable:      number | null;
  balanceDue:        number;
  supplierPending:   number;
  grossMargin:       number;
  marginPct:         number;
  // Service Margin Mode — Convenience Fee is a manually entered service
  // charge; GST applies ONLY on it (never on the full supplier/vendor value).
  // taxableFee/gstOnFee are the GST breakdown of that fee — they mirror
  // taxableAmount/gstAmount but are kept distinct so standard bookings
  // (which tax the full selling price) are never confused with service-
  // margin bookings (which tax only the fee).
  serviceMarginMode: boolean;
  convenienceFee:    number;
  taxableFee:        number;
  gstOnFee:          number;
  // Renamed from `status` to avoid colliding with Booking.status: BookingStatus
  financialStatus:  FinancialStatus;
}

export function calcBookingFinance(opts: {
  sellingPrice:       number | null | undefined;
  gstRate?:           number;
  gstMode?:           GstMode;
  advance?:           number;
  supplierCost?:      number;
  supplierPaid?:      number;
  serviceMarginMode?: boolean;
  convenienceFee?:    number | null;
}): BookingFinanceResult {
  const gstRate      = opts.gstRate      ?? 0;
  const gstMode      = opts.gstMode      ?? 'EXCLUDED';
  const advance      = opts.advance      ?? 0;
  const supplierCost = opts.supplierCost ?? 0;
  const supplierPaid = opts.supplierPaid ?? 0;
  const supplierPending   = Math.max(0, supplierCost - supplierPaid);
  const serviceMarginMode = opts.serviceMarginMode ?? false;

  // ─── Service Margin Mode ───────────────────────────────────
  // Operationally distinct from standard selling-price bookings: applies to
  // flights, trains, buses, hotels, cabs, transfers and other vendor-
  // arranged services where we pass the supplier/vendor cost straight
  // through and earn via a service/convenience margin. The Convenience Fee
  // is a manually entered service charge (NOT derived from a selling
  // price), and GST is levied ONLY on that fee — the supplier/vendor cost
  // passes through untaxed by us. Standard selling-price logic does not
  // apply here.
  //
  //   Taxable Fee / GST on Fee = calcGst(convenienceFee, rate, mode)
  //   Invoice Total            = Supplier Cost + (fee + GST on fee)
  //
  // EXCLUDED: convenienceFee is the taxable base — GST is added on top.
  //   e.g. cost 10,000 + fee 500 + GST 90  = invoice 10,590
  // INCLUDED: convenienceFee already contains GST — it is back-calculated.
  //   e.g. cost 10,000 + fee 590 (taxable 500 + GST 90) = invoice 10,590
  if (serviceMarginMode) {
    const convenienceFee = opts.convenienceFee ?? 0;

    if (supplierCost === 0 && convenienceFee === 0) {
      return {
        gstMode,
        gstAmount:       0,
        taxableAmount:   0,
        totalPayable:    null,
        balanceDue:      0,
        supplierPending,
        grossMargin:     0,
        marginPct:       0,
        serviceMarginMode,
        convenienceFee:  0,
        taxableFee:      0,
        gstOnFee:        0,
        financialStatus: 'unpriced',
      };
    }

    const feeGst       = calcGst(convenienceFee, gstRate, gstMode);
    const taxableFee   = feeGst.taxableAmount;
    const gstOnFee     = feeGst.gstAmount;
    const totalPayable = supplierCost + feeGst.totalPayable;
    const balanceDue   = Math.max(0, totalPayable - advance);
    // Actual earnings = the fee revenue net of GST (GST is collected and
    // remitted, not kept). Margin % is expressed against the fee charged —
    // the figure the agency actually controls — not the full invoice.
    const grossMargin = taxableFee;
    const marginPct   = convenienceFee > 0 ? Math.round((grossMargin / convenienceFee) * 1000) / 10 : 0;
    const financialStatus = getFinancialStatus(totalPayable, advance);

    return {
      gstMode,
      gstAmount:     gstOnFee,
      taxableAmount: taxableFee,
      totalPayable,
      balanceDue,
      supplierPending,
      grossMargin,
      marginPct,
      serviceMarginMode,
      convenienceFee,
      taxableFee,
      gstOnFee,
      financialStatus,
    };
  }

  // ─── Standard Booking Mode ─────────────────────────────────
  // GST applies on the full selling price, exactly as before.
  const base = opts.sellingPrice ?? null;

  if (base === null || base === 0) {
    return {
      gstMode,
      gstAmount:       0,
      taxableAmount:   0,
      totalPayable:    null,
      balanceDue:      0,
      supplierPending,
      grossMargin:     0,
      marginPct:       0,
      serviceMarginMode,
      convenienceFee:  0,
      taxableFee:      0,
      gstOnFee:        0,
      financialStatus: 'unpriced',
    };
  }

  const fullGst        = calcGst(base, gstRate, gstMode);
  const taxableAmount  = fullGst.taxableAmount;
  const gstAmount      = fullGst.gstAmount;
  const totalPayable   = fullGst.totalPayable;
  const balanceDue     = Math.max(0, totalPayable - advance);
  const grossMargin    = taxableAmount - supplierCost;
  const marginPct      = taxableAmount > 0 ? Math.round((grossMargin / taxableAmount) * 1000) / 10 : 0;
  const financialStatus = getFinancialStatus(totalPayable, advance);

  return {
    gstMode,
    gstAmount,
    taxableAmount,
    totalPayable,
    balanceDue,
    supplierPending,
    grossMargin,
    marginPct,
    serviceMarginMode,
    convenienceFee: 0,
    taxableFee:     0,
    gstOnFee:       0,
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

// ─── Receivables (Accounts Receivable) ───────────────────────
//
// A Receivable is a standalone invoice/amount-due ledger entry — independent
// of the existing Payment model — against which one or more ReceivableEntry
// payments are recorded over time (supports partial + full collection).
//
// `status` is intentionally NEVER persisted: 'overdue' depends on today's
// date, so a stored value would go stale without a background job. It is
// always derived live here, exactly like FinancialStatus elsewhere.
//
// Rule table:
//   balanceDue <= 0                         → 'paid'
//   dueDate is set AND dueDate < asOf       → 'overdue'
//   totalReceived > 0                       → 'partial'
//   otherwise                               → 'pending'

export const RECEIVABLE_STATUS_LABEL: Record<ReceivableStatus, string> = {
  pending:  'Pending',
  partial:  'Partially Received',
  paid:     'Paid',
  overdue:  'Overdue',
};

export const RECEIVABLE_STATUS_CLASS: Record<ReceivableStatus, string> = {
  pending:  'bg-yellow-50 text-yellow-700 border border-yellow-200 ring-0',
  partial:  'bg-orange-50 text-orange-700 border border-orange-200 ring-0',
  paid:     'bg-green-50 text-green-700 border border-green-200 ring-0',
  overdue:  'bg-red-50 text-red-700 border border-red-200 ring-0',
};

export interface ReceivableFinanceResult {
  totalReceived: number;
  balanceDue:    number;
  status:        ReceivableStatus;
}

export function calcReceivableFinance(opts: {
  invoiceAmount: number;
  entries:       { amount: number }[];
  dueDate?:      string | null;
  asOf?:         string;
}): ReceivableFinanceResult {
  const asOf          = opts.asOf ?? today();
  const totalReceived = Math.round(opts.entries.reduce((sum, e) => sum + (e.amount || 0), 0) * 100) / 100;
  const balanceDue    = Math.max(0, Math.round((opts.invoiceAmount - totalReceived) * 100) / 100);

  let status: ReceivableStatus;
  if (balanceDue <= 0) {
    status = 'paid';
  } else if (opts.dueDate && opts.dueDate < asOf) {
    status = 'overdue';
  } else if (totalReceived > 0) {
    status = 'partial';
  } else {
    status = 'pending';
  }

  return { totalReceived, balanceDue, status };
}

/** @deprecated Use normalizeTripFinance() */
export const tripToPortfolioItem = normalizeTripFinance;
