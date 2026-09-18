// ============================================================
// Booking contracts (Phase 2.7). Created when a quotation is accepted — one
// for the whole group, or one per party for family-wise billing. Each
// contract owns a payment schedule and a legacy Trip (with TripService rows)
// so the existing operations and finance screens keep working.
// ============================================================

import type { Prisma } from '@prisma/client';
import { prisma, type DbClient } from '../../lib/prisma.js';
import { audit } from '../../core/audit.js';
import { nextDisplayId } from '../../core/numbering.js';
import { AppError, notFound, stateConflict } from '../../core/errors.js';
import { defaultSchedule, validateSchedule, allocatePayments, scheduleSummary } from '../../../../src/shared/calc/schedule.js';
import { CONTRACT_TRANSITIONS, type ContractListQuery, type ContractStatus, type ScheduleInput } from '../../../../src/shared/contracts/contracts.js';
import { registerOnAccepted, type OnAccepted } from '../quotations/service.js';
import { syncTripTravellersFromIds } from '../travellers/service.js';

const today = () => new Date().toISOString().slice(0, 10);
const n = (v: Prisma.Decimal | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));
const r2 = (x: number) => Math.round(x * 100) / 100;
const isoDay = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

/** GK-YYYY-NNNN trip ids from the sequence; skips numbers the legacy client already used. */
async function nextTripId(tx: DbClient): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const id = await nextDisplayId(tx, 'GK');
    if (!(await tx.trip.findUnique({ where: { id }, select: { id: true } }))) return id;
  }
  throw new Error('Could not allocate a trip id');
}

const TRIP_STATUS: Record<ContractStatus, string> = { CONFIRMED: 'confirmed', IN_PROGRESS: 'in_progress', COMPLETED: 'completed', CANCELLED: 'cancelled' };

// ── Creation on acceptance ────────────────────────────────────

