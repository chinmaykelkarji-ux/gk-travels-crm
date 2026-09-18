// ============================================================
// Customers v2 — service. Owns validation of business rules, duplicate
// detection, the 360° aggregate, merge, relationships and soft delete.
// Routes only parse and call; nothing here trusts the client for ids or
// computed fields.
// ============================================================

import type { Prisma } from '@prisma/client';
import { prisma, type DbClient } from '../../lib/prisma.js';
import { audit } from '../../core/audit.js';
import { nextDisplayId } from '../../core/numbering.js';
import { AppError, notFound, stateConflict } from '../../core/errors.js';
import { normalizePhone } from '../../../../src/shared/calc/phone.js';
import { customerIdentityData, presentCustomer, presentTraveller } from '../../core/identity.js';
import type { CustomerCreate, CustomerUpdate, CustomerListQuery, RelationshipCreate, CustomerSummary } from '../../../../src/shared/contracts/customers.js';

const TODAY = () => new Date().toISOString().slice(0, 10);

function toSummary(c: {
  id: string; customerNumber: number; name: string; phone: string; phoneNormalized: string | null; email: string | null;
  type: string; companyName: string | null; city: string | null; tags: unknown; createdAt: Date; deletedAt: Date | null;
}, stats: { tripCount: number; lastTripAt: string | null }): CustomerSummary {
  return {
    id: c.id, customerNumber: c.customerNumber, name: c.name, phone: c.phone, phoneNormalized: c.phoneNormalized,
    email: c.email, type: c.type as CustomerSummary['type'], companyName: c.companyName, city: c.city,
    tags: Array.isArray(c.tags) ? (c.tags as string[]) : [],
    tripCount: stats.tripCount, lastTripAt: stats.lastTripAt,
    createdAt: c.createdAt.toISOString(), deletedAt: c.deletedAt?.toISOString() ?? null,
  };
}

async function tripStats(customerIds: string[]): Promise<Map<string, { tripCount: number; lastTripAt: string | null }>> {
  const map = new Map<string, { tripCount: number; lastTripAt: string | null }>();
  if (!customerIds.length) return map;
  const groups = await prisma.trip.groupBy({
    by: ['customerId'],
    where: { customerId: { in: customerIds } },
    _count: { id: true },
    _max: { departure: true },
  });
  for (const g of groups) if (g.customerId) map.set(g.customerId, { tripCount: g._count.id, lastTripAt: g._max.departure ?? null });
  return map;
}

// ── List / search ─────────────────────────────────────────────

