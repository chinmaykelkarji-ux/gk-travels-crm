// ============================================================
// Supplier bills and the payments that settle them (payables).
//
// A bill is what a hotel, transporter, consolidator or activity provider
// has charged: it posts the cost to the right expense account, holds any
// GST as input credit (verify with CA) and owes the supplier. A payment
// settles a bill, or sits as an advance until a bill arrives.
//
// As everywhere in finance: nothing is deleted. Cancelling reverses the
// posting and marks the row.
// ============================================================

import { Prisma } from '@prisma/client';
import { prisma, type DbClient } from '../../lib/prisma.js';
import { audit } from '../../core/audit.js';
import { AppError, notFound, stateConflict } from '../../core/errors.js';
import { nextDisplayId } from '../../core/numbering.js';
import { istToday } from '../../../../src/shared/calc/istTime.js';
import { sumPaise, toPaise, toRupees } from '../../../../src/shared/calc/money.js';
import { agingSummary, EXPENSE_ACCOUNT, MONEY_ACCOUNT } from '../../../../src/shared/calc/ledger.js';
import { BILL_CATEGORY_LABEL, type BillCategory, type CancelInput, type PayablesQuery, type VendorBillInput, type VendorPaymentInput } from '../../../../src/shared/contracts/payables.js';
import { dayDate, isoDay, page } from '../masters/common.js';
import { postEntry, reverseEntry } from '../ledger/service.js';
import { tripChanged } from '../operations/hooks.js';

const PAYABLE = '2000';
const INPUT_GST = '1300';
const SUPPLIER_ADVANCE = '1200';

const BILL_INCLUDE = {
  vendor: { select: { id: true, name: true, phone: true, kind: true } },
  trip: { select: { id: true, tourName: true, destination: true } },
  payments: { where: { status: 'POSTED' }, select: { id: true, amount: true, paidAt: true, mode: true, reference: true } },
} satisfies Prisma.VendorBillInclude;
type BillRow = Prisma.VendorBillGetPayload<{ include: typeof BILL_INCLUDE }>;

function billDto(b: BillRow, today = istToday()) {
  const paidPaise = sumPaise(b.payments.map(p => toPaise(Number(p.amount))));
  const amountPaise = toPaise(Number(b.amount));
  const outstandingPaise = b.status === 'CANCELLED' ? 0 : amountPaise - paidPaise;
  const due = isoDay(b.dueDate);
  return {
    id: b.id, vendorId: b.vendorId, vendor: b.vendor, billNumber: b.billNumber, billDate: isoDay(b.billDate)!, dueDate: due,
    category: b.category, categoryLabel: BILL_CATEGORY_LABEL[b.category as BillCategory] ?? b.category,
    amount: Number(b.amount), gstAmount: Number(b.gstAmount), netAmount: toRupees(amountPaise - toPaise(Number(b.gstAmount))),
    paid: toRupees(paidPaise), outstanding: toRupees(outstandingPaise),
    status: b.status === 'CANCELLED' ? 'CANCELLED' : outstandingPaise <= 0 ? 'PAID' : 'OPEN',
    daysOverdue: due && due < today && outstandingPaise > 0 ? Math.round((Date.parse(today) - Date.parse(due)) / 86_400_000) : 0,
    tripId: b.tripId, trip: b.trip ? { id: b.trip.id, label: b.trip.tourName ?? b.trip.destination } : null, contractId: b.contractId,
    description: b.description, notes: b.notes, ledgerTransactionId: b.ledgerTransactionId,
    cancelledAt: b.cancelledAt?.toISOString() ?? null, cancelReason: b.cancelReason, legacyPayableId: b.legacyPayableId,
    payments: b.payments.map(p => ({ id: p.id, amount: Number(p.amount), paidAt: isoDay(p.paidAt)!, mode: p.mode, reference: p.reference })),
    createdAt: b.createdAt.toISOString(),
  };
}
export type VendorBillDto = ReturnType<typeof billDto>;

async function assertVendor(db: DbClient, vendorId: string) {
  const v = await db.vendor.findUnique({ where: { id: vendorId }, select: { id: true, name: true, isActive: true } });
  if (!v) throw new AppError('VALIDATION_ERROR', 400, 'Supplier not found', { vendorId: 'Unknown supplier' });
  return v;
}

