// ============================================================
// Travellers v2 — the people who travel (table "passengers"). Owns ids,
// validation, passport duplicate checks, trip membership and passport alerts.
// ============================================================

import type { Prisma } from '@prisma/client';
import { prisma, type DbClient } from '../../lib/prisma.js';
import { audit } from '../../core/audit.js';
import { nextDisplayId, nextFreeDisplayId } from '../../core/numbering.js';
import { AppError, notFound, stateConflict } from '../../core/errors.js';
import { passportStatus, travellerDisplayName } from '../../../../src/shared/calc/travellers.js';
import { travellerIdentityData, presentTraveller, passportHash } from '../../core/identity.js';
import { isMaskedValue, maskFromLast4, maskIdNumber, normalizeIdNumber } from '../../../../src/shared/calc/identity.js';
import type { TravellerCreate, TravellerUpdate, TravellerListQuery, TripTravellersPut, TravellerSummary } from '../../../../src/shared/contracts/travellers.js';

const today = () => new Date().toISOString().slice(0, 10);
const isoPlusDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

const ACTIVE_TRIP_STATUSES = ['draft', 'quotation', 'confirmed', 'in_progress'];

type TravellerRow = Prisma.TravellerGetPayload<{ include: { customer: { select: { name: true } }; _count: { select: { trips: true } } } }>;

function toSummary(t: TravellerRow): TravellerSummary {
  return {
    id: t.id, customerId: t.customerId, customerName: t.customer?.name ?? null,
    title: t.title, firstName: t.firstName, lastName: t.lastName, displayName: t.displayName,
    dateOfBirth: t.dateOfBirth, gender: t.gender, nationality: t.nationality,
    passportNumber: maskedPassport(t), passportExpiry: t.passportExpiry,
    passportStatus: passportStatus(t.passportExpiry),
    tripCount: t._count.trips, createdAt: t.createdAt.toISOString(),
  };
}

function maskedPassport(t: { passportLast4?: string | null; passportNumber?: string | null }): string | null {
  return maskFromLast4(t.passportLast4) ?? maskIdNumber(t.passportNumber);
}

// ── List ──────────────────────────────────────────────────────

export async function listTravellers(q: TravellerListQuery) {
  const term = q.q?.trim();
  const where: Prisma.TravellerWhereInput = {
    deletedAt: null,
    ...(q.customerId ? { customerId: q.customerId } : {}),
    ...(q.passport === 'MISSING'  ? { OR: [{ passportLast4: null, passportNumber: null }, { passportExpiry: null }] } : {}),
    ...(q.passport === 'EXPIRED'  ? { passportExpiry: { lt: today() } } : {}),
    ...(q.passport === 'EXPIRING' ? { passportExpiry: { gte: today(), lte: isoPlusDays(180) } } : {}),
    ...(term ? {
      AND: [{ OR: [
        { firstName:      { contains: term, mode: 'insensitive' } },
        { lastName:       { contains: term, mode: 'insensitive' } },
        { displayName:    { contains: term, mode: 'insensitive' } },
        // Identity numbers are sealed: exact match on the blind index only.
        ...(normalizeIdNumber(term).length >= 6 ? [{ passportNumberHash: passportHash(term) }] : []),
        { id:             { contains: term, mode: 'insensitive' } },
        { customer:       { name: { contains: term, mode: 'insensitive' } } },
      ] }],
    } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.traveller.findMany({
      where, orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      skip: (q.page - 1) * q.pageSize, take: q.pageSize,
      include: { customer: { select: { name: true } }, _count: { select: { trips: true } } },
    }),
    prisma.traveller.count({ where }),
  ]);
  return { items: rows.map(toSummary), total, page: q.page, pageSize: q.pageSize };
}

// ── Read ──────────────────────────────────────────────────────

export async function getTraveller(id: string) {
  const t = await prisma.traveller.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      trips: { include: { trip: { select: { id: true, destination: true, departure: true, returnDate: true, status: true } } }, orderBy: { createdAt: 'desc' } },
    },
  });
  if (!t) throw notFound('Traveller');
  return {
    ...presentTraveller(t),
    displayName: travellerDisplayName(t),
    passportStatus: passportStatus(t.passportExpiry),
    trips: t.trips.map(tt => ({ linkId: tt.id, role: tt.role, position: tt.position, ...tt.trip, passportStatus: passportStatus(t.passportExpiry, { travelDate: tt.trip.departure }) })),
  };
}

// ── Create / update / delete ──────────────────────────────────

async function assertCustomer(customerId: string | null | undefined) {
  if (!customerId) return;
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, deletedAt: true } });
  if (!c || c.deletedAt) throw new AppError('VALIDATION_ERROR', 400, 'Customer not found', { customerId: 'Unknown customer' });
}

async function findPassportClash(passportNumber: string | null | undefined, excludeId?: string) {
  if (!passportNumber || isMaskedValue(passportNumber)) return null;
  return prisma.traveller.findFirst({
    where: { deletedAt: null, passportNumberHash: passportHash(passportNumber), ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, firstName: true, lastName: true, customerId: true },
  });
}

