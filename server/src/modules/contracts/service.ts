// ============================================================
// Booking contracts (Phase 2.7, reshaped in 3.4). Created when a quotation is
// accepted — one for the whole group, or one per party for family-wise
// billing — all on ONE trip (the tour). Each contract owns a payment schedule;
// the trip carries the classic finance columns and TripService rows so the
// existing operations and finance screens keep working.
// ============================================================

import type { Prisma } from '@prisma/client';
import { prisma, type DbClient } from '../../lib/prisma.js';
import { audit } from '../../core/audit.js';
import { nextDisplayId } from '../../core/numbering.js';
import { AppError, notFound, stateConflict } from '../../core/errors.js';
import { defaultSchedule, validateSchedule, allocatePayments, scheduleSummary } from '../../../../src/shared/calc/schedule.js';
import { sumPaise, toPaise, toRupees } from '../../../../src/shared/calc/money.js';
import { CONTRACT_TRANSITIONS, type ContractListQuery, type ContractStatus, type ScheduleInput } from '../../../../src/shared/contracts/contracts.js';
import { registerOnAccepted, type OnAccepted } from '../quotations/service.js';
import { tripChanged } from '../operations/hooks.js';
import { syncTripTravellersFromIds } from '../travellers/service.js';
import { nextTripId } from '../trips/ids.js';
import { applyStage } from '../trips/stage.js';
import type { TripStage } from '../../../../src/shared/calc/tripStage.js';

const today = () => new Date().toISOString().slice(0, 10);
const n = (v: Prisma.Decimal | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));
const r2 = (x: number) => Math.round(x * 100) / 100;
const isoDay = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);


// ── Creation on acceptance ────────────────────────────────────
// One trip for the whole tour (hotels, transport, tickets and itinerary are
// shared), and one booking contract per party when the customer wants
// family-wise billing, each with its own payment schedule.

