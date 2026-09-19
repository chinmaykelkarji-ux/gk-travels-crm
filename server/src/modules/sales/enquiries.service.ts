// ============================================================
// Enquiries v2 — a concrete trip requirement for a customer. Pax is kept as
// adults/children/infants (pax = sum) so quotes can price per person.
// ============================================================

import type { Prisma } from '@prisma/client';
import { prisma, type DbClient } from '../../lib/prisma.js';
import { audit } from '../../core/audit.js';
import { nextDisplayId, nextFreeDisplayId } from '../../core/numbering.js';
import { AppError, notFound, stateConflict } from '../../core/errors.js';
import { normalizePhone } from '../../../../src/shared/calc/phone.js';
import { ENQUIRY_TRANSITIONS, paxTotal, type EnquiryCreate, type EnquiryUpdate, type EnquiryListQuery, type EnquiryStatus } from '../../../../src/shared/contracts/sales.js';
import { randomUUID } from 'node:crypto';

const OPEN: EnquiryStatus[] = ['NEW', 'IN_PROGRESS', 'QUOTED', 'NEGOTIATING'];
const today = () => new Date().toISOString().slice(0, 10);
const toDate = (s: string | null | undefined) => (s ? new Date(`${s}T00:00:00.000Z`) : null);
const assigneeSelect = { select: { id: true, name: true, role: true } } as const;
const customerSelect = { select: { id: true, name: true, phone: true, email: true, city: true } } as const;

async function assertAssignee(db: DbClient, userId: string | null | undefined) {
  if (!userId) return null;
  const u = await db.user.findFirst({ where: { id: userId, isActive: true }, select: { id: true, name: true } });
  if (!u) throw new AppError('VALIDATION_ERROR', 400, 'Assignee must be an active user', { assignedToUserId: 'Unknown or inactive user' });
  return u;
}

