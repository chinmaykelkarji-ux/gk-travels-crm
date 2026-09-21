// ============================================================
// Tickets: ticket (PNR, mode, fare, supplier, source document) → segments
// (legs with their own boarding / dropping points) → passenger rows (one
// per passenger per segment: status, coach, seat/berth, ticket number).
// One PNR can carry a 45-person group. The ticket status is derived from
// its rows; IRCTC status strings are parsed, and anything unreadable is
// refused rather than guessed.
// ============================================================

import type { Prisma } from '@prisma/client';
import { prisma, type DbClient } from '../../lib/prisma.js';
import { audit } from '../../core/audit.js';
import { nextDisplayId } from '../../core/numbering.js';
import { rateFor } from '../tax/service.js';
import { AppError, notFound, stateConflict } from '../../core/errors.js';
import { canSeeCommercials } from '../../lib/redact.js';
import { deriveTicketStatus, fareTotals, parseRailStatus, type PassengerStatus, type TicketStatus } from '../../../../src/shared/calc/tickets.js';
import { toIstLocal } from '../../../../src/shared/calc/istTime.js';
import { travellerDisplayName } from '../../../../src/shared/calc/travellers.js';
import type {
  BulkStatusInput, PassengerInput, PassengerRowUpdate, SegmentInput, TicketCancel, TicketInput, TicketListQuery, TicketUpdate,
} from '../../../../src/shared/contracts/tickets.js';
import { assertOpenTrip, assertContractOnTrip } from '../operations/common.js';
import { tripChanged } from '../operations/hooks.js';

const n = (v: Prisma.Decimal | number | null | undefined) => (v === null || v === undefined ? null : Number(v));

const INCLUDE = {
  segments: { orderBy: { seq: 'asc' }, include: { passengers: { orderBy: { paxIndex: 'asc' } } } },
  vendor: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true, phone: true } },
  trip: { select: { id: true, destination: true } },
} satisfies Prisma.TicketInclude;
type Row = Prisma.TicketGetPayload<{ include: typeof INCLUDE }>;

function ticketDto(t: Row, role: string | undefined) {
  const c = canSeeCommercials(role);
  const first = t.segments[0];
  const paxIndexes = [...new Set(t.segments.flatMap(s => s.passengers.map(p => p.paxIndex)))].sort((a, b) => a - b);
  const passengers = paxIndexes.map(i => {
    const rows = t.segments.map(s => s.passengers.find(p => p.paxIndex === i)).filter(Boolean) as Row['segments'][number]['passengers'];
    const r0 = rows[0];
    return { paxIndex: i, travellerId: r0.travellerId, name: r0.name, paxType: r0.paxType, age: r0.age, gender: r0.gender, statuses: rows.map(r => r.status) };
  });
  return {
    id: t.id, displayNumber: t.displayNumber, mode: t.mode, status: t.status, pnr: t.pnr, carrier: t.carrier, bookingRef: t.bookingRef, quota: t.quota, travelClass: t.travelClass,
    tripId: t.tripId, trip: t.trip, contractId: t.contractId, customerId: t.customerId, customer: t.customer, vendorId: t.vendorId, vendor: t.vendor, sourceDocumentId: t.sourceDocumentId,
    fare: {
      baseFare: n(t.baseFare), taxes: n(t.taxes), otherCharges: n(t.otherCharges), totalFare: n(t.totalFare),
      serviceFee: c ? n(t.serviceFee) : null, serviceFeeGstPct: c ? n(t.serviceFeeGstPct) : null, serviceFeeGst: c ? n(t.serviceFeeGst) : null, costAmount: c ? n(t.costAmount) : null,
    },
    chartPrepared: t.chartPrepared, chartCheckedAt: t.chartCheckedAt?.toISOString() ?? null, cancelReason: t.cancelReason, cancelledAt: t.cancelledAt?.toISOString() ?? null,
    customerNotes: t.customerNotes, internalNotes: t.internalNotes, legacyBookingId: t.legacyBookingId, createdAt: t.createdAt.toISOString(),
    route: t.segments.length ? `${first.fromCode ?? first.fromName} → ${t.segments.map(s => s.toCode ?? s.toName).join(' → ')}` : '',
    departAt: first?.departAt?.toISOString() ?? null, departLocal: toIstLocal(first?.departAt ?? null),
    segments: t.segments.map(s => ({
      id: s.id, seq: s.seq, carrierNumber: s.carrierNumber, carrierName: s.carrierName, fromCode: s.fromCode, fromName: s.fromName, toCode: s.toCode, toName: s.toName,
      departAt: s.departAt?.toISOString() ?? null, arriveAt: s.arriveAt?.toISOString() ?? null, departLocal: toIstLocal(s.departAt), arriveLocal: toIstLocal(s.arriveAt),
      travelClass: s.travelClass, boardingPoint: s.boardingPoint, droppingPoint: s.droppingPoint, terminal: s.terminal, platform: s.platform, baggage: s.baggage,
      passengers: s.passengers.map(p => ({ id: p.id, paxIndex: p.paxIndex, travellerId: p.travellerId, name: p.name, paxType: p.paxType, status: p.status, bookingStatus: p.bookingStatus, currentStatus: p.currentStatus, waitlistPosition: p.waitlistPosition, coach: p.coach, seat: p.seat, berth: p.berth, ticketNumber: p.ticketNumber, boardingPoint: p.boardingPoint ?? s.boardingPoint, fare: c ? n(p.fare) : null })),
    })),
    passengers, paxCount: passengers.length,
  };
}
export type TicketDto = ReturnType<typeof ticketDto>;

