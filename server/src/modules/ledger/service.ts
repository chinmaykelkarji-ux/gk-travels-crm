// ============================================================
// Ledger: the books. Other finance modules (receipts, supplier bills,
// expenses, invoices) post through `postEntry` inside their own
// transaction, so the money movement and the record that caused it are
// saved together or not at all.
//
// Rules enforced here: lines must balance to the paisa, accounts must
// exist and be active, and nothing posted is ever edited or deleted — a
// mistake is corrected by `reverseEntry`, which mirrors the original.
// ============================================================

import { Prisma } from '@prisma/client';
import { prisma, type DbClient } from '../../lib/prisma.js';
import { audit } from '../../core/audit.js';
import { AppError, notFound, stateConflict } from '../../core/errors.js';
import { nextDisplayId } from '../../core/numbering.js';
import { getContext } from '../../core/requestContext.js';
import { toPaise, toRupees } from '../../../../src/shared/calc/money.js';
import { ACCOUNTS, ACCOUNT_BY_CODE, checkLines, reverseLines, trialBalance, withRunningBalance, type AccountType, type PostingLine } from '../../../../src/shared/calc/ledger.js';
import { dayDate, isoDay, page } from '../masters/common.js';
import type { LedgerEntriesQuery, LedgerPeriodQuery, ManualEntry } from '../../../../src/shared/contracts/ledger.js';

export interface PostingRef { tripId?: string | null; contractId?: string | null; customerId?: string | null; vendorId?: string | null }
export interface PostingInput extends PostingRef {
  date: string;
  narration: string;
  sourceType: string;
  sourceId?: string | null;
  lines: (PostingLine & PostingRef)[];
}

/** Seeds the chart of accounts; safe to call repeatedly. */
export async function ensureAccounts(db: DbClient = prisma) {
  await db.ledgerAccount.createMany({
    data: ACCOUNTS.map(a => ({ code: a.code, name: a.name, type: a.type as AccountType, group: a.group, description: a.description, isSystem: true })),
    skipDuplicates: true,
  });
  return db.ledgerAccount.findMany({ orderBy: { code: 'asc' } });
}

async function accountsByCode(db: DbClient, codes: string[]) {
  const wanted = [...new Set(codes)];
  const find = () => db.ledgerAccount.findMany({ where: { code: { in: wanted } }, select: { id: true, code: true, isActive: true } });
  let rows = await find();
  // First posting in a fresh organisation (or a newly added account code): seed and look again.
  if (rows.length < wanted.length && wanted.some(c => ACCOUNT_BY_CODE.has(c) && !rows.some(r => r.code === c))) {
    await ensureAccounts(db);
    rows = await find();
  }
  return new Map(rows.map(r => [r.code, r]));
}

/**
 * Writes one balanced transaction. Call inside the caller's transaction so
 * the posting and its source record live or die together.
 */
export async function postEntry(db: DbClient, input: PostingInput, actorId?: string | null) {
  const accounts = await accountsByCode(db, input.lines.map(l => l.code));
  const check = checkLines(input.lines, new Set(accounts.keys()));
  if (!check.ok) throw new AppError('VALIDATION_ERROR', 400, check.errors[0], Object.fromEntries(check.errors.map((e, i) => [`line${i}`, e])));
  const inactive = input.lines.filter(l => accounts.get(l.code)?.isActive === false).map(l => l.code);
  if (inactive.length) throw new AppError('VALIDATION_ERROR', 400, `Account ${inactive[0]} is closed`, { lines: `Account ${inactive[0]} is closed` });

  const displayNumber = await nextDisplayId(db, 'JV');
  const txn = await db.ledgerTransaction.create({
    data: {
      displayNumber, date: dayDate(input.date)!, narration: input.narration, sourceType: input.sourceType, sourceId: input.sourceId ?? null,
      tripId: input.tripId ?? null, contractId: input.contractId ?? null, customerId: input.customerId ?? null, vendorId: input.vendorId ?? null,
      createdById: actorId ?? null, source: getContext()?.source ?? 'SYSTEM',
    },
  });
  await db.ledgerLine.createMany({
    data: input.lines.map((l, i) => ({
      transactionId: txn.id, accountId: accounts.get(l.code)!.id, accountCode: l.code, seq: i,
      debit: toRupees(toPaise(l.debit ?? 0)), credit: toRupees(toPaise(l.credit ?? 0)), description: l.description ?? null,
      tripId: l.tripId ?? input.tripId ?? null, contractId: l.contractId ?? input.contractId ?? null, customerId: l.customerId ?? input.customerId ?? null, vendorId: l.vendorId ?? input.vendorId ?? null,
    })),
  });
  await audit(db, {
    action: 'ledger_posted', entityType: 'ledger', entityId: txn.id, userId: actorId,
    description: `${displayNumber}: ${input.narration} (${(check.debitPaise / 100).toFixed(2)})`,
    after: { displayNumber, date: input.date, sourceType: input.sourceType, sourceId: input.sourceId ?? null, lines: input.lines.map(l => ({ code: l.code, debit: l.debit ?? 0, credit: l.credit ?? 0 })) },
  });
  return txn;
}