export async function createBill(input: VendorBillInput, actorId?: string | null) {
  const id = await prisma.$transaction(async tx => {
    const vendor = await assertVendor(tx, input.vendorId);
    const clash = await tx.vendorBill.findFirst({ where: { vendorId: input.vendorId, billNumber: input.billNumber, status: { not: 'CANCELLED' } }, select: { id: true } });
    if (clash) throw new AppError('CONFLICT', 409, `${vendor.name} already has bill ${input.billNumber} (${clash.id})`, { billNumber: 'Already recorded' });
    if (input.tripId && !(await tx.trip.findUnique({ where: { id: input.tripId }, select: { id: true } }))) throw new AppError('VALIDATION_ERROR', 400, 'Trip not found', { tripId: 'Unknown trip' });

    const billId = await nextDisplayId(tx, 'BILL', { displayPrefix: 'BILL' });
    const net = toRupees(toPaise(input.amount) - toPaise(input.gstAmount));
    const what = input.description || BILL_CATEGORY_LABEL[input.category];
    const lines = [
      { code: EXPENSE_ACCOUNT[input.category], debit: net, description: `${what}${input.tripId ? ` · ${input.tripId}` : ''}` },
      ...(input.gstAmount > 0 ? [{ code: INPUT_GST, debit: input.gstAmount, description: 'GST on the supplier bill — verify with CA' }] : []),
      { code: PAYABLE, credit: input.amount, description: `${vendor.name} · bill ${input.billNumber}` },
    ];
    const entry = await postEntry(tx, {
      date: input.billDate, narration: `${billId}: ${vendor.name} bill ${input.billNumber} — ${what}`,
      sourceType: 'vendor_bill', sourceId: billId, vendorId: input.vendorId, tripId: input.tripId, contractId: input.contractId, lines,
    }, actorId);

    await tx.vendorBill.create({
      data: {
        id: billId, vendorId: input.vendorId, billNumber: input.billNumber, billDate: dayDate(input.billDate)!, dueDate: dayDate(input.dueDate ?? null),
        category: input.category, amount: input.amount, gstAmount: input.gstAmount, tripId: input.tripId, contractId: input.contractId,
        description: input.description, notes: input.notes, ledgerTransactionId: entry.id, createdById: actorId ?? null,
      },
    });
    await audit(tx, {
      action: 'vendor_bill_recorded', entityType: 'vendor', entityId: input.vendorId, userId: actorId,
      description: `${billId}: ${vendor.name} bill ${input.billNumber} of ₹${input.amount.toLocaleString('en-IN')} (${BILL_CATEGORY_LABEL[input.category]})${input.tripId ? ` for ${input.tripId}` : ''}`,
      after: { billId, amount: input.amount, gstAmount: input.gstAmount, category: input.category, tripId: input.tripId ?? null },
    });
    await tripChanged(tx, input.tripId, 'vendor_bill', actorId);
    return billId;
  });
  return getBill(id);
}

export async function cancelBill(id: string, reason: string, actorId?: string | null) {
  const ledgerId = await prisma.$transaction(async tx => {
    const b = await tx.vendorBill.findUnique({ where: { id }, include: { payments: { where: { status: 'POSTED' }, select: { id: true } } } });
    if (!b) throw notFound('Bill');
    if (b.status === 'CANCELLED') throw stateConflict(`${id} was already cancelled`);
    if (b.payments.length) throw stateConflict('Cancel or unlink the payments on this bill first');
    await tx.vendorBill.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason } });
    await audit(tx, { action: 'vendor_bill_cancelled', entityType: 'vendor', entityId: b.vendorId, userId: actorId, description: `${id} cancelled: ${reason}`, before: { amount: Number(b.amount) }, after: { status: 'CANCELLED', reason } });
    await tripChanged(tx, b.tripId, 'vendor_bill_cancelled', actorId);
    return b.ledgerTransactionId;
  });
  if (ledgerId) await reverseEntry(ledgerId, `Bill ${id} cancelled: ${reason}`, actorId);
  return getBill(id);
}

export async function getBill(id: string) {
  const b = await prisma.vendorBill.findUnique({ where: { id }, include: BILL_INCLUDE });
  if (!b) throw notFound('Bill');
  return billDto(b);
}