// ── Reads ─────────────────────────────────────────────────────

export async function listTickets(q: TicketListQuery, role: string | undefined) {
  const term = q.q?.trim();
  const where: Prisma.TicketWhereInput = {
    ...(q.mode ? { mode: q.mode } : {}),
    ...(q.status ? { status: q.status } : q.openOnly ? { status: { notIn: ['CANCELLED'] } } : {}),
    ...(q.tripId ? { tripId: q.tripId } : {}),
    ...(q.customerId ? { customerId: q.customerId } : {}),
    ...(q.from || q.to ? { segments: { some: { seq: 1, departAt: { ...(q.from ? { gte: new Date(`${q.from}T00:00:00+05:30`) } : {}), ...(q.to ? { lt: new Date(new Date(`${q.to}T00:00:00+05:30`).getTime() + 86_400_000) } : {}) } } } } : {}),
    ...(term ? { OR: [
      { pnr: { contains: term, mode: 'insensitive' } }, { displayNumber: { contains: term, mode: 'insensitive' } }, { bookingRef: { contains: term, mode: 'insensitive' } },
      { customer: { name: { contains: term, mode: 'insensitive' } } }, { passengers: { some: { name: { contains: term, mode: 'insensitive' } } } },
      { segments: { some: { OR: [{ carrierNumber: { contains: term, mode: 'insensitive' } }, { fromName: { contains: term, mode: 'insensitive' } }, { toName: { contains: term, mode: 'insensitive' } }] } } },
    ] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.ticket.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: INCLUDE }),
    prisma.ticket.count({ where }),
  ]);
  return { items: rows.map(r => ticketDto(r, role)), total, page: q.page, pageSize: q.pageSize };
}

export async function getTicket(id: string, role: string | undefined) {
  const t = await prisma.ticket.findUnique({ where: { id }, include: INCLUDE });
  if (!t) throw notFound('Ticket');
  const activity = await prisma.activityLog.findMany({ where: { entityType: 'ticket', entityId: id }, orderBy: { createdAt: 'desc' }, take: 40, select: { id: true, action: true, description: true, timestamp: true, userId: true, source: true } });
  return { ...ticketDto(t, role), activity };
}

async function load(db: DbClient, id: string, role: string | undefined) {
  const t = await db.ticket.findUnique({ where: { id }, include: INCLUDE });
  if (!t) throw notFound('Ticket');
  return ticketDto(t, role);
}

