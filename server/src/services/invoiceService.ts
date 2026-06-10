// ============================================================
// GST INVOICING ENGINE — Invoices, Credit Notes, Debit Notes
//
// Companion to financeService.ts: the only code allowed to write
// Invoice/CreditNote/DebitNote rows, manage NumberingSequence
// counters, lock/unlock Booking/Trip.invoiceId, and adjust the
// linked Receivable's invoiceAmount/balanceDue. Every write happens
// inside one Prisma transaction so numbering, receivables, and the
// activity feed can never drift apart.
// ============================================================

import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logActivity, type DbClient } from '../lib/activity.js';
import { today } from '../../../src/shared/utils/date.js';
import { calcReceivableFinance } from '../../../src/shared/utils/finance.js';
import { uid } from '../../../src/shared/utils/id.js';
import {
  getFinancialYear,
  determineGstType,
  getStateCodeFromGstin,
  splitGst,
  sumGstSplits,
  formatDocNumber,
  INVOICE_SEQ_PAD,
  CREDIT_DEBIT_SEQ_PAD,
  type GstSplitType,
} from '../../../src/shared/utils/gst.js';
import { createReceivable } from './financeService.js';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Company Master ────────────────────────────────────────────

export async function getOrCreateCompanySettings(db: DbClient = prisma) {
  return db.companySettings.upsert({
    where:  { id: 'default' },
    create: { id: 'default' },
    update: {},
  });
}

export async function updateCompanySettings(data: Prisma.CompanySettingsUpdateInput, db: DbClient = prisma) {
  return db.companySettings.upsert({
    where:  { id: 'default' },
    create: { id: 'default', ...(data as Prisma.CompanySettingsCreateInput) },
    update: data,
  });
}

// ── Document numbering (NumberingSequence) ─────────────────────

