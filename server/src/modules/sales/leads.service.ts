// ============================================================
// Leads v2 — raw interest before it becomes a customer + enquiry.
// ============================================================

import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { audit } from '../../core/audit.js';
import { nextDisplayId } from '../../core/numbering.js';
import { AppError, notFound, stateConflict } from '../../core/errors.js';
import { getContext } from '../../core/requestContext.js';
import { normalizePhone } from '../../../../src/shared/calc/phone.js';
import { LEAD_TRANSITIONS, type LeadCreate, type LeadUpdate, type LeadListQuery, type LeadStatus, type LeadConvert } from '../../../../src/shared/contracts/sales.js';
import { createEnquiry } from './enquiries.service.js';

const OPEN: LeadStatus[] = ['new', 'contacted', 'qualified'];
const today = () => new Date().toISOString().slice(0, 10);

const assigneeSelect = { select: { id: true, name: true, role: true } } as const;

export async function assertAssignee(userId: string | null | undefined) {
  if (!userId) return null;
  const u = await prisma.user.findFirst({ where: { id: userId, isActive: true }, select: { id: true, name: true } });
  if (!u) throw new AppError('VALIDATION_ERROR', 400, 'Assignee must be an active user', { assignedToUserId: 'Unknown or inactive user' });
  return u;
}

type TimelineEntry = { at: string; type: string; text: string; userId?: string | null };
function appendTimeline(existing: unknown, entry: TimelineEntry): Prisma.InputJsonValue {
  const arr = Array.isArray(existing) ? (existing as TimelineEntry[]) : [];
  return [...arr, entry].slice(-200) as unknown as Prisma.InputJsonValue;
}

export async function findLeadDuplicates(phoneRaw: string, excludeId?: string) {
  const phoneNormalized = normalizePhone(phoneRaw);
  if (!phoneNormalized) return { leads: [], customers: [] };
  const [leads, customers] = await Promise.all([
    prisma.lead.findMany({ where: { phoneNormalized, deletedAt: null, status: { in: OPEN }, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true, name: true, status: true, createdAt: true }, take: 5 }),
    prisma.customer.findMany({ where: { phoneNormalized, deletedAt: null }, select: { id: true, name: true }, take: 5 }),
  ]);
  return { leads, customers };
}