// ── Helpers ───────────────────────────────────────────────────

async function resolvePassengers(db: DbClient, input: PassengerInput[]) {
  const ids = input.map(p => p.travellerId).filter((x): x is string => !!x);
  const found = ids.length ? await db.traveller.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true, firstName: true, lastName: true, title: true, displayName: true, gender: true, dateOfBirth: true } }) : [];
  const missing = ids.filter(id => !found.some(f => f.id === id));
  if (missing.length) throw new AppError('VALIDATION_ERROR', 400, `Unknown traveller(s): ${missing.join(', ')}`, { passengers: missing.join(', ') });
  if (new Set(ids).size !== ids.length) throw new AppError('VALIDATION_ERROR', 400, 'The same traveller is listed twice', { passengers: 'Duplicate traveller' });
  return input.map(p => {
    const t = p.travellerId ? found.find(f => f.id === p.travellerId)! : null;
    return { travellerId: t?.id ?? null, name: p.name || (t ? travellerDisplayName(t) : ''), paxType: p.paxType, age: p.age ?? null, gender: p.gender ?? (t?.gender as string | null) ?? null, boardingPoint: p.boardingPoint };
  });
}

function segmentData(s: SegmentInput, seq: number) {
  return {
    seq, carrierNumber: s.carrierNumber, carrierName: s.carrierName, fromCode: s.fromCode?.toUpperCase() ?? null, fromName: s.fromName, toCode: s.toCode?.toUpperCase() ?? null, toName: s.toName,
    departAt: s.departAt ? new Date(s.departAt) : null, arriveAt: s.arriveAt ? new Date(s.arriveAt) : null, travelClass: s.travelClass, boardingPoint: s.boardingPoint,
    droppingPoint: s.droppingPoint, terminal: s.terminal, platform: s.platform, baggage: s.baggage,
  };
}

/** Re-derives the ticket status from its rows; stamps cancelledAt when every row is cancelled. */
async function refreshStatus(tx: DbClient, ticketId: string): Promise<TicketStatus> {
  const t = await tx.ticket.findUniqueOrThrow({ where: { id: ticketId }, select: { status: true, passengers: { select: { status: true } } } });
  const next = deriveTicketStatus(t.passengers.map(p => p.status as PassengerStatus), t.status as TicketStatus);
  if (next !== t.status) await tx.ticket.update({ where: { id: ticketId }, data: { status: next, ...(next === 'CANCELLED' ? { cancelledAt: new Date() } : {}), ...(next === 'CONFIRMED' || next === 'PARTIAL' ? { bookedAt: new Date() } : {}) } });
  return next;
}

async function writeAudit(tx: DbClient, t: { id: string; tripId: string | null; displayNumber: string | null }, actorId: string | null | undefined, action: string, description: string, extra: { before?: unknown; after?: unknown } = {}) {
  await audit(tx, { action, entityType: 'ticket', entityId: t.id, userId: actorId, description, ...extra });
  if (t.tripId) {
    await audit(tx, { action, entityType: 'trip', entityId: t.tripId, userId: actorId, description: `${t.displayNumber ?? 'Ticket'}: ${description}` });
    await tripChanged(tx, t.tripId, action, actorId);
  }
}

// ── Create / update ───────────────────────────────────────────

