// ============================================================
// CENTRAL FINANCE ENGINE
//
// The only code allowed to: write FinancialTransaction rows,
// mutate cached balance fields (Trip.paidAmount/balanceDue,
// Receivable.totalReceived/balanceDue, VendorPayment.outstanding),
// and append matching ActivityLog entries. Every write happens
// inside one Prisma transaction so the ledger, cached balances,
// and activity feed can never drift apart.
//
// Routes call these functions instead of hand-rolling balance math —
// see prisma/schema.prisma FinancialTransaction + src/shared/utils/finance.ts
// (calcGst/getFinancialStatus — the canonical formulas reused here).
// ============================================================

import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { getFinancialStatus } from '../../../src/shared/utils/finance.js';
import { today } from '../../../src/shared/utils/date.js';
import { logActivity, type DbClient } from '../lib/activity.js';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function calcOutstanding(totalCost: number, advancePaid: number, isPaid: boolean): number {
  if (isPaid) return 0;
  return Math.max(0, round2(totalCost - advancePaid));
}

// ── Receivables (Phase 2 — automation) ───────────────────────

export interface CreateReceivableInput {
  id?:           string;
  sourceType:    'trip' | 'booking' | 'quotation' | 'invoice';
  sourceId:      string;
  tripId?:       string | null;
  bookingId?:    string | null;
  customerId?:   string | null;
  customerName:  string;
  amount:        number;
  gstAmount?:    number;
  taxableAmount?: number;
  dueDate?:      string | null;
  description?:  string;
  createdBy?:    string | null;
}

// Creates the A/R record + ledger entry + activity post for an operational
// event (booking/trip/quotation conversion/invoice). Skips silently when the
// amount is unset/zero — an unpriced trip has nothing receivable yet.
export async function createReceivable(input: CreateReceivableInput, db: DbClient = prisma) {
  if (!input.amount || input.amount <= 0) return null;

  const id = input.id ?? `RCV-${input.sourceType}-${input.sourceId}-${Date.now()}`;

  const receivable = await db.receivable.create({
    data: {
      id,
      customerId:    input.customerId ?? undefined,
      customerName:  input.customerName,
      bookingId:     input.bookingId ?? undefined,
      tripId:        input.tripId ?? undefined,
      invoiceAmount: input.amount,
      description: input.description ?? `Receivable for ${input.sourceType} ${input.sourceId}`,
      dueDate:       input.dueDate ?? undefined,
      totalReceived: 0,
      balanceDue:    input.amount,
      createdDate:   today(),
    },
  });

  await db.financialTransaction.create({
    data: {
      type:            'RECEIVABLE',
      sourceType:      input.sourceType,
      sourceId:        input.sourceId,
      customerId:      input.customerId ?? undefined,
      tripId:          input.tripId ?? undefined,
      bookingId:       input.bookingId ?? undefined,
      amount:          input.amount,
      gstAmount:       input.gstAmount ?? 0,
      taxableAmount:   input.taxableAmount ?? input.amount,
      description: receivable.description,
      transactionDate: today(),
      createdBy:       input.createdBy ?? undefined,
    },
  });

  await logActivity(db, {
    action:      'receivable_created',
    description: `Receivable of ₹${input.amount.toLocaleString('en-IN')} raised for ${input.customerName} (${input.sourceType} ${input.sourceId})`,
    entityType: 'receivable',
    entityId:   receivable.id,
    userId:     input.createdBy,
    after:      receivable,
  });

  return receivable;
}

// ── Payments (Phase 3 — payment recording) ───────────────────

export interface RecordPaymentInput {
  id?:            string;
  receivableId?:  string | null;
  tripId?:        string | null;
  bookingId?:     string | null;
  customerId?:    string | null;
  customerName?:  string | null;
  amount:         number;
  paymentMode:    string;
  reference?:     string | null;
  notes?:         string | null;
  date?:          string;
  createdBy?:     string | null;
}