async function getNextDocNumber(tx: DbClient, docType: string, financialYear: string): Promise<number> {
  const seq = await tx.numberingSequence.upsert({
    where:  { docType_financialYear: { docType, financialYear } },
    create: { id: `${docType}-${financialYear}`, docType, financialYear, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  return seq.lastNumber;
}

// Frees a number only if it was the most-recently issued one for that FY —
// per spec, deleting a non-latest invoice does NOT renumber/reuse earlier gaps.
async function releaseDocNumber(tx: DbClient, docType: string, financialYear: string, sequenceNumber: number) {
  await tx.numberingSequence.updateMany({
    where: { docType, financialYear, lastNumber: sequenceNumber },
    data:  { lastNumber: { decrement: 1 } },
  });
}

// ── GST period freeze ───────────────────────────────────────────

function assertNotFrozen(dateStr: string, settings: { gstFrozenUntil: string | null }) {
  if (settings.gstFrozenUntil && dateStr <= settings.gstFrozenUntil) {
    throw new Error(`This document's period (${dateStr}) is GST-frozen (returns filed up to ${settings.gstFrozenUntil}) and can no longer be changed.`);
  }
}

// ── Line item helpers ───────────────────────────────────────────

export interface InvoiceLineItemInput {
  description:  string;
  hsnSac?:      string | null;
  serviceType?: string | null;
  bookingId?:   string | null;
  quantity?:    number;
  rate:         number;
  gstRate:      number;
}

export interface CreditDebitLineItemInput {
  description: string;
  hsnSac?:     string | null;
  quantity?:   number;
  rate:        number;
  gstRate:     number;
}

function buildInvoiceLineItems(items: InvoiceLineItemInput[], gstType: GstSplitType) {
  return items.map((it, idx) => {
    const quantity = it.quantity ?? 1;
    const amount   = round2(quantity * it.rate);
    const split    = splitGst(amount, it.gstRate, gstType);
    return {
      description:  it.description,
      hsnSac:       it.hsnSac ?? null,
      serviceType:  it.serviceType ?? null,
      bookingId:    it.bookingId ?? null,
      quantity,
      rate:         it.rate,
      amount,
      gstRate:      it.gstRate,
      gstAmount:    split.totalGstAmount,
      totalAmount:  split.totalAmount,
      sortOrder:    idx,
    };
  });
}

function buildCreditDebitLineItems(items: CreditDebitLineItemInput[], gstType: GstSplitType) {
  return items.map((it, idx) => {
    const quantity = it.quantity ?? 1;
    const amount   = round2(quantity * it.rate);
    const split    = splitGst(amount, it.gstRate, gstType);
    return {
      description: it.description,
      hsnSac:      it.hsnSac ?? null,
      quantity,
      rate:        it.rate,
      amount,
      gstRate:     it.gstRate,
      gstAmount:   split.totalGstAmount,
      totalAmount: split.totalAmount,
      sortOrder:   idx,
    };
  });
}

// ── Invoices ─────────────────────────────────────────────────────

export interface CreateInvoiceInput {
  invoiceDate:             string;
  dueDate?:                string | null;
  customerId?:             string | null;
  customerName:            string;
  customerAddress?:        string | null;
  customerGstin?:          string | null;
  placeOfSupply?:          string | null;
  placeOfSupplyStateCode?: string | null;
  notes?:                  string | null;
  termsAndConds?:          string | null;
  bookingIds?:             string[];
  tripIds?:                string[];
  items:                   InvoiceLineItemInput[];
  createdBy?:              string | null;
}

export async function createInvoice(input: CreateInvoiceInput) {
  if (!input.items?.length) throw new Error('Invoice must have at least one line item');

  return prisma.$transaction(async (tx) => {
    const settings = await getOrCreateCompanySettings(tx);
    assertNotFrozen(input.invoiceDate, settings);

    const bookingIds = input.bookingIds ?? [];
    const tripIds    = input.tripIds ?? [];

    if (bookingIds.length) {
      const existing = await tx.booking.findMany({ where: { id: { in: bookingIds } }, select: { id: true, invoiceId: true } });
      const already = existing.filter(b => b.invoiceId);
      if (already.length) throw new Error(`Booking(s) already invoiced: ${already.map(b => b.id).join(', ')}`);
    }
    if (tripIds.length) {
      const existing = await tx.trip.findMany({ where: { id: { in: tripIds } }, select: { id: true, invoiceId: true } });
      const already = existing.filter(t => t.invoiceId);
      if (already.length) throw new Error(`Trip(s) already invoiced: ${already.map(t => t.id).join(', ')}`);
    }

    const financialYear  = getFinancialYear(input.invoiceDate);
    const sequenceNumber = await getNextDocNumber(tx, 'INV', financialYear);
    const prefix         = settings.invoicePrefix || 'GK';
    const invoiceNumber  = formatDocNumber(prefix, financialYear, sequenceNumber, INVOICE_SEQ_PAD);

    const companyStateCode      = settings.stateCode ?? getStateCodeFromGstin(settings.gstin);
    const placeOfSupplyStateCode = input.placeOfSupplyStateCode
      ?? getStateCodeFromGstin(input.customerGstin)
      ?? companyStateCode
      ?? null;
    const gstType = determineGstType(companyStateCode, placeOfSupplyStateCode);

    const lineItems = buildInvoiceLineItems(input.items, gstType);
    const totals    = sumGstSplits(lineItems.map(li => splitGst(li.amount, li.gstRate, gstType)));

    const companyAddress = [settings.addressLine1, settings.addressLine2, settings.city, settings.state, settings.pincode]
      .filter(Boolean).join(', ') || null;

    const id = `INV-${uid()}`;
    const invoice = await tx.invoice.create({
      data: {
        id,
        invoiceNumber,
        financialYear,
        sequenceNumber,
        status:            'ISSUED',
        invoiceDate:       input.invoiceDate,
        dueDate:           input.dueDate ?? null,
        customerId:        input.customerId ?? null,
        customerName:      input.customerName,
        customerAddress:   input.customerAddress ?? null,
        customerGstin:     input.customerGstin ?? null,
        customerStateCode: placeOfSupplyStateCode,
        placeOfSupply:     input.placeOfSupply ?? null,
        companyName:       settings.companyName,
        companyAddress,
        companyGstin:      settings.gstin ?? null,
        companyStateCode,
        gstType,
        taxableAmount:     totals.taxableAmount,
        cgstAmount:        totals.cgstAmount,
        sgstAmount:        totals.sgstAmount,
        igstAmount:        totals.igstAmount,
        totalGstAmount:    totals.totalGstAmount,
        totalAmount:       totals.totalAmount,
        notes:             input.notes ?? null,
        termsAndConds:     input.termsAndConds ?? settings.invoiceTerms ?? null,
        bookingIds:        bookingIds as unknown as Prisma.InputJsonValue,
        tripIds:           tripIds as unknown as Prisma.InputJsonValue,
        createdDate:       today(),
        createdBy:         input.createdBy ?? null,
        items: { create: lineItems },
      },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });

    if (bookingIds.length) await tx.booking.updateMany({ where: { id: { in: bookingIds } }, data: { invoiceId: invoice.id } });
    if (tripIds.length)    await tx.trip.updateMany({ where: { id: { in: tripIds } }, data: { invoiceId: invoice.id } });

    const receivable = await createReceivable({
      sourceType:    'invoice',
      sourceId:      invoice.id,
      customerId:    input.customerId ?? null,
      customerName:  input.customerName,
      amount:        totals.totalAmount,
      gstAmount:     totals.totalGstAmount,
      taxableAmount: totals.taxableAmount,
      dueDate:       input.dueDate ?? null,
      description:   `Invoice ${invoiceNumber}`,
      createdBy:     input.createdBy ?? null,
    }, tx);

    let finalInvoice = invoice;
    if (receivable) {
      await tx.receivable.update({ where: { id: receivable.id }, data: { invoiceId: invoice.id } });
      finalInvoice = await tx.invoice.update({
        where:   { id: invoice.id },
        data:    { receivableId: receivable.id },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      });
    }

    await logActivity(tx, {
      action:      'invoice_created',
      description: `Invoice ${invoiceNumber} created for ${input.customerName} (₹${totals.totalAmount.toLocaleString('en-IN')})`,
      entityType:  'invoice',
      entityId:    invoice.id,
      userId:      input.createdBy,
      after:       finalInvoice,
    });

    return finalInvoice;
  });
}

export interface UpdateInvoiceInput {
  invoiceDate?:             string;
  dueDate?:                 string | null;
  customerName?:            string;
  customerAddress?:         string | null;
  customerGstin?:           string | null;
  placeOfSupply?:           string | null;
  placeOfSupplyStateCode?:  string | null;
  notes?:                   string | null;
  termsAndConds?:           string | null;
  items?:                   InvoiceLineItemInput[];
  updatedBy?:               string | null;
}

export async function updateInvoice(id: string, input: UpdateInvoiceInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.invoice.findUniqueOrThrow({ where: { id }, include: { items: true } });
    const settings = await getOrCreateCompanySettings(tx);

    if (existing.status === 'CANCELLED') throw new Error('Cannot edit a cancelled invoice');
    assertNotFrozen(existing.invoiceDate, settings);
    if (input.invoiceDate) assertNotFrozen(input.invoiceDate, settings);

    let gstType = existing.gstType;
    let totals = {
      taxableAmount:  existing.taxableAmount,
      cgstAmount:     existing.cgstAmount,
      sgstAmount:     existing.sgstAmount,
      igstAmount:     existing.igstAmount,
      totalGstAmount: existing.totalGstAmount,
      totalAmount:    existing.totalAmount,
    };
    let lineItems: ReturnType<typeof buildInvoiceLineItems> | null = null;

    if (input.items) {
      const placeOfSupplyStateCode = input.placeOfSupplyStateCode
        ?? getStateCodeFromGstin(input.customerGstin ?? existing.customerGstin)
        ?? existing.customerStateCode;
      gstType   = determineGstType(existing.companyStateCode, placeOfSupplyStateCode);
      lineItems = buildInvoiceLineItems(input.items, gstType);
      totals    = sumGstSplits(lineItems.map(li => splitGst(li.amount, li.gstRate, gstType)));
    }

    const updated = await tx.invoice.update({
      where: { id },
      data: {
        invoiceDate:       input.invoiceDate ?? undefined,
        dueDate:           input.dueDate !== undefined ? input.dueDate : undefined,
        customerName:      input.customerName ?? undefined,
        customerAddress:   input.customerAddress !== undefined ? input.customerAddress : undefined,
        customerGstin:     input.customerGstin !== undefined ? input.customerGstin : undefined,
        placeOfSupply:     input.placeOfSupply !== undefined ? input.placeOfSupply : undefined,
        notes:             input.notes !== undefined ? input.notes : undefined,
        termsAndConds:     input.termsAndConds !== undefined ? input.termsAndConds : undefined,
        gstType,
        taxableAmount:     totals.taxableAmount,
        cgstAmount:        totals.cgstAmount,
        sgstAmount:        totals.sgstAmount,
        igstAmount:        totals.igstAmount,
        totalGstAmount:    totals.totalGstAmount,
        totalAmount:       totals.totalAmount,
        ...(lineItems ? { items: { deleteMany: {}, create: lineItems } } : {}),
      },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });

    if (existing.receivableId && totals.totalAmount !== existing.totalAmount) {
      const rcv = await tx.receivable.findUnique({ where: { id: existing.receivableId }, include: { entries: true } });
      if (rcv) {
        const fin = calcReceivableFinance({ invoiceAmount: totals.totalAmount, entries: rcv.entries, dueDate: rcv.dueDate });
        await tx.receivable.update({ where: { id: rcv.id }, data: { invoiceAmount: totals.totalAmount, balanceDue: fin.balanceDue } });
      }
    }

    await logActivity(tx, {
      action:      'invoice_edited',
      description: `Invoice ${existing.invoiceNumber} edited`,
      entityType:  'invoice',
      entityId:    id,
      userId:      input.updatedBy,
      before:      existing,
      after:       updated,
    });

    return updated;
  });
}

export async function cancelInvoice(id: string, reason: string, userId?: string | null) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.invoice.findUniqueOrThrow({ where: { id } });
    const settings = await getOrCreateCompanySettings(tx);

    if (existing.status === 'CANCELLED') throw new Error('Invoice is already cancelled');
    assertNotFrozen(existing.invoiceDate, settings);

    const updated = await tx.invoice.update({
      where: { id },
      data: {
        status:       'CANCELLED',
        cancelledAt:  new Date().toISOString(),
        cancelledBy:  userId ?? null,
        cancelReason: reason,
      },
    });

    if (existing.receivableId) {
      const rcv = await tx.receivable.findUnique({ where: { id: existing.receivableId }, include: { entries: true } });
      if (rcv) {
        const fin = calcReceivableFinance({ invoiceAmount: 0, entries: rcv.entries, dueDate: rcv.dueDate });
        await tx.receivable.update({ where: { id: rcv.id }, data: { invoiceAmount: 0, balanceDue: fin.balanceDue } });
      }
    }

    await logActivity(tx, {
      action:      'invoice_cancelled',
      description: `Invoice ${existing.invoiceNumber} cancelled — ${reason}`,
      entityType:  'invoice',
      entityId:    id,
      userId,
      before:      existing,
      after:       updated,
    });

    return updated;
  });
}

