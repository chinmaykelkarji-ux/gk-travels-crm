// ============================================================
// Trip control centre: list, create, header edits, pickup points, party /
// pickup assignment of travellers, and the one-call workspace that shows
// everything about a trip. Operational records have their own services
// (modules/operations, modules/tickets); this module stitches them together.
// ============================================================

import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { audit } from '../../core/audit.js';
import { AppError, notFound } from '../../core/errors.js';
import { canSeeCommercials } from '../../lib/redact.js';
import { passportStatus, travellerDisplayName } from '../../../../src/shared/calc/travellers.js';
import { nightsBetween } from '../../../../src/shared/calc/operations.js';
import { toIstLocal } from '../../../../src/shared/calc/istTime.js';
import { STAGE_LABEL, type TripStage } from '../../../../src/shared/calc/tripStage.js';
import type { PickupPointsPut, TravellerAssignments, TripCreate, TripListQuery, TripUpdate } from '../../../../src/shared/contracts/trips.js';
import { listHotelBookings } from '../operations/hotelBookings.service.js';
import { listAssignments } from '../operations/vehicleAssignments.service.js';
import { listActivityBookings } from '../operations/activityBookings.service.js';
import { listTickets } from '../tickets/service.js';
import { getContract } from '../contracts/service.js';
import { tripChanged } from '../operations/hooks.js';
import { nextTripId } from './ids.js';
import { readiness } from './stage.js';

const OPEN: TripStage[] = ['PLANNING', 'CONFIRMING', 'READY', 'ONGOING'];
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

// ── List ──────────────────────────────────────────────────────

