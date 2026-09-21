// ============================================================
// Expenses: money spent directly rather than against a supplier bill —
// fuel, tolls, food on the road, tips, office costs. Each one posts to its
// expense account and to wherever the money came from. When a staff member
// paid from their own pocket, the money is owed back to them ("Staff
// reimbursements") until it is settled.
//
// Cancelling reverses the posting and keeps the row, as everywhere else.
// ============================================================

import { Prisma } from '@prisma/client';
import { prisma, type DbClient } from '../../lib/prisma.js';
import { audit } from '../../core/audit.js';
import { AppError, notFound, stateConflict } from '../../core/errors.js';
import { nextDisplayId } from '../../core/numbering.js';
import { sumPaise, toPaise, toRupees } from '../../../../src/shared/calc/money.js';
import { MONEY_ACCOUNT } from '../../../../src/shared/calc/ledger.js';
import {
  EXPENSE_CATEGORY_ACCOUNT, EXPENSE_CATEGORY_LABEL, PAID_BY_LABEL,
  type ExpenseCategory, type ExpenseInput, type ExpenseListQuery, type PaidBy, type ReimburseInput,
} from '../../../../src/shared/contracts/expenses.js';
import { dayDate, isoDay, page } from '../masters/common.js';
import { postEntry, reverseEntry } from '../ledger/service.js';
import { tripChanged } from '../operations/hooks.js';

const INPUT_GST = '1300';
const STAFF_OWED = '2400';

const INCLUDE = {
  trip: { select: { id: true, tourName: true, destination: true } },
  vendor: { select: { id: true, name: true } },
  paidByUser: { select: { id: true, name: true } },
} satisfies Prisma.ExpenseInclude;
type Row = Prisma.ExpenseGetPayload<{ include: typeof INCLUDE }>;

function expenseDto(e: Row) {
  return {
    id: e.id, date: isoDay(e.date)!, category: e.category, categoryLabel: EXPENSE_CATEGORY_LABEL[e.category as ExpenseCategory] ?? e.category,
    amount: Number(e.amount), gstAmount: Number(e.gstAmount), paidBy: e.paidBy, paidByLabel: PAID_BY_LABEL[e.paidBy as PaidBy] ?? e.paidBy,
    paidByUserId: e.paidByUserId, paidByUser: e.paidByUser, tripId: e.tripId, trip: e.trip ? { id: e.trip.id, label: e.trip.tourName ?? e.trip.destination } : null,
    contractId: e.contractId, vendorId: e.vendorId, vendor: e.vendor, description: e.description, notes: e.notes, documentId: e.documentId,
    status: e.status, ledgerTransactionId: e.ledgerTransactionId, cancelledAt: e.cancelledAt?.toISOString() ?? null, cancelReason: e.cancelReason,
    createdAt: e.createdAt.toISOString(), createdById: e.createdById,
  };
}
export type ExpenseDto = ReturnType<typeof expenseDto>;

