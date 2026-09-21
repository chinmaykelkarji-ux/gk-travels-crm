// ============================================================
// Customer receipts and refunds. A receipt belongs to the family party
// (booking contract) that paid where there is one, so several families on
// one tour keep separate balances; money paid for the whole tour is held
// against the trip.
//
// Every receipt posts to the ledger in the same transaction: money in
// (cash / bank / gateway) against customer advances. Cancelling a receipt
// never deletes it — the posting is reversed and the row is marked.
// ============================================================

import { Prisma } from '@prisma/client';
import { prisma, type DbClient } from '../../lib/prisma.js';
import { audit } from '../../core/audit.js';
import { AppError, notFound, stateConflict } from '../../core/errors.js';
import { nextFreeDisplayId } from '../../core/numbering.js';
import { istToday } from '../../../../src/shared/calc/istTime.js';
import { sumPaise, toPaise, toRupees } from '../../../../src/shared/calc/money.js';
import { RECEIPT_MODE_LABEL, type ReceiptInput, type ReceiptListQuery, type ReceiptMode } from '../../../../src/shared/contracts/receipts.js';
import { dayDate, isoDay, page } from '../masters/common.js';
import { postEntry } from '../ledger/service.js';
import { reverseEntry } from '../ledger/service.js';
import { tripChanged } from '../operations/hooks.js';

/** Where the money landed. Card and payment-link money sits with the gateway until it settles. */
const MONEY_ACCOUNT: Record<ReceiptMode, string> = {
  CASH: '1000', UPI: '1010', BANK_TRANSFER: '1010', CHEQUE: '1010', CARD: '1020', GATEWAY: '1020', OTHER: '1030',
};
const ADVANCES = '2100';
const RECEIVABLE = '1100';

const INCLUDE = {
  contract: { select: { id: true, contractNumber: true, partyName: true, tripId: true, customerId: true, totalAmount: true } },
  trip: { select: { id: true, tourName: true, destination: true } },
  customer: { select: { id: true, name: true, phone: true } },
} satisfies Prisma.CustomerReceiptInclude;
type Row = Prisma.CustomerReceiptGetPayload<{ include: typeof INCLUDE }>;

function receiptDto(r: Row) {
  return {
    id: r.id, kind: r.kind, status: r.status, amount: Number(r.amount), mode: r.mode, modeLabel: RECEIPT_MODE_LABEL[r.mode as ReceiptMode] ?? r.mode,
    receivedAt: isoDay(r.receivedAt)!, reference: r.reference, notes: r.notes,
    contractId: r.contractId, contract: r.contract ? { id: r.contract.id, contractNumber: r.contract.contractNumber, partyName: r.contract.partyName } : null,
    tripId: r.tripId, trip: r.trip ? { id: r.trip.id, label: r.trip.tourName ?? r.trip.destination } : null,
    customerId: r.customerId, customer: r.customer ? { id: r.customer.id, name: r.customer.name, phone: r.customer.phone } : null,
    ledgerTransactionId: r.ledgerTransactionId, cancelledAt: r.cancelledAt?.toISOString() ?? null, cancelReason: r.cancelReason,
    legacyPaymentId: r.legacyPaymentId, createdAt: r.createdAt.toISOString(), createdById: r.createdById,
  };
}
export type ReceiptDto = ReturnType<typeof receiptDto>;

/** Net money received (receipts minus refunds) per contract and for the trip as a whole. */
export async function receivedTotals(db: DbClient, where: { tripId?: string; contractIds?: string[] }) {
  const rows = await db.customerReceipt.findMany({
    where: { status: 'POSTED', ...(where.tripId ? { OR: [{ tripId: where.tripId }, { contract: { tripId: where.tripId } }] } : {}), ...(where.contractIds ? { contractId: { in: where.contractIds } } : {}) },
    select: { kind: true, amount: true, contractId: true, tripId: true },
  });
  const signed = (r: { kind: string; amount: Prisma.Decimal }) => (r.kind === 'REFUND' ? -toPaise(Number(r.amount)) : toPaise(Number(r.amount)));
  const byContract = new Map<string, number>();
  let tripTotal = 0;
  for (const r of rows) {
    tripTotal += signed(r);
    if (r.contractId) byContract.set(r.contractId, (byContract.get(r.contractId) ?? 0) + signed(r));
  }
  return { tripPaise: tripTotal, byContractPaise: byContract };
}

export async function receivedForContract(db: DbClient, contractId: string): Promise<number> {
  const t = await receivedTotals(db, { contractIds: [contractId] });
  return toRupees(t.byContractPaise.get(contractId) ?? 0);
}

/** Keeps the trip's cached money columns (used by the classic screens) in step with the receipts. */
export async function refreshTripMoney(db: DbClient, tripId: string | null | undefined) {
  if (!tripId) return;
  const trip = await db.trip.findUnique({ where: { id: tripId }, select: { totalAmount: true, totalPayable: true } });
  if (!trip) return;
  const { tripPaise } = await receivedTotals(db, { tripId });
  const payable = toPaise(Number(trip.totalPayable ?? trip.totalAmount ?? 0));
  await db.trip.update({ where: { id: tripId }, data: { paidAmount: toRupees(tripPaise), balanceDue: toRupees(Math.max(0, payable - tripPaise)) } });
}