export async function listTrips(q: TripListQuery) {
  const term = q.q?.trim();
  const where: Prisma.TripWhereInput = {
    ...(q.stage ? { stage: q.stage } : q.includeClosed ? {} : { stage: { in: OPEN } }),
    ...(q.from ? { departure: { gte: q.from } } : {}),
    ...(q.to ? { departure: { ...(q.from ? { gte: q.from } : {}), lte: q.to } } : {}),
    ...(term ? { OR: [
      { id: { contains: term, mode: 'insensitive' } }, { destination: { contains: term, mode: 'insensitive' } },
      { customer: { contains: term, mode: 'insensitive' } }, { tourName: { contains: term, mode: 'insensitive' } },
    ] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.trip.findMany({
      where, orderBy: [{ departure: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize,
      select: {
        id: true, tourName: true, destination: true, customer: true, customerId: true, departure: true, returnDate: true, pax: true, stage: true, isInternational: true,
        assignedOps: { select: { id: true, name: true } },
        _count: { select: {
          contracts: { where: { status: { not: 'CANCELLED' } } }, travellers: true,
          hotelBookings: { where: { status: { in: ['REQUESTED', 'ON_HOLD'] } } },
          vehicleAssignments: { where: { status: 'REQUESTED' } },
          activityBookings: { where: { status: { in: ['REQUESTED', 'ON_HOLD'] } } },
          tickets: { where: { status: { in: ['REQUESTED', 'ON_HOLD', 'WAITLISTED', 'RAC', 'PARTIAL'] } } },
        } },
      },
    }),
    prisma.trip.count({ where }),
  ]);
  return {
    items: rows.map(t => ({
      id: t.id, tourName: t.tourName, destination: t.destination, customer: t.customer, customerId: t.customerId, departure: t.departure, returnDate: t.returnDate,
      pax: t.pax, stage: t.stage, isInternational: t.isInternational, assignedOps: t.assignedOps, parties: t._count.contracts, travellers: t._count.travellers,
      pending: { hotels: t._count.hotelBookings, vehicles: t._count.vehicleAssignments, activities: t._count.activityBookings, tickets: t._count.tickets },
    })),
    total, page: q.page, pageSize: q.pageSize,
  };
}

// ── Create / update ───────────────────────────────────────────

async function assertUser(userId: string | null | undefined) {
  if (!userId) return;
  if (!(await prisma.user.findUnique({ where: { id: userId }, select: { id: true } }))) throw new AppError('VALIDATION_ERROR', 400, 'User not found', { assignedOpsUserId: 'Unknown user' });
}

export async function createTrip(input: TripCreate, actorId?: string | null) {
  const customer = input.customerId ? await prisma.customer.findUnique({ where: { id: input.customerId }, select: { id: true, name: true, phone: true, email: true } }) : null;
  if (input.customerId && !customer) throw new AppError('VALIDATION_ERROR', 400, 'Customer not found', { customerId: 'Unknown customer' });
  await assertUser(input.assignedOpsUserId);
  const id = await prisma.$transaction(async tx => {
    const tripId = await nextTripId(tx);
    await tx.trip.create({
      data: {
        id: tripId, tourName: input.tourName, destination: input.destination, departure: input.departure, returnDate: input.returnDate, isInternational: input.isInternational,
        customer: customer?.name ?? input.tourName ?? 'Group tour', phone: customer?.phone ?? '', email: customer?.email ?? null, customerId: customer?.id ?? null,
        assignedOpsUserId: input.assignedOpsUserId, notes: input.notes ?? '', status: 'draft', stage: 'PLANNING', pax: 0, createdDate: new Date().toISOString().slice(0, 10), createdBy: actorId ?? null,
      },
    });
    await audit(tx, { action: 'trip_created', entityType: 'trip', entityId: tripId, userId: actorId, description: `Trip ${tripId} created: ${input.tourName ?? input.destination}${input.departure ? ` from ${input.departure}` : ''}`, after: { destination: input.destination, departure: input.departure, returnDate: input.returnDate } });
    return tripId;
  });
  return getWorkspace(id, undefined);
}

export async function updateTrip(id: string, input: TripUpdate, role: string | undefined, actorId?: string | null) {
  const before = await prisma.trip.findUnique({ where: { id } });
  if (!before) throw notFound('Trip');
  if (before.stage === 'COMPLETED' || before.stage === 'CANCELLED') throw new AppError('STATE_CONFLICT', 409, `Trip ${id} is ${before.stage.toLowerCase()}`);
  const departure = input.departure !== undefined ? input.departure : before.departure;
  const returnDate = input.returnDate !== undefined ? input.returnDate : before.returnDate;
  if (departure && returnDate && returnDate < departure) throw new AppError('VALIDATION_ERROR', 400, 'Return must not be before departure', { returnDate: 'After departure' });
  if (input.assignedOpsUserId) await assertUser(input.assignedOpsUserId);
  let customerPatch: Prisma.TripUncheckedUpdateInput = {};
  if (input.customerId !== undefined && input.customerId !== before.customerId) {
    const c = input.customerId ? await prisma.customer.findUnique({ where: { id: input.customerId }, select: { name: true, phone: true, email: true } }) : null;
    if (input.customerId && !c) throw new AppError('VALIDATION_ERROR', 400, 'Customer not found', { customerId: 'Unknown customer' });
    customerPatch = c ? { customer: c.name, phone: c.phone, email: c.email } : {};
  }
  const keys = Object.keys(input) as (keyof TripUpdate)[];
  await prisma.$transaction(async tx => {
    await tx.trip.update({ where: { id }, data: { ...input, ...customerPatch, notes: input.notes ?? undefined } });
    const b = before as unknown as Record<string, unknown>;
    const changed = keys.filter(k => JSON.stringify(b[k] ?? null) !== JSON.stringify((input as Record<string, unknown>)[k] ?? null));
    await audit(tx, { action: 'trip_updated', entityType: 'trip', entityId: id, userId: actorId, description: `Trip ${id} updated (${changed.join(', ') || 'no changes'})`, before: Object.fromEntries(changed.map(k => [k, b[k] ?? null])), after: Object.fromEntries(changed.map(k => [k, (input as Record<string, unknown>)[k] ?? null])) });
    await tripChanged(tx, id, 'trip_updated', actorId);
  });
  return getWorkspace(id, role);
}

// ── Pickup points and traveller assignment ────────────────────

export async function setPickupPoints(tripId: string, input: PickupPointsPut, role: string | undefined, actorId?: string | null) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { id: true, pickupPoints: { select: { id: true, name: true } } } });
  if (!trip) throw notFound('Trip');
  const keep = input.points.map(p => p.id).filter((x): x is string => !!x);
  const unknown = keep.filter(k => !trip.pickupPoints.some(p => p.id === k));
  if (unknown.length) throw new AppError('VALIDATION_ERROR', 400, 'Pickup point does not belong to this trip', { points: unknown.join(', ') });
  await prisma.$transaction(async tx => {
    await tx.tripPickupPoint.deleteMany({ where: { tripId, id: { notIn: keep.length ? keep : ['__none__'] } } });
    for (const [i, p] of input.points.entries()) {
      const data = { seq: i + 1, name: p.name, address: p.address, landmark: p.landmark, pickupAt: p.pickupAt ? new Date(p.pickupAt) : null, contactName: p.contactName, contactPhone: p.contactPhone, mapUrl: p.mapUrl, notes: p.notes };
      if (p.id) await tx.tripPickupPoint.update({ where: { id: p.id }, data });
      else await tx.tripPickupPoint.create({ data: { tripId, ...data } });
    }
    await audit(tx, { action: 'trip_pickup_points_set', entityType: 'trip', entityId: tripId, userId: actorId, description: `Pickup points: ${input.points.map(p => p.name).join(' → ') || 'none'}`, before: { points: trip.pickupPoints.map(p => p.name) }, after: { points: input.points.map(p => p.name) } });
    await tripChanged(tx, tripId, 'trip_pickup_points', actorId);
  });
  return getWorkspace(tripId, role);
}

