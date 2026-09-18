// Pure financial calculations — the invariants documented at the top of
// src/shared/utils/finance.ts, pinned so a refactor cannot move them.
import { describe, it, expect } from 'vitest';
import {
  calcGst,
  getFinancialStatus,
  calcTripFinance,
  calcBookingFinance,
  calcReceivableFinance,
  calcPortfolioFinance,
  normalizeTripFinance,
  normalizeBookingFinance,
  calcOutstandingAmount,
  calcQuotationItemTotals,
  calcQuotationTotals,
} from '../../src/shared/utils/finance';

describe('calcGst', () => {
  it('EXCLUDED adds GST on top of the taxable base', () => {
    expect(calcGst(10_000, 5, 'EXCLUDED')).toEqual({
      gstMode: 'EXCLUDED', taxableAmount: 10_000, gstAmount: 500, totalPayable: 10_500,
    });
    expect(calcGst(1_000, 18, 'EXCLUDED')).toEqual({
      gstMode: 'EXCLUDED', taxableAmount: 1_000, gstAmount: 180, totalPayable: 1_180,
    });
  });

  it('EXCLUDED rounds the GST to the nearest rupee (documented behaviour of the trip-level calc)', () => {
    // 999 × 5% = 49.95 → 50. Invoice-level GST (gst.ts splitGst) rounds to paise instead.
    expect(calcGst(999, 5, 'EXCLUDED')).toEqual({
      gstMode: 'EXCLUDED', taxableAmount: 999, gstAmount: 50, totalPayable: 1_049,
    });
  });

  it('INCLUDED back-calculates the base and never changes the customer-facing total', () => {
    expect(calcGst(10_500, 5, 'INCLUDED')).toEqual({
      gstMode: 'INCLUDED', taxableAmount: 10_000, gstAmount: 500, totalPayable: 10_500,
    });
    const r = calcGst(1_180, 18, 'INCLUDED');
    expect(r.taxableAmount).toBe(1_000);
    expect(r.gstAmount).toBe(180);
    expect(r.totalPayable).toBe(1_180);
  });

  it('INCLUDED keeps two-decimal precision and taxable + gst === total', () => {
    const r = calcGst(1_234.56, 5, 'INCLUDED');
    expect(r.taxableAmount).toBe(1_175.77);
    expect(r.gstAmount).toBe(58.79);
    expect(Math.round((r.taxableAmount + r.gstAmount) * 100) / 100).toBe(1_234.56);
  });

  it('zero rate is a no-op in both modes', () => {
    expect(calcGst(500, 0, 'EXCLUDED').gstAmount).toBe(0);
    expect(calcGst(500, 0, 'INCLUDED')).toMatchObject({ taxableAmount: 500, gstAmount: 0, totalPayable: 500 });
  });
});

describe('getFinancialStatus', () => {
  it('never reports paid when there is no price', () => {
    expect(getFinancialStatus(null, 0)).toBe('unpriced');
    expect(getFinancialStatus(undefined, 500)).toBe('unpriced');
    expect(getFinancialStatus(0, 500)).toBe('unpriced');
    expect(getFinancialStatus(-10, 0)).toBe('unpriced');
  });

  it('walks unpaid → partial → paid', () => {
    expect(getFinancialStatus(100, 0)).toBe('unpaid');
    expect(getFinancialStatus(100, null)).toBe('unpaid');
    expect(getFinancialStatus(100, 50)).toBe('partial');
    expect(getFinancialStatus(100, 100)).toBe('paid');
    expect(getFinancialStatus(100, 150)).toBe('paid');
  });
});