export async function createExpense(input: ExpenseInput, actorId?: string | null) {
  const id = await prisma.$transaction(async tx => {
    if (input.tripId && !(await tx.trip.findUnique({ where: { id: input.tripId }, select: { id: true } }))) throw new AppError('VALIDATION_ERROR', 400, 'Trip not found', { tripId: 'Unknown trip' });
    if (input.vendorId && !(await tx.vendor.findUnique({ where: { id: input.vendorId }, select: { id: true } }))) throw new AppError('VALIDATION_ERROR', 400, 'Supplier not found', { vendorId: 'Unknown supplier' });
    const payer = input.paidByUserId ? await tx.user.findUnique({ where: { id: input.paidByUserId }, select: { id: true, name: true, isActive: true } }) : null;
    if (input.paidByUserId && !payer) throw new AppError('VALIDATION_ERROR', 400, 'Choose who paid', { paidByUserId: 'Unknown user' });

    const expenseId = await nextDisplayId(tx, 'EXP', { displayPrefix: 'EXP' });
    const net = toRupees(toPaise(input.amount) - toPaise(input.gstAmount));
    const moneyCode = input.paidBy === 'STAFF' ? STAFF_OWED : MONEY_ACCOUNT[input.paidBy];
    const entry = await postEntry(tx, {
      date: input.date,
      narration: `${expenseId}: ${input.description}${input.tripId ? ` · ${input.tripId}` : ''}${input.paidBy === 'STAFF' ? ` · paid by ${payer?.name ?? 'staff'}` : ''}`,
      sourceType: 'expense', sourceId: expenseId, tripId: input.tripId, contractId: input.contractId, vendorId: input.vendorId,
      lines: [
        { code: EXPENSE_CATEGORY_ACCOUNT[input.category], debit: net, description: input.description },
        ...(input.gstAmount > 0 ? [{ code: INPUT_GST, debit: input.gstAmount, description: 'GST on the bill — verify with CA' }] : []),
        { code: moneyCode, credit: input.amount, description: PAID_BY_LABEL[input.paidBy] },
      ],
    }, actorId);

    await tx.expense.create({
      data: {
        id: expenseId, date: dayDate(input.date)!, category: input.category, amount: input.amount, gstAmount: input.gstAmount,
        paidBy: input.paidBy, paidByUserId: payer?.id ?? null, tripId: input.tripId, contractId: input.contractId, vendorId: input.vendorId,
        description: input.description, notes: input.notes, documentId: input.documentId, ledgerTransactionId: entry.id, createdById: actorId ?? null,
      },
    });
    if (input.documentId) {
      await tx.documentLink.create({ data: { documentId: input.documentId, entityType: 'expense', entityId: expenseId, role: 'receipt' } }).catch(() => undefined);
    }
    await audit(tx, {
      action: 'expense_recorded', entityType: input.tripId ? 'trip' : 'expense', entityId: input.tripId ?? expenseId, userId: actorId,
      description: `${expenseId}: ₹${input.amount.toLocaleString('en-IN')} — ${input.description} (${EXPENSE_CATEGORY_LABEL[input.category]}, ${PAID_BY_LABEL[input.paidBy]})`,
      after: { expenseId, amount: input.amount, category: input.category, paidBy: input.paidBy, tripId: input.tripId ?? null },
    });
    await tripChanged(tx, input.tripId, 'expense', actorId);
    return expenseId;
  });
  return getExpense(id);
}

export async function cancelExpense(id: string, reason: string, actorId?: string | null) {
  const ledgerId = await prisma.$transaction(async tx => {
    const e = await tx.expense.findUnique({ where: { id } });
    if (!e) throw notFound('Expense');
    if (e.status === 'CANCELLED') throw stateConflict(`${id} was already cancelled`);
    await tx.expense.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason } });
    await audit(tx, { action: 'expense_cancelled', entityType: e.tripId ? 'trip' : 'expense', entityId: e.tripId ?? id, userId: actorId, description: `${id} cancelled: ${reason}`, before: { amount: Number(e.amount) }, after: { status: 'CANCELLED', reason } });
    await tripChanged(tx, e.tripId, 'expense_cancelled', actorId);
    return e.ledgerTransactionId;
  });
  if (ledgerId) await reverseEntry(ledgerId, `Expense ${id} cancelled: ${reason}`, actorId);
  return getExpense(id);
}

export async function getExpense(id: string) {
  const e = await prisma.expense.findUnique({ where: { id }, include: INCLUDE });
  if (!e) throw notFound('Expense');
  return expenseDto(e);
}