async function resolveRefs(db: DbClient, input: ReceiptInput) {
  let { contractId, tripId, customerId } = input;
  if (contractId) {
    const c = await db.bookingContract.findUnique({ where: { id: contractId }, select: { id: true, tripId: true, customerId: true, status: true, contractNumber: true } });
    if (!c) throw new AppError('VALIDATION_ERROR', 400, 'Booking not found', { contractId: 'Unknown booking' });
    if (tripId && tripId !== c.tripId) throw new AppError('VALIDATION_ERROR', 400, 'That booking belongs to another trip', { tripId: 'Does not match the booking' });
    tripId = c.tripId; customerId = customerId ?? c.customerId;
  } else if (tripId) {
    const t = await db.trip.findUnique({ where: { id: tripId }, select: { id: true, customerId: true } });
    if (!t) throw new AppError('VALIDATION_ERROR', 400, 'Trip not found', { tripId: 'Unknown trip' });
    customerId = customerId ?? t.customerId;
  }
  if (customerId && !(await db.customer.findUnique({ where: { id: customerId }, select: { id: true } }))) {
    throw new AppError('VALIDATION_ERROR', 400, 'Customer not found', { customerId: 'Unknown customer' });
  }
  return { contractId, tripId, customerId };
}

/** What is still owed on invoices already issued to this customer (or trip). */
async function openDuesPaise(db: DbClient, refs: { tripId?: string | null; customerId?: string | null }): Promise<number> {
  const where: Prisma.LedgerLineWhereInput = {
    accountCode: RECEIVABLE,
    ...(refs.tripId ? { OR: [{ tripId: refs.tripId }, { transaction: { tripId: refs.tripId } }] } : refs.customerId ? { OR: [{ customerId: refs.customerId }, { transaction: { customerId: refs.customerId } }] } : { id: '__none__' }),
  };
  const sums = await db.ledgerLine.aggregate({ where, _sum: { debit: true, credit: true } });
  return Math.max(0, toPaise(Number(sums._sum.debit ?? 0)) - toPaise(Number(sums._sum.credit ?? 0)));
}

export async function createReceipt(input: ReceiptInput, actorId?: string | null) {
  const id = await prisma.$transaction(async tx => {
    const refs = await resolveRefs(tx, input);
    const amountPaise = toPaise(input.amount);

    if (input.kind === 'REFUND') {
      const totals = await receivedTotals(tx, refs.contractId ? { contractIds: [refs.contractId] } : { tripId: refs.tripId ?? undefined });
      const held = refs.contractId ? (totals.byContractPaise.get(refs.contractId) ?? 0) : totals.tripPaise;
      if (amountPaise > held) throw new AppError('VALIDATION_ERROR', 400, `Only ${toRupees(held).toLocaleString('en-IN')} was received${refs.contractId ? ' for this booking' : ' for this trip'}; a refund cannot be more`, { amount: 'More than what was received' });
    }

    const receiptId = await nextFreeDisplayId(tx, 'RCP');
    const who = refs.customerId ? await tx.customer.findUnique({ where: { id: refs.customerId }, select: { name: true } }) : null;
    const label = `${input.kind === 'REFUND' ? 'Refund to' : 'Received from'} ${who?.name ?? 'customer'}${refs.contractId ? ` (${refs.contractId})` : refs.tripId ? ` (${refs.tripId})` : ''}`;
    const money = MONEY_ACCOUNT[input.mode];
    // Money pays off invoices already issued first; whatever is left is an advance.
    const duesPaise = input.kind === 'REFUND' ? 0 : await openDuesPaise(tx, refs);
    const againstDues = toRupees(Math.min(duesPaise, amountPaise));
    const asAdvance = toRupees(amountPaise - toPaise(againstDues));
    const lines = input.kind === 'REFUND'
      ? [{ code: ADVANCES, debit: input.amount, description: label }, { code: money, credit: input.amount, description: RECEIPT_MODE_LABEL[input.mode] }]
      : [
          { code: money, debit: input.amount, description: RECEIPT_MODE_LABEL[input.mode] },
          ...(againstDues > 0 ? [{ code: RECEIVABLE, credit: againstDues, description: `${label} · against what is owed` }] : []),
          ...(asAdvance > 0 ? [{ code: ADVANCES, credit: asAdvance, description: label }] : []),
        ];
    const entry = await postEntry(tx, {
      date: input.receivedAt, narration: `${receiptId}: ${label}${input.reference ? ` · ${input.reference}` : ''}`,
      sourceType: input.kind === 'REFUND' ? 'refund' : 'receipt', sourceId: receiptId, ...refs, lines,
    }, actorId);

    await tx.customerReceipt.create({
      data: {
        id: receiptId, kind: input.kind, amount: input.amount, mode: input.mode, receivedAt: dayDate(input.receivedAt)!,
        reference: input.reference, notes: input.notes, ...refs, ledgerTransactionId: entry.id, createdById: actorId ?? null,
      },
    });
    await audit(tx, {
      action: input.kind === 'REFUND' ? 'refund_paid' : 'receipt_recorded', entityType: refs.contractId ? 'contract' : refs.tripId ? 'trip' : 'customer',
      entityId: refs.contractId ?? refs.tripId ?? refs.customerId!, userId: actorId,
      description: `${receiptId}: ${label} — ₹${input.amount.toLocaleString('en-IN')} by ${RECEIPT_MODE_LABEL[input.mode]} on ${input.receivedAt}`,
      after: { receiptId, amount: input.amount, mode: input.mode, kind: input.kind, reference: input.reference },
    });
    await refreshTripMoney(tx, refs.tripId);
    await tripChanged(tx, refs.tripId, 'receipt', actorId);
    return receiptId;
  });
  return getReceipt(id);
}