// Records a (partial/advance/full) customer payment and atomically:
//   1. logs the Payment row
//   2. applies a ReceivableEntry + recalculates Receivable balances (if linked)
//   3. recalculates Trip.paidAmount/balanceDue/financialStatus (if linked)
//   4. recalculates Booking balance/financialStatus (if linked)
//   5. writes the PAYMENT_RECEIVED ledger row
//   6. posts to the activity feed
// All of which keeps dashboard, receivables, customer & trip views in sync.
export async function recordPayment(input: RecordPaymentInput) {
  const date = input.date ?? today();

  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        id:         input.id ?? `PAY-${Date.now()}`,
        type:       'customer',
        tripId:     input.tripId ?? undefined,
        bookingId:  input.bookingId ?? undefined,
        customer:   input.customerName ?? undefined,
        customerId: input.customerId ?? undefined,
        amount:     input.amount,
        method:     input.paymentMode,
        date,
        paidDate:   date,
        status:     'completed',
        reference:  input.reference ?? undefined,
        notes:      input.notes ?? undefined,
      },
    });

    let receivable = null;
    if (input.receivableId) {
      await tx.receivableEntry.create({
        data: {
          id:           `RCVE-${Date.now()}`,
          receivableId: input.receivableId,
          amount:       input.amount,
          paymentDate:  date,
          paymentMode:  input.paymentMode,
          reference:    input.reference ?? undefined,
          notes:        input.notes ?? undefined,
        },
      });

      const current = await tx.receivable.findUniqueOrThrow({ where: { id: input.receivableId } });
      const totalReceived = round2(current.totalReceived + input.amount);
      receivable = await tx.receivable.update({
        where: { id: input.receivableId },
        data: {
          totalReceived,
          balanceDue: round2(Math.max(0, current.invoiceAmount - totalReceived)),
        },
      });
    }

    let trip = null;
    if (input.tripId) {
      const current = await tx.trip.findUniqueOrThrow({ where: { id: input.tripId } });
      const paidAmount = round2(current.paidAmount + input.amount);
      const totalPayable = current.totalPayable;
      trip = await tx.trip.update({
        where: { id: input.tripId },
        data: {
          paidAmount,
          balanceDue: totalPayable !== null ? round2(Math.max(0, totalPayable - paidAmount)) : 0,
        },
      });
    }

    let booking = null;
    if (input.bookingId) {
      const current = await tx.booking.findUniqueOrThrow({ where: { id: input.bookingId } });
      const advance = round2(current.advance + input.amount);
      const totalPayable = current.totalPayable;
      booking = await tx.booking.update({
        where: { id: input.bookingId },
        data: {
          advance,
          balanceDue:      totalPayable !== null ? round2(Math.max(0, totalPayable - advance)) : 0,
          financialStatus: getFinancialStatus(totalPayable, advance),
        },
      });
    }

    await tx.financialTransaction.create({
      data: {
        type:            'PAYMENT_RECEIVED',
        sourceType:      input.receivableId ? 'receivable' : input.bookingId ? 'booking' : 'trip',
        sourceId:        input.receivableId ?? input.bookingId ?? input.tripId ?? payment.id,
        customerId:      input.customerId ?? undefined,
        tripId:          input.tripId ?? undefined,
        bookingId:       input.bookingId ?? undefined,
        amount:          input.amount,
        description: `Payment received via ${input.paymentMode}${input.reference ? ` (Ref: ${input.reference})` : ''}`,
        transactionDate: date,
        paymentMode:     input.paymentMode,
        reference:       input.reference ?? undefined,
        createdBy:       input.createdBy ?? undefined,
      },
    });

    await logActivity(tx, {
      action:      'payment_received',
      description: `Payment of ₹${input.amount.toLocaleString('en-IN')} received from ${input.customerName ?? 'customer'} via ${input.paymentMode}`,
      entityType: 'payment',
      entityId:   payment.id,
      userId:     input.createdBy,
      after:      payment,
    });

    return { payment, receivable, trip, booking };
  });
}

// ── Payables / vendor payments (vendor-side ledger) ──────────

export interface CreatePayableInput {
  id?:           string;
  vendorId:      string;
  vendorName:    string;
  tripId?:       string | null;
  tripName?:     string | null;
  totalCost:     number;
  advancePaid?:  number;
  dueDate?:      string | null;
  description?:  string | null;
  createdBy?:    string | null;
}

// Creates/updates the VendorPayment ledger row with the single canonical
// outstanding calculation (replacing the duplicated copies that used to live
// in routes/vendors.ts) and writes the matching PAYABLE ledger entry.
export async function createPayable(input: CreatePayableInput) {
  const advancePaid = input.advancePaid ?? 0;
  const isPaid = advancePaid >= input.totalCost && input.totalCost > 0;

  return prisma.$transaction(async (tx) => {
    const id = input.id ?? `VP-${Date.now()}`;
    const vendorPayment = await tx.vendorPayment.upsert({
      where:  { id },
      create: {
        id,
        vendorId:    input.vendorId,
        vendorName:  input.vendorName,
        tripId:      input.tripId ?? undefined,
        tripName:    input.tripName ?? undefined,
        description: input.description ?? undefined,
        totalCost:   input.totalCost,
        advancePaid,
        outstanding: calcOutstanding(input.totalCost, advancePaid, isPaid),
        isPaid,
        dueDate:     input.dueDate ?? undefined,
        createdDate: today(),
      },
      update: {
        totalCost:   input.totalCost,
        advancePaid,
        outstanding: calcOutstanding(input.totalCost, advancePaid, isPaid),
        isPaid,
        dueDate:     input.dueDate ?? undefined,
      },
    });

    await tx.financialTransaction.create({
      data: {
        type:            'PAYABLE',
        sourceType:      'vendor_payment',
        sourceId:        vendorPayment.id,
        vendorId:        input.vendorId,
        tripId:          input.tripId ?? undefined,
        amount:          input.totalCost,
        description: input.description ?? `Payable to ${input.vendorName}`,
        transactionDate: today(),
        createdBy:       input.createdBy ?? undefined,
      },
    });

    await logActivity(tx, {
      action:      'payable_created',
      description: `Payable of ₹${input.totalCost.toLocaleString('en-IN')} recorded for vendor ${input.vendorName}`,
      entityType: 'vendor_payment',
      entityId:   vendorPayment.id,
      userId:     input.createdBy,
      after:      vendorPayment,
    });

    return vendorPayment;
  });
}