export async function listCustomers(q: CustomerListQuery) {
  const term = q.q?.trim();
  const termDigits = term ? normalizePhone(term) : null;
  const where: Prisma.CustomerWhereInput = {
    ...(q.includeDeleted ? {} : { deletedAt: null }),
    ...(q.type ? { type: q.type } : {}),
    ...(q.tag ? { tags: { array_contains: [q.tag] } } : {}),
    ...(term ? {
      OR: [
        { name:        { contains: term, mode: 'insensitive' } },
        { email:       { contains: term, mode: 'insensitive' } },
        { companyName: { contains: term, mode: 'insensitive' } },
        { id:          { contains: term, mode: 'insensitive' } },
        ...(termDigits && termDigits.length >= 4 ? [{ phoneNormalized: { contains: termDigits } }] : []),
      ],
    } : {}),
  };
  const orderBy: Prisma.CustomerOrderByWithRelationInput[] =
    q.sort === 'name' ? [{ name: 'asc' }] : [{ createdAt: 'desc' }];

  const [rows, total] = await Promise.all([
    prisma.customer.findMany({ where, orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.customer.count({ where }),
  ]);
  const stats = await tripStats(rows.map(r => r.id));
  let items = rows.map(r => toSummary(r, stats.get(r.id) ?? { tripCount: 0, lastTripAt: null }));
  if (q.sort === 'trips') items = items.sort((a, b) => b.tripCount - a.tripCount);
  return { items, total, page: q.page, pageSize: q.pageSize };
}

// ── Duplicates ────────────────────────────────────────────────

export async function findDuplicateCandidates(input: { phone?: string | null; email?: string | null; name?: string | null; excludeId?: string }) {
  const phoneNormalized = normalizePhone(input.phone);
  const email = input.email?.trim().toLowerCase();
  const or: Prisma.CustomerWhereInput[] = [];
  if (phoneNormalized) or.push({ phoneNormalized });
  if (email) or.push({ email: { equals: email, mode: 'insensitive' } });
  if (!or.length) return [];
  const rows = await prisma.customer.findMany({
    where: { deletedAt: null, ...(input.excludeId ? { id: { not: input.excludeId } } : {}), OR: or },
    select: { id: true, name: true, phone: true, email: true, customerNumber: true },
    take: 10,
  });
  return rows.map(r => ({ ...r, reason: phoneNormalized && normalizePhone(r.phone) === phoneNormalized ? 'phone' : 'email' }));
}

/** Groups of live customers sharing a normalised phone — feeds the merge tool. */
export async function duplicateGroups() {
  const groups = await prisma.customer.groupBy({
    by: ['phoneNormalized'],
    where: { deletedAt: null, phoneNormalized: { not: null } },
    _count: { id: true },
    having: { id: { _count: { gt: 1 } } },
  });
  const phones = groups.map(g => g.phoneNormalized as string);
  if (!phones.length) return [];
  const rows = await prisma.customer.findMany({
    where: { deletedAt: null, phoneNormalized: { in: phones } },
    select: { id: true, name: true, phone: true, phoneNormalized: true, email: true, customerNumber: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  return phones.map(p => ({ phoneNormalized: p, customers: rows.filter(r => r.phoneNormalized === p) }));
}

// ── Create / update ───────────────────────────────────────────

export async function createCustomer(input: CustomerCreate, actorId?: string | null) {
  const phoneNormalized = normalizePhone(input.phone);
  if (!input.force) {
    const dupes = await findDuplicateCandidates({ phone: input.phone, email: input.email });
    if (dupes.length) {
      throw new AppError('CONFLICT', 409, `A customer with the same ${dupes[0].reason} already exists: ${dupes[0].name} (${dupes[0].id})`, {
        existingCustomerId: dupes[0].id,
        ...(dupes.length > 1 ? { otherMatches: dupes.slice(1).map(d => d.id).join(', ') } : {}),
      });
    }
  }
  if (input.referredByCustomerId) {
    const ref = await prisma.customer.findUnique({ where: { id: input.referredByCustomerId }, select: { id: true } });
    if (!ref) throw new AppError('VALIDATION_ERROR', 400, 'Referring customer not found', { referredByCustomerId: 'Unknown customer' });
  }

  return prisma.$transaction(async tx => {
    const id = await nextDisplayId(tx, 'CUS');
    const { force: _force, preferences, tags, passportNo, ...rest } = input;
    const customer = await tx.customer.create({
      data: {
        id,
        ...rest,
        ...customerIdentityData({ passportNo }),
        email:       input.email ?? null,
        phoneNormalized,
        preferences: preferences as Prisma.InputJsonValue,
        tags:        tags as Prisma.InputJsonValue,
        createdDate: TODAY(),
      } as Prisma.CustomerUncheckedCreateInput,
    });
    await audit(tx, {
      action: 'customer_created', entityType: 'customer', entityId: id, userId: actorId,
      description: `Customer ${customer.name} added${customer.phone ? ` (${customer.phone})` : ''}`,
      after: { name: customer.name, phone: customer.phone, email: customer.email, type: customer.type },
    });
    return presentCustomer(customer);
  });
}

export async function updateCustomer(id: string, input: CustomerUpdate, actorId?: string | null) {
  const before = await prisma.customer.findUnique({ where: { id } });
  if (!before || before.deletedAt) throw notFound('Customer');

  const { passportNo, ...plain } = input;
  const data: Prisma.CustomerUncheckedUpdateInput = { ...plain, ...customerIdentityData({ passportNo }), email: input.email === undefined ? undefined : input.email };
  if (input.phone !== undefined) {
    data.phoneNormalized = normalizePhone(input.phone);
    const dupes = await findDuplicateCandidates({ phone: input.phone, excludeId: id });
    const phoneDupe = dupes.find(d => d.reason === 'phone');
    if (phoneDupe) throw new AppError('CONFLICT', 409, `Phone number already belongs to ${phoneDupe.name} (${phoneDupe.id})`, { existingCustomerId: phoneDupe.id });
  }
  if (input.preferences !== undefined) data.preferences = input.preferences as Prisma.InputJsonValue;
  if (input.tags !== undefined) data.tags = input.tags as Prisma.InputJsonValue;
  if (input.referredByCustomerId === id) throw new AppError('VALIDATION_ERROR', 400, 'A customer cannot refer themselves', { referredByCustomerId: 'Choose another customer' });

  return prisma.$transaction(async tx => {
    const after = await tx.customer.update({ where: { id }, data });
    const [b, a] = [presentCustomer(before), presentCustomer(after)] as Record<string, unknown>[];
    const changed = Object.keys(input).filter(k => k === 'passportNo'
      ? before.passportNoEnc !== after.passportNoEnc
      : JSON.stringify(b[k]) !== JSON.stringify(a[k]));
    await audit(tx, {
      action: 'customer_updated', entityType: 'customer', entityId: id, userId: actorId,
      description: `Customer ${after.name} updated (${changed.join(', ') || 'no changes'})`,
      before: pick(b, changed), after: pick(a, changed),
    });
    // Denormalised names on trips follow the customer.
    if (input.name && input.name !== before.name) {
      await tx.trip.updateMany({ where: { customerId: id }, data: { customer: input.name } });
    }
    return presentCustomer(after);
  });
}

function pick(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = obj[k];
  return out;
}

// ── 360° view ─────────────────────────────────────────────────

export async function getCustomer360(id: string) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      relationships:   { include: { related: { select: { id: true, name: true, phone: true } } } },
      relatedTo:       { include: { customer: { select: { id: true, name: true, phone: true } } } },
      referredBy:      { select: { id: true, name: true } },
    },
  });
  if (!customer) throw notFound('Customer');

  const [trips, enquiries, salesQuotes, legacyQuotations, invoices, ledger, payments, passengers, documents, activity, tasks, referrals] = await Promise.all([
    prisma.trip.findMany({ where: { customerId: id }, orderBy: { createdAt: 'desc' }, select: { id: true, tripNumber: true, destination: true, departure: true, returnDate: true, status: true, pax: true, totalPayable: true, paidAmount: true, balanceDue: true } }),
    prisma.enquiry.findMany({ where: { customerId: id }, orderBy: { createdAt: 'desc' }, select: { id: true, destination: true, departureDate: true, pax: true, status: true, createdAt: true } }),
    prisma.salesQuote.findMany({ where: { customerId: id }, orderBy: { createdAt: 'desc' }, select: { id: true, quoteNumber: true, status: true, totalAmount: true, createdAt: true, convertedTripId: true } }),
    prisma.quotation.findMany({ where: { customerId: id }, orderBy: { createdAt: 'desc' }, select: { id: true, quotationNumber: true, status: true, totalSelling: true, createdDate: true, convertedTripId: true } }),
    prisma.invoice.findMany({ where: { customerId: id }, orderBy: { createdAt: 'desc' }, select: { id: true, invoiceNumber: true, invoiceDate: true, status: true, totalAmount: true, receivableId: true } }),
    prisma.receivable.aggregate({ where: { customerId: id }, _sum: { invoiceAmount: true, totalReceived: true, balanceDue: true } }),
    prisma.payment.findMany({ where: { customerId: id, type: 'customer' }, orderBy: { date: 'desc' }, take: 20, select: { id: true, amount: true, method: true, date: true, status: true, tripId: true, reference: true } }),
    prisma.traveller.findMany({ where: { customerId: id }, orderBy: { firstName: 'asc' }, select: { id: true, firstName: true, lastName: true, dateOfBirth: true, passportNumber: true, passportLast4: true, passportExpiry: true, nationality: true } }),
    prisma.documentLink.findMany({ where: { entityType: 'customer', entityId: id }, include: { document: { select: { id: true, title: true, type: true, status: true, fileName: true, expiresAt: true, createdAt: true } } } }),
    prisma.activityLog.findMany({ where: { OR: [{ entityType: 'customer', entityId: id }, { entityType: 'trip', entityId: { in: [] } }] }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, action: true, title: true, description: true, timestamp: true, userId: true, source: true } }),
    prisma.task.findMany({ where: { customerId: id, status: { not: 'completed' } }, orderBy: { dueDate: 'asc' }, select: { id: true, title: true, dueDate: true, priority: true, status: true, assignedTo: true } }),
    prisma.customer.findMany({ where: { referredByCustomerId: id, deletedAt: null }, select: { id: true, name: true, createdAt: true } }),
  ]);

  const revenue = trips.reduce((s, t) => s + (t.totalPayable ?? 0), 0);
  const paid    = trips.reduce((s, t) => s + (t.paidAmount ?? 0), 0);

  return {
    customer: {
      ...presentCustomer(customer),
      tags: Array.isArray(customer.tags) ? customer.tags : [],
      relationships: [
        ...customer.relationships.map(r => ({ id: r.id, kind: r.kind, note: r.note, customer: r.related })),
        ...customer.relatedTo.map(r => ({ id: r.id, kind: r.kind, note: r.note, customer: r.customer })),
      ],
      relatedTo: undefined,
    },
    stats: {
      tripCount: trips.length,
      lifetimeValue: revenue,
      lifetimePaid: paid,
      outstanding: ledger._sum.balanceDue ?? 0,
      invoiced: ledger._sum.invoiceAmount ?? 0,
      received: ledger._sum.totalReceived ?? 0,
      lastTripAt: trips.map(t => t.departure).filter(Boolean).sort().at(-1) ?? null,
    },
    trips,
    enquiries,
    quotations: [
      ...salesQuotes.map(q => ({ id: q.id, number: q.quoteNumber, status: q.status, total: Number(q.totalAmount), createdAt: q.createdAt.toISOString(), convertedTripId: q.convertedTripId, engine: 'sales' as const })),
      ...legacyQuotations.map(q => ({ id: q.id, number: q.quotationNumber, status: q.status, total: q.totalSelling, createdAt: q.createdDate, convertedTripId: q.convertedTripId, engine: 'legacy' as const })),
    ],
    invoices,
    payments,
    travellers: passengers.map(p => presentTraveller(p)),
    documents: documents.map(d => ({ ...d.document, linkId: d.id, role: d.role })),
    tasks,
    referrals,
    activity,
  };
}