export const createContractsFromQuote: OnAccepted = async (tx, quote, totals, { splitByParty, actorId }) => {
  const pax = { adults: quote.adults, children: quote.children, infants: quote.infants };
  const totalPax = pax.adults + pax.children + pax.infants || 1;
  const selected = quote.lineItems.filter(i => totals.items.find(t => t.id === i.id)?.included);

  type Plan = { partyId: string | null; partyName: string | null; pax: { adults: number; children: number; infants: number }; share: number; travellerIds: string[]; totals: { subtotal: number; tax: number; total: number; cost: number } };
  const plans: Plan[] = splitByParty
    ? quote.parties.map(p => {
        const pt = totals.parties.find(x => x.partyId === p.id)!;
        const ppax = p.adults + p.children + p.infants;
        const partyPax = quote.parties.reduce((s, x) => s + x.adults + x.children + x.infants, 0) || 1;
        return { partyId: p.id, partyName: p.name, pax: { adults: p.adults, children: p.children, infants: p.infants }, share: ppax / partyPax, travellerIds: Array.isArray(p.travellerIds) ? (p.travellerIds as string[]) : [], totals: { subtotal: pt.sell, tax: pt.tax, total: pt.total, cost: pt.cost } };
      })
    : [{ partyId: null, partyName: null, pax, share: 1, travellerIds: quote.parties.flatMap(p => (Array.isArray(p.travellerIds) ? (p.travellerIds as string[]) : [])), totals: { subtotal: totals.subtotal, tax: totals.tax, total: totals.total, cost: totals.cost } }];

  const created: string[] = [];
  let firstTripId: string | null = null;
  for (const plan of plans) {
    const contractNumber = await nextDisplayId(tx, 'BK');
    const tripId = await nextTripId(tx);
    const paxCount = plan.pax.adults + plan.pax.children + plan.pax.infants || totalPax;
    const taxable = r2(plan.totals.total - plan.totals.tax);
    const margin = r2(taxable - plan.totals.cost);
    const trip = await tx.trip.create({
      data: {
        id: tripId, customer: quote.customer.name, phone: quote.customer.phone, email: quote.customer.email, customerId: quote.customerId,
        destination: quote.enquiry.destination, type: 'Leisure', pax: paxCount, departure: isoDay(quote.enquiry.departureDate), returnDate: isoDay(quote.enquiry.returnDate),
        status: 'confirmed', totalAmount: taxable, gstRate: n(quote.gstRate), discount: r2(totals.discountAmount * plan.share), gstAmount: plan.totals.tax, gstMode: quote.gstMode,
        taxableAmount: taxable, totalPayable: plan.totals.total, paidAmount: 0, balanceDue: plan.totals.total, supplierCost: plan.totals.cost, grossMargin: margin,
        marginPct: taxable > 0 ? r2(margin / taxable * 100) : 0, notes: `From quotation ${quote.quoteNumber}${plan.partyName ? ` — ${plan.partyName}` : ''}`,
        createdDate: today(), createdBy: actorId ?? null, sourceLeadId: null, passengerIds: plan.travellerIds as Prisma.InputJsonValue,
      },
    });
    if (!firstTripId) firstTripId = trip.id;

    for (const item of selected) {
      const own = item.partyId === plan.partyId || (!splitByParty);
      const shared = splitByParty && !item.partyId;
      if (!own && !shared) continue;
      const it = totals.items.find(t => t.id === item.id)!;
      const factor = shared ? plan.share : 1;
      await tx.tripService.create({
        data: {
          tripId: trip.id, type: item.serviceType, status: 'REQUESTED', serviceDate: item.serviceDate ?? quote.enquiry.departureDate ?? new Date(),
          supplierId: item.supplierId, costPrice: r2(it.cost * factor), sellPrice: r2(it.sell * factor),
          details: { ...(item.details as object), pricingBasis: item.pricingBasis, quoteItemId: item.id, ...(shared ? { sharedAcrossParties: true, share: r2(plan.share) } : {}) } as Prisma.InputJsonValue,
          notes: item.description + (item.customerNote ? ` — ${item.customerNote}` : ''),
        },
      });
    }
    if (plan.travellerIds.length) await syncTripTravellersFromIds(tx, trip.id, plan.travellerIds);

    const contract = await tx.bookingContract.create({
      data: {
        contractNumber, salesQuoteId: quote.id, enquiryId: quote.enquiryId, customerId: quote.customerId, partyId: plan.partyId, partyName: plan.partyName, tripId: trip.id,
        destination: quote.enquiry.destination, departureDate: quote.enquiry.departureDate, returnDate: quote.enquiry.returnDate,
        adults: plan.pax.adults, children: plan.pax.children, infants: plan.pax.infants, travellerIds: plan.travellerIds as Prisma.InputJsonValue,
        subtotal: plan.totals.subtotal, discountAmount: r2(totals.discountAmount * plan.share), taxAmount: plan.totals.tax, totalAmount: plan.totals.total, costAmount: plan.totals.cost,
        gstMode: quote.gstMode, gstRate: quote.gstRate, paymentPolicy: quote.paymentPolicy, cancellationPolicy: quote.cancellationPolicy, createdByUserId: actorId ?? null,
        schedule: { create: defaultSchedule(plan.totals.total, { today: today(), departureDate: isoDay(quote.enquiry.departureDate) }).map(s => ({ seq: s.seq, label: s.label, dueDate: new Date(`${s.dueDate}T00:00:00.000Z`), amount: s.amount })) },
      },
    });
    created.push(contract.id);
    await audit(tx, { action: 'contract_created', entityType: 'contract', entityId: contract.id, userId: actorId, description: `Booking ${contractNumber} (${plan.partyName ?? 'whole group'}) ₹${plan.totals.total} — trip ${trip.id}`, after: { tripId: trip.id, total: plan.totals.total, quoteId: quote.id } });
    await audit(tx, { action: 'trip_created', entityType: 'trip', entityId: trip.id, userId: actorId, description: `Trip ${trip.id} created from quotation ${quote.quoteNumber}`, after: { contractId: contract.id } });
    await tx.outboxEvent.create({ data: { eventType: 'BOOKING_CONFIRMED', payload: { tripId: trip.id, salesQuoteId: quote.id, contractId: contract.id }, idempotencyKey: `booking-confirmed:${contract.id}` } });
  }
  await tx.salesQuote.update({ where: { id: quote.id }, data: { convertedTripId: firstTripId, convertedAt: new Date() } });
  return created;
};
registerOnAccepted(createContractsFromQuote);