export async function listBills(q: PayablesQuery) {
  const where: Prisma.VendorBillWhereInput = {
    ...(q.vendorId ? { vendorId: q.vendorId } : {}),
    ...(q.tripId ? { tripId: q.tripId } : {}),
    ...(q.category ? { category: q.category } : {}),
    ...(q.status === 'CANCELLED' ? { status: 'CANCELLED' } : q.status === 'ALL' ? {} : { status: 'OPEN' }),
    ...(q.from || q.to ? { billDate: { ...(q.from ? { gte: dayDate(q.from)! } : {}), ...(q.to ? { lte: dayDate(q.to)! } : {}) } } : {}),
    ...(q.q ? { OR: [{ billNumber: { contains: q.q, mode: 'insensitive' } }, { id: { contains: q.q, mode: 'insensitive' } }, { description: { contains: q.q, mode: 'insensitive' } }, { vendor: { name: { contains: q.q, mode: 'insensitive' } } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.vendorBill.findMany({ where, include: BILL_INCLUDE, orderBy: [{ billDate: 'desc' }, { createdAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.vendorBill.count({ where }),
  ]);
  const today = istToday();
  let items = rows.map(b => billDto(b, today));
  if (q.status === 'OPEN') items = items.filter(b => b.status === 'OPEN');
  if (q.status === 'PAID') items = items.filter(b => b.status === 'PAID');
  return { ...page(items, total, q), totals: { outstanding: toRupees(sumPaise(items.map(i => toPaise(i.outstanding)))), billed: toRupees(sumPaise(items.map(i => toPaise(i.amount)))) } };
}

/** What is owed, by how late it is, with the worst suppliers first. */
export async function payablesAging() {
  const rows = await prisma.vendorBill.findMany({ where: { status: 'OPEN' }, include: BILL_INCLUDE });
  const today = istToday();
  const bills = rows.map(b => billDto(b, today)).filter(b => b.outstanding > 0);
  const byVendor = new Map<string, { vendorId: string; vendor: string; outstandingPaise: number; overduePaise: number; bills: number }>();
  for (const b of bills) {
    const v = byVendor.get(b.vendorId) ?? { vendorId: b.vendorId, vendor: b.vendor?.name ?? b.vendorId, outstandingPaise: 0, overduePaise: 0, bills: 0 };
    v.outstandingPaise += toPaise(b.outstanding);
    if (b.daysOverdue > 0) v.overduePaise += toPaise(b.outstanding);
    v.bills++;
    byVendor.set(b.vendorId, v);
  }
  const aging = agingSummary(bills.map(b => ({ daysOverdue: b.dueDate ? b.daysOverdue : 0, outstandingPaise: toPaise(b.outstanding) })));
  const advances = await prisma.vendorPaymentV2.aggregate({ where: { status: 'POSTED', billId: null }, _sum: { amount: true } });
  return {
    today,
    buckets: aging.buckets.map(b => ({ ...b, amount: toRupees(b.amountPaise) })),
    total: toRupees(aging.totalPaise), overdue: toRupees(aging.overduePaise),
    unappliedAdvances: Number(advances._sum.amount ?? 0),
    vendors: [...byVendor.values()].sort((a, b) => b.outstandingPaise - a.outstandingPaise)
      .map(v => ({ vendorId: v.vendorId, vendor: v.vendor, bills: v.bills, outstanding: toRupees(v.outstandingPaise), overdue: toRupees(v.overduePaise) })),
    bills: bills.sort((a, b) => b.daysOverdue - a.daysOverdue || toPaise(b.outstanding) - toPaise(a.outstanding)),
  };
}

// ── Payments ──────────────────────────────────────────────────

const PAY_INCLUDE = { vendor: { select: { id: true, name: true } }, bill: { select: { id: true, billNumber: true, amount: true } }, trip: { select: { id: true, tourName: true, destination: true } } } satisfies Prisma.VendorPaymentV2Include;
type PayRow = Prisma.VendorPaymentV2GetPayload<{ include: typeof PAY_INCLUDE }>;

function paymentDto(p: PayRow) {
  return {
    id: p.id, vendorId: p.vendorId, vendor: p.vendor, billId: p.billId, bill: p.bill ? { id: p.bill.id, billNumber: p.bill.billNumber, amount: Number(p.bill.amount) } : null,
    tripId: p.tripId, trip: p.trip ? { id: p.trip.id, label: p.trip.tourName ?? p.trip.destination } : null,
    amount: Number(p.amount), mode: p.mode, paidAt: isoDay(p.paidAt)!, reference: p.reference, notes: p.notes, status: p.status,
    ledgerTransactionId: p.ledgerTransactionId, cancelledAt: p.cancelledAt?.toISOString() ?? null, cancelReason: p.cancelReason,
    legacyPaymentId: p.legacyPaymentId, createdAt: p.createdAt.toISOString(),
  };
}
export type VendorPaymentDto = ReturnType<typeof paymentDto>;

export async function payVendor(input: VendorPaymentInput, actorId?: string | null) {
  const id = await prisma.$transaction(async tx => {
    const vendor = await assertVendor(tx, input.vendorId);
    let tripId = input.tripId ?? null;
    let bill: { id: string; billNumber: string; amount: Prisma.Decimal; vendorId: string; tripId: string | null; status: string } | null = null;
    if (input.billId) {
      bill = await tx.vendorBill.findUnique({ where: { id: input.billId }, select: { id: true, billNumber: true, amount: true, vendorId: true, tripId: true, status: true } });
      if (!bill) throw new AppError('VALIDATION_ERROR', 400, 'Bill not found', { billId: 'Unknown bill' });
      if (bill.vendorId !== input.vendorId) throw new AppError('VALIDATION_ERROR', 400, 'That bill belongs to another supplier', { billId: 'Wrong supplier' });
      if (bill.status === 'CANCELLED') throw stateConflict('That bill was cancelled');
      const paid = await tx.vendorPaymentV2.aggregate({ where: { billId: bill.id, status: 'POSTED' }, _sum: { amount: true } });
      const left = toPaise(Number(bill.amount)) - toPaise(Number(paid._sum.amount ?? 0));
      if (toPaise(input.amount) > left) throw new AppError('VALIDATION_ERROR', 400, `Only ₹${toRupees(left).toLocaleString('en-IN')} is left on bill ${bill.billNumber}`, { amount: 'More than the bill' });
      tripId = tripId ?? bill.tripId;
    }

    const payId = await nextDisplayId(tx, 'VP', { displayPrefix: 'VP' });
    const account = input.billId ? PAYABLE : SUPPLIER_ADVANCE;
    const entry = await postEntry(tx, {
      date: input.paidAt,
      narration: `${payId}: paid ${vendor.name}${bill ? ` for bill ${bill.billNumber}` : ' (advance)'}${input.reference ? ` · ${input.reference}` : ''}`,
      sourceType: 'vendor_payment', sourceId: payId, vendorId: input.vendorId, tripId,
      lines: [
        { code: account, debit: input.amount, description: bill ? `Bill ${bill.billNumber}` : `Advance to ${vendor.name}` },
        { code: MONEY_ACCOUNT[input.mode], credit: input.amount, description: input.mode.toLowerCase().replace('_', ' ') },
      ],
    }, actorId);

    await tx.vendorPaymentV2.create({
      data: { id: payId, vendorId: input.vendorId, billId: input.billId, tripId, amount: input.amount, mode: input.mode, paidAt: dayDate(input.paidAt)!, reference: input.reference, notes: input.notes, ledgerTransactionId: entry.id, createdById: actorId ?? null },
    });
    await audit(tx, {
      action: 'vendor_paid', entityType: 'vendor', entityId: input.vendorId, userId: actorId,
      description: `${payId}: ₹${input.amount.toLocaleString('en-IN')} paid to ${vendor.name}${bill ? ` against bill ${bill.billNumber}` : ' as an advance'} on ${input.paidAt}`,
      after: { paymentId: payId, amount: input.amount, billId: input.billId ?? null, mode: input.mode },
    });
    await tripChanged(tx, tripId, 'vendor_payment', actorId);
    return payId;
  });
  return getPayment(id);
}

export async function cancelPayment(id: string, reason: string, actorId?: string | null) {
  const ledgerId = await prisma.$transaction(async tx => {
    const p = await tx.vendorPaymentV2.findUnique({ where: { id } });
    if (!p) throw notFound('Payment');
    if (p.status === 'CANCELLED') throw stateConflict(`${id} was already cancelled`);
    await tx.vendorPaymentV2.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason } });
    await audit(tx, { action: 'vendor_payment_cancelled', entityType: 'vendor', entityId: p.vendorId, userId: actorId, description: `${id} cancelled: ${reason}`, before: { amount: Number(p.amount) }, after: { status: 'CANCELLED', reason } });
    await tripChanged(tx, p.tripId, 'vendor_payment_cancelled', actorId);
    return p.ledgerTransactionId;
  });
  if (ledgerId) await reverseEntry(ledgerId, `Payment ${id} cancelled: ${reason}`, actorId);
  return getPayment(id);
}

/** Puts an advance already paid against a bill that has since arrived. */
export async function applyAdvance(paymentId: string, billId: string, actorId?: string | null) {
  await prisma.$transaction(async tx => {
    const p = await tx.vendorPaymentV2.findUnique({ where: { id: paymentId } });
    if (!p) throw notFound('Payment');
    if (p.status !== 'POSTED') throw stateConflict('That payment was cancelled');
    if (p.billId) throw stateConflict('That payment is already against a bill');
    const bill = await tx.vendorBill.findUnique({ where: { id: billId }, select: { id: true, billNumber: true, amount: true, vendorId: true, tripId: true, status: true } });
    if (!bill || bill.vendorId !== p.vendorId) throw new AppError('VALIDATION_ERROR', 400, 'Choose a bill from the same supplier', { billId: 'Wrong supplier' });
    if (bill.status === 'CANCELLED') throw stateConflict('That bill was cancelled');
    const paid = await tx.vendorPaymentV2.aggregate({ where: { billId, status: 'POSTED' }, _sum: { amount: true } });
    const left = toPaise(Number(bill.amount)) - toPaise(Number(paid._sum.amount ?? 0));
    if (toPaise(Number(p.amount)) > left) throw new AppError('VALIDATION_ERROR', 400, `Only ₹${toRupees(left).toLocaleString('en-IN')} is left on bill ${bill.billNumber}`, { billId: 'The advance is larger than the bill' });

    await postEntry(tx, {
      date: istToday(), narration: `Advance ${paymentId} applied to bill ${bill.billNumber}`, sourceType: 'advance_applied', sourceId: paymentId,
      vendorId: p.vendorId, tripId: bill.tripId,
      lines: [{ code: PAYABLE, debit: Number(p.amount), description: `Bill ${bill.billNumber}` }, { code: SUPPLIER_ADVANCE, credit: Number(p.amount), description: 'Advance applied' }],
    }, actorId);
    await tx.vendorPaymentV2.update({ where: { id: paymentId }, data: { billId, tripId: p.tripId ?? bill.tripId } });
    await audit(tx, { action: 'vendor_advance_applied', entityType: 'vendor', entityId: p.vendorId, userId: actorId, description: `${paymentId} (₹${Number(p.amount).toLocaleString('en-IN')}) applied to bill ${bill.billNumber}`, after: { billId } });
  });
  return getPayment(paymentId);
}

export async function getPayment(id: string) {
  const p = await prisma.vendorPaymentV2.findUnique({ where: { id }, include: PAY_INCLUDE });
  if (!p) throw notFound('Payment');
  return paymentDto(p);
}

export async function listPayments(q: PayablesQuery) {
  const where: Prisma.VendorPaymentV2WhereInput = {
    ...(q.vendorId ? { vendorId: q.vendorId } : {}),
    ...(q.tripId ? { tripId: q.tripId } : {}),
    ...(q.status === 'CANCELLED' ? { status: 'CANCELLED' } : q.status === 'ALL' ? {} : { status: 'POSTED' }),
    ...(q.from || q.to ? { paidAt: { ...(q.from ? { gte: dayDate(q.from)! } : {}), ...(q.to ? { lte: dayDate(q.to)! } : {}) } } : {}),
    ...(q.q ? { OR: [{ id: { contains: q.q, mode: 'insensitive' } }, { reference: { contains: q.q, mode: 'insensitive' } }, { vendor: { name: { contains: q.q, mode: 'insensitive' } } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.vendorPaymentV2.findMany({ where, include: PAY_INCLUDE, orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.vendorPaymentV2.count({ where }),
  ]);
  return page(rows.map(paymentDto), total, q);
}

/** One supplier's bills, payments and what is left to pay. */
export async function vendorStatement(vendorId: string) {
  const vendor = await assertVendor(prisma, vendorId);
  const [bills, payments] = await Promise.all([
    prisma.vendorBill.findMany({ where: { vendorId }, include: BILL_INCLUDE, orderBy: { billDate: 'desc' }, take: 200 }),
    prisma.vendorPaymentV2.findMany({ where: { vendorId, status: 'POSTED' }, include: PAY_INCLUDE, orderBy: { paidAt: 'desc' }, take: 200 }),
  ]);
  const today = istToday();
  const billDtos = bills.map(b => billDto(b, today));
  const open = billDtos.filter(b => b.status === 'OPEN');
  const advances = payments.filter(p => !p.billId);
  return {
    vendor: { id: vendor.id, name: vendor.name },
    bills: billDtos, payments: payments.map(paymentDto),
    outstanding: toRupees(sumPaise(open.map(b => toPaise(b.outstanding)))),
    overdue: toRupees(sumPaise(open.filter(b => b.daysOverdue > 0).map(b => toPaise(b.outstanding)))),
    unappliedAdvances: toRupees(sumPaise(advances.map(p => toPaise(Number(p.amount))))),
  };
}