export const createContractsFromQuote: OnAccepted = async (tx, quote, totals, { splitByParty, actorId }) => {
  const pax = { adults: quote.adults, children: quote.children, infants: quote.infants };
  const totalPax = pax.adults + pax.children + pax.infants || 1;
  const selected = quote.lineItems.filter(i => totals.items.find(t => t.id === i.id)?.included);
  const partyTravellers = (p: { travellerIds: unknown }) => (Array.isArray(p.travellerIds) ? (p.travellerIds as string[]) : []);

  type Plan = { partyId: string | null; partyName: string | null; pax: { adults: number; children: number; infants: number }; share: number; travellerIds: string[]; totals: { subtotal: number; tax: number; total: number; cost: number } };
  const plans: Plan[] = splitByParty
    ? quote.parties.map(p => {
        const pt = totals.parties.find(x => x.partyId === p.id)!;
        const ppax = p.adults + p.children + p.infants;
        const partyPax = quote.parties.reduce((s, x) => s + x.adults + x.children + x.infants, 0) || 1;
        return { partyId: p.id, partyName: p.name, pax: { adults: p.adults, children: p.children, infants: p.infants }, share: ppax / partyPax, travellerIds: partyTravellers(p), totals: { subtotal: pt.sell, tax: pt.tax, total: pt.total, cost: pt.cost } };
      })
    : [{ partyId: null, partyName: null, pax, share: 1, travellerIds: quote.parties.flatMap(partyTravellers), totals: { subtotal: totals.subtotal, tax: totals.tax, total: totals.total, cost: totals.cost } }];

  // The tour: legacy finance columns carry the whole-group figures for the classic screens.
  const tripId = await nextTripId(tx);
  const taxable = r2(totals.total - totals.tax);
  const margin = r2(taxable - totals.cost);
  const allTravellerIds = Array.from(new Set(plans.flatMap(p => p.travellerIds)));
  const trip = await tx.trip.create({
    data: {
      id: tripId, customer: quote.customer.name, phone: quote.customer.phone, email: quote.customer.email, customerId: quote.customerId,
      destination: quote.enquiry.destination, type: 'Leisure', pax: totalPax, departure: isoDay(quote.enquiry.departureDate), returnDate: isoDay(quote.enquiry.returnDate),
      status: 'confirmed', stage: 'CONFIRMING', stageChangedAt: new Date(), tourName: quote.title ?? null,
      totalAmount: taxable, gstRate: n(quote.gstRate), discount: r2(totals.discountAmount), gstAmount: totals.tax, gstMode: quote.gstMode,
      taxableAmount: taxable, totalPayable: totals.total, paidAmount: 0, balanceDue: totals.total, supplierCost: totals.cost, grossMargin: margin,
      marginPct: taxable > 0 ? r2(margin / taxable * 100) : 0, notes: `From quotation ${quote.quoteNumber}${splitByParty ? ` — ${plans.length} parties` : ''}`,
      createdDate: today(), createdBy: actorId ?? null, sourceLeadId: null, passengerIds: allTravellerIds as Prisma.InputJsonValue,
    },
  });

  // Classic service lines, once per selected item at full value.
  for (const item of selected) {
    const it = totals.items.find(t => t.id === item.id)!;
    await tx.tripService.create({
      data: {
        tripId: trip.id, type: item.serviceType, status: 'REQUESTED', serviceDate: item.serviceDate ?? quote.enquiry.departureDate ?? new Date(),
        supplierId: item.supplierId, costPrice: r2(it.cost), sellPrice: r2(it.sell),
        details: { ...(item.details as object), pricingBasis: item.pricingBasis, quoteItemId: item.id, ...(item.partyId ? { partyId: item.partyId } : { sharedAcrossParties: splitByParty }) } as Prisma.InputJsonValue,
        notes: item.description + (item.customerNote ? ` — ${item.customerNote}` : ''),
      },
    });
  }
  if (allTravellerIds.length) await syncTripTravellersFromIds(tx, trip.id, allTravellerIds);

  const created: string[] = [];
  for (const plan of plans) {
    const contractNumber = await nextDisplayId(tx, 'BK');
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
    if (plan.travellerIds.length) await tx.tripTraveller.updateMany({ where: { tripId: trip.id, travellerId: { in: plan.travellerIds } }, data: { contractId: contract.id } });
    created.push(contract.id);
    await audit(tx, { action: 'contract_created', entityType: 'contract', entityId: contract.id, userId: actorId, description: `Booking ${contractNumber} (${plan.partyName ?? 'whole group'}) ₹${plan.totals.total} — trip ${trip.id}`, after: { tripId: trip.id, total: plan.totals.total, quoteId: quote.id } });
    await tx.outboxEvent.create({ data: { eventType: 'BOOKING_CONFIRMED', payload: { tripId: trip.id, salesQuoteId: quote.id, contractId: contract.id }, idempotencyKey: `booking-confirmed:${contract.id}` } });
  }
  await audit(tx, { action: 'trip_created', entityType: 'trip', entityId: trip.id, userId: actorId, description: `Trip ${trip.id} created from quotation ${quote.quoteNumber}${plans.length > 1 ? ` with ${plans.length} parties` : ''}`, after: { contractIds: created } });
  await tx.salesQuote.update({ where: { id: quote.id }, data: { convertedTripId: trip.id, convertedAt: new Date() } });
  return created;
};
registerOnAccepted(createContractsFromQuote);

// ── Reads ─────────────────────────────────────────────────────

const INCLUDE = { customer: { select: { id: true, name: true, phone: true } }, salesQuote: { select: { id: true, quoteNumber: true, title: true } }, schedule: { orderBy: { seq: 'asc' as const } }, receipts: { where: { status: 'POSTED' }, select: { kind: true, amount: true } }, trip: { select: { id: true, status: true, stage: true, paidAmount: true, balanceDue: true } } } as const;
type Row = Prisma.BookingContractGetPayload<{ include: typeof INCLUDE }>;