// ── Relationships ─────────────────────────────────────────────

export async function addRelationship(customerId: string, input: RelationshipCreate, actorId?: string | null) {
  if (input.relatedCustomerId === customerId) throw new AppError('VALIDATION_ERROR', 400, 'A customer cannot be related to themselves');
  const [a, b] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true } }),
    prisma.customer.findUnique({ where: { id: input.relatedCustomerId }, select: { id: true, name: true } }),
  ]);
  if (!a) throw notFound('Customer');
  if (!b) throw new AppError('VALIDATION_ERROR', 400, 'Related customer not found', { relatedCustomerId: 'Unknown customer' });

  // One row per pair, whichever direction it was created from.
  const existing = await prisma.customerRelationship.findFirst({
    where: { OR: [{ customerId, relatedCustomerId: input.relatedCustomerId }, { customerId: input.relatedCustomerId, relatedCustomerId: customerId }] },
  });
  if (existing) {
    return prisma.customerRelationship.update({ where: { id: existing.id }, data: { kind: input.kind, note: input.note ?? null } });
  }
  return prisma.$transaction(async tx => {
    const rel = await tx.customerRelationship.create({ data: { customerId, relatedCustomerId: input.relatedCustomerId, kind: input.kind, note: input.note ?? null } });
    await audit(tx, { action: 'customer_updated', entityType: 'customer', entityId: customerId, userId: actorId, description: `${a.name} linked to ${b.name} (${input.kind.toLowerCase()})`, after: { relationship: input } });
    return rel;
  });
}

