// ============================================================
// Unified quotation engine (Phase 2.6) on top of SalesQuote.
// Totals always come from src/shared/calc/quotation.ts — the same code the
// builder runs — and are cached on the row for lists. Margin and cost never
// leave the server through customerView().
// ============================================================

import type { Prisma } from '@prisma/client';
import { prisma, type DbClient } from '../../lib/prisma.js';
import { audit } from '../../core/audit.js';
import { nextDisplayId } from '../../core/numbering.js';
import { AppError, forbidden, notFound, stateConflict } from '../../core/errors.js';
import { computeQuote, customerSafeTotals, type ItemInput as CalcItem, type QuoteTotals } from '../../../../src/shared/calc/quotation.js';
import { rateFor } from '../tax/service.js';
import { QUOTE_TRANSITIONS, EDITABLE_STATUSES, type QuoteCreate, type QuoteUpdate, type QuoteListQuery, type QuoteStatus } from '../../../../src/shared/contracts/quotations.js';
import { markEnquiryQuoted } from '../sales/enquiries.service.js';

/** Quotes whose margin falls below this need an admin's approval before they are sent. */
export const MIN_MARGIN_PCT = Number(process.env.QUOTE_MIN_MARGIN_PCT ?? 0);

const toDate = (s: string | null | undefined) => (s ? new Date(`${s}T00:00:00.000Z`) : null);
const n = (v: Prisma.Decimal | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));

const FULL = {
  customer: { select: { id: true, name: true, phone: true, email: true, gstNumber: true, gstRegistered: true, address: true } },
  enquiry:  { select: { id: true, enquiryNumber: true, destination: true, origin: true, departureDate: true, returnDate: true, adults: true, children: true, infants: true, status: true } },
  lineItems: { include: { rates: true, supplier: { select: { id: true, name: true } } }, orderBy: { sortOrder: 'asc' as const } },
  optionGroups: { orderBy: { sortOrder: 'asc' as const } },
  parties: { orderBy: { sortOrder: 'asc' as const } },
} as const;
type Full = Prisma.SalesQuoteGetPayload<{ include: typeof FULL }>;

// ── Calculation from rows ─────────────────────────────────────

export function calcFromRows(q: Full): QuoteTotals {
  const items: CalcItem[] = q.lineItems.map(i => ({
    id: i.id, description: i.description, serviceType: i.serviceType, pricingBasis: i.pricingBasis,
    costPrice: n(i.costPrice), sellPrice: n(i.sellPrice), quantity: i.quantity, nights: i.nights,
    rates: i.rates.map(r => ({ band: r.band as 'ADULT' | 'CHILD' | 'INFANT', count: r.count, costPrice: n(r.costPrice), sellPrice: n(r.sellPrice) })),
    optionGroupId: i.optionGroupId, isSelectedOption: i.isSelectedOption, partyId: i.partyId, taxRate: i.taxRate === null ? null : n(i.taxRate),
  }));
  return computeQuote({
    items, parties: q.parties.map(p => ({ id: p.id, name: p.name, adults: p.adults, children: p.children, infants: p.infants })),
    discountAmount: n(q.discountAmount), gstMode: q.gstMode, gstRate: n(q.gstRate), adults: q.adults, children: q.children, infants: q.infants,
  });
}

function approvalFor(t: QuoteTotals, current: string): string {
  const needs = t.margin < 0 || t.marginPct < MIN_MARGIN_PCT;
  if (!needs) return 'NOT_REQUIRED';
  return current === 'APPROVED' ? 'APPROVED' : 'PENDING';
}

// ── DTOs ──────────────────────────────────────────────────────

