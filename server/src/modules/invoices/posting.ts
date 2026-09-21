// ============================================================
// Invoices, credit notes and debit notes in the books.
//
//   issue        customer dues ← sales + output GST (+ TCS when charged)
//   advances     money already received moves from "Customer advances" to
//                the invoice, so the customer's balance is what is really left
//   cancel       the posting is reversed, never edited
//   credit note  sales and GST come back, the customer owes less
//   debit note   the mirror of an invoice
//
// The invoice service calls these inside its own transaction, so an invoice
// and its effect on the books are saved together or not at all.
// ============================================================

import type { Prisma } from '@prisma/client';
import type { DbClient } from '../../lib/prisma.js';
import { toPaise, toRupees } from '../../../../src/shared/calc/money.js';
import { postEntry, reverseEntry } from '../ledger/service.js';

const RECEIVABLE = '1100';
const ADVANCES = '2100';
const SALES = '4000';
const OUTPUT_GST = '2200';
const TCS_PAYABLE = '2210';

interface InvoiceLike {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  customerId: string | null;
  customerName: string;
  taxableAmount: number;
  totalGstAmount: number;
  totalAmount: number;
  tcsAmount?: number | null;
  tripIds?: unknown;
  ledgerTransactionId?: string | null;
}

const tripsOf = (inv: { tripIds?: unknown }) => (Array.isArray(inv.tripIds) ? (inv.tripIds as string[]) : []);
const day = (v: string) => v.slice(0, 10);

/** Customer dues go up; sales, GST and any TCS are recognised. */
export async function postInvoice(tx: DbClient, inv: InvoiceLike, actorId?: string | null) {
  const tcs = Number(inv.tcsAmount ?? 0);
  const tripId = tripsOf(inv)[0] ?? null;
  const lines = [
    { code: RECEIVABLE, debit: inv.totalAmount, description: `${inv.customerName} · invoice ${inv.invoiceNumber}` },
    { code: SALES, credit: inv.taxableAmount, description: `Invoice ${inv.invoiceNumber}` },
    ...(inv.totalGstAmount > 0 ? [{ code: OUTPUT_GST, credit: inv.totalGstAmount, description: 'GST charged on the invoice' }] : []),
    ...(tcs > 0 ? [{ code: TCS_PAYABLE, credit: tcs, description: 'TCS collected — verify with CA' }] : []),
  ];
  const entry = await postEntry(tx, {
    date: day(inv.invoiceDate), narration: `Invoice ${inv.invoiceNumber} to ${inv.customerName}`,
    sourceType: 'invoice', sourceId: inv.id, customerId: inv.customerId, tripId, lines,
  }, actorId);
  await applyAdvances(tx, inv, actorId);
  return entry;
}

/**
 * Moves money already received for this invoice's trips out of "Customer
 * advances" and against the invoice, up to whichever is smaller.
 */
export async function applyAdvances(tx: DbClient, inv: InvoiceLike, actorId?: string | null) {
  const tripIds = tripsOf(inv);
  if (!tripIds.length && !inv.customerId) return null;

  const where: Prisma.LedgerLineWhereInput = {
    accountCode: ADVANCES,
    ...(tripIds.length ? { OR: [{ tripId: { in: tripIds } }, { transaction: { tripId: { in: tripIds } } }] } : { customerId: inv.customerId }),
  };
  const sums = await tx.ledgerLine.aggregate({ where, _sum: { credit: true, debit: true } });
  const heldPaise = toPaise(Number(sums._sum.credit ?? 0)) - toPaise(Number(sums._sum.debit ?? 0));
  const applyPaise = Math.min(heldPaise, toPaise(inv.totalAmount));
  if (applyPaise <= 0) return null;

  const amount = toRupees(applyPaise);
  return postEntry(tx, {
    date: day(inv.invoiceDate), narration: `Advance applied to invoice ${inv.invoiceNumber} — ${inv.customerName}`,
    sourceType: 'advance_adjust', sourceId: inv.id, customerId: inv.customerId, tripId: tripIds[0] ?? null,
    lines: [
      { code: ADVANCES, debit: amount, description: `Applied to invoice ${inv.invoiceNumber}` },
      { code: RECEIVABLE, credit: amount, description: `${inv.customerName} · invoice ${inv.invoiceNumber}` },
    ],
  }, actorId);
}