export async function removeRelationship(customerId: string, relationshipId: string) {
  const r = await prisma.customerRelationship.deleteMany({
    where: { id: relationshipId, OR: [{ customerId }, { relatedCustomerId: customerId }] },
  });
  if (!r.count) throw notFound('Relationship');
}

// ── Soft delete ───────────────────────────────────────────────

export async function softDeleteCustomer(id: string, actorId?: string | null) {
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer || customer.deletedAt) throw notFound('Customer');

  const [activeTrips, openInvoices, balance] = await Promise.all([
    prisma.trip.count({ where: { customerId: id, status: { in: ['draft', 'quotation', 'confirmed', 'in_progress'] } } }),
    prisma.invoice.count({ where: { customerId: id, status: 'ISSUED' } }),
    prisma.receivable.aggregate({ where: { customerId: id }, _sum: { balanceDue: true } }),
  ]);
  if (activeTrips) throw stateConflict(`Cannot remove a customer with ${activeTrips} active trip(s). Complete or cancel them first.`);
  if ((balance._sum.balanceDue ?? 0) > 0) throw stateConflict('Cannot remove a customer with an outstanding balance.');
  if (openInvoices) throw stateConflict('Cannot remove a customer with issued invoices. Their financial history must be kept.');

  return prisma.$transaction(async tx => {
    const after = await tx.customer.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit(tx, { action: 'customer_deleted', entityType: 'customer', entityId: id, userId: actorId, description: `Customer ${customer.name} removed (soft delete)`, before: { name: customer.name, phone: customer.phone } });
    return after;
  });
}