export async function assignTravellers(tripId: string, input: TravellerAssignments, role: string | undefined, actorId?: string | null) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { id: true, travellers: { select: { travellerId: true } }, contracts: { select: { id: true, status: true } }, pickupPoints: { select: { id: true } } } });
  if (!trip) throw notFound('Trip');
  for (const r of input.rows) {
    if (!trip.travellers.some(t => t.travellerId === r.travellerId)) throw new AppError('VALIDATION_ERROR', 400, 'Traveller is not on this trip', { rows: r.travellerId });
    if (r.contractId && !trip.contracts.some(c => c.id === r.contractId && c.status !== 'CANCELLED')) throw new AppError('VALIDATION_ERROR', 400, 'That party is not on this trip', { rows: r.contractId });
    if (r.pickupPointId && !trip.pickupPoints.some(p => p.id === r.pickupPointId)) throw new AppError('VALIDATION_ERROR', 400, 'That pickup point is not on this trip', { rows: r.pickupPointId });
  }
  await prisma.$transaction(async tx => {
    for (const r of input.rows) {
      await tx.tripTraveller.update({ where: { tripId_travellerId: { tripId, travellerId: r.travellerId } }, data: { ...(r.contractId !== undefined ? { contractId: r.contractId } : {}), ...(r.pickupPointId !== undefined ? { pickupPointId: r.pickupPointId } : {}) } });
    }
    await audit(tx, { action: 'trip_travellers_assigned', entityType: 'trip', entityId: tripId, userId: actorId, description: `Party / pickup point set for ${input.rows.length} traveller(s)`, after: { rows: input.rows } });
    await tripChanged(tx, tripId, 'trip_travellers_assigned', actorId);
  });
  return getWorkspace(tripId, role);
}

// ── Workspace ─────────────────────────────────────────────────