/** Cancelling an invoice reverses its posting and any advance it had absorbed. */
export async function reverseInvoicePostings(invoiceId: string, ledgerTransactionId: string | null | undefined, reason: string, tx: DbClient, actorId?: string | null) {
  const entries = await tx.ledgerTransaction.findMany({
    where: { sourceId: invoiceId, sourceType: { in: ['invoice', 'advance_adjust'] }, reversedBy: null, reversalOfId: null },
    select: { id: true },
  });
  const ids = entries.map(e => e.id);
  if (ledgerTransactionId && !ids.includes(ledgerTransactionId)) ids.push(ledgerTransactionId);
  return ids;
}

/** A credit note takes sales and GST back and reduces what the customer owes. */
export async function postCreditNote(tx: DbClient, cn: { id: string; creditNoteNumber: string; creditNoteDate: string; customerId: string | null; customerName: string; taxableAmount: number; totalGstAmount: number; totalAmount: number; invoiceId?: string | null }, actorId?: string | null) {
  return postEntry(tx, {
    date: day(cn.creditNoteDate), narration: `Credit note ${cn.creditNoteNumber} to ${cn.customerName}`,
    sourceType: 'credit_note', sourceId: cn.id, customerId: cn.customerId,
    lines: [
      { code: SALES, debit: cn.taxableAmount, description: `Credit note ${cn.creditNoteNumber}` },
      ...(cn.totalGstAmount > 0 ? [{ code: OUTPUT_GST, debit: cn.totalGstAmount, description: 'GST taken back' }] : []),
      { code: RECEIVABLE, credit: cn.totalAmount, description: `${cn.customerName} · credit note ${cn.creditNoteNumber}` },
    ],
  }, actorId);
}

/** A debit note charges the customer more, like a small extra invoice. */
export async function postDebitNote(tx: DbClient, dn: { id: string; debitNoteNumber: string; debitNoteDate: string; customerId: string | null; customerName: string; taxableAmount: number; totalGstAmount: number; totalAmount: number }, actorId?: string | null) {
  return postEntry(tx, {
    date: day(dn.debitNoteDate), narration: `Debit note ${dn.debitNoteNumber} to ${dn.customerName}`,
    sourceType: 'debit_note', sourceId: dn.id, customerId: dn.customerId,
    lines: [
      { code: RECEIVABLE, debit: dn.totalAmount, description: `${dn.customerName} · debit note ${dn.debitNoteNumber}` },
      { code: SALES, credit: dn.taxableAmount, description: `Debit note ${dn.debitNoteNumber}` },
      ...(dn.totalGstAmount > 0 ? [{ code: OUTPUT_GST, credit: dn.totalGstAmount, description: 'GST charged' }] : []),
    ],
  }, actorId);
}

/** Reverses every posting a document made, after it has been cancelled. */
export async function reverseDocumentPostings(sourceIds: string[], sourceTypes: string[], reason: string, actorId?: string | null, db?: DbClient) {
  const { prisma } = await import('../../lib/prisma.js');
  const client = db ?? prisma;
  const entries = await client.ledgerTransaction.findMany({
    where: { sourceId: { in: sourceIds }, sourceType: { in: sourceTypes }, reversalOfId: null },
    select: { id: true, reversedBy: { select: { id: true } } },
  });
  const done: string[] = [];
  for (const e of entries) {
    if (e.reversedBy) continue;
    await reverseEntry(e.id, reason, actorId);
    done.push(e.id);
  }
  return done;
}