export interface RecordVendorPaymentInput {
  vendorPaymentId: string;
  amount:          number;
  paymentMode?:    string | null;
  reference?:      string | null;
  date?:           string;
  createdBy?:      string | null;
}

// Records an additional payment toward an existing vendor payable —
// recalculates outstanding/isPaid via the same calcOutstanding used on
// creation, and writes the PAYMENT_SENT ledger row.
export async function recordVendorPayment(input: RecordVendorPaymentInput) {
  const date = input.date ?? today();

  return prisma.$transaction(async (tx) => {
    const current = await tx.vendorPayment.findUniqueOrThrow({ where: { id: input.vendorPaymentId } });
    const advancePaid = round2(current.advancePaid + input.amount);
    const isPaid = advancePaid >= current.totalCost && current.totalCost > 0;

    const vendorPayment = await tx.vendorPayment.update({
      where: { id: input.vendorPaymentId },
      data: {
        advancePaid,
        outstanding: calcOutstanding(current.totalCost, advancePaid, isPaid),
        isPaid,
        paidDate:    isPaid ? date : current.paidDate,
      },
    });

    await tx.financialTransaction.create({
      data: {
        type:            'PAYMENT_SENT',
        sourceType:      'vendor_payment',
        sourceId:        vendorPayment.id,
        vendorId:        vendorPayment.vendorId,
        tripId:          vendorPayment.tripId ?? undefined,
        amount:          input.amount,
        description: `Payment sent to ${vendorPayment.vendorName} via ${input.paymentMode ?? 'unspecified mode'}${input.reference ? ` (Ref: ${input.reference})` : ''}`,
        transactionDate: date,
        paymentMode:     input.paymentMode ?? undefined,
        reference:       input.reference ?? undefined,
        createdBy:       input.createdBy ?? undefined,
      },
    });

    await logActivity(tx, {
      action:      'vendor_payment_sent',
      description: `Payment of ₹${input.amount.toLocaleString('en-IN')} sent to vendor ${vendorPayment.vendorName}`,
      entityType: 'vendor_payment',
      entityId:   vendorPayment.id,
      userId:     input.createdBy,
      after:      vendorPayment,
    });

    return vendorPayment;
  });
}

// ── Refunds & adjustments (ledger symmetry) ──────────────────

export interface RefundInput {
  sourceType:      string;
  sourceId:        string;
  customerId?:     string | null;
  tripId?:         string | null;
  bookingId?:      string | null;
  amount:          number;
  description?:    string;
  paymentMode?:    string | null;
  reference?:      string | null;
  createdBy?:      string | null;
}

export async function recordRefund(input: RefundInput, db: DbClient = prisma) {
  const txn = await db.financialTransaction.create({
    data: {
      type:            'REFUND',
      sourceType:      input.sourceType,
      sourceId:        input.sourceId,
      customerId:      input.customerId ?? undefined,
      tripId:          input.tripId ?? undefined,
      bookingId:       input.bookingId ?? undefined,
      amount:          input.amount,
      description: input.description ?? 'Refund issued',
      transactionDate: today(),
      paymentMode:     input.paymentMode ?? undefined,
      reference:       input.reference ?? undefined,
      createdBy:       input.createdBy ?? undefined,
    },
  });

  await logActivity(db, {
    action:      'refund_issued',
    description: `Refund of ₹${input.amount.toLocaleString('en-IN')} issued (${input.sourceType} ${input.sourceId})`,
    entityType: 'financial_transaction',
    entityId:   txn.id,
    userId:     input.createdBy,
    after:      txn,
  });

  return txn;
}

export interface AdjustmentInput {
  sourceType:      string;
  sourceId:        string;
  customerId?:     string | null;
  vendorId?:       string | null;
  tripId?:         string | null;
  bookingId?:      string | null;
  amount:          number;
  description: string;
  createdBy?:      string | null;
}

export async function recordAdjustment(input: AdjustmentInput, db: DbClient = prisma) {
  const txn = await db.financialTransaction.create({
    data: {
      type:            'ADJUSTMENT',
      sourceType:      input.sourceType,
      sourceId:        input.sourceId,
      customerId:      input.customerId ?? undefined,
      vendorId:        input.vendorId ?? undefined,
      tripId:          input.tripId ?? undefined,
      bookingId:       input.bookingId ?? undefined,
      amount:          input.amount,
      description: input.description,
      transactionDate: today(),
      createdBy:       input.createdBy ?? undefined,
    },
  });

  await logActivity(db, {
    action:      'adjustment_recorded',
    description: `Adjustment recorded: ${input.description} (₹${input.amount.toLocaleString('en-IN')})`,
    entityType: 'financial_transaction',
    entityId:   txn.id,
    userId:     input.createdBy,
    after:      txn,
  });

  return txn;
}

export type { Prisma };