export async function cancelReceipt(id: string, reason: string, actorId?: string | null) {
  await prisma.$transaction(async tx => {
    const r = await tx.customerReceipt.findUnique({ where: { id } });
    if (!r) throw notFound('Receipt');
    if (r.status === 'CANCELLED') throw stateConflict(`${id} was already cancelled`);
    await tx.customerReceipt.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason } });
    await audit(tx, {
      action: 'receipt_cancelled', entityType: r.contractId ? 'contract' : r.tripId ? 'trip' : 'customer', entityId: r.contractId ?? r.tripId ?? r.customerId!,
      userId: actorId, description: `${id} cancelled: ${reason}`, before: { status: r.status, amount: Number(r.amount) }, after: { status: 'CANCELLED', reason },
    });
    await refreshTripMoney(tx, r.tripId);
    await tripChanged(tx, r.tripId, 'receipt_cancelled', actorId);
  });
  // The ledger posting is reversed in its own transaction so the reversal keeps its own journal number.
  const r = await prisma.customerReceipt.findUniqueOrThrow({ where: { id }, select: { ledgerTransactionId: true } });
  if (r.ledgerTransactionId) await reverseEntry(r.ledgerTransactionId, `Receipt ${id} cancelled: ${reason}`, actorId);
  return getReceipt(id);
}

export async function getReceipt(id: string) {
  const r = await prisma.customerReceipt.findUnique({ where: { id }, include: INCLUDE });
  if (!r) throw notFound('Receipt');
  return receiptDto(r);
}

export async function listReceipts(q: ReceiptListQuery) {
  const where: Prisma.CustomerReceiptWhereInput = {
    ...(q.includeCancelled ? {} : { status: 'POSTED' }),
    ...(q.contractId ? { contractId: q.contractId } : {}),
    ...(q.tripId ? { OR: [{ tripId: q.tripId }, { contract: { tripId: q.tripId } }] } : {}),
    ...(q.customerId ? { customerId: q.customerId } : {}),
    ...(q.kind ? { kind: q.kind } : {}),
    ...(q.mode ? { mode: q.mode } : {}),
    ...(q.from || q.to ? { receivedAt: { ...(q.from ? { gte: dayDate(q.from)! } : {}), ...(q.to ? { lte: dayDate(q.to)! } : {}) } } : {}),
    ...(q.q ? { OR: [{ id: { contains: q.q, mode: 'insensitive' } }, { reference: { contains: q.q, mode: 'insensitive' } }, { notes: { contains: q.q, mode: 'insensitive' } }] } : {}),
  };
  const [rows, total, sums] = await Promise.all([
    prisma.customerReceipt.findMany({ where, include: INCLUDE, orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.customerReceipt.count({ where }),
    prisma.customerReceipt.groupBy({ by: ['kind'], where, _sum: { amount: true } }),
  ]);
  const paise = (kind: string) => toPaise(Number(sums.find(s => s.kind === kind)?._sum.amount ?? 0));
  return {
    ...page(rows.map(receiptDto), total, q),
    totals: { received: toRupees(paise('RECEIPT')), refunded: toRupees(paise('REFUND')), net: toRupees(sumPaise([paise('RECEIPT'), -paise('REFUND')])) },
  };
}

/** Today's collections, for the finance dashboard and the day's cash count. */
export async function dayBook(day = istToday()) {
  const rows = await prisma.customerReceipt.findMany({ where: { status: 'POSTED', receivedAt: dayDate(day)! }, include: INCLUDE, orderBy: { createdAt: 'asc' } });
  const byMode = new Map<string, number>();
  for (const r of rows) {
    const p = toPaise(Number(r.amount)) * (r.kind === 'REFUND' ? -1 : 1);
    byMode.set(r.mode, (byMode.get(r.mode) ?? 0) + p);
  }
  return {
    day,
    receipts: rows.map(receiptDto),
    byMode: [...byMode.entries()].map(([mode, p]) => ({ mode, label: RECEIPT_MODE_LABEL[mode as ReceiptMode] ?? mode, amount: toRupees(p) })),
    total: toRupees(sumPaise([...byMode.values()])),
  };
}