// ── Reads ─────────────────────────────────────────────────────

const INCLUDE = { customer: { select: { id: true, name: true, phone: true } }, salesQuote: { select: { id: true, quoteNumber: true, title: true } }, schedule: { orderBy: { seq: 'asc' as const } }, trip: { select: { id: true, status: true, paidAmount: true, balanceDue: true } } } as const;
type Row = Prisma.BookingContractGetPayload<{ include: typeof INCLUDE }>;

function toDto(c: Row) {
  const items = c.schedule.map(s => ({ id: s.id, seq: s.seq, label: s.label, dueDate: s.dueDate.toISOString().slice(0, 10), amount: n(s.amount) }));
  const received = n(c.trip?.paidAmount);
  const states = allocatePayments(items, received, today());
  const summary = scheduleSummary(states);
  return {
    id: c.id, contractNumber: c.contractNumber, status: c.status, salesQuoteId: c.salesQuoteId, quote: c.salesQuote, enquiryId: c.enquiryId, customer: c.customer,
    partyId: c.partyId, partyName: c.partyName, tripId: c.tripId, trip: c.trip, destination: c.destination,
    departureDate: isoDay(c.departureDate), returnDate: isoDay(c.returnDate), adults: c.adults, children: c.children, infants: c.infants, travellerIds: Array.isArray(c.travellerIds) ? c.travellerIds : [],
    subtotal: n(c.subtotal), discountAmount: n(c.discountAmount), taxAmount: n(c.taxAmount), totalAmount: n(c.totalAmount), costAmount: n(c.costAmount), gstMode: c.gstMode, gstRate: n(c.gstRate),
    paymentPolicy: c.paymentPolicy, cancellationPolicy: c.cancellationPolicy, notes: c.notes, cancelledAt: c.cancelledAt, cancellationReason: c.cancellationReason, completedAt: c.completedAt, createdAt: c.createdAt,
    schedule: states, received, payments: summary,
  };
}
export type ContractDto = ReturnType<typeof toDto>;