export async function createTicket(input: TicketInput, role: string | undefined, actorId?: string | null) {
  let customerId = input.customerId;
  if (input.tripId) {
    const trip = await assertOpenTrip(prisma, input.tripId);
    await assertContractOnTrip(prisma, input.tripId, input.contractId);
    customerId = customerId ?? trip.customerId;
  }
  if (customerId && !(await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } }))) throw new AppError('VALIDATION_ERROR', 400, 'Customer not found', { customerId: 'Unknown customer' });
  if (input.vendorId && !(await prisma.vendor.findUnique({ where: { id: input.vendorId }, select: { id: true } }))) throw new AppError('VALIDATION_ERROR', 400, 'Vendor not found', { vendorId: 'Unknown vendor' });
  const pax = await resolvePassengers(prisma, input.passengers);
  const commercial = canSeeCommercials(role);
  const gstPct = input.serviceFeeGstPct ?? (await rateFor('GST_TICKET_SERVICE_FEE'));
  const fare = { baseFare: input.baseFare, taxes: input.taxes, otherCharges: input.otherCharges, serviceFee: commercial ? input.serviceFee : 0, serviceFeeGstPct: gstPct };
  const totals = fareTotals(fare);

  const id = await prisma.$transaction(async tx => {
    const displayNumber = await nextDisplayId(tx, 'TKT');
    const t = await tx.ticket.create({
      data: {
        displayNumber, tripId: input.tripId, contractId: input.contractId, customerId, mode: input.mode, pnr: input.pnr?.toUpperCase() ?? null, carrier: input.carrier, bookingRef: input.bookingRef,
        quota: input.quota ?? null, travelClass: input.travelClass, vendorId: input.vendorId, sourceDocumentId: input.sourceDocumentId, customerNotes: input.customerNotes, internalNotes: input.internalNotes,
        ...fare, serviceFeeGst: totals.serviceFeeGst, totalFare: totals.total, costAmount: commercial ? input.costAmount : 0, status: 'REQUESTED', createdById: actorId ?? null,
      },
    });
    for (const [i, s] of input.segments.entries()) {
      const seg = await tx.ticketSegment.create({ data: { ticketId: t.id, ...segmentData(s, i + 1) } });
      if (pax.length) await tx.ticketPassenger.createMany({ data: pax.map((p, k) => ({ ticketId: t.id, segmentId: seg.id, paxIndex: k, ...p, status: 'PENDING' as const })) });
    }
    await writeAudit(tx, t, actorId, 'ticket_created', `${input.mode.toLowerCase()} ticket ${displayNumber} ${input.segments.map(s => `${s.fromName}→${s.toName}`).join(', ')} for ${pax.length} passenger(s)`, { after: { pnr: t.pnr, totalFare: totals.total, passengers: pax.length } });
    return t.id;
  });
  return load(prisma, id, role);
}

export async function updateTicket(id: string, patch: TicketUpdate, role: string | undefined, actorId?: string | null) {
  const before = await prisma.ticket.findUnique({ where: { id }, include: { passengers: { select: { status: true } } } });
  if (!before) throw notFound('Ticket');
  if (before.tripId) await assertOpenTrip(prisma, before.tripId);
  if (patch.contractId && before.tripId) await assertContractOnTrip(prisma, before.tripId, patch.contractId);
  if (patch.status && before.passengers.some(p => p.status !== 'PENDING')) throw stateConflict('Seats are already booked on this ticket; its status now follows the passengers');
  const commercial = canSeeCommercials(role);
  const fareKeys = ['baseFare', 'taxes', 'otherCharges', 'serviceFee', 'serviceFeeGstPct'] as const;
  const { serviceFee, costAmount, serviceFeeGstPct, ...rest } = patch;
  const fareChanged = fareKeys.some(k => patch[k] !== undefined);
  const next = {
    baseFare: patch.baseFare ?? Number(before.baseFare), taxes: patch.taxes ?? Number(before.taxes), otherCharges: patch.otherCharges ?? Number(before.otherCharges),
    serviceFee: commercial && serviceFee !== undefined ? serviceFee : Number(before.serviceFee),
    serviceFeeGstPct: commercial && serviceFeeGstPct !== undefined && serviceFeeGstPct !== null ? serviceFeeGstPct : Number(before.serviceFeeGstPct ?? 0),
  };
  const totals = fareTotals(next);
  await prisma.$transaction(async tx => {
    const a = await tx.ticket.update({
      where: { id },
      data: {
        ...rest, ...(patch.pnr ? { pnr: patch.pnr.toUpperCase() } : {}),
        ...(fareChanged ? { ...next, serviceFeeGst: totals.serviceFeeGst, totalFare: totals.total } : {}),
        ...(commercial && costAmount !== undefined ? { costAmount } : {}),
      },
    });
    await writeAudit(tx, a, actorId, 'ticket_updated', `Ticket ${a.displayNumber} updated (${Object.keys(patch).join(', ')})`, { before: { pnr: before.pnr, totalFare: n(before.totalFare), status: before.status }, after: { pnr: a.pnr, totalFare: n(a.totalFare), status: a.status } });
  });
  return load(prisma, id, role);
}