function toDto(q: Full, totals = calcFromRows(q)) {
  return {
    id: q.id, quoteNumber: q.quoteNumber, title: q.title, version: q.version, parentQuoteId: q.parentQuoteId, isCurrent: q.isCurrent,
    status: q.status, approvalStatus: q.approvalStatus, approvalComment: q.approvalComment, approvedBy: q.approvedBy, approvedAt: q.approvedAt,
    enquiryId: q.enquiryId, enquiry: { ...q.enquiry, departureDate: q.enquiry.departureDate?.toISOString().slice(0, 10) ?? null, returnDate: q.enquiry.returnDate?.toISOString().slice(0, 10) ?? null },
    customerId: q.customerId, customer: q.customer,
    adults: q.adults, children: q.children, infants: q.infants,
    validUntil: q.validUntil.toISOString().slice(0, 10), gstMode: q.gstMode, gstRate: n(q.gstRate), discountAmount: n(q.discountAmount),
    notes: q.notes, termsConditions: q.termsConditions, inclusions: q.inclusions, exclusions: q.exclusions, paymentPolicy: q.paymentPolicy, cancellationPolicy: q.cancellationPolicy,
    sentAt: q.sentAt, viewedAt: q.viewedAt, acceptedAt: q.acceptedAt, rejectedAt: q.rejectedAt, rejectionReason: q.rejectionReason, convertedTripId: q.convertedTripId, convertedAt: q.convertedAt,
    createdAt: q.createdAt, updatedAt: q.updatedAt,
    optionGroups: q.optionGroups.map(g => ({ id: g.id, name: g.name, sortOrder: g.sortOrder })),
    parties: q.parties.map(p => ({ id: p.id, name: p.name, adults: p.adults, children: p.children, infants: p.infants, travellerIds: Array.isArray(p.travellerIds) ? p.travellerIds : [], sortOrder: p.sortOrder })),
    items: q.lineItems.map(i => {
      const t = totals.items.find(x => x.id === i.id);
      return {
        id: i.id, serviceType: i.serviceType, description: i.description, supplierId: i.supplierId, supplierName: i.supplier?.name ?? null,
        pricingBasis: i.pricingBasis, costPrice: n(i.costPrice), sellPrice: n(i.sellPrice), quantity: i.quantity, nights: i.nights, unit: i.unit,
        serviceDate: i.serviceDate?.toISOString().slice(0, 10) ?? null, taxRate: i.taxRate === null ? null : n(i.taxRate),
        rates: i.rates.map(r => ({ band: r.band, count: r.count, costPrice: n(r.costPrice), sellPrice: n(r.sellPrice) })),
        optionGroupId: i.optionGroupId, isSelectedOption: i.isSelectedOption, partyId: i.partyId, customerNote: i.customerNote, internalNote: i.internalNote, details: i.details, sortOrder: i.sortOrder,
        totals: t ? { included: t.included, cost: t.cost, sell: t.sell, tax: t.tax, margin: t.margin, marginPct: t.marginPct } : null,
      };
    }),
    totals,
  };
}
export type QuoteDto = ReturnType<typeof toDto>;

// ── Writes ────────────────────────────────────────────────────