export async function listContracts(q: ContractListQuery) {
  const term = q.q?.trim();
  const where: Prisma.BookingContractWhereInput = {
    ...(q.status ? { status: q.status } : q.includeClosed ? {} : { status: { in: ['CONFIRMED', 'IN_PROGRESS'] } }),
    ...(q.customerId ? { customerId: q.customerId } : {}),
    ...(q.salesQuoteId ? { salesQuoteId: q.salesQuoteId } : {}),
    ...(term ? { OR: [{ contractNumber: { contains: term, mode: 'insensitive' } }, { destination: { contains: term, mode: 'insensitive' } }, { tripId: { contains: term, mode: 'insensitive' } }, { customer: { name: { contains: term, mode: 'insensitive' } } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.bookingContract.findMany({ where, orderBy: [{ departureDate: 'asc' }, { createdAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: INCLUDE }),
    prisma.bookingContract.count({ where }),
  ]);
  return { items: rows.map(toDto), total, page: q.page, pageSize: q.pageSize };
}

export async function getContract(id: string) {
  const c = await prisma.bookingContract.findUnique({ where: { id }, include: INCLUDE });
  if (!c) throw notFound('Booking');
  const [services, activity] = await Promise.all([
    c.tripId ? prisma.tripService.findMany({ where: { tripId: c.tripId }, orderBy: { serviceDate: 'asc' }, include: { supplier: { select: { id: true, name: true } } } }) : [],
    prisma.activityLog.findMany({ where: { OR: [{ entityType: 'contract', entityId: id }, ...(c.tripId ? [{ entityType: 'trip', entityId: c.tripId }] : [])] }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, action: true, description: true, timestamp: true, userId: true, source: true } }),
  ]);
  return { ...toDto(c), services: services.map(s => ({ id: s.id, type: s.type, status: s.status, serviceDate: isoDay(s.serviceDate), supplier: s.supplier, costPrice: n(s.costPrice), sellPrice: n(s.sellPrice), notes: s.notes, details: s.details })), activity };
}

// ── Schedule + lifecycle ──────────────────────────────────────

export async function setSchedule(id: string, input: ScheduleInput, actorId?: string | null) {
  const c = await prisma.bookingContract.findUnique({ where: { id }, include: INCLUDE });
  if (!c) throw notFound('Booking');
  if (c.status === 'CANCELLED' || c.status === 'COMPLETED') throw stateConflict(`The schedule of a ${c.status.toLowerCase()} booking is fixed`);
  const items = [...input.items].sort((a, b) => a.seq - b.seq).map((i, idx) => ({ ...i, seq: idx + 1, amount: Math.round(i.amount) }));
  const errors = validateSchedule(items, n(c.totalAmount));
  if (errors.length) throw new AppError('VALIDATION_ERROR', 400, errors[0], { items: errors.join('; ') });
  await prisma.$transaction(async tx => {
    await tx.paymentScheduleItem.deleteMany({ where: { contractId: id } });
    await tx.paymentScheduleItem.createMany({ data: items.map(i => ({ contractId: id, seq: i.seq, label: i.label, dueDate: new Date(`${i.dueDate}T00:00:00.000Z`), amount: i.amount })) });
    await audit(tx, { action: 'contract_schedule_set', entityType: 'contract', entityId: id, userId: actorId, description: `Payment schedule for ${c.contractNumber}: ${items.map(i => `${i.label} ₹${i.amount} by ${i.dueDate}`).join(', ')}`, before: { items: c.schedule.map(s => ({ label: s.label, dueDate: isoDay(s.dueDate), amount: n(s.amount) })) }, after: { items } });
  });
  return getContract(id);
}

export async function setContractStatus(id: string, status: ContractStatus, reason: string | null | undefined, actorId?: string | null) {
  const c = await prisma.bookingContract.findUnique({ where: { id }, include: INCLUDE });
  if (!c) throw notFound('Booking');
  if (c.status === status) return getContract(id);
  if (!(CONTRACT_TRANSITIONS[c.status] ?? []).includes(status)) throw stateConflict(`A ${c.status.toLowerCase()} booking cannot move to ${status.toLowerCase()}`);
  await prisma.$transaction(async tx => {
    await tx.bookingContract.update({ where: { id }, data: { status, ...(status === 'CANCELLED' ? { cancelledAt: new Date(), cancellationReason: reason ?? null } : {}), ...(status === 'COMPLETED' ? { completedAt: new Date() } : {}) } });
    if (c.tripId) await tx.trip.update({ where: { id: c.tripId }, data: { status: TRIP_STATUS[status] } });
    await audit(tx, { action: 'contract_status_changed', entityType: 'contract', entityId: id, userId: actorId, description: `Booking ${c.contractNumber}: ${c.status} → ${status}${reason ? ` (${reason})` : ''}`, before: { status: c.status }, after: { status } });
  });
  return getContract(id);
}

export async function setContractNotes(id: string, notes: string | null, actorId?: string | null) {
  const c = await prisma.bookingContract.findUnique({ where: { id }, select: { id: true, contractNumber: true } });
  if (!c) throw notFound('Booking');
  await prisma.bookingContract.update({ where: { id }, data: { notes } });
  await audit(prisma, { action: 'contract_updated', entityType: 'contract', entityId: id, userId: actorId, description: `Notes updated on ${c.contractNumber}` });
  return getContract(id);
}

/** Instalments due within `days` (or overdue) across open bookings — for the dashboard and reminders. */
export async function paymentsDue(days = 7) {
  const rows = await prisma.bookingContract.findMany({ where: { status: { in: ['CONFIRMED', 'IN_PROGRESS'] } }, include: INCLUDE });
  const horizon = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  return rows.map(toDto).flatMap(c => c.schedule.filter(s => s.status !== 'PAID' && s.dueDate <= horizon).map(s => ({ contractId: c.id, contractNumber: c.contractNumber, customer: c.customer, tripId: c.tripId, destination: c.destination, ...s, outstanding: s.amount - s.paidAmount })))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