// Deletes an invoice entirely — frees its number (if it was the most
// recently issued for its FY) and unlocks any bookings/trips it covered.
// Blocked if GST-frozen or if Credit/Debit Notes were issued against it.
export async function deleteInvoice(id: string, userId?: string | null) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.invoice.findUniqueOrThrow({
      where:   { id },
      include: { creditNotes: true, debitNotes: true },
    });
    const settings = await getOrCreateCompanySettings(tx);
    assertNotFrozen(existing.invoiceDate, settings);

    if (existing.creditNotes.length || existing.debitNotes.length) {
      throw new Error('Cannot delete an invoice that has Credit/Debit Notes issued against it — cancel those first');
    }

    const bookingIds = (existing.bookingIds as string[]) ?? [];
    const tripIds    = (existing.tripIds as string[]) ?? [];
    if (bookingIds.length) await tx.booking.updateMany({ where: { id: { in: bookingIds } }, data: { invoiceId: null } });
    if (tripIds.length)    await tx.trip.updateMany({ where: { id: { in: tripIds } }, data: { invoiceId: null } });

    await releaseDocNumber(tx, 'INV', existing.financialYear, existing.sequenceNumber);

    if (existing.receivableId) {
      await tx.receivable.delete({ where: { id: existing.receivableId } }).catch(() => {});
    }

    await tx.invoice.delete({ where: { id } });

    await logActivity(tx, {
      action:      'invoice_deleted',
      description: `Invoice ${existing.invoiceNumber} deleted`,
      entityType:  'invoice',
      entityId:    id,
      userId,
      before:      existing,
    });

    return { id };
  });
}