/** Replaces option groups, parties and items of a quote from a validated body (keys → ids). */
async function writeBody(tx: DbClient, quoteId: string, input: QuoteUpdate) {
  await tx.salesQuoteItem.deleteMany({ where: { salesQuoteId: quoteId } });
  await tx.salesQuoteOptionGroup.deleteMany({ where: { salesQuoteId: quoteId } });
  await tx.salesQuoteParty.deleteMany({ where: { salesQuoteId: quoteId } });

  const groupIds = new Map<string, string>();
  for (const [i, g] of input.optionGroups.entries()) {
    const row = await tx.salesQuoteOptionGroup.create({ data: { salesQuoteId: quoteId, name: g.name, sortOrder: i } });
    groupIds.set(g.key, row.id);
  }
  const partyIds = new Map<string, string>();
  for (const [i, p] of input.parties.entries()) {
    const row = await tx.salesQuoteParty.create({ data: { salesQuoteId: quoteId, name: p.name, adults: p.adults, children: p.children, infants: p.infants, travellerIds: p.travellerIds as Prisma.InputJsonValue, sortOrder: i } });
    partyIds.set(p.key, row.id);
  }
  for (const [i, it] of input.items.entries()) {
    if (it.supplierId) {
      const v = await tx.vendor.findUnique({ where: { id: it.supplierId }, select: { id: true } });
      if (!v) throw new AppError('VALIDATION_ERROR', 400, `Unknown supplier on item ${i + 1}`, { [`items.${i}.supplierId`]: 'Unknown supplier' });
    }
    await tx.salesQuoteItem.create({
      data: {
        salesQuoteId: quoteId, serviceType: it.serviceType, description: it.description, supplierId: it.supplierId,
        pricingBasis: it.pricingBasis, costPrice: it.costPrice, sellPrice: it.sellPrice, markup: Math.max(0, it.sellPrice - it.costPrice), quantity: it.quantity,
        unit: it.pricingBasis === 'PER_PERSON' ? 'per person' : it.pricingBasis === 'PER_ROOM' ? 'per room' : it.pricingBasis === 'PER_GROUP' ? 'per group' : 'per unit',
        nights: it.nights ?? null, serviceDate: toDate(it.serviceDate), taxRate: it.taxRate ?? null,
        optionGroupId: it.optionGroupKey ? groupIds.get(it.optionGroupKey) ?? null : null, isSelectedOption: it.isSelectedOption,
        partyId: it.partyKey ? partyIds.get(it.partyKey) ?? null : null,
        customerNote: it.customerNote, internalNote: it.internalNote, details: it.details as Prisma.InputJsonValue, sortOrder: i,
        rates: it.pricingBasis === 'PER_PERSON' ? { create: it.rates.map(r => ({ band: r.band, count: r.count, costPrice: r.costPrice, sellPrice: r.sellPrice })) } : undefined,
      },
    });
  }
}

async function recompute(tx: DbClient, quoteId: string): Promise<Full> {
  const q = await tx.salesQuote.findUniqueOrThrow({ where: { id: quoteId }, include: FULL });
  const t = calcFromRows(q);
  const updated = await tx.salesQuote.update({
    where: { id: quoteId },
    data: {
      subtotal: t.subtotal, discountAmount: t.discountAmount, taxAmount: t.tax, totalAmount: t.total, taxableAmount: t.taxable, costAmount: t.cost,
      approvalStatus: approvalFor(t, q.approvalStatus),
      totalsCache: { total: t.total, tax: t.tax, subtotal: t.subtotal, cost: t.cost, margin: t.margin, marginPct: t.marginPct, pax: t.pax, perPerson: t.perPerson, warnings: t.warnings } as Prisma.InputJsonValue,
    },
    include: FULL,
  });
  return updated;
}

export async function createQuote(input: QuoteCreate, actorId?: string | null) {
  const enquiry = await prisma.enquiry.findUnique({ where: { id: input.enquiryId }, select: { id: true, customerId: true, status: true, adults: true, children: true, infants: true, deletedAt: true } });
  if (!enquiry || enquiry.deletedAt) throw new AppError('VALIDATION_ERROR', 400, 'Enquiry not found', { enquiryId: 'Unknown enquiry' });
  if (enquiry.status === 'LOST') throw stateConflict('Reopen the enquiry before quoting it');

  // The GST rate comes from the organisation's tax rules unless one was given.
  const gstRate = input.gstRate ?? (await rateFor('GST_TOUR_PACKAGE'));

  return prisma.$transaction(async tx => {
    const quoteNumber = await nextDisplayId(tx, 'Q', { displayPrefix: 'GK-Q' });
    const { enquiryId, items: _i, optionGroups: _g, parties: _p, validUntil, ...fields } = input;
    const q = await tx.salesQuote.create({
      data: {
        enquiryId, customerId: enquiry.customerId, quoteNumber, ...fields, gstRate,
        adults: input.adults ?? enquiry.adults, children: input.children ?? enquiry.children, infants: input.infants ?? enquiry.infants,
        validUntil: toDate(validUntil) ?? new Date(Date.now() + 7 * 86_400_000),
        termsConditions: fields.termsConditions ?? process.env.DEFAULT_TERMS ?? null,
        createdByUserId: actorId ?? null,
      },
    });
    await writeBody(tx, q.id, input);
    const full = await recompute(tx, q.id);
    await audit(tx, { action: 'quote_created', entityType: 'quotation', entityId: q.id, userId: actorId, description: `Quotation ${quoteNumber} drafted for enquiry ${enquiryId} (₹${full.totalAmount})`, after: { quoteNumber, total: n(full.totalAmount), items: input.items.length } });
    if (enquiry.status === 'NEW') await tx.enquiry.update({ where: { id: enquiryId }, data: { status: 'IN_PROGRESS' } });
    return toDto(full);
  });
}