export async function listEnquiries(q: EnquiryListQuery) {
  const term = q.q?.trim();
  const digits = term ? normalizePhone(term) : null;
  const where: Prisma.EnquiryWhereInput = {
    deletedAt: null,
    ...(q.status ? { status: q.status } : q.includeClosed ? {} : { status: { in: OPEN } }),
    ...(q.assignedToUserId ? { assignedToUserId: q.assignedToUserId } : {}),
    ...(q.customerId ? { customerId: q.customerId } : {}),
    ...(term ? { OR: [
      { destination: { contains: term, mode: 'insensitive' } },
      { enquiryNumber: { contains: term, mode: 'insensitive' } },
      { customer: { name: { contains: term, mode: 'insensitive' } } },
      ...(digits && digits.length >= 4 ? [{ customer: { phoneNormalized: { contains: digits } } }] : []),
    ] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.enquiry.findMany({ where, orderBy: [{ createdAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { customer: customerSelect, assignee: assigneeSelect, _count: { select: { salesQuotes: true } } } }),
    prisma.enquiry.count({ where }),
  ]);
  return { items: rows.map(toDto), total, page: q.page, pageSize: q.pageSize };
}

type Row = Prisma.EnquiryGetPayload<{ include: { customer: typeof customerSelect; assignee: typeof assigneeSelect; _count: { select: { salesQuotes: true } } } }>;
function toDto(e: Row) {
  const { _count, budget, budgetMax, ...rest } = e;
  return { ...rest, budget: budget === null ? null : Number(budget), budgetMax: budgetMax === null ? null : Number(budgetMax), quoteCount: _count.salesQuotes, departureDate: e.departureDate?.toISOString().slice(0, 10) ?? null, returnDate: e.returnDate?.toISOString().slice(0, 10) ?? null };
}

export async function getEnquiry(id: string) {
  const e = await prisma.enquiry.findUnique({
    where: { id },
    include: {
      customer: customerSelect, assignee: assigneeSelect, _count: { select: { salesQuotes: true } },
      lead: { select: { id: true, name: true, source: true, status: true } },
      salesQuotes: { select: { id: true, quoteNumber: true, status: true, totalAmount: true, validUntil: true, createdAt: true, convertedTripId: true }, orderBy: { createdAt: 'desc' } },
    },
  });
  if (!e) throw notFound('Enquiry');
  const [tasks, activity] = await Promise.all([
    prisma.task.findMany({ where: { OR: [{ id: { startsWith: `SYS-TSK-enq-${id}` } }, { description: { contains: `[${e.enquiryNumber ?? id}]` } }], status: { not: 'completed' } }, orderBy: { dueDate: 'asc' }, select: { id: true, title: true, dueDate: true, status: true, priority: true, assignedTo: true } }),
    prisma.activityLog.findMany({ where: { entityType: 'enquiry', entityId: id }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, action: true, description: true, timestamp: true, userId: true, source: true } }),
  ]);
  const { salesQuotes, lead, ...row } = e;
  return { ...toDto(row as Row), lead, quotes: salesQuotes.map(q => ({ ...q, totalAmount: Number(q.totalAmount) })), tasks, activity };
}

export async function createEnquiry(input: EnquiryCreate, actorId?: string | null, db?: DbClient) {
  const run = async (tx: DbClient) => {
    let customerId = input.customerId ?? null;
    if (!customerId && input.newCustomer) {
      const phoneNormalized = normalizePhone(input.newCustomer.phone);
      const existing = phoneNormalized ? await tx.customer.findFirst({ where: { phoneNormalized, deletedAt: null }, select: { id: true } }) : null;
      if (existing) customerId = existing.id;
      else {
        customerId = await nextFreeDisplayId(tx, 'CUS');
        await tx.customer.create({ data: { id: customerId, name: input.newCustomer.name, phone: input.newCustomer.phone, phoneNormalized, email: input.newCustomer.email ?? null, source: input.source, createdDate: today() } });
        await audit(tx, { action: 'customer_created', entityType: 'customer', entityId: customerId, userId: actorId, description: `Customer ${input.newCustomer.name} created with enquiry`, after: { name: input.newCustomer.name, phone: input.newCustomer.phone } });
      }
    }
    if (!customerId) throw new AppError('VALIDATION_ERROR', 400, 'Customer is required', { customerId: 'Choose a customer' });
    const customer = await tx.customer.findUnique({ where: { id: customerId }, select: { id: true, deletedAt: true } });
    if (!customer || customer.deletedAt) throw new AppError('VALIDATION_ERROR', 400, 'Customer not found', { customerId: 'Unknown customer' });
    if (input.leadId) {
      const lead = await tx.lead.findUnique({ where: { id: input.leadId }, select: { id: true } });
      if (!lead) throw new AppError('VALIDATION_ERROR', 400, 'Lead not found', { leadId: 'Unknown lead' });
    }
    const assignee = await assertAssignee(tx, input.assignedToUserId);
    const enquiryNumber = await nextDisplayId(tx, 'ENQ');
    const { customerId: _c, newCustomer: _n, ...fields } = input;
    const e = await tx.enquiry.create({
      data: {
        ...fields, customerId, enquiryNumber,
        departureDate: toDate(fields.departureDate), returnDate: toDate(fields.returnDate),
        pax: paxTotal(fields), preferences: fields.preferences as Prisma.InputJsonValue,
        assignedTo: assignee?.name ?? null,
      },
      include: { customer: customerSelect, assignee: assigneeSelect, _count: { select: { salesQuotes: true } } },
    });
    await audit(tx, { action: 'enquiry_created', entityType: 'enquiry', entityId: e.id, userId: actorId, description: `Enquiry ${enquiryNumber}: ${e.destination} for ${e.customer.name} (${e.pax} pax)`, after: { destination: e.destination, adults: e.adults, children: e.children, infants: e.infants, departureDate: fields.departureDate } });
    return toDto(e);
  };
  return db ? run(db) : prisma.$transaction(run);
}

export async function updateEnquiry(id: string, input: EnquiryUpdate, actorId?: string | null) {
  const before = await prisma.enquiry.findUnique({ where: { id } });
  if (!before || before.deletedAt) throw notFound('Enquiry');
  if (before.status === 'WON' || before.status === 'LOST') throw stateConflict(`A ${before.status.toLowerCase()} enquiry is closed; reopen it first`);
  const data: Prisma.EnquiryUncheckedUpdateInput = { ...input, preferences: input.preferences as Prisma.InputJsonValue | undefined };
  if (input.departureDate !== undefined) data.departureDate = toDate(input.departureDate);
  if (input.returnDate !== undefined) data.returnDate = toDate(input.returnDate);
  const adults = input.adults ?? before.adults, children = input.children ?? before.children, infants = input.infants ?? before.infants;
  data.pax = adults + children + infants;
  if (input.assignedToUserId !== undefined) { const a = await assertAssignee(prisma, input.assignedToUserId); data.assignedTo = a?.name ?? null; }
  return prisma.$transaction(async tx => {
    const after = await tx.enquiry.update({ where: { id }, data, include: { customer: customerSelect, assignee: assigneeSelect, _count: { select: { salesQuotes: true } } } });
    const changed = Object.keys(input).filter(k => JSON.stringify((before as Record<string, unknown>)[k]) !== JSON.stringify((after as Record<string, unknown>)[k]));
    await audit(tx, { action: 'enquiry_updated', entityType: 'enquiry', entityId: id, userId: actorId, description: `Enquiry ${after.enquiryNumber ?? id} updated (${changed.join(', ') || 'no changes'})`, before: pick(before, changed), after: pick(after, changed) });
    return toDto(after);
  });
}

function pick(obj: Record<string, unknown>, keys: string[]) { const o: Record<string, unknown> = {}; for (const k of keys) o[k] = obj[k]; return o; }

export async function setEnquiryStatus(id: string, status: EnquiryStatus, opts: { lostReason?: string | null; note?: string | null }, actorId?: string | null) {
  const e = await prisma.enquiry.findUnique({ where: { id } });
  if (!e || e.deletedAt) throw notFound('Enquiry');
  if (e.status === status) return getEnquiry(id);
  const allowed = ENQUIRY_TRANSITIONS[e.status as EnquiryStatus] ?? [];
  if (!allowed.includes(status)) throw stateConflict(`A ${e.status} enquiry cannot move to ${status}`);
  await prisma.$transaction(async tx => {
    await tx.enquiry.update({ where: { id }, data: { status, lostReason: status === 'LOST' ? opts.lostReason ?? null : null, lostAt: status === 'LOST' ? new Date() : null, wonAt: status === 'WON' ? new Date() : null } });
    await audit(tx, { action: 'enquiry_status_changed', entityType: 'enquiry', entityId: id, userId: actorId, description: `Enquiry ${e.enquiryNumber ?? id}: ${e.status} → ${status}${opts.note ? ` — ${opts.note}` : ''}${opts.lostReason ? ` (${opts.lostReason})` : ''}`, before: { status: e.status }, after: { status } });
  });
  return getEnquiry(id);
}

/** Called by the quotation engine when a quote is sent; NEW/IN_PROGRESS → QUOTED. */
export async function markEnquiryQuoted(db: DbClient, id: string, actorId?: string | null) {
  const e = await db.enquiry.findUnique({ where: { id }, select: { id: true, status: true, enquiryNumber: true } });
  if (!e || !['NEW', 'IN_PROGRESS'].includes(e.status)) return;
  await db.enquiry.update({ where: { id }, data: { status: 'QUOTED' } });
  await audit(db, { action: 'enquiry_status_changed', entityType: 'enquiry', entityId: id, userId: actorId, description: `Enquiry ${e.enquiryNumber ?? id}: ${e.status} → QUOTED (quote sent)`, before: { status: e.status }, after: { status: 'QUOTED' } });
}

export async function assignEnquiry(id: string, userId: string | null, actorId?: string | null) {
  const e = await prisma.enquiry.findUnique({ where: { id } });
  if (!e || e.deletedAt) throw notFound('Enquiry');
  const assignee = await assertAssignee(prisma, userId);
  await prisma.$transaction(async tx => {
    await tx.enquiry.update({ where: { id }, data: { assignedToUserId: userId, assignedTo: assignee?.name ?? null } });
    await audit(tx, { action: 'enquiry_assigned', entityType: 'enquiry', entityId: id, userId: actorId, description: `Enquiry ${e.enquiryNumber ?? id} ${assignee ? `assigned to ${assignee.name}` : 'unassigned'}`, before: { assignedToUserId: e.assignedToUserId }, after: { assignedToUserId: userId } });
  });
  return getEnquiry(id);
}

export async function addEnquiryNote(id: string, note: string, actorId?: string | null) {
  const e = await prisma.enquiry.findUnique({ where: { id }, select: { id: true, enquiryNumber: true, deletedAt: true } });
  if (!e || e.deletedAt) throw notFound('Enquiry');
  await audit(prisma, { action: 'enquiry_note', entityType: 'enquiry', entityId: id, userId: actorId, description: note });
  return getEnquiry(id);
}

export async function createFollowUp(id: string, input: { dueDate: string; title?: string; note?: string | null; assignedToUserId?: string | null }, actorId?: string | null) {
  const e = await prisma.enquiry.findUnique({ where: { id }, include: { customer: { select: { id: true, name: true } } } });
  if (!e || e.deletedAt) throw notFound('Enquiry');
  const assignee = await assertAssignee(prisma, input.assignedToUserId ?? e.assignedToUserId);
  const task = await prisma.task.create({
    data: {
      id: `SYS-TSK-enq-${id}-${randomUUID().slice(0, 8)}`,
      title: input.title ?? `Follow up ${e.customer.name} — ${e.destination}`,
      description: `[${e.enquiryNumber ?? id}] ${input.note ?? ''}`.trim(),
      priority: e.priority, status: 'pending', customerId: e.customerId, dueDate: input.dueDate, assignedTo: assignee?.name ?? null, createdDate: today(),
    },
  });
  await audit(prisma, { action: 'enquiry_follow_up', entityType: 'enquiry', entityId: id, userId: actorId, description: `Follow-up on ${input.dueDate}${assignee ? ` for ${assignee.name}` : ''}${input.note ? `: ${input.note}` : ''}`, after: { taskId: task.id } });
  return task;
}

export async function softDeleteEnquiry(id: string, actorId?: string | null) {
  const e = await prisma.enquiry.findUnique({ where: { id }, include: { _count: { select: { salesQuotes: true } } } });
  if (!e || e.deletedAt) throw notFound('Enquiry');
  if (e._count.salesQuotes > 0) throw stateConflict('Enquiries with quotations are kept; mark it lost instead');
  await prisma.$transaction(async tx => {
    await tx.enquiry.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit(tx, { action: 'enquiry_deleted', entityType: 'enquiry', entityId: id, userId: actorId, description: `Enquiry ${e.enquiryNumber ?? id} removed` });
  });
}