// ── Segments ──────────────────────────────────────────────────

export async function addSegment(ticketId: string, s: SegmentInput, role: string | undefined, actorId?: string | null) {
  const t = await prisma.ticket.findUnique({ where: { id: ticketId }, include: { segments: { orderBy: { seq: 'asc' }, include: { passengers: true } } } });
  if (!t) throw notFound('Ticket');
  if (t.segments.length >= 8) throw new AppError('VALIDATION_ERROR', 400, 'A ticket can have at most 8 segments');
  const people = t.segments[0]?.passengers ?? [];
  await prisma.$transaction(async tx => {
    const seg = await tx.ticketSegment.create({ data: { ticketId, ...segmentData(s, (t.segments.at(-1)?.seq ?? 0) + 1) } });
    if (people.length) await tx.ticketPassenger.createMany({ data: people.map(p => ({ ticketId, segmentId: seg.id, paxIndex: p.paxIndex, travellerId: p.travellerId, name: p.name, paxType: p.paxType, age: p.age, gender: p.gender, status: 'PENDING' as const })) });
    await refreshStatus(tx, ticketId);
    await writeAudit(tx, t, actorId, 'ticket_segment_added', `Segment ${s.fromName} → ${s.toName} added to ${t.displayNumber}`);
  });
  return load(prisma, ticketId, role);
}

export async function updateSegment(segmentId: string, s: SegmentInput, role: string | undefined, actorId?: string | null) {
  const seg = await prisma.ticketSegment.findUnique({ where: { id: segmentId }, include: { ticket: true } });
  if (!seg) throw notFound('Segment');
  const data = segmentData(s, seg.seq);
  await prisma.$transaction(async tx => {
    await tx.ticketSegment.update({ where: { id: segmentId }, data });
    const moved = (seg.departAt?.toISOString() ?? null) !== (data.departAt?.toISOString() ?? null);
    await writeAudit(tx, seg.ticket, actorId, 'ticket_segment_updated', `Segment ${seg.seq} of ${seg.ticket.displayNumber} updated${moved ? ` — departure ${toIstLocal(seg.departAt)?.replace('T', ' ') ?? 'unset'} → ${toIstLocal(data.departAt)?.replace('T', ' ') ?? 'unset'}` : ''}`,
      { before: { departAt: seg.departAt, boardingPoint: seg.boardingPoint }, after: { departAt: data.departAt, boardingPoint: data.boardingPoint } });
  });
  return load(prisma, seg.ticketId, role);
}

export async function deleteSegment(segmentId: string, role: string | undefined, actorId?: string | null) {
  const seg = await prisma.ticketSegment.findUnique({ where: { id: segmentId }, include: { ticket: { include: { _count: { select: { segments: true } } } }, passengers: { select: { status: true } } } });
  if (!seg) throw notFound('Segment');
  if (seg.ticket._count.segments <= 1) throw stateConflict('A ticket needs at least one segment; cancel the ticket instead');
  if (seg.passengers.some(p => p.status !== 'PENDING' && p.status !== 'CANCELLED')) throw stateConflict('Seats on this segment are booked; cancel them first');
  await prisma.$transaction(async tx => {
    await tx.ticketSegment.delete({ where: { id: segmentId } });
    await refreshStatus(tx, seg.ticketId);
    await writeAudit(tx, seg.ticket, actorId, 'ticket_segment_removed', `Segment ${seg.fromName} → ${seg.toName} removed from ${seg.ticket.displayNumber}`);
  });
  return load(prisma, seg.ticketId, role);
}