export async function updateQuote(id: string, input: QuoteUpdate, actorId?: string | null) {
  const q = await prisma.salesQuote.findUnique({ where: { id }, include: FULL });
  if (!q || q.deletedAt) throw notFound('Quotation');
  if (!EDITABLE_STATUSES.includes(q.status as QuoteStatus)) throw stateConflict(`A ${q.status} quotation cannot be edited; create a new version instead`);
  const before = calcFromRows(q);
  return prisma.$transaction(async tx => {
    const { items: _i, optionGroups: _g, parties: _p, validUntil, adults, children, infants, ...fields } = input;
    await tx.salesQuote.update({ where: { id }, data: { ...fields, adults: adults ?? q.adults, children: children ?? q.children, infants: infants ?? q.infants, validUntil: toDate(validUntil) ?? q.validUntil } });
    await writeBody(tx, id, input);
    const full = await recompute(tx, id);
    const after = calcFromRows(full);
    await audit(tx, { action: 'quote_updated', entityType: 'quotation', entityId: id, userId: actorId, description: `Quotation ${q.quoteNumber} updated (total ₹${before.total} → ₹${after.total})`, before: { total: before.total, items: q.lineItems.length }, after: { total: after.total, items: input.items.length } });
    return toDto(full, after);
  });
}

// ── Reads ─────────────────────────────────────────────────────

export async function getQuote(id: string) {
  const q = await prisma.salesQuote.findUnique({ where: { id }, include: FULL });
  if (!q) throw notFound('Quotation');
  const base = q.quoteNumber.replace(/-v\d+$/, '');
  const versions = await prisma.salesQuote.findMany({ where: { quoteNumber: { startsWith: base }, deletedAt: null }, select: { id: true, quoteNumber: true, version: true, status: true, isCurrent: true, totalAmount: true, createdAt: true }, orderBy: { version: 'asc' } });
  const activity = await prisma.activityLog.findMany({ where: { entityType: 'quotation', entityId: id }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, action: true, description: true, timestamp: true, userId: true, source: true } });
  return { ...toDto(q), versions: versions.map(v => ({ ...v, totalAmount: n(v.totalAmount) })), activity };
}