export async function getWorkspace(id: string, role: string | undefined) {
  const t = await prisma.trip.findUnique({
    where: { id },
    include: {
      assignedOps: { select: { id: true, name: true } },
      pickupPoints: { orderBy: { seq: 'asc' }, include: { _count: { select: { travellers: true } } } },
      contracts: { orderBy: { createdAt: 'asc' }, select: { id: true } },
      travellers: {
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        include: { traveller: { select: { id: true, title: true, firstName: true, lastName: true, displayName: true, phone: true, dateOfBirth: true, gender: true, passportExpiry: true } }, contract: { select: { id: true, partyName: true, contractNumber: true } } },
      },
    },
  });
  if (!t) throw notFound('Trip');
  const commercial = canSeeCommercials(role);
  const [hotels, vehicles, activities, tickets, parties, docs, tasks, ready, timeline] = await Promise.all([
    listHotelBookings(id, role), listAssignments(id, role), listActivityBookings(id, role),
    listTickets({ tripId: id, page: 1, pageSize: 100, openOnly: false }, role),
    Promise.all(t.contracts.map(c => getContract(c.id))),
    prisma.documentLink.findMany({ where: { entityType: 'trip', entityId: id }, include: { document: { select: { id: true, title: true, type: true, status: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true, expiresAt: true } } }, orderBy: { createdAt: 'desc' } }),
    prisma.task.findMany({ where: { tripId: id, status: { notIn: ['completed', 'cancelled'] } }, orderBy: [{ dueDate: 'asc' }], take: 50, select: { id: true, title: true, priority: true, status: true, dueDate: true, assignedTo: true } }),
    readiness(prisma, id),
    prisma.activityLog.findMany({
      where: { OR: [{ entityType: 'trip', entityId: id }, { entityType: 'contract', entityId: { in: t.contracts.map(c => c.id) } }] },
      orderBy: { createdAt: 'desc' }, take: 80, select: { id: true, action: true, title: true, description: true, timestamp: true, userId: true, source: true },
    }),
  ]);
  const opsMoney = commercial ? {
    cost: [...hotels, ...vehicles, ...activities].reduce((s, r) => s + (r.costAmount ?? 0), 0) + tickets.items.reduce((s, k) => s + (k.fare.costAmount ?? 0), 0),
    sell: [...hotels, ...vehicles, ...activities].reduce((s, r) => s + (r.sellAmount ?? 0), 0) + tickets.items.reduce((s, k) => s + (k.fare.totalFare ?? 0), 0),
  } : null;
  return {
    trip: {
      id: t.id, tourName: t.tourName, destination: t.destination, customer: t.customer, customerId: t.customerId, phone: t.phone, departure: t.departure, returnDate: t.returnDate,
      nights: t.departure && t.returnDate ? nightsBetween(t.departure, t.returnDate) : null, pax: t.pax, stage: t.stage, stageLabel: STAGE_LABEL[t.stage as TripStage], status: t.status,
      isInternational: t.isInternational, notes: t.notes, assignedOps: t.assignedOps, assignedOpsUserId: t.assignedOpsUserId, stageChangedAt: t.stageChangedAt?.toISOString() ?? null, cancelReason: t.cancelReason,
    },
    readiness: ready,
    money: {
      totalPayable: n(t.totalPayable), paid: n(t.paidAmount), balance: n(t.balanceDue),
      ...(commercial ? { quotedCost: n(t.supplierCost), grossMargin: n(t.grossMargin), marginPct: n(t.marginPct), bookedCost: opsMoney!.cost, bookedSell: opsMoney!.sell } : {}),
    },
    parties: parties.map(c => ({
      id: c.id, contractNumber: c.contractNumber, partyName: c.partyName, status: c.status, adults: c.adults, children: c.children, infants: c.infants,
      totalAmount: c.totalAmount, schedule: c.schedule, payments: c.payments, paymentTracking: c.paymentTracking, customer: c.customer,
      travellers: t.travellers.filter(x => x.contractId === c.id).length,
    })),
    pickupPoints: t.pickupPoints.map(p => ({ id: p.id, seq: p.seq, name: p.name, address: p.address, landmark: p.landmark, pickupAt: p.pickupAt?.toISOString() ?? null, pickupLocal: toIstLocal(p.pickupAt), contactName: p.contactName, contactPhone: p.contactPhone, mapUrl: p.mapUrl, notes: p.notes, travellers: p._count.travellers })),
    travellers: t.travellers.map(x => ({
      linkId: x.id, travellerId: x.travellerId, name: travellerDisplayName(x.traveller), role: x.role, phone: x.traveller.phone, gender: x.traveller.gender, dateOfBirth: x.traveller.dateOfBirth,
      contractId: x.contractId, partyName: x.contract?.partyName ?? null, pickupPointId: x.pickupPointId, passportStatus: passportStatus(x.traveller.passportExpiry, { travelDate: t.departure }),
    })),
    hotels, vehicles, activities, tickets: tickets.items,
    documents: docs.map(d => ({ linkId: d.id, role: d.role, ...d.document, createdAt: d.document.createdAt.toISOString() })),
    tasks, timeline,
  };
}
export type TripWorkspace = Awaited<ReturnType<typeof getWorkspace>>;