// ── Passengers ────────────────────────────────────────────────

export async function addPassengers(ticketId: string, input: PassengerInput[], role: string | undefined, actorId?: string | null) {
  const t = await prisma.ticket.findUnique({ where: { id: ticketId }, include: { segments: { select: { id: true } }, passengers: { select: { paxIndex: true, travellerId: true } } } });
  if (!t) throw notFound('Ticket');
  if (t.status === 'CANCELLED') throw stateConflict('This ticket is cancelled');
  const pax = await resolvePassengers(prisma, input);
  const clash = pax.find(p => p.travellerId && t.passengers.some(x => x.travellerId === p.travellerId));
  if (clash) throw new AppError('CONFLICT', 409, `${clash.name} is already on this ticket`);
  const start = t.passengers.reduce((m, p) => Math.max(m, p.paxIndex + 1), 0);
  await prisma.$transaction(async tx => {
    for (const seg of t.segments) await tx.ticketPassenger.createMany({ data: pax.map((p, k) => ({ ticketId, segmentId: seg.id, paxIndex: start + k, ...p, status: 'PENDING' as const })) });
    await refreshStatus(tx, ticketId);
    await writeAudit(tx, t, actorId, 'ticket_passengers_added', `${pax.map(p => p.name).join(', ')} added to ${t.displayNumber}`);
  });
  return load(prisma, ticketId, role);
}

/** Removes a passenger who was never booked; booked passengers must be cancelled so the refund trail survives. */
export async function removePassenger(ticketId: string, paxIndex: number, role: string | undefined, actorId?: string | null) {
  const rows = await prisma.ticketPassenger.findMany({ where: { ticketId, paxIndex }, include: { ticket: true } });
  if (!rows.length) throw notFound('Passenger');
  if (rows.some(r => r.status !== 'PENDING')) throw stateConflict(`${rows[0].name} is booked on this ticket; cancel instead of removing`);
  await prisma.$transaction(async tx => {
    await tx.ticketPassenger.deleteMany({ where: { ticketId, paxIndex } });
    await refreshStatus(tx, ticketId);
    await writeAudit(tx, rows[0].ticket, actorId, 'ticket_passenger_removed', `${rows[0].name} removed from ${rows[0].ticket.displayNumber}`);
  });
  return load(prisma, ticketId, role);
}

function applyRailParse(patch: PassengerRowUpdate, mode: string) {
  const raw = patch.currentStatus ?? patch.bookingStatus;
  if (patch.status || !raw || mode !== 'TRAIN') return {};
  const parsed = parseRailStatus(raw);
  if (!parsed) throw new AppError('VALIDATION_ERROR', 400, `Unable to confidently read "${raw}" — choose the status yourself`, { status: 'Choose the status' });
  return { status: parsed.status, waitlistPosition: parsed.position, ...(parsed.coach ? { coach: parsed.coach } : {}), ...(parsed.berth ? { seat: parsed.berth } : {}), ...(parsed.berthType ? { berth: parsed.berthType } : {}) };
}

export async function updatePassengerRow(rowId: string, patch: PassengerRowUpdate, role: string | undefined, actorId?: string | null) {
  const row = await prisma.ticketPassenger.findUnique({ where: { id: rowId }, include: { ticket: true, segment: true } });
  if (!row) throw notFound('Passenger');
  const derived = applyRailParse(patch, row.ticket.mode);
  const { fare, ...rest } = patch;
  await prisma.$transaction(async tx => {
    const a = await tx.ticketPassenger.update({ where: { id: rowId }, data: { ...rest, ...derived, ...(fare !== undefined && canSeeCommercials(role) ? { fare } : {}) } });
    await refreshStatus(tx, row.ticketId);
    await writeAudit(tx, row.ticket, actorId, 'ticket_passenger_updated', `${row.name} on ${row.segment.fromName}→${row.segment.toName}: ${row.status}${row.status !== a.status ? ` → ${a.status}` : ''}${a.coach || a.seat ? ` (${[a.coach, a.seat, a.berth].filter(Boolean).join('/')})` : ''}`,
      { before: { status: row.status, coach: row.coach, seat: row.seat }, after: { status: a.status, coach: a.coach, seat: a.seat } });
  });
  return load(prisma, row.ticketId, role);
}