export async function listQuotes(qy: QuoteListQuery) {
  const term = qy.q?.trim();
  const where: Prisma.SalesQuoteWhereInput = {
    deletedAt: null,
    ...(qy.currentOnly ? { isCurrent: true } : {}),
    ...(qy.status ? { status: qy.status } : {}),
    ...(qy.enquiryId ? { enquiryId: qy.enquiryId } : {}),
    ...(qy.customerId ? { customerId: qy.customerId } : {}),
    ...(term ? { OR: [{ quoteNumber: { contains: term, mode: 'insensitive' } }, { title: { contains: term, mode: 'insensitive' } }, { customer: { name: { contains: term, mode: 'insensitive' } } }, { enquiry: { destination: { contains: term, mode: 'insensitive' } } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.salesQuote.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (qy.page - 1) * qy.pageSize, take: qy.pageSize, include: { customer: { select: { id: true, name: true } }, enquiry: { select: { id: true, enquiryNumber: true, destination: true, departureDate: true } } } }),
    prisma.salesQuote.count({ where }),
  ]);
  return {
    items: rows.map(r => ({
      id: r.id, quoteNumber: r.quoteNumber, title: r.title, version: r.version, isCurrent: r.isCurrent, status: r.status, approvalStatus: r.approvalStatus,
      customer: r.customer, enquiry: { ...r.enquiry, departureDate: r.enquiry.departureDate?.toISOString().slice(0, 10) ?? null },
      pax: r.adults + r.children + r.infants, total: n(r.totalAmount), margin: n(r.taxableAmount) - n(r.costAmount), marginPct: (r.totalsCache as { marginPct?: number })?.marginPct ?? 0,
      validUntil: r.validUntil.toISOString().slice(0, 10), sentAt: r.sentAt, createdAt: r.createdAt, convertedTripId: r.convertedTripId,
    })),
    total, page: qy.page, pageSize: qy.pageSize,
  };
}

// ── Lifecycle ─────────────────────────────────────────────────

async function load(id: string): Promise<Full> {
  const q = await prisma.salesQuote.findUnique({ where: { id }, include: FULL });
  if (!q || q.deletedAt) throw notFound('Quotation');
  return q;
}

export async function sendQuote(id: string, actorId?: string | null) {
  const q = await load(id);
  if (!['DRAFT', 'NEGOTIATING'].includes(q.status)) throw stateConflict(`A ${q.status} quotation cannot be sent`);
  if (q.approvalStatus === 'PENDING') throw stateConflict('This quotation needs an admin\'s approval before it can be sent (margin below the threshold)');
  if (q.approvalStatus === 'REJECTED') throw stateConflict('Approval was refused; revise the quotation first');
  if (q.lineItems.length === 0) throw stateConflict('Add at least one item before sending');
  return prisma.$transaction(async tx => {
    const full = await tx.salesQuote.update({ where: { id }, data: { status: 'SENT', sentAt: new Date() }, include: FULL });
    await markEnquiryQuoted(tx, q.enquiryId, actorId);
    await audit(tx, { action: 'quote_sent', entityType: 'quotation', entityId: id, userId: actorId, description: `Quotation ${q.quoteNumber} sent (₹${n(q.totalAmount)})`, before: { status: q.status }, after: { status: 'SENT' } });
    return toDto(full);
  });
}

export async function setQuoteStatus(id: string, status: QuoteStatus, reason: string | null | undefined, actorId?: string | null) {
  const q = await load(id);
  if (q.status === status) return toDto(q);
  if (!(QUOTE_TRANSITIONS[q.status as QuoteStatus] ?? []).includes(status)) throw stateConflict(`A ${q.status} quotation cannot move to ${status}`);
  if (status === 'REJECTED' && !reason) throw new AppError('VALIDATION_ERROR', 400, 'Give the customer\'s reason', { reason: 'Required when rejecting' });
  return prisma.$transaction(async tx => {
    const full = await tx.salesQuote.update({ where: { id }, data: { status, ...(status === 'VIEWED' ? { viewedAt: new Date() } : {}), ...(status === 'REJECTED' ? { rejectedAt: new Date(), rejectionReason: reason ?? null } : {}) }, include: FULL });
    if (status === 'REJECTED' || status === 'NEGOTIATING') {
      const e = await tx.enquiry.findUnique({ where: { id: q.enquiryId }, select: { status: true } });
      if (e && ['QUOTED', 'IN_PROGRESS'].includes(e.status)) await tx.enquiry.update({ where: { id: q.enquiryId }, data: { status: 'NEGOTIATING' } });
    }
    await audit(tx, { action: 'quote_status_changed', entityType: 'quotation', entityId: id, userId: actorId, description: `Quotation ${q.quoteNumber}: ${q.status} → ${status}${reason ? ` (${reason})` : ''}`, before: { status: q.status }, after: { status } });
    return toDto(full);
  });
}

export async function decideApproval(id: string, approve: boolean, comment: string | null | undefined, actor: { id?: string | null; role?: string | null }) {
  if (actor.role !== 'ADMIN') throw forbidden('Only an admin can approve quotations');
  const q = await load(id);
  if (q.approvalStatus !== 'PENDING') throw stateConflict('This quotation is not waiting for approval');
  return prisma.$transaction(async tx => {
    const full = await tx.salesQuote.update({ where: { id }, data: { approvalStatus: approve ? 'APPROVED' : 'REJECTED', approvalComment: comment ?? null, approvedBy: actor.id ?? null, approvedAt: new Date() }, include: FULL });
    await audit(tx, { action: approve ? 'quote_approved' : 'quote_approval_refused', entityType: 'quotation', entityId: id, userId: actor.id, description: `Quotation ${q.quoteNumber} ${approve ? 'approved' : 'approval refused'}${comment ? `: ${comment}` : ''}` });
    return toDto(full);
  });
}

export async function selectOption(id: string, optionGroupId: string, itemId: string, actorId?: string | null) {
  const q = await load(id);
  if (['ACCEPTED', 'REJECTED', 'EXPIRED'].includes(q.status)) throw stateConflict(`Options are fixed on a ${q.status} quotation`);
  const group = q.optionGroups.find(g => g.id === optionGroupId);
  if (!group) throw notFound('Option group');
  const item = q.lineItems.find(i => i.id === itemId && i.optionGroupId === optionGroupId);
  if (!item) throw new AppError('VALIDATION_ERROR', 400, 'Item is not part of that option group', { itemId: 'Not in group' });
  return prisma.$transaction(async tx => {
    await tx.salesQuoteItem.updateMany({ where: { salesQuoteId: id, optionGroupId }, data: { isSelectedOption: false } });
    await tx.salesQuoteItem.update({ where: { id: itemId }, data: { isSelectedOption: true } });
    const full = await recompute(tx, id);
    await audit(tx, { action: 'quote_option_selected', entityType: 'quotation', entityId: id, userId: actorId, description: `${group.name}: ${item.description} selected on ${q.quoteNumber}`, after: { optionGroupId, itemId } });
    return toDto(full);
  });
}

async function cloneQuote(tx: DbClient, src: Full, opts: { quoteNumber: string; version: number; parentQuoteId: string | null }, actorId?: string | null): Promise<Full> {
  const created = await tx.salesQuote.create({
    data: {
      enquiryId: src.enquiryId, customerId: src.customerId, quoteNumber: opts.quoteNumber, title: src.title, version: opts.version, parentQuoteId: opts.parentQuoteId,
      status: 'DRAFT', validUntil: new Date(Date.now() + 7 * 86_400_000), adults: src.adults, children: src.children, infants: src.infants,
      gstMode: src.gstMode, gstRate: src.gstRate, discountAmount: src.discountAmount, notes: src.notes, termsConditions: src.termsConditions,
      inclusions: src.inclusions, exclusions: src.exclusions, paymentPolicy: src.paymentPolicy, cancellationPolicy: src.cancellationPolicy, createdByUserId: actorId ?? null,
    },
  });
  const groupMap = new Map<string, string>(), partyMap = new Map<string, string>();
  for (const g of src.optionGroups) groupMap.set(g.id, (await tx.salesQuoteOptionGroup.create({ data: { salesQuoteId: created.id, name: g.name, sortOrder: g.sortOrder } })).id);
  for (const p of src.parties) partyMap.set(p.id, (await tx.salesQuoteParty.create({ data: { salesQuoteId: created.id, name: p.name, adults: p.adults, children: p.children, infants: p.infants, travellerIds: p.travellerIds as Prisma.InputJsonValue, sortOrder: p.sortOrder } })).id);
  for (const i of src.lineItems) {
    await tx.salesQuoteItem.create({
      data: {
        salesQuoteId: created.id, serviceType: i.serviceType, description: i.description, supplierId: i.supplierId, pricingBasis: i.pricingBasis,
        costPrice: i.costPrice, sellPrice: i.sellPrice, markup: i.markup, quantity: i.quantity, unit: i.unit, nights: i.nights, serviceDate: i.serviceDate, taxRate: i.taxRate,
        optionGroupId: i.optionGroupId ? groupMap.get(i.optionGroupId) ?? null : null, isSelectedOption: i.isSelectedOption, partyId: i.partyId ? partyMap.get(i.partyId) ?? null : null,
        customerNote: i.customerNote, internalNote: i.internalNote, details: i.details as Prisma.InputJsonValue, sortOrder: i.sortOrder,
        rates: { create: i.rates.map(r => ({ band: r.band, count: r.count, costPrice: r.costPrice, sellPrice: r.sellPrice })) },
      },
    });
  }
  return recompute(tx, created.id);
}

export async function newVersion(id: string, actorId?: string | null) {
  const q = await load(id);
  if (q.status === 'DRAFT') throw stateConflict('Edit the draft directly; versions are for quotations already sent');
  if (q.status === 'ACCEPTED') throw stateConflict('An accepted quotation cannot be revised; duplicate it instead');
  const base = q.quoteNumber.replace(/-v\d+$/, '');
  const latest = await prisma.salesQuote.findFirst({ where: { quoteNumber: { startsWith: base } }, orderBy: { version: 'desc' }, select: { version: true } });
  const version = (latest?.version ?? q.version) + 1;
  return prisma.$transaction(async tx => {
    await tx.salesQuote.updateMany({ where: { quoteNumber: { startsWith: base } }, data: { isCurrent: false } });
    const full = await cloneQuote(tx, q, { quoteNumber: `${base}-v${version}`, version, parentQuoteId: q.id }, actorId);
    await audit(tx, { action: 'quote_version_created', entityType: 'quotation', entityId: full.id, userId: actorId, description: `Version ${version} of ${base} drafted from ${q.quoteNumber}`, after: { parentQuoteId: q.id } });
    return toDto(full);
  });
}

export async function duplicateQuote(id: string, actorId?: string | null) {
  const q = await load(id);
  return prisma.$transaction(async tx => {
    const quoteNumber = await nextDisplayId(tx, 'Q', { displayPrefix: 'GK-Q' });
    const full = await cloneQuote(tx, q, { quoteNumber, version: 1, parentQuoteId: null }, actorId);
    await audit(tx, { action: 'quote_created', entityType: 'quotation', entityId: full.id, userId: actorId, description: `Quotation ${quoteNumber} duplicated from ${q.quoteNumber}` });
    return toDto(full);
  });
}

/** Hook used by the booking module (Phase 2.7). Runs inside the acceptance transaction. */
export type OnAccepted = (tx: DbClient, quote: Full, totals: QuoteTotals, opts: { splitByParty: boolean; actorId?: string | null }) => Promise<unknown>;
let onAccepted: OnAccepted | null = null;
export function registerOnAccepted(fn: OnAccepted) { onAccepted = fn; }

export async function acceptQuote(id: string, opts: { splitByParty: boolean; note?: string | null }, actorId?: string | null) {
  const q = await load(id);
  if (!['SENT', 'VIEWED', 'NEGOTIATING'].includes(q.status)) throw stateConflict(`A ${q.status} quotation cannot be accepted${q.status === 'DRAFT' ? '; send it first' : ''}`);
  if (q.approvalStatus === 'PENDING' || q.approvalStatus === 'REJECTED') throw stateConflict('Approval is outstanding on this quotation');
  const totals = calcFromRows(q);
  if (totals.warnings.some(w => /no selected option/.test(w))) throw stateConflict('Every option group needs a selected option before acceptance');
  if (opts.splitByParty && q.parties.length < 2) throw new AppError('VALIDATION_ERROR', 400, 'Family-wise split needs at least two parties on the quotation', { splitByParty: 'Add parties first' });
  return prisma.$transaction(async tx => {
    const full = await tx.salesQuote.update({ where: { id }, data: { status: 'ACCEPTED', acceptedAt: new Date() }, include: FULL });
    await tx.enquiry.update({ where: { id: q.enquiryId }, data: { status: 'WON', wonAt: new Date() } });
    await audit(tx, { action: 'quote_accepted', entityType: 'quotation', entityId: id, userId: actorId, description: `Quotation ${q.quoteNumber} accepted (₹${totals.total})${opts.note ? `: ${opts.note}` : ''}`, before: { status: q.status }, after: { status: 'ACCEPTED', total: totals.total } });
    await audit(tx, { action: 'enquiry_status_changed', entityType: 'enquiry', entityId: q.enquiryId, userId: actorId, description: `Enquiry won — quotation ${q.quoteNumber} accepted`, after: { status: 'WON' } });
    const bookings = onAccepted ? await onAccepted(tx, full, totals, { splitByParty: opts.splitByParty, actorId }) : null;
    return { quote: toDto(full, totals), bookings };
  });
}

export async function softDeleteQuote(id: string, actorId?: string | null) {
  const q = await load(id);
  if (q.status !== 'DRAFT') throw stateConflict('Only drafts can be deleted; mark others rejected or expired');
  await prisma.$transaction(async tx => {
    await tx.salesQuote.update({ where: { id }, data: { deletedAt: new Date(), isCurrent: false } });
    await audit(tx, { action: 'quote_deleted', entityType: 'quotation', entityId: id, userId: actorId, description: `Draft ${q.quoteNumber} deleted` });
  });
}

// ── Customer-facing view (no cost, margin, supplier or internal notes) ──

export async function customerView(id: string) {
  const q = await load(id);
  const t = calcFromRows(q);
  const safe = customerSafeTotals(t);
  const company = await prisma.companySettings.findFirst({ select: { companyName: true, addressLine1: true, addressLine2: true, city: true, state: true, pincode: true, phone: true, email: true, gstin: true, website: true, logoUrl: true } }).catch(() => null);
  const item = (i: Full['lineItems'][number]) => ({
    id: i.id, serviceType: i.serviceType, description: i.description, customerNote: i.customerNote, pricingBasis: i.pricingBasis,
    quantity: i.quantity, nights: i.nights, serviceDate: i.serviceDate?.toISOString().slice(0, 10) ?? null,
    sellPrice: i.pricingBasis === 'PER_PERSON' ? null : n(i.sellPrice),
    rates: i.rates.map(r => ({ band: r.band, count: r.count, sellPrice: n(r.sellPrice) })),
    optionGroupId: i.optionGroupId, isSelectedOption: i.isSelectedOption, partyId: i.partyId,
    amount: t.items.find(x => x.id === i.id)?.sell ?? 0,
  });
  return {
    quoteNumber: q.quoteNumber, title: q.title, version: q.version, status: q.status, validUntil: q.validUntil.toISOString().slice(0, 10), sentAt: q.sentAt,
    customer: { name: q.customer.name, phone: q.customer.phone, email: q.customer.email, address: q.customer.address },
    trip: { destination: q.enquiry.destination, origin: q.enquiry.origin, departureDate: q.enquiry.departureDate?.toISOString().slice(0, 10) ?? null, returnDate: q.enquiry.returnDate?.toISOString().slice(0, 10) ?? null, adults: q.adults, children: q.children, infants: q.infants },
    gstMode: q.gstMode, gstRate: n(q.gstRate),
    items: q.lineItems.filter(i => !i.optionGroupId).map(item),
    optionGroups: q.optionGroups.map(g => ({ id: g.id, name: g.name, options: q.lineItems.filter(i => i.optionGroupId === g.id).map(item) })),
    parties: q.parties.map(p => ({ id: p.id, name: p.name, adults: p.adults, children: p.children, infants: p.infants })),
    totals: safe,
    inclusions: q.inclusions, exclusions: q.exclusions, paymentPolicy: q.paymentPolicy, cancellationPolicy: q.cancellationPolicy, termsConditions: q.termsConditions, notes: q.notes,
    company,
  };
}