export async function listLeads(q: LeadListQuery) {
  const term = q.q?.trim();
  const digits = term ? normalizePhone(term) : null;
  const where: Prisma.LeadWhereInput = {
    deletedAt: null,
    ...(q.status ? { status: q.status } : q.includeClosed ? {} : { status: { in: OPEN } }),
    ...(q.assignedToUserId ? { assignedToUserId: q.assignedToUserId } : {}),
    ...(q.source ? { source: q.source } : {}),
    ...(term ? { OR: [
      { name: { contains: term, mode: 'insensitive' } },
      { destination: { contains: term, mode: 'insensitive' } },
      { email: { contains: term, mode: 'insensitive' } },
      { id: { contains: term, mode: 'insensitive' } },
      ...(digits && digits.length >= 4 ? [{ phoneNormalized: { contains: digits } }] : []),
    ] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.lead.findMany({ where, orderBy: [{ createdAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { assignee: assigneeSelect } }),
    prisma.lead.count({ where }),
  ]);
  return { items: rows, total, page: q.page, pageSize: q.pageSize };
}

export async function getLead(id: string) {
  const lead = await prisma.lead.findUnique({ where: { id }, include: { assignee: assigneeSelect } });
  if (!lead) throw notFound('Lead');
  const [customer, enquiry, activity] = await Promise.all([
    lead.convertedCustomerId ? prisma.customer.findUnique({ where: { id: lead.convertedCustomerId }, select: { id: true, name: true } }) : null,
    lead.convertedEnquiryId ? prisma.enquiry.findUnique({ where: { id: lead.convertedEnquiryId }, select: { id: true, enquiryNumber: true, status: true, destination: true } }) : null,
    prisma.activityLog.findMany({ where: { entityType: 'lead', entityId: id }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, action: true, description: true, timestamp: true, userId: true, source: true } }),
  ]);
  return { ...lead, convertedCustomer: customer, convertedEnquiry: enquiry, activity };
}

export async function createLead(input: LeadCreate, actorId?: string | null) {
  const phoneNormalized = normalizePhone(input.phone);
  if (!input.force) {
    const dupes = await findLeadDuplicates(input.phone);
    if (dupes.leads.length || dupes.customers.length) {
      const first = dupes.leads[0] ? `open lead ${dupes.leads[0].name} (${dupes.leads[0].id})` : `customer ${dupes.customers[0].name} (${dupes.customers[0].id})`;
      throw new AppError('CONFLICT', 409, `This phone number already belongs to ${first}`, {
        ...(dupes.leads[0] ? { existingLeadId: dupes.leads[0].id } : {}),
        ...(dupes.customers[0] ? { existingCustomerId: dupes.customers[0].id } : {}),
      });
    }
  }
  const assignee = await assertAssignee(input.assignedToUserId);
  return prisma.$transaction(async tx => {
    const id = await nextDisplayId(tx, 'L');
    const { force: _f, ...rest } = input;
    const lead = await tx.lead.create({
      data: {
        id, ...rest, phoneNormalized, status: 'new', createdDate: today(),
        assignedTo: assignee?.name ?? null,
        timeline: appendTimeline([], { at: new Date().toISOString(), type: 'created', text: `Lead created from ${input.source}`, userId: actorId }),
      },
      include: { assignee: assigneeSelect },
    });
    await audit(tx, { action: 'lead_created', entityType: 'lead', entityId: id, userId: actorId, description: `Lead ${lead.name} (${lead.phone}) from ${lead.source}`, after: { name: lead.name, phone: lead.phone, source: lead.source, destination: lead.destination } });
    return lead;
  });
}

export async function updateLead(id: string, input: LeadUpdate, actorId?: string | null) {
  const before = await prisma.lead.findUnique({ where: { id } });
  if (!before || before.deletedAt) throw notFound('Lead');
  const data: Prisma.LeadUncheckedUpdateInput = { ...input };
  if (input.phone !== undefined) data.phoneNormalized = normalizePhone(input.phone);
  if (input.assignedToUserId !== undefined) {
    const assignee = await assertAssignee(input.assignedToUserId);
    data.assignedTo = assignee?.name ?? null;
  }
  return prisma.$transaction(async tx => {
    const after = await tx.lead.update({ where: { id }, data, include: { assignee: assigneeSelect } });
    const changed = Object.keys(input).filter(k => JSON.stringify((before as Record<string, unknown>)[k]) !== JSON.stringify((after as Record<string, unknown>)[k]));
    await audit(tx, { action: 'lead_updated', entityType: 'lead', entityId: id, userId: actorId, description: `Lead ${after.name} updated (${changed.join(', ') || 'no changes'})`, before: pick(before, changed), after: pick(after, changed) });
    return after;
  });
}

function pick(obj: Record<string, unknown>, keys: string[]) { const o: Record<string, unknown> = {}; for (const k of keys) o[k] = obj[k]; return o; }

export async function setLeadStatus(id: string, status: LeadStatus, opts: { lostReason?: string | null; note?: string | null }, actorId?: string | null) {
  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead || lead.deletedAt) throw notFound('Lead');
  if (lead.status === status) return lead;
  const allowed = LEAD_TRANSITIONS[lead.status as LeadStatus] ?? [];
  if (!allowed.includes(status)) throw stateConflict(`A ${lead.status} lead cannot move to ${status}${status === 'converted' ? ' directly; use Convert' : ''}`);
  return prisma.$transaction(async tx => {
    const after = await tx.lead.update({
      where: { id },
      data: {
        status,
        lostReason: status === 'lost' ? opts.lostReason ?? null : null,
        lastContactedAt: status === 'contacted' ? new Date() : undefined,
        timeline: appendTimeline(lead.timeline, { at: new Date().toISOString(), type: 'status', text: `${lead.status} → ${status}${opts.note ? `: ${opts.note}` : ''}${opts.lostReason ? ` (${opts.lostReason})` : ''}`, userId: actorId }),
      },
      include: { assignee: assigneeSelect },
    });
    await audit(tx, { action: 'lead_status_changed', entityType: 'lead', entityId: id, userId: actorId, description: `Lead ${lead.name}: ${lead.status} → ${status}${opts.lostReason ? ` (${opts.lostReason})` : ''}`, before: { status: lead.status }, after: { status } });
    return after;
  });
}

export async function assignLead(id: string, userId: string | null, actorId?: string | null) {
  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead || lead.deletedAt) throw notFound('Lead');
  const assignee = await assertAssignee(userId);
  return prisma.$transaction(async tx => {
    const after = await tx.lead.update({ where: { id }, data: { assignedToUserId: userId, assignedTo: assignee?.name ?? null, timeline: appendTimeline(lead.timeline, { at: new Date().toISOString(), type: 'assigned', text: assignee ? `Assigned to ${assignee.name}` : 'Unassigned', userId: actorId }) }, include: { assignee: assigneeSelect } });
    await audit(tx, { action: 'lead_assigned', entityType: 'lead', entityId: id, userId: actorId, description: `Lead ${lead.name} ${assignee ? `assigned to ${assignee.name}` : 'unassigned'}`, before: { assignedToUserId: lead.assignedToUserId }, after: { assignedToUserId: userId } });
    return after;
  });
}