export async function createTraveller(input: TravellerCreate, actorId?: string | null) {
  await assertCustomer(input.customerId);
  if (!input.force) {
    const clash = await findPassportClash(input.passportNumber);
    if (clash) {
      throw new AppError('CONFLICT', 409, `Passport ${maskIdNumber(input.passportNumber)} already belongs to ${clash.firstName} ${clash.lastName} (${clash.id})`, { existingTravellerId: clash.id });
    }
  }
  return prisma.$transaction(async tx => {
    const id = await nextFreeDisplayId(tx, 'PAX');
    const { force: _force, passportNumber, govtIdNumber, ...rest } = input;
    const t = await tx.traveller.create({
      data: { id, ...rest, ...travellerIdentityData({ passportNumber, govtIdNumber }), createdDate: today() } as Prisma.TravellerUncheckedCreateInput,
    });
    const shown = presentTraveller(t);
    await audit(tx, {
      action: 'traveller_created', entityType: 'traveller', entityId: id, userId: actorId,
      description: `Traveller ${travellerDisplayName(t)} added${t.customerId ? ` for ${t.customerId}` : ''}`,
      after: { firstName: t.firstName, lastName: t.lastName, customerId: t.customerId, passportNumber: shown.passportNumber, govtIdNumber: shown.govtIdNumber },
    });
    return shown;
  });
}

export async function updateTraveller(id: string, input: TravellerUpdate, actorId?: string | null) {
  const before = await prisma.traveller.findUnique({ where: { id } });
  if (!before || before.deletedAt) throw notFound('Traveller');
  if (input.customerId !== undefined) await assertCustomer(input.customerId);
  if (input.passportNumber) {
    const clash = await findPassportClash(input.passportNumber, id);
    if (clash) throw new AppError('CONFLICT', 409, `Passport ${maskIdNumber(input.passportNumber)} already belongs to ${clash.firstName} ${clash.lastName} (${clash.id})`, { existingTravellerId: clash.id });
  }
  const { passportNumber, govtIdNumber, ...rest } = input;
  const data: Prisma.TravellerUncheckedUpdateInput = { ...rest, ...travellerIdentityData({ passportNumber, govtIdNumber }) };
  return prisma.$transaction(async tx => {
    const after = await tx.traveller.update({ where: { id }, data });
    // Compare identity numbers by their sealed value; audit rows only ever hold the mask.
    const sealedKey: Record<string, string> = { passportNumber: 'passportNumberEnc', govtIdNumber: 'govtIdNumberEnc' };
    const raw = [before, after] as unknown as Record<string, unknown>[];
    const [b, a] = [presentTraveller(before), presentTraveller(after)] as Record<string, unknown>[];
    const changed = Object.keys(input).filter(k => sealedKey[k] ? raw[0][sealedKey[k]] !== raw[1][sealedKey[k]] : b[k] !== a[k]);
    await audit(tx, {
      action: 'traveller_updated', entityType: 'traveller', entityId: id, userId: actorId,
      description: `Traveller ${travellerDisplayName(after)} updated (${changed.join(', ') || 'no changes'})`,
      before: pick(b, changed), after: pick(a, changed),
    });
    return presentTraveller(after);
  });
}

function pick(obj: Record<string, unknown>, keys: string[]) {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = obj[k];
  return out;
}

export async function softDeleteTraveller(id: string, actorId?: string | null) {
  const t = await prisma.traveller.findUnique({ where: { id }, include: { trips: { include: { trip: { select: { id: true, status: true } } } } } });
  if (!t || t.deletedAt) throw notFound('Traveller');
  const active = t.trips.filter(tt => ACTIVE_TRIP_STATUSES.includes(tt.trip.status)).map(tt => tt.trip.id);
  if (active.length) throw stateConflict(`Traveller is on active trip(s) ${active.join(', ')}. Remove them from the trip first.`);
  return prisma.$transaction(async tx => {
    const after = await tx.traveller.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit(tx, { action: 'traveller_deleted', entityType: 'traveller', entityId: id, userId: actorId, description: `Traveller ${travellerDisplayName(t)} removed` });
    return after;
  });
}

// ── Trip membership ───────────────────────────────────────────

export async function getTripTravellers(tripId: string) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { id: true, departure: true, pax: true } });
  if (!trip) throw notFound('Trip');
  const rows = await prisma.tripTraveller.findMany({
    where: { tripId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    include: { traveller: { include: { customer: { select: { name: true } }, _count: { select: { trips: true } } } } },
  });
  return {
    tripId, pax: trip.pax, departure: trip.departure,
    travellers: rows.map(r => ({ linkId: r.id, role: r.role, position: r.position, ...toSummary(r.traveller), passportStatus: passportStatus(r.traveller.passportExpiry, { travelDate: trip.departure }) })),
  };
}