describe('calcTripFinance', () => {
  it('is unpriced when totalAmount is null, but still reports what the customer has paid', () => {
    const r = calcTripFinance({
      totalAmount: null, customerPaymentsTotal: 5_000, supplierPaymentsTotal: 0, bookingSupplierTotal: 2_000,
    });
    expect(r.financialStatus).toBe('unpriced');
    expect(r.totalPayable).toBeNull();
    expect(r.paidAmount).toBe(5_000);
    expect(r.balanceDue).toBe(0);
    expect(r.supplierCost).toBe(2_000);
    expect(r.gstRate).toBe(5);
    expect(r.gstMode).toBe('EXCLUDED');
  });

  it('computes payable, balance, supplier cost (max of the two sources) and margin net of GST', () => {
    const r = calcTripFinance({
      totalAmount: 100_000, gstRate: 5, gstMode: 'EXCLUDED',
      customerPaymentsTotal: 30_000, supplierPaymentsTotal: 20_000, bookingSupplierTotal: 60_000,
    });
    expect(r.taxableAmount).toBe(100_000);
    expect(r.gstAmount).toBe(5_000);
    expect(r.totalPayable).toBe(105_000);
    expect(r.paidAmount).toBe(30_000);
    expect(r.balanceDue).toBe(75_000);
    expect(r.supplierCost).toBe(60_000);        // max(20000, 60000) — never double-counted
    expect(r.grossMargin).toBe(40_000);         // taxable − supplier cost; GST is not margin
    expect(r.marginPct).toBe(40);
    expect(r.financialStatus).toBe('partial');
  });

  it('uses the larger of the stored paidAmount and the summed customer payments', () => {
    const r = calcTripFinance({
      totalAmount: 10_000, gstRate: 0, paidAmount: 8_000,
      customerPaymentsTotal: 2_000, supplierPaymentsTotal: 0, bookingSupplierTotal: 0,
    });
    expect(r.paidAmount).toBe(8_000);
    expect(r.balanceDue).toBe(2_000);
  });

  it('never returns a negative balance', () => {
    const r = calcTripFinance({
      totalAmount: 1_000, gstRate: 0, customerPaymentsTotal: 1_500, supplierPaymentsTotal: 0, bookingSupplierTotal: 0,
    });
    expect(r.balanceDue).toBe(0);
    expect(r.financialStatus).toBe('paid');
  });

  it('INCLUDED mode: margin is computed on the taxable base, not the gross price', () => {
    const r = calcTripFinance({
      totalAmount: 105_000, gstRate: 5, gstMode: 'INCLUDED',
      customerPaymentsTotal: 0, supplierPaymentsTotal: 0, bookingSupplierTotal: 60_000,
    });
    expect(r.taxableAmount).toBe(100_000);
    expect(r.totalPayable).toBe(105_000);
    expect(r.grossMargin).toBe(40_000);
    expect(r.marginPct).toBe(40);
  });
});

describe('calcBookingFinance — standard mode', () => {
  it('taxes the full selling price', () => {
    const r = calcBookingFinance({
      sellingPrice: 20_000, gstRate: 5, advance: 5_000, supplierCost: 15_000, supplierPaid: 10_000,
    });
    expect(r.taxableAmount).toBe(20_000);
    expect(r.gstAmount).toBe(1_000);
    expect(r.totalPayable).toBe(21_000);
    expect(r.balanceDue).toBe(16_000);
    expect(r.supplierPending).toBe(5_000);
    expect(r.grossMargin).toBe(5_000);
    expect(r.marginPct).toBe(25);
    expect(r.serviceMarginMode).toBe(false);
    expect(r.financialStatus).toBe('partial');
  });

  it('is unpriced without a selling price', () => {
    const r = calcBookingFinance({ sellingPrice: null, supplierCost: 5_000 });
    expect(r.financialStatus).toBe('unpriced');
    expect(r.totalPayable).toBeNull();
    expect(r.supplierPending).toBe(5_000);
  });
});

describe('calcBookingFinance — service margin mode', () => {
  it('EXCLUDED: GST applies only to the convenience fee; supplier cost passes through untaxed', () => {
    const r = calcBookingFinance({
      serviceMarginMode: true, supplierCost: 10_000, convenienceFee: 500, gstRate: 18, gstMode: 'EXCLUDED',
    });
    expect(r.taxableFee).toBe(500);
    expect(r.gstOnFee).toBe(90);
    expect(r.gstAmount).toBe(90);
    expect(r.taxableAmount).toBe(500);
    expect(r.totalPayable).toBe(10_590);
    expect(r.grossMargin).toBe(500);
    expect(r.marginPct).toBe(100);
    expect(r.financialStatus).toBe('unpaid');
  });

  it('INCLUDED: the fee already contains GST and is back-calculated', () => {
    const r = calcBookingFinance({
      serviceMarginMode: true, supplierCost: 10_000, convenienceFee: 590, gstRate: 18, gstMode: 'INCLUDED', advance: 10_590,
    });
    expect(r.taxableFee).toBe(500);
    expect(r.gstOnFee).toBe(90);
    expect(r.totalPayable).toBe(10_590);
    expect(r.balanceDue).toBe(0);
    expect(r.financialStatus).toBe('paid');
  });

  it('is unpriced when both supplier cost and fee are zero', () => {
    const r = calcBookingFinance({ serviceMarginMode: true, supplierCost: 0, convenienceFee: 0, gstRate: 18 });
    expect(r.financialStatus).toBe('unpriced');
    expect(r.totalPayable).toBeNull();
  });
});