function toDto(c: Row) {
  const items = c.schedule.map(s => ({ id: s.id, seq: s.seq, label: s.label, dueDate: s.dueDate.toISOString().slice(0, 10), amount: n(s.amount) }));
  // What this family has actually paid: its own receipts, less any refund.
  const received = toRupees(sumPaise(c.receipts.map(r => (r.kind === 'REFUND' ? -toPaise(Number(r.amount)) : toPaise(Number(r.amount))))));
  const schedule = allocatePayments(items, received, today());
  const summary = scheduleSummary(schedule);
  return {
    id: c.id, contractNumber: c.contractNumber, status: c.status, salesQuoteId: c.salesQuoteId, quote: c.salesQuote, enquiryId: c.enquiryId, customer: c.customer,
    partyId: c.partyId, partyName: c.partyName, tripId: c.tripId, trip: c.trip, destination: c.destination,
    departureDate: isoDay(c.departureDate), returnDate: isoDay(c.returnDate), adults: c.adults, children: c.children, infants: c.infants, travellerIds: Array.isArray(c.travellerIds) ? c.travellerIds : [],
    subtotal: n(c.subtotal), discountAmount: n(c.discountAmount), taxAmount: n(c.taxAmount), totalAmount: n(c.totalAmount), costAmount: n(c.costAmount), gstMode: c.gstMode, gstRate: n(c.gstRate),
    paymentPolicy: c.paymentPolicy, cancellationPolicy: c.cancellationPolicy, notes: c.notes, cancelledAt: c.cancelledAt, cancellationReason: c.cancellationReason, completedAt: c.completedAt, createdAt: c.createdAt,
    schedule, received, payments: summary,
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

/**
 * Contract statuses follow the trip: starting the trip puts its bookings in
 * progress and completing it completes them (modules/trips/stage.ts). The
 * only status set here is CANCELLED: one family pulls out of the tour. Its
 * travellers leave the trip and the tour totals drop; when the last open
 * booking is cancelled, the trip itself is cancelled.
 */
export async function setContractStatus(id: string, status: ContractStatus, reason: string | null | undefined, actorId?: string | null) {
  const c = await prisma.bookingContract.findUnique({ where: { id }, include: INCLUDE });
  if (!c) throw notFound('Booking');
  if (c.status === status) return getContract(id);
  if (status !== 'CANCELLED') throw stateConflict('A booking goes in progress or completes with its trip — change the stage in the trip workspace');
  if (!(CONTRACT_TRANSITIONS[c.status] ?? []).includes(status)) throw stateConflict(`A ${c.status.toLowerCase()} booking cannot be cancelled`);
  if (!reason) throw new AppError('VALIDATION_ERROR', 400, 'Give a reason for cancelling', { reason: 'Required' });
  await prisma.$transaction(async tx => {
    await tx.bookingContract.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: reason } });
    await audit(tx, { action: 'contract_status_changed', entityType: 'contract', entityId: id, userId: actorId, description: `Booking ${c.contractNumber}${c.partyName ? ` (${c.partyName})` : ''}: ${c.status} → CANCELLED (${reason}). Refund and cancellation charges are settled in Finance.`, before: { status: c.status }, after: { status: 'CANCELLED' } });
    if (!c.tripId) return;
    const open = await tx.bookingContract.findMany({ where: { tripId: c.tripId, status: { not: 'CANCELLED' } }, select: { totalAmount: true, taxAmount: true } });
    const trip = await tx.trip.findUniqueOrThrow({ where: { id: c.tripId }, select: { stage: true, paidAmount: true } });
    if (!open.length) {
      if (trip.stage !== 'CANCELLED' && trip.stage !== 'COMPLETED') await applyStage(tx, c.tripId, trip.stage as TripStage, 'CANCELLED', `Last booking ${c.contractNumber} cancelled: ${reason}`, actorId);
      return;
    }
    // One party leaves a shared tour: its travellers come off the trip, the tour totals shrink.
    const leaving = await tx.tripTraveller.findMany({ where: { tripId: c.tripId, contractId: id }, select: { travellerId: true } });
    if (leaving.length) {
      await tx.tripTraveller.deleteMany({ where: { tripId: c.tripId, contractId: id } });
      const remaining = await tx.tripTraveller.findMany({ where: { tripId: c.tripId }, orderBy: { position: 'asc' }, select: { travellerId: true } });
      await tx.trip.update({ where: { id: c.tripId }, data: { passengerIds: remaining.map(r => r.travellerId) as Prisma.InputJsonValue, pax: remaining.length } });
    }
    const totalPayable = r2(open.reduce((s, x) => s + n(x.totalAmount), 0));
    const tax = r2(open.reduce((s, x) => s + n(x.taxAmount), 0));
    await tx.trip.update({ where: { id: c.tripId }, data: { totalPayable, gstAmount: tax, taxableAmount: r2(totalPayable - tax), totalAmount: r2(totalPayable - tax), balanceDue: Math.max(0, r2(totalPayable - n(trip.paidAmount))) } });
    await audit(tx, { action: 'trip_party_removed', entityType: 'trip', entityId: c.tripId, userId: actorId, description: `${c.partyName ?? c.contractNumber} left the tour (${leaving.length} traveller(s)); tour total now ₹${totalPayable}`, after: { contractId: id, travellers: leaving.map(l => l.travellerId) } });
    await tripChanged(tx, c.tripId, 'contract_cancelled', actorId);
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
  // Party schedules on shared trips have no paid status yet; they would only produce false reminders.
  return rows.map(toDto).flatMap(c => c.schedule.filter(s => s.status !== 'PAID' && s.dueDate <= horizon).map(s => ({ contractId: c.id, contractNumber: c.contractNumber, customer: c.customer, tripId: c.tripId, destination: c.destination, ...s, outstanding: s.amount - s.paidAmount })))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