/** Replace the traveller list of a trip. Also mirrors ids into trips.passengerIds and, optionally, trip.pax. */
export async function setTripTravellers(tripId: string, input: TripTravellersPut, actorId?: string | null) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { id: true, pax: true, customerId: true } });
  if (!trip) throw notFound('Trip');
  const ids = Array.from(new Set(input.travellers.map(t => t.travellerId)));
  if (ids.length) {
    const found = await prisma.traveller.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true } });
    const missing = ids.filter(id => !found.some(f => f.id === id));
    if (missing.length) throw new AppError('VALIDATION_ERROR', 400, `Unknown traveller(s): ${missing.join(', ')}`, { travellers: missing.join(', ') });
  }
  const leads = input.travellers.filter(t => t.role === 'LEAD').length;
  if (leads > 1) throw new AppError('VALIDATION_ERROR', 400, 'Only one lead traveller per trip', { travellers: 'Choose a single lead' });

  return prisma.$transaction(async tx => {
    await tx.tripTraveller.deleteMany({ where: { tripId, travellerId: { notIn: ids.length ? ids : ['__none__'] } } });
    let position = 0;
    for (const t of input.travellers) {
      if (input.travellers.findIndex(x => x.travellerId === t.travellerId) !== position && ids.indexOf(t.travellerId) !== position) { /* duplicates collapse to the first mention */ }
      await tx.tripTraveller.upsert({
        where:  { tripId_travellerId: { tripId, travellerId: t.travellerId } },
        create: { tripId, travellerId: t.travellerId, role: t.role, position },
        update: { role: t.role, position },
      });
      position++;
    }
    const data: Prisma.TripUncheckedUpdateInput = { passengerIds: ids as Prisma.InputJsonValue };
    if (input.syncPax && ids.length) data.pax = ids.length;
    await tx.trip.update({ where: { id: tripId }, data });
    await audit(tx, {
      action: 'trip_travellers_set', entityType: 'trip', entityId: tripId, userId: actorId,
      description: `${ids.length} traveller(s) on trip ${tripId}`, after: { travellers: input.travellers },
    });
    return getTripTravellersTx(tx, tripId);
  });
}

async function getTripTravellersTx(tx: DbClient, tripId: string) {
  const rows = await tx.tripTraveller.findMany({ where: { tripId }, orderBy: { position: 'asc' }, include: { traveller: { include: { customer: { select: { name: true } }, _count: { select: { trips: true } } } } } });
  return { tripId, travellers: rows.map(r => ({ linkId: r.id, role: r.role, position: r.position, ...toSummary(r.traveller) })) };
}

/** Legacy bridge: when a v1 screen writes trips.passengerIds, mirror it into trip_travellers. */
export async function syncTripTravellersFromIds(tx: DbClient, tripId: string, ids: unknown) {
  if (!Array.isArray(ids)) return;
  const clean = Array.from(new Set(ids.filter((x): x is string => typeof x === 'string' && x.length > 0)));
  const existing = await tx.traveller.findMany({ where: { id: { in: clean }, deletedAt: null }, select: { id: true } });
  const valid = clean.filter(id => existing.some(e => e.id === id));
  await tx.tripTraveller.deleteMany({ where: { tripId, travellerId: { notIn: valid.length ? valid : ['__none__'] } } });
  for (const [position, travellerId] of valid.entries()) {
    await tx.tripTraveller.upsert({ where: { tripId_travellerId: { tripId, travellerId } }, create: { tripId, travellerId, position }, update: { position } });
  }
}

// ── Passport alerts ───────────────────────────────────────────

export async function passportAlerts(days: number) {
  const horizon = isoPlusDays(days);
  const travellers = await prisma.traveller.findMany({
    where: { deletedAt: null, passportExpiry: { not: null, lte: horizon } },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      trips: { where: { trip: { departure: { gte: today() }, status: { in: ACTIVE_TRIP_STATUSES } } }, include: { trip: { select: { id: true, destination: true, departure: true, status: true } } } },
    },
    orderBy: { passportExpiry: 'asc' },
  });
  return travellers.map(t => ({
    id: t.id, name: travellerDisplayName(t), customer: t.customer, passportNumber: maskedPassport(t), passportExpiry: t.passportExpiry,
    status: passportStatus(t.passportExpiry),
    upcomingTrips: t.trips.map(tt => ({ ...tt.trip, status: passportStatus(t.passportExpiry, { travelDate: tt.trip.departure }) })),
  }));
}

/** Travellers on upcoming trips whose passport is expired or short of six months at departure. */
export async function passportProblemsForUpcomingTrips(windowDays = 90) {
  const links = await prisma.tripTraveller.findMany({
    where: { trip: { status: { in: ACTIVE_TRIP_STATUSES }, departure: { gte: today(), lte: isoPlusDays(windowDays) } }, traveller: { deletedAt: null, passportExpiry: { not: null } } },
    include: { trip: { select: { id: true, destination: true, departure: true, customerId: true, customer: true } }, traveller: { select: { id: true, firstName: true, lastName: true, title: true, displayName: true, passportExpiry: true } } },
  });
  return links
    .map(l => ({ trip: l.trip, traveller: l.traveller, status: passportStatus(l.traveller.passportExpiry, { travelDate: l.trip.departure }) }))
    .filter(x => x.status === 'EXPIRED' || x.status === 'INSUFFICIENT');
}