export async function addLeadNote(id: string, note: string, actorId?: string | null) {
  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead || lead.deletedAt) throw notFound('Lead');
  return prisma.$transaction(async tx => {
    const after = await tx.lead.update({ where: { id }, data: { lastContactedAt: new Date(), timeline: appendTimeline(lead.timeline, { at: new Date().toISOString(), type: 'note', text: note, userId: actorId }) }, include: { assignee: assigneeSelect } });
    await audit(tx, { action: 'lead_note', entityType: 'lead', entityId: id, userId: actorId, description: note.slice(0, 200) });
    return after;
  });
}

export async function softDeleteLead(id: string, actorId?: string | null) {
  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead || lead.deletedAt) throw notFound('Lead');
  if (lead.status === 'converted') throw stateConflict('Converted leads are kept for reporting');
  return prisma.$transaction(async tx => {
    await tx.lead.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit(tx, { action: 'lead_deleted', entityType: 'lead', entityId: id, userId: actorId, description: `Lead ${lead.name} removed` });
  });
}

/** Lead → customer (matched by phone or created) + enquiry. */
export async function convertLead(id: string, input: LeadConvert, actorId?: string | null) {
  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead || lead.deletedAt) throw notFound('Lead');
  if (lead.status === 'converted') throw stateConflict('Lead is already converted');
  if (lead.status === 'lost') throw stateConflict('Reopen the lead before converting it');

  let customerId = input.customerId ?? null;
  if (customerId) {
    const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, deletedAt: true } });
    if (!c || c.deletedAt) throw new AppError('VALIDATION_ERROR', 400, 'Customer not found', { customerId: 'Unknown customer' });
  } else {
    const match = await prisma.customer.findFirst({ where: { phoneNormalized: normalizePhone(lead.phone), deletedAt: null }, select: { id: true } });
    customerId = match?.id ?? null;
  }

  const ctx = getContext();
  return prisma.$transaction(async tx => {
    if (!customerId) {
      customerId = await nextDisplayId(tx, 'CUS');
      await tx.customer.create({ data: { id: customerId, name: lead.name, phone: lead.phone, phoneNormalized: normalizePhone(lead.phone), email: lead.email, source: lead.source, sourceLeadId: lead.id, createdDate: today() } });
      await audit(tx, { action: 'customer_created', entityType: 'customer', entityId: customerId, userId: actorId, description: `Customer ${lead.name} created from lead ${lead.id}`, after: { name: lead.name, phone: lead.phone } });
    }
    const enquiry = await createEnquiry({
      customerId, leadId: lead.id, newCustomer: null,
      source: sourceForEnquiry(lead.source),
      destination: input.destination ?? (lead.destination || 'To be decided'),
      origin: null, departureDate: input.departureDate ?? lead.travelDate, returnDate: input.returnDate ?? null, flexibleDates: false,
      adults: input.adults ?? Math.max(1, lead.pax - (input.children ?? 0) - (input.infants ?? 0)), children: input.children ?? 0, infants: input.infants ?? 0,
      rooms: null, tripType: lead.tripType || null, hotelCategory: null, mealPlan: null,
      budget: input.budget ?? lead.budget ?? null, budgetMax: null,
      requirements: input.requirements ?? (lead.notes || null), preferences: {}, priority: (lead.priority as 'low' | 'medium' | 'high') ?? 'medium',
      assignedToUserId: lead.assignedToUserId ?? null, notes: null,
    }, actorId, tx);

    const after = await tx.lead.update({
      where: { id },
      data: {
        status: 'converted', convertedCustomerId: customerId, convertedEnquiryId: enquiry.id, convertedAt: new Date().toISOString(), convertedBy: ctx?.userId ?? actorId ?? null,
        timeline: appendTimeline(lead.timeline, { at: new Date().toISOString(), type: 'converted', text: `Converted → customer ${customerId}, enquiry ${enquiry.enquiryNumber ?? enquiry.id}`, userId: actorId }),
      },
      include: { assignee: assigneeSelect },
    });
    await audit(tx, { action: 'lead_converted', entityType: 'lead', entityId: id, userId: actorId, description: `Lead ${lead.name} converted to ${customerId} / ${enquiry.enquiryNumber ?? enquiry.id}`, after: { customerId, enquiryId: enquiry.id } });
    return { lead: after, customerId, enquiry };
  });
}

function sourceForEnquiry(leadSource: string): 'DIRECT' | 'WHATSAPP' | 'PHONE' | 'EMAIL' | 'REFERRAL' | 'WEBSITE' {
  const s = leadSource.toLowerCase();
  if (s.includes('whatsapp')) return 'WHATSAPP';
  if (s.includes('phone') || s.includes('call')) return 'PHONE';
  if (s.includes('email')) return 'EMAIL';
  if (s.includes('referral') || s.includes('repeat')) return 'REFERRAL';
  if (s.includes('website') || s.includes('google') || s.includes('instagram') || s.includes('facebook')) return 'WEBSITE';
  return 'DIRECT';
}