const LINES = { lines: { orderBy: { seq: 'asc' }, select: { id: true, accountCode: true, debit: true, credit: true, description: true, tripId: true, contractId: true, customerId: true, vendorId: true } } } satisfies Prisma.LedgerTransactionInclude;
type Row = Prisma.LedgerTransactionGetPayload<{ include: typeof LINES }>;

function entryDto(t: Row & { reversedBy?: { id: string; displayNumber: string } | null; reversalOf?: { id: string; displayNumber: string } | null }) {
  return {
    id: t.id, displayNumber: t.displayNumber, date: isoDay(t.date)!, narration: t.narration, sourceType: t.sourceType, sourceId: t.sourceId,
    tripId: t.tripId, contractId: t.contractId, customerId: t.customerId, vendorId: t.vendorId, source: t.source,
    postedAt: t.postedAt.toISOString(), createdById: t.createdById,
    reversalOf: t.reversalOf ? { id: t.reversalOf.id, displayNumber: t.reversalOf.displayNumber } : null,
    reversedBy: t.reversedBy ? { id: t.reversedBy.id, displayNumber: t.reversedBy.displayNumber } : null,
    reversalReason: t.reversalReason,
    amount: Number(t.lines.reduce((s, l) => s + Number(l.debit), 0).toFixed(2)),
    lines: t.lines.map(l => ({ id: l.id, code: l.accountCode, debit: Number(l.debit), credit: Number(l.credit), description: l.description, tripId: l.tripId, contractId: l.contractId, customerId: l.customerId, vendorId: l.vendorId })),
  };
}
export type LedgerEntryDto = ReturnType<typeof entryDto>;

export async function getEntry(id: string) {
  const t = await prisma.ledgerTransaction.findUnique({ where: { id }, include: { ...LINES, reversedBy: { select: { id: true, displayNumber: true } }, reversalOf: { select: { id: true, displayNumber: true } } } });
  if (!t) throw notFound('Journal entry');
  return entryDto(t);
}

/** A journal entry typed by a person (opening balances, corrections, office costs paid in cash). */
export async function createManualEntry(input: ManualEntry, actorId?: string | null) {
  const id = await prisma.$transaction(async tx => {
    const t = await postEntry(tx, { ...input, sourceType: 'manual', sourceId: null }, actorId);
    return t.id;
  });
  return getEntry(id);
}

export async function reverseEntry(id: string, reason: string, actorId?: string | null) {
  const reversalId = await prisma.$transaction(async tx => {
    const original = await tx.ledgerTransaction.findUnique({ where: { id }, include: { ...LINES, reversedBy: { select: { id: true, displayNumber: true } } } });
    if (!original) throw notFound('Journal entry');
    if (original.reversedBy) throw stateConflict(`${original.displayNumber} was already reversed by ${original.reversedBy.displayNumber}`);
    if (original.reversalOfId) throw stateConflict('A reversal cannot itself be reversed; post a fresh entry instead');
    const lines = reverseLines(original.lines.map(l => ({ code: l.accountCode, debit: Number(l.debit), credit: Number(l.credit), description: l.description, tripId: l.tripId, contractId: l.contractId, customerId: l.customerId, vendorId: l.vendorId })));
    const txn = await postEntry(tx, {
      date: isoDay(original.date)!, narration: `Reversal of ${original.displayNumber}: ${reason}`, sourceType: 'reversal', sourceId: original.id,
      tripId: original.tripId, contractId: original.contractId, customerId: original.customerId, vendorId: original.vendorId, lines,
    }, actorId);
    await tx.ledgerTransaction.update({ where: { id: txn.id }, data: { reversalOfId: original.id, reversalReason: reason } });
    await audit(tx, {
      action: 'ledger_reversed', entityType: 'ledger', entityId: original.id, userId: actorId,
      description: `${original.displayNumber} reversed by ${txn.displayNumber}: ${reason}`, before: { displayNumber: original.displayNumber }, after: { reversalNumber: txn.displayNumber, reason },
    });
    return txn.id;
  });
  return getEntry(reversalId);
}

// ── Reads ─────────────────────────────────────────────────────

function periodWhere(q: { from?: string; to?: string }): Prisma.LedgerTransactionWhereInput {
  const date: Prisma.DateTimeFilter = {};
  if (q.from) date.gte = dayDate(q.from)!;
  if (q.to) date.lte = dayDate(q.to)!;
  return Object.keys(date).length ? { date } : {};
}