// ── Credit Notes ─────────────────────────────────────────────────

export interface CreateCreditNoteInput {
  invoiceId:       string;
  date:            string;
  reason:          string;
  reasonDetails?:  string | null;
  notes?:          string | null;
  items:           CreditDebitLineItemInput[];
  createdBy?:      string | null;
}

export async function createCreditNote(input: CreateCreditNoteInput) {
  if (!input.items?.length) throw new Error('Credit note must have at least one line item');

  return prisma.$transaction(async (tx) => {
    const invoice  = await tx.invoice.findUniqueOrThrow({ where: { id: input.invoiceId } });
    const settings = await getOrCreateCompanySettings(tx);
    assertNotFrozen(input.date, settings);
    if (invoice.status === 'CANCELLED') throw new Error('Cannot issue a credit note against a cancelled invoice');

    const financialYear  = getFinancialYear(input.date);
    const sequenceNumber = await getNextDocNumber(tx, 'CN', financialYear);
    const creditNoteNumber = formatDocNumber('CN', financialYear, sequenceNumber, CREDIT_DEBIT_SEQ_PAD);

    const gstType   = invoice.gstType;
    const lineItems = buildCreditDebitLineItems(input.items, gstType);
    const totals    = sumGstSplits(lineItems.map(li => splitGst(li.amount, li.gstRate, gstType)));

    const id = `CN-${uid()}`;
    const creditNote = await tx.creditNote.create({
      data: {
        id,
        creditNoteNumber,
        financialYear,
        sequenceNumber,
        status:         'ISSUED',
        date:           input.date,
        invoiceId:      invoice.id,
        customerId:     invoice.customerId,
        customerName:   invoice.customerName,
        reason:         input.reason,
        reasonDetails:  input.reasonDetails ?? null,
        taxableAmount:  totals.taxableAmount,
        cgstAmount:     totals.cgstAmount,
        sgstAmount:     totals.sgstAmount,
        igstAmount:     totals.igstAmount,
        totalGstAmount: totals.totalGstAmount,
        totalAmount:    totals.totalAmount,
        notes:          input.notes ?? null,
        createdDate:    today(),
        createdBy:      input.createdBy ?? null,
        items: { create: lineItems },
      },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });

    if (invoice.receivableId) {
      const rcv = await tx.receivable.findUnique({ where: { id: invoice.receivableId }, include: { entries: true } });
      if (rcv) {
        const newInvoiceAmount = round2(rcv.invoiceAmount - totals.totalAmount);
        const fin = calcReceivableFinance({ invoiceAmount: newInvoiceAmount, entries: rcv.entries, dueDate: rcv.dueDate });
        await tx.receivable.update({ where: { id: rcv.id }, data: { invoiceAmount: newInvoiceAmount, balanceDue: fin.balanceDue } });
      }
    }

    await logActivity(tx, {
      action:      'credit_note_created',
      description: `Credit Note ${creditNoteNumber} issued against Invoice ${invoice.invoiceNumber} (₹${totals.totalAmount.toLocaleString('en-IN')}) — ${input.reason}`,
      entityType:  'credit_note',
      entityId:    creditNote.id,
      userId:      input.createdBy,
      after:       creditNote,
    });

    return creditNote;
  });
}