// ── Merge ─────────────────────────────────────────────────────
// Everything that points at `sourceId` is repointed at `targetId`, then the
// source is soft-deleted and marked as merged. Financial rows are moved, not
// copied, so totals are unchanged.

export async function mergeCustomers(targetId: string, sourceId: string, actorId?: string | null) {
  if (targetId === sourceId) throw new AppError('VALIDATION_ERROR', 400, 'Choose two different customers to merge');
  const [target, source] = await Promise.all([
    prisma.customer.findUnique({ where: { id: targetId } }),
    prisma.customer.findUnique({ where: { id: sourceId } }),
  ]);
  if (!target || target.deletedAt) throw notFound('Target customer');
  if (!source || source.deletedAt) throw notFound('Source customer');

  return prisma.$transaction(async tx => {
    const moved: Record<string, number> = {};
    const repoint = async (label: string, fn: () => Promise<{ count: number }>) => { moved[label] = (await fn()).count; };

    await repoint('trips',        () => tx.trip.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId, customer: target.name } }));
    await repoint('bookings',     () => tx.booking.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId, customerName: target.name } }));
    await repoint('enquiries',    () => tx.enquiry.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } }));
    await repoint('salesQuotes',  () => tx.salesQuote.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } }));
    await repoint('quotations',   () => tx.quotation.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId, customerName: target.name } }));
    await repoint('invoices',     () => tx.invoice.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } }));
    await repoint('creditNotes',  () => tx.creditNote.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } }));
    await repoint('debitNotes',   () => tx.debitNote.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } }));
    await repoint('receivables',  () => tx.receivable.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId, customerName: target.name } }));
    await repoint('payments',     () => tx.payment.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } }));
    await repoint('ledger',       () => tx.financialTransaction.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } }));
    await repoint('passengers',   () => tx.traveller.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } }));
    await repoint('tasks',        () => tx.task.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } }));
    await repoint('messages',     () => tx.messageLog.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } }));
    await repoint('vouchers',     () => tx.voucher.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } }));
    await repoint('referrals',    () => tx.customer.updateMany({ where: { referredByCustomerId: sourceId }, data: { referredByCustomerId: targetId } }));

    // Document links are unique per (document, entity) — skip ones the target already has.
    const links = await tx.documentLink.findMany({ where: { entityType: 'customer', entityId: sourceId } });
    let movedLinks = 0;
    for (const l of links) {
      const clash = await tx.documentLink.findFirst({ where: { documentId: l.documentId, entityType: 'customer', entityId: targetId } });
      if (clash) await tx.documentLink.delete({ where: { id: l.id } });
      else { await tx.documentLink.update({ where: { id: l.id }, data: { entityId: targetId } }); movedLinks++; }
    }
    moved.documents = movedLinks;

    // Relationships: repoint, drop self-links and duplicates.
    const rels = await tx.customerRelationship.findMany({ where: { OR: [{ customerId: sourceId }, { relatedCustomerId: sourceId }] } });
    for (const r of rels) {
      const a = r.customerId === sourceId ? targetId : r.customerId;
      const b = r.relatedCustomerId === sourceId ? targetId : r.relatedCustomerId;
      if (a === b) { await tx.customerRelationship.delete({ where: { id: r.id } }); continue; }
      const dup = await tx.customerRelationship.findFirst({ where: { OR: [{ customerId: a, relatedCustomerId: b }, { customerId: b, relatedCustomerId: a }], NOT: { id: r.id } } });
      if (dup) await tx.customerRelationship.delete({ where: { id: r.id } });
      else await tx.customerRelationship.update({ where: { id: r.id }, data: { customerId: a, relatedCustomerId: b } });
    }

    // Fill gaps on the target from the source (never overwrite).
    const fill: Prisma.CustomerUncheckedUpdateInput = {};
    for (const k of ['email', 'altPhone', 'address', 'city', 'state', 'companyName', 'gstNumber', 'passportExpiry', 'passportCountry', 'panNumber', 'billingAddress'] as const) {
      if (!target[k] && source[k]) (fill as Record<string, unknown>)[k] = source[k];
    }
    // Sealed passport columns travel together; plaintext is never copied.
    if (!target.passportNoEnc && !target.passportNo && source.passportNoEnc) {
      Object.assign(fill, { passportNoEnc: source.passportNoEnc, passportNoHash: source.passportNoHash, passportNoLast4: source.passportNoLast4 });
    } else if (!target.passportNoEnc && !target.passportNo && source.passportNo) {
      Object.assign(fill, customerIdentityData({ passportNo: source.passportNo }));
    }
    const mergedTags = Array.from(new Set([...(target.tags as string[] ?? []), ...(source.tags as string[] ?? [])]));
    const notes = [target.notes, source.notes ? `[merged from ${source.id}] ${source.notes}` : null].filter(Boolean).join('\n');
    const updatedTarget = await tx.customer.update({ where: { id: targetId }, data: { ...fill, tags: mergedTags, notes: notes || null } });
    await tx.customer.update({ where: { id: sourceId }, data: { deletedAt: new Date(), mergedIntoId: targetId } });

    await audit(tx, {
      action: 'customer_merged', entityType: 'customer', entityId: targetId, userId: actorId,
      description: `Customer ${source.name} (${source.id}) merged into ${target.name} (${target.id})`,
      metadata: { sourceId, moved },
    });
    await audit(tx, {
      action: 'customer_merged', entityType: 'customer', entityId: sourceId, userId: actorId,
      description: `Merged into ${target.name} (${target.id})`, metadata: { targetId },
    });
    return { target: presentCustomer(updatedTarget), moved };
  });
}

export type { DbClient };