export async function listExpenses(q: ExpenseListQuery) {
  const where: Prisma.ExpenseWhereInput = {
    ...(q.includeCancelled ? {} : { status: 'POSTED' }),
    ...(q.tripId ? { tripId: q.tripId } : {}),
    ...(q.category ? { category: q.category } : {}),
    ...(q.paidBy ? { paidBy: q.paidBy } : {}),
    ...(q.paidByUserId ? { paidByUserId: q.paidByUserId } : {}),
    ...(q.from || q.to ? { date: { ...(q.from ? { gte: dayDate(q.from)! } : {}), ...(q.to ? { lte: dayDate(q.to)! } : {}) } } : {}),
    ...(q.q ? { OR: [{ id: { contains: q.q, mode: 'insensitive' } }, { description: { contains: q.q, mode: 'insensitive' } }, { notes: { contains: q.q, mode: 'insensitive' } }] } : {}),
  };
  const [rows, total, byCategory] = await Promise.all([
    prisma.expense.findMany({ where, include: INCLUDE, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.expense.count({ where }),
    prisma.expense.groupBy({ by: ['category'], where: { ...where, status: 'POSTED' }, _sum: { amount: true } }),
  ]);
  const cats = byCategory.map(c => ({ category: c.category, label: EXPENSE_CATEGORY_LABEL[c.category as ExpenseCategory] ?? c.category, amount: Number(c._sum.amount ?? 0) })).sort((a, b) => b.amount - a.amount);
  return { ...page(rows.map(expenseDto), total, q), byCategory: cats, total_spent: toRupees(sumPaise(cats.map(c => toPaise(c.amount)))) };
}

/** What each staff member is owed for money they put in themselves. */
export async function reimbursementsOwed(db: DbClient = prisma) {
  const spent = await db.expense.groupBy({ by: ['paidByUserId'], where: { status: 'POSTED', paidBy: 'STAFF', paidByUserId: { not: null } }, _sum: { amount: true } });
  const settled = await db.staffReimbursement.groupBy({ by: ['userId'], where: { status: 'POSTED' }, _sum: { amount: true } });
  const paid = new Map(settled.map(s => [s.userId, toPaise(Number(s._sum.amount ?? 0))]));
  const users = await db.user.findMany({ where: { id: { in: spent.map(s => s.paidByUserId!) } }, select: { id: true, name: true } });
  const names = new Map(users.map(u => [u.id, u.name]));
  return spent
    .map(s => ({ userId: s.paidByUserId!, name: names.get(s.paidByUserId!) ?? s.paidByUserId!, owedPaise: toPaise(Number(s._sum.amount ?? 0)) - (paid.get(s.paidByUserId!) ?? 0) }))
    .filter(r => r.owedPaise !== 0)
    .map(r => ({ userId: r.userId, name: r.name, owed: toRupees(r.owedPaise) }))
    .sort((a, b) => b.owed - a.owed);
}

/** Pays a staff member back what they spent. */
export async function reimburse(input: ReimburseInput, actorId?: string | null) {
  const id = await prisma.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { id: input.userId }, select: { id: true, name: true } });
    if (!user) throw new AppError('VALIDATION_ERROR', 400, 'Choose who is being paid back', { userId: 'Unknown user' });
    const owed = (await reimbursementsOwed(tx)).find(r => r.userId === input.userId)?.owed ?? 0;
    if (toPaise(input.amount) > toPaise(owed)) throw new AppError('VALIDATION_ERROR', 400, `${user.name} is owed ₹${owed.toLocaleString('en-IN')}; a reimbursement cannot be more`, { amount: 'More than what is owed' });

    const rid = await nextDisplayId(tx, 'REM', { displayPrefix: 'REM' });
    const entry = await postEntry(tx, {
      date: input.paidAt, narration: `${rid}: reimbursed ${user.name}${input.reference ? ` · ${input.reference}` : ''}`, sourceType: 'reimbursement', sourceId: rid,
      lines: [{ code: STAFF_OWED, debit: input.amount, description: `Paid back to ${user.name}` }, { code: MONEY_ACCOUNT[input.mode], credit: input.amount, description: input.mode.toLowerCase().replace('_', ' ') }],
    }, actorId);
    await tx.staffReimbursement.create({ data: { id: rid, userId: user.id, amount: input.amount, mode: input.mode, paidAt: dayDate(input.paidAt)!, reference: input.reference, ledgerTransactionId: entry.id, createdById: actorId ?? null } });
    await audit(tx, { action: 'staff_reimbursed', entityType: 'user', entityId: user.id, userId: actorId, description: `${rid}: ₹${input.amount.toLocaleString('en-IN')} paid back to ${user.name} on ${input.paidAt}`, after: { reimbursementId: rid, amount: input.amount } });
    return rid;
  });
  return { id, owed: await reimbursementsOwed() };
}