/** Statuses read off IRCTC after chart preparation, many rows at once. Nothing is saved if any line is unreadable. */
export async function bulkStatuses(ticketId: string, input: BulkStatusInput, role: string | undefined, actorId?: string | null) {
  const t = await prisma.ticket.findUnique({ where: { id: ticketId }, include: { passengers: true } });
  if (!t) throw notFound('Ticket');
  const plans = input.rows.map(r => {
    const row = t.passengers.find(p => p.id === r.rowId);
    if (!row) throw new AppError('VALIDATION_ERROR', 400, 'A row does not belong to this ticket', { rows: r.rowId });
    const parsed = parseRailStatus(r.currentStatus);
    return { row, raw: r.currentStatus, parsed };
  });
  const unreadable = plans.filter(p => !p.parsed);
  if (unreadable.length) throw new AppError('VALIDATION_ERROR', 400, `Unable to confidently read ${unreadable.length} status(es): ${unreadable.map(u => `${u.row.name} "${u.raw}"`).join(', ')}`, { rows: unreadable.map(u => u.row.id).join(',') });
  await prisma.$transaction(async tx => {
    for (const p of plans) {
      await tx.ticketPassenger.update({ where: { id: p.row.id }, data: { currentStatus: p.raw.trim().toUpperCase(), status: p.parsed!.status, waitlistPosition: p.parsed!.position, ...(p.parsed!.coach ? { coach: p.parsed!.coach } : {}), ...(p.parsed!.berth ? { seat: p.parsed!.berth } : {}), ...(p.parsed!.berthType ? { berth: p.parsed!.berthType } : {}) } });
    }
    if (input.chartPrepared) await tx.ticket.update({ where: { id: ticketId }, data: { chartPrepared: true, chartCheckedAt: new Date() } });
    const status = await refreshStatus(tx, ticketId);
    await writeAudit(tx, t, actorId, 'ticket_statuses_updated', `${plans.length} passenger status(es) on ${t.displayNumber}${input.chartPrepared ? ' after chart preparation' : ''} → ticket ${status.toLowerCase()}`, { after: { rows: plans.map(p => ({ name: p.row.name, status: p.parsed!.status, raw: p.raw })) } });
  });
  return load(prisma, ticketId, role);
}

export async function cancelTicket(ticketId: string, input: TicketCancel, role: string | undefined, actorId?: string | null) {
  const t = await prisma.ticket.findUnique({ where: { id: ticketId }, include: { passengers: true } });
  if (!t) throw notFound('Ticket');
  if (t.status === 'CANCELLED') throw stateConflict('This ticket is already cancelled');
  const targets = input.paxIndexes ? t.passengers.filter(p => input.paxIndexes!.includes(p.paxIndex)) : t.passengers;
  if (input.paxIndexes && !targets.length) throw new AppError('VALIDATION_ERROR', 400, 'Choose passengers on this ticket', { paxIndexes: 'Unknown passengers' });
  await prisma.$transaction(async tx => {
    if (targets.length) await tx.ticketPassenger.updateMany({ where: { id: { in: targets.map(p => p.id) } }, data: { status: 'CANCELLED' } });
    else await tx.ticket.update({ where: { id: ticketId }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
    const status = await refreshStatus(tx, ticketId);
    await tx.ticket.update({ where: { id: ticketId }, data: { cancelReason: input.reason } });
    const names = [...new Set(targets.map(p => p.name))];
    await writeAudit(tx, t, actorId, 'ticket_cancelled', `${input.paxIndexes ? `${names.join(', ')} cancelled` : 'Ticket cancelled'} on ${t.displayNumber} — ${input.reason} (ticket now ${status.toLowerCase()})`);
  });
  return load(prisma, ticketId, role);
}