describe('calcReceivableFinance', () => {
  it('sums entries and derives partial / paid / overdue live', () => {
    const base = { invoiceAmount: 1_000, entries: [{ amount: 300 }, { amount: 200 }] };
    expect(calcReceivableFinance({ ...base, asOf: '2026-09-18' })).toEqual({
      totalReceived: 500, balanceDue: 500, excessAmount: 0, status: 'partial',
    });
    expect(calcReceivableFinance({ ...base, dueDate: '2026-09-01', asOf: '2026-09-18' }).status).toBe('overdue');
    expect(calcReceivableFinance({ ...base, dueDate: '2026-09-18', asOf: '2026-09-18' }).status).toBe('partial'); // due today is not overdue
    expect(calcReceivableFinance({ invoiceAmount: 1_000, entries: [], asOf: '2026-09-18' }).status).toBe('pending');
  });

  it('reports paid and any excess received', () => {
    expect(calcReceivableFinance({ invoiceAmount: 1_000, entries: [{ amount: 1_000 }], dueDate: '2000-01-01', asOf: '2026-09-18' })).toMatchObject({
      balanceDue: 0, excessAmount: 0, status: 'paid',
    });
    expect(calcReceivableFinance({ invoiceAmount: 1_000, entries: [{ amount: 1_200 }], asOf: '2026-09-18' })).toMatchObject({
      balanceDue: 0, excessAmount: 200, status: 'paid',
    });
  });

  it('rounds to paise', () => {
    const r = calcReceivableFinance({ invoiceAmount: 100, entries: [{ amount: 33.333 }, { amount: 33.333 }], asOf: '2026-09-18' });
    expect(r.totalReceived).toBe(66.67);
    expect(r.balanceDue).toBe(33.33);
  });
});

describe('calcPortfolioFinance', () => {
  it('aggregates revenue, collections, balance and margin; unpriced items count but add no revenue', () => {
    const items = [
      normalizeTripFinance({ totalPayable: 105_000, paidAmount: 30_000, balanceDue: 75_000, supplierCost: 60_000, grossMargin: 40_000 }),
      normalizeBookingFinance({ totalPayable: 21_000, advance: 21_000, balanceDue: 0, supplierCost: 15_000, grossMargin: 5_000 }),
      normalizeTripFinance({ totalPayable: null, paidAmount: 2_000, balanceDue: 0, supplierCost: 0, grossMargin: 0 }),
    ];
    const p = calcPortfolioFinance(items);
    expect(p.totalRevenue).toBe(126_000);
    expect(p.totalCollected).toBe(53_000);
    expect(p.totalPending).toBe(73_000);
    expect(p.totalBalance).toBe(75_000);
    expect(p.totalSupplier).toBe(75_000);
    expect(p.totalGrossMargin).toBe(45_000);
    expect(p.avgMarginPct).toBe(35.7); // 45000 / 126000
    expect(p.unpricedCount).toBe(1);
    expect(items[2].financialStatus).toBe('unpriced');
  });
});

describe('quotation and vendor helpers', () => {
  it('calcOutstandingAmount never goes negative and rounds to paise', () => {
    expect(calcOutstandingAmount(1_000, 400)).toBe(600);
    expect(calcOutstandingAmount(1_000, 1_400)).toBe(0);
    expect(calcOutstandingAmount(100, 33.333)).toBe(66.67);
  });

  it('calcQuotationItemTotals multiplies by quantity and reports margin on selling', () => {
    expect(calcQuotationItemTotals({ quantity: 2, costPrice: 100, sellingPrice: 150 })).toEqual({
      totalCost: 200, totalSelling: 300, grossProfit: 100, marginPct: 33.33,
    });
    expect(calcQuotationItemTotals({ quantity: 0, costPrice: 100, sellingPrice: 150 }).marginPct).toBe(0);
  });

  it('calcQuotationTotals sums items', () => {
    const t = calcQuotationTotals([
      calcQuotationItemTotals({ quantity: 2, costPrice: 100, sellingPrice: 150 }),
      calcQuotationItemTotals({ quantity: 1, costPrice: 500, sellingPrice: 700 }),
    ]);
    expect(t).toEqual({ totalCost: 700, totalSelling: 1_000, grossProfit: 300, marginPct: 30 });
  });
});