export async function cancelCreditNote(id: string, userId?: string | null) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.creditNote.findUniqueOrThrow({ where: { id } });
    const settings = await getOrCreateCompanySettings(tx);
    assertNotFrozen(existing.date, settings);
    if (existing.status === 'CANCELLED') throw new Error('Credit note is already cancelled');

    const updated = await tx.creditNote.update({
      where: { id },
      data:  { status: 'CANCELLED', cancelledAt: new Date().toISOString(), cancelledBy: userId ?? null },
    });

    const invoice = await tx.invoice.findUnique({ where: { id: existing.invoiceId } });
    if (invoice?.receivableId) {
      const rcv = await tx.receivable.findUnique({ where: { id: invoice.receivableId }, include: { entries: true } });
      if (rcv) {
        const newInvoiceAmount = round2(rcv.invoiceAmount + existing.totalAmount);
        const fin = calcReceivableFinance({ invoiceAmount: newInvoiceAmount, entries: rcv.entries, dueDate: rcv.dueDate });
        await tx.receivable.update({ where: { id: rcv.id }, data: { invoiceAmount: newInvoiceAmount, balanceDue: fin.balanceDue } });
      }
    }

    await logActivity(tx, {
      action:      'credit_note_cancelled',
      description: `Credit Note ${existing.creditNoteNumber} cancelled`,
      entityType:  'credit_note',
      entityId:    id,
      userId,
      before:      existing,
      after:       updated,
    });

    return updated;
  });
}

// ── Debit Notes ──────────────────────────────────────────────────

export interface CreateDebitNoteInput {
  invoiceId:       string;
  date:            string;
  reason:          string;
  reasonDetails?:  string | null;
  notes?:          string | null;
  items:           CreditDebitLineItemInput[];
  createdBy?:      string | null;
}