export async function listEntries(q: LedgerEntriesQuery) {
  const where: Prisma.LedgerTransactionWhereInput = {
    ...periodWhere(q),
    ...(q.tripId ? { tripId: q.tripId } : {}),
    ...(q.contractId ? { contractId: q.contractId } : {}),
    ...(q.customerId ? { customerId: q.customerId } : {}),
    ...(q.vendorId ? { vendorId: q.vendorId } : {}),
    ...(q.sourceType ? { sourceType: q.sourceType } : {}),
    ...(q.code ? { lines: { some: { accountCode: q.code } } } : {}),
    ...(q.q ? { OR: [{ narration: { contains: q.q, mode: 'insensitive' } }, { displayNumber: { contains: q.q, mode: 'insensitive' } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.ledgerTransaction.findMany({ where, include: { ...LINES, reversedBy: { select: { id: true, displayNumber: true } }, reversalOf: { select: { id: true, displayNumber: true } } }, orderBy: [{ date: 'desc' }, { postedAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.ledgerTransaction.count({ where }),
  ]);
  return page(rows.map(entryDto), total, q);
}

async function totalsByAccount(where: Prisma.LedgerLineWhereInput) {
  const rows = await prisma.ledgerLine.groupBy({ by: ['accountCode'], where, _sum: { debit: true, credit: true } });
  return rows.map(r => ({ code: r.accountCode, debitPaise: toPaise(Number(r._sum.debit ?? 0)), creditPaise: toPaise(Number(r._sum.credit ?? 0)) }));
}

/** Trial balance for a period: every account's debits, credits and balance, and the difference (zero in healthy books). */
export async function trialBalanceFor(q: LedgerPeriodQuery) {
  const rows = await totalsByAccount({ transaction: periodWhere(q) });
  const tb = trialBalance(rows);
  return {
    from: q.from ?? null, to: q.to ?? null,
    accounts: tb.accounts.map(a => ({ ...a, debit: toRupees(a.debitPaise), credit: toRupees(a.creditPaise), balance: toRupees(a.balancePaise) })),
    totalDebit: toRupees(tb.totalDebitPaise), totalCredit: toRupees(tb.totalCreditPaise), difference: toRupees(tb.differencePaise),
    byType: Object.fromEntries(Object.entries(tb.byType).map(([k, v]) => [k, toRupees(v)])) as Record<AccountType, number>,
  };
}

/** One account's movements with a running balance, after its opening balance. */
export async function accountStatement(code: string, q: LedgerPeriodQuery) {
  const account = await prisma.ledgerAccount.findFirst({ where: { code } });
  if (!account) throw notFound('Account');
  const opening = q.from ? (await totalsByAccount({ accountCode: code, transaction: { date: { lt: dayDate(q.from)! } } }))[0] : undefined;
  const openingPaise = opening ? (account.type === 'ASSET' || account.type === 'EXPENSE' ? opening.debitPaise - opening.creditPaise : opening.creditPaise - opening.debitPaise) : 0;
  const lines = await prisma.ledgerLine.findMany({
    where: { accountCode: code, transaction: periodWhere(q) },
    include: { transaction: { select: { id: true, displayNumber: true, date: true, narration: true, sourceType: true, tripId: true, contractId: true } } },
    orderBy: [{ transaction: { date: 'asc' } }, { transaction: { postedAt: 'asc' } }, { seq: 'asc' }],
    take: 2000,
  });
  const rows = withRunningBalance(account.type as AccountType, openingPaise, lines.map(l => ({
    id: l.id, entryId: l.transaction.id, displayNumber: l.transaction.displayNumber, date: isoDay(l.transaction.date)!, narration: l.transaction.narration,
    description: l.description, sourceType: l.transaction.sourceType, tripId: l.tripId ?? l.transaction.tripId, contractId: l.contractId ?? l.transaction.contractId,
    debitPaise: toPaise(Number(l.debit)), creditPaise: toPaise(Number(l.credit)),
  })));
  return {
    account: { code: account.code, name: account.name, type: account.type, group: account.group, description: account.description },
    from: q.from ?? null, to: q.to ?? null, opening: toRupees(openingPaise),
    rows: rows.map(r => ({ ...r, debit: toRupees(r.debitPaise), credit: toRupees(r.creditPaise), balance: toRupees(r.balancePaise) })),
    closing: toRupees(rows.length ? rows[rows.length - 1].balancePaise : openingPaise),
  };
}

export async function listAccounts() {
  const [accounts, totals] = await Promise.all([ensureAccounts(), totalsByAccount({})]);
  const byCode = new Map(totals.map(t => [t.code, t]));
  return accounts.map(a => {
    const t = byCode.get(a.code);
    const debit = t?.debitPaise ?? 0, credit = t?.creditPaise ?? 0;
    const balancePaise = a.type === 'ASSET' || a.type === 'EXPENSE' ? debit - credit : credit - debit;
    return { code: a.code, name: a.name, type: a.type, group: a.group, description: a.description, isActive: a.isActive, isSystem: a.isSystem, balance: toRupees(balancePaise) };
  });
}