export async function createDebitNote(input: CreateDebitNoteInput) {
  if (!input.items?.length) throw new Error('Debit note must have at least one line item');

  return prisma.$transaction(async (tx) => {
    const invoice  = await tx.invoice.findUniqueOrThrow({ where: { id: input.invoiceId } });
    const settings = await getOrCreateCompanySettings(tx);
    assertNotFrozen(input.date, settings);
    if (invoice.status === 'CANCELLED') throw new Error('Cannot issue a debit note against a cancelled invoice');

    const financialYear  = getFinancialYear(input.date);
    const sequenceNumber = await getNextDocNumber(tx, 'DN', financialYear);
    const debitNoteNumber = formatDocNumber('DN', financialYear, sequenceNumber, CREDIT_DEBIT_SEQ_PAD);

    const gstType   = invoice.gstType;
    const lineItems = buildCreditDebitLineItems(input.items, gstType);
    const totals    = sumGstSplits(lineItems.map(li => splitGst(li.amount, li.gstRate, gstType)));

    const id = `DN-${uid()}`;
    const debitNote = await tx.debitNote.create({
      data: {
        id,
        debitNoteNumber,
        financialYear,
        sequenceNumber,
        status:         'ISSUED',
        date:           input.date,
        invoiceId:      invoice.id,
        customerId:     invoice.customerId,
        customerName:   invoice.customerName,
        reason:         input.reason,
        reasonDetails:  input.reasonDetails ?? null,
        taxableAmount:  totals.taxableAmount,
        cgstAmount:     totals.cgstAmount,
        sgstAmount:     totals.sgstAmount,
        igstAmount:     totals.igstAmount,
        totalGstAmount: totals.totalGstAmount,
        totalAmount:    totals.totalAmount,
        notes:          input.notes ?? null,
        createdDate:    today(),
        createdBy:      input.createdBy ?? null,
        items: { create: lineItems },
      },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });

    if (invoice.receivableId) {
      const rcv = await tx.receivable.findUnique({ where: { id: invoice.receivableId }, include: { entries: true } });
      if (rcv) {
        const newInvoiceAmount = round2(rcv.invoiceAmount + totals.totalAmount);
        const fin = calcReceivableFinance({ invoiceAmount: newInvoiceAmount, entries: rcv.entries, dueDate: rcv.dueDate });
        await tx.receivable.update({ where: { id: rcv.id }, data: { invoiceAmount: newInvoiceAmount, balanceDue: fin.balanceDue } });
      }
    }

    await logActivity(tx, {
      action:      'debit_note_created',
      description: `Debit Note ${debitNoteNumber} issued against Invoice ${invoice.invoiceNumber} (₹${totals.totalAmount.toLocaleString('en-IN')}) — ${input.reason}`,
      entityType:  'debit_note',
      entityId:    debitNote.id,
      userId:      input.createdBy,
      after:       debitNote,
    });

    return debitNote;
  });
}

export async function cancelDebitNote(id: string, userId?: string | null) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.debitNote.findUniqueOrThrow({ where: { id } });
    const settings = await getOrCreateCompanySettings(tx);
    assertNotFrozen(existing.date, settings);
    if (existing.status === 'CANCELLED') throw new Error('Debit note is already cancelled');

    const updated = await tx.debitNote.update({
      where: { id },
      data:  { status: 'CANCELLED', cancelledAt: new Date().toISOString(), cancelledBy: userId ?? null },
    });

    const invoice = await tx.invoice.findUnique({ where: { id: existing.invoiceId } });
    if (invoice?.receivableId) {
      const rcv = await tx.receivable.findUnique({ where: { id: invoice.receivableId }, include: { entries: true } });
      if (rcv) {
        const newInvoiceAmount = round2(rcv.invoiceAmount - existing.totalAmount);
        const fin = calcReceivableFinance({ invoiceAmount: newInvoiceAmount, entries: rcv.entries, dueDate: rcv.dueDate });
        await tx.receivable.update({ where: { id: rcv.id }, data: { invoiceAmount: newInvoiceAmount, balanceDue: fin.balanceDue } });
      }
    }

    await logActivity(tx, {
      action:      'debit_note_cancelled',
      description: `Debit Note ${existing.debitNoteNumber} cancelled`,
      entityType:  'debit_note',
      entityId:    id,
      userId,
      before:      existing,
      after:       updated,
    });

    return updated;
  });
}

export type { Prisma };
