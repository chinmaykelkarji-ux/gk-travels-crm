// ============================================================
// Itinerary v2: one itinerary per trip, built day by day in the trip
// workspace. Staff see everything (internal notes; internal cost only with
// commercial access); customers only ever get customerView(), which goes
// through the allowlist in calc/itinerary.ts.
//
// Saves replace the days and items in one transaction, guarded by the
// revision the editor started from. Items that came from bookings keep
// their generated text (the booking is the truth): the editor may only
// change their internal note, internal cost and visibility.
// ============================================================

import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma, type DbClient } from '../../lib/prisma.js';
import { audit } from '../../core/audit.js';
import { AppError, notFound, stateConflict } from '../../core/errors.js';
import { nextFreeDisplayId } from '../../core/numbering.js';
import { canSeeCommercials } from '../../lib/redact.js';
import { addDays, toIstLocal } from '../../../../src/shared/calc/istTime.js';
import {
  alignDays, defaultDayTitle, ITEM_KINDS, planDays, sortItems, toCustomerItinerary,
  type DayDoc, type ItemDoc, type ItemKind, type ItineraryDoc, type SourceType,
} from '../../../../src/shared/calc/itinerary.js';
import type { ItineraryCreate, ItineraryListQuery, ItinerarySave } from '../../../../src/shared/contracts/itineraries.js';
import { assertOpenTrip, n } from '../operations/common.js';
import { tripChanged } from '../operations/hooks.js';
// Cycle with sync.ts is safe: neither module uses the other at load time.
import { syncItinerary } from './sync.js';

export const ITINERARY_INCLUDE = {
  days: { orderBy: [{ dayNumber: 'asc' }, { sortOrder: 'asc' }], include: { items: { orderBy: { sortOrder: 'asc' } } } },
} satisfies Prisma.ItineraryInclude;
export type ItineraryRow = Prisma.ItineraryGetPayload<{ include: typeof ITINERARY_INCLUDE }>;

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const kindOf = (k: string): ItemKind => ((ITEM_KINDS as readonly string[]).includes(k) ? (k as ItemKind) : 'NOTE');

/** Row → staff document. Classic days' activity lines appear as items so the first v2 save keeps them. */
export function toDoc(row: ItineraryRow, role: string | undefined): ItineraryDoc {
  const commercial = canSeeCommercials(role);
  return {
    id: row.id, tripId: row.tripId, title: row.title, destination: row.destination, customerName: row.customerName,
    startDate: row.startDate, endDate: row.endDate, pax: row.pax, revision: row.revision,
    notes: row.notes, internalNotes: row.internalNotes, emergencyContact: row.emergencyContact,
    days: row.days.map((d): DayDoc => ({
      id: d.id, dayNumber: d.dayNumber, date: d.date, title: d.title, morning: d.morning, afternoon: d.afternoon, evening: d.evening,
      hotelName: d.hotelName, hotelAddress: d.hotelAddress, meals: strings(d.meals), transfers: d.transfers, notes: d.notes, internalNotes: d.internalNotes,
      items: [
        ...d.items.map((i): ItemDoc => ({
          id: i.id, time: i.time, kind: kindOf(i.kind), title: i.title, details: i.details, internalNote: i.internalNote,
          internalCost: commercial ? n(i.internalCost) : null, customerVisible: i.customerVisible,
          sourceType: i.sourceType as SourceType | null, sourceId: i.sourceId,
        })),
        ...(row.format === 'CLASSIC' ? strings(d.activities).filter(a => a.trim()).map((a): ItemDoc => ({ time: null, kind: 'ACTIVITY', title: a.trim().slice(0, 200), details: null, internalNote: null, internalCost: null, customerVisible: true, sourceType: null, sourceId: null })) : []),
      ],
    })),
  };
}

async function staffView(row: ItineraryRow, role: string | undefined) {
  const doc = toDoc(row, role);
  const trip = row.tripId ? await prisma.trip.findUnique({ where: { id: row.tripId }, select: { departure: true, returnDate: true, stage: true } }) : null;
  const plan = trip ? planDays(trip.departure, trip.returnDate) : [];
  const beyond = trip ? alignDays(doc.days, trip.departure, trip.returnDate).beyond.map(d => d.dayNumber) : [];
  const datesOutOfStep = plan.length > 0 && (doc.days.length < plan.length || doc.days.some(d => d.dayNumber <= plan.length && d.date !== plan[d.dayNumber - 1].date));
  return {
    ...doc,
    format: row.format, status: row.status, sharedRevision: row.sharedRevision, sharedAt: row.sharedAt?.toISOString() ?? null, updatedAt: row.updatedAt.toISOString(),
    canSeeCost: canSeeCommercials(role),
    trip: trip ? { departure: trip.departure, returnDate: trip.returnDate, stage: trip.stage, days: plan.length } : null,
    warnings: {
      datesOutOfStep, daysBeyondTrip: beyond,
      notShared: row.sharedRevision === null, changedSinceShared: row.sharedRevision !== null && row.revision > row.sharedRevision,
    },
  };
}
export type ItineraryView = Awaited<ReturnType<typeof staffView>>;

async function load(db: DbClient, id: string): Promise<ItineraryRow> {
  const row = await db.itinerary.findUnique({ where: { id }, include: ITINERARY_INCLUDE });
  if (!row) throw notFound('Itinerary');
  return row;
}

export async function getItinerary(id: string, role: string | undefined) {
  return staffView(await load(prisma, id), role);
}

/** The trip's itinerary, or null when none has been started. */
export async function getTripItinerary(tripId: string, role: string | undefined) {
  const row = await prisma.itinerary.findFirst({ where: { tripId }, orderBy: { createdAt: 'asc' }, include: ITINERARY_INCLUDE });
  return row ? staffView(row, role) : null;
}

export async function listItineraries(q: ItineraryListQuery) {
  const where: Prisma.ItineraryWhereInput = q.search ? { OR: [{ title: { contains: q.search, mode: 'insensitive' } }, { destination: { contains: q.search, mode: 'insensitive' } }, { id: { contains: q.search, mode: 'insensitive' } }] } : {};
  const rows = await prisma.itinerary.findMany({ where, orderBy: { updatedAt: 'desc' }, take: q.limit, select: { id: true, title: true, destination: true, tripId: true, startDate: true, format: true, _count: { select: { days: true } } } });
  return rows.map(r => ({ id: r.id, title: r.title, destination: r.destination, tripId: r.tripId, startDate: r.startDate, format: r.format, days: r._count.days }));
}

// ── Create ────────────────────────────────────────────────────

export async function createItinerary(input: ItineraryCreate, role: string | undefined, actorId?: string | null) {
  const trip = await prisma.trip.findUnique({ where: { id: input.tripId }, select: { id: true, tourName: true, destination: true, customer: true, phone: true, email: true, departure: true, returnDate: true, pax: true } });
  if (!trip) throw notFound('Trip');
  await assertOpenTrip(prisma, trip.id);
  const source = input.copyFromId ? toDoc(await load(prisma, input.copyFromId), 'ADMIN') : null;
  const plan = planDays(trip.departure, trip.returnDate);
  const count = Math.max(plan.length, source?.days.length ?? 0, 1);

  const id = await prisma.$transaction(async tx => {
    // One itinerary per trip: serialise on the trip row.
    await tx.$queryRaw`SELECT "id" FROM "trips" WHERE "id" = ${trip.id} FOR UPDATE`;
    const existing = await tx.itinerary.findFirst({ where: { tripId: trip.id }, select: { id: true } });
    if (existing) throw new AppError('CONFLICT', 409, `Trip ${trip.id} already has itinerary ${existing.id}`, { itineraryId: existing.id });
    const itnId = await nextFreeDisplayId(tx, 'ITN');
    await tx.itinerary.create({
      data: {
        id: itnId, tripId: trip.id, title: trip.tourName ?? `${trip.customer} — ${trip.destination}`, destination: trip.destination, customerName: trip.customer,
        customerPhone: trip.phone, customerEmail: trip.email, startDate: trip.departure, endDate: trip.returnDate, pax: trip.pax, status: 'draft', format: 'V2',
        notes: source?.notes ?? null, internalNotes: source?.internalNotes ?? null, emergencyContact: source?.emergencyContact ?? null,
        createdDate: new Date().toISOString().slice(0, 10), updatedById: actorId ?? null,
      },
    });
    const days = Array.from({ length: count }, (_, i) => {
      const from = source?.days[i];
      return {
        id: randomUUID(), itineraryId: itnId, dayNumber: i + 1, sortOrder: i, date: plan[i]?.date ?? null, title: from?.title || defaultDayTitle(i + 1),
        morning: from?.morning ?? null, afternoon: from?.afternoon ?? null, evening: from?.evening ?? null, hotelName: null, hotelAddress: null,
        meals: (from?.meals ?? []) as Prisma.InputJsonValue, activities: [] as Prisma.InputJsonValue, transfers: from?.transfers ?? null, notes: from?.notes ?? null, internalNotes: from?.internalNotes ?? null,
      };
    });
    await tx.itineraryDay.createMany({ data: days });
    // Copied items are the manual ones; booking items belong to the other trip.
    const items = days.flatMap((d, i) => sortItems((source?.days[i]?.items ?? []).filter(it => !it.sourceType)).map((it, k) => ({
      itineraryId: itnId, dayId: d.id, sortOrder: k, time: it.time, kind: it.kind, title: it.title, details: it.details, internalNote: it.internalNote,
      internalCost: canSeeCommercials(role) ? it.internalCost : null, customerVisible: it.customerVisible,
    })));
    if (items.length) await tx.itineraryItem.createMany({ data: items });
    await audit(tx, {
      action: 'itinerary_created', entityType: 'trip', entityId: trip.id, userId: actorId,
      description: `Itinerary ${itnId} started with ${count} day(s)${source ? ` from ${source.id}` : ''}`, after: { itineraryId: itnId, days: count, copiedFrom: source?.id ?? null },
    });
    await tripChanged(tx, trip.id, 'itinerary_created', actorId);
    return itnId;
  });
  if (input.fromBookings) await syncItinerary(id, role, actorId, { quiet: true });
  return getItinerary(id, role);
}

// ── Save ──────────────────────────────────────────────────────

const snapshot = (doc: ItineraryDoc) => ({
  title: doc.title, notes: doc.notes, internalNotes: doc.internalNotes, emergencyContact: doc.emergencyContact,
  days: doc.days.map(d => ({ day: d.dayNumber, title: d.title, morning: d.morning, afternoon: d.afternoon, evening: d.evening, hotelName: d.hotelName, meals: d.meals, transfers: d.transfers, notes: d.notes, internalNotes: d.internalNotes, items: d.items.map(i => [i.time, i.kind, i.title, i.details, i.internalNote, i.internalCost, i.customerVisible]) })),
});

function describeChanges(before: ReturnType<typeof snapshot>, after: ReturnType<typeof snapshot>): string {
  const changed: number[] = [];
  const max = Math.max(before.days.length, after.days.length);
  for (let i = 0; i < max; i++) if (JSON.stringify(before.days[i]) !== JSON.stringify(after.days[i])) changed.push(i + 1);
  const head = (['title', 'notes', 'internalNotes', 'emergencyContact'] as const).filter(k => before[k] !== after[k]);
  const parts = [changed.length ? `day ${changed.join(', ')}` : '', head.length ? head.join(', ') : '', before.days.length !== after.days.length ? `${before.days.length} → ${after.days.length} days` : ''].filter(Boolean);
  return parts.length ? parts.join('; ') : 'no changes';
}

export async function saveItinerary(id: string, input: ItinerarySave, role: string | undefined, actorId?: string | null) {
  const commercial = canSeeCommercials(role);
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "itineraries" WHERE "id" = ${id} FOR UPDATE`;
    const before = await load(tx, id);
    if (before.tripId) await assertOpenTrip(tx, before.tripId);
    if (input.revision !== before.revision) throw stateConflict(`This itinerary was saved by someone else (now version ${before.revision}). Reload to see their changes, then make yours again.`);
    const trip = before.tripId ? await tx.trip.findUnique({ where: { id: before.tripId }, select: { departure: true } }) : null;
    const start = trip?.departure ?? before.startDate;

    const oldDays = new Map(before.days.map(d => [d.id, d]));
    const oldItems = new Map(before.days.flatMap(d => d.items).map(i => [i.id, i]));
    // Day ids survive a save when the editor sends them back (first use only).
    const dayIds: string[] = [];
    for (const d of input.days) dayIds.push(d.id && oldDays.has(d.id) && !dayIds.includes(d.id) ? d.id : randomUUID());
    const kept = new Set(dayIds);
    const days: Prisma.ItineraryDayCreateManyInput[] = [];
    const items: Prisma.ItineraryItemCreateManyInput[] = [];
    const used = new Set<string>();

    input.days.forEach((d, idx) => {
      const dayId = dayIds[idx];
      const dayNumber = idx + 1;
      days.push({
        id: dayId, itineraryId: id, dayNumber, sortOrder: idx, date: start ? addDays(start, idx) : null,
        title: d.title || defaultDayTitle(dayNumber), morning: d.morning, afternoon: d.afternoon, evening: d.evening, hotelName: d.hotelName, hotelAddress: d.hotelAddress,
        meals: d.meals, activities: [], transfers: d.transfers, notes: d.notes, internalNotes: d.internalNotes,
      });
      sortItems(d.items).forEach((it, k) => {
        const old = it.id ? oldItems.get(it.id) : undefined;
        const itemId = old && !used.has(old.id) ? old.id : randomUUID();
        used.add(itemId);
        const cost = commercial ? (it.internalCost ?? null) : (old && old.id === itemId ? old.internalCost : null);
        if (old && old.id === itemId && old.sourceType) {
          // Booking item: its text, time and day come from the booking.
          items.push({ id: itemId, itineraryId: id, dayId: kept.has(old.dayId) ? old.dayId : dayId, sortOrder: k, time: old.time, kind: old.kind, title: old.title, details: old.details, sourceType: old.sourceType, sourceId: old.sourceId, internalNote: it.internalNote, internalCost: cost, customerVisible: it.customerVisible });
        } else {
          items.push({ id: itemId, itineraryId: id, dayId, sortOrder: k, time: it.time ?? null, kind: it.kind, title: it.title, details: it.details, internalNote: it.internalNote, internalCost: cost, customerVisible: it.customerVisible });
        }
      });
    });

    // Booking items cannot be deleted here (hide them instead); ones left out stay where they were.
    for (const old of oldItems.values()) {
      if (!old.sourceType || used.has(old.id)) continue;
      if (!kept.has(old.dayId)) {
        const day = oldDays.get(old.dayId)!;
        throw new AppError('VALIDATION_ERROR', 400, `Day ${day.dayNumber} has items from bookings. Hide them from the customer instead of removing the day.`, { days: 'Booking items cannot be removed' });
      }
      items.push({ id: old.id, itineraryId: id, dayId: old.dayId, sortOrder: 999, time: old.time, kind: old.kind, title: old.title, details: old.details, sourceType: old.sourceType, sourceId: old.sourceId, internalNote: old.internalNote, internalCost: old.internalCost, customerVisible: old.customerVisible });
    }

    await tx.itineraryDay.deleteMany({ where: { itineraryId: id } });
    if (days.length) await tx.itineraryDay.createMany({ data: days });
    if (items.length) await tx.itineraryItem.createMany({ data: items });
    const last = days[days.length - 1];
    await tx.itinerary.update({
      where: { id },
      data: {
        title: input.title, notes: input.notes, internalNotes: input.internalNotes, emergencyContact: input.emergencyContact, format: 'V2', status: 'draft',
        revision: { increment: 1 }, updatedById: actorId ?? null, ...(start ? { startDate: start, endDate: (last?.date as string | null) ?? start } : {}),
      },
    });
    const after = await load(tx, id);
    const b = snapshot(toDoc(before, 'ADMIN')), a = snapshot(toDoc(after, 'ADMIN'));
    await audit(tx, {
      action: 'itinerary_saved', entityType: before.tripId ? 'trip' : 'itinerary', entityId: before.tripId ?? id, userId: actorId,
      description: `Itinerary ${id} saved as version ${after.revision}: ${describeChanges(b, a)}`, before: b, after: a,
    });
    await tripChanged(tx, before.tripId, 'itinerary_saved', actorId);
  });
  return getItinerary(id, role);
}

// ── Share / delete ────────────────────────────────────────────

/** Records that the customer has been given the current version (the office sends it; nothing is sent from here). */
export async function markShared(id: string, role: string | undefined, actorId?: string | null) {
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "itineraries" WHERE "id" = ${id} FOR UPDATE`;
    const it = await tx.itinerary.findUnique({ where: { id }, select: { id: true, tripId: true, revision: true, sharedRevision: true, _count: { select: { days: true } } } });
    if (!it) throw notFound('Itinerary');
    if (it.tripId) await assertOpenTrip(tx, it.tripId);
    if (!it._count.days) throw stateConflict('Add at least one day before sharing the itinerary');
    await tx.itinerary.update({ where: { id }, data: { sharedRevision: it.revision, sharedAt: new Date(), sharedById: actorId ?? null, status: 'finalized' } });
    await audit(tx, {
      action: 'itinerary_shared', entityType: it.tripId ? 'trip' : 'itinerary', entityId: it.tripId ?? id, userId: actorId,
      description: `Itinerary ${id} version ${it.revision} marked as shared with the customer`, before: { sharedRevision: it.sharedRevision }, after: { sharedRevision: it.revision },
    });
    await tripChanged(tx, it.tripId, 'itinerary_shared', actorId);
  });
  return getItinerary(id, role);
}

export async function deleteItinerary(id: string, actorId?: string | null) {
  await prisma.$transaction(async tx => {
    const it = await tx.itinerary.findUnique({ where: { id }, include: ITINERARY_INCLUDE });
    if (!it) throw notFound('Itinerary');
    if (it.tripId) await assertOpenTrip(tx, it.tripId);
    await tx.itinerary.delete({ where: { id } });
    await audit(tx, {
      action: 'itinerary_deleted', entityType: it.tripId ? 'trip' : 'itinerary', entityId: it.tripId ?? id, userId: actorId,
      description: `Itinerary ${id} deleted (${it.days.length} day(s))`, before: snapshot(toDoc(it, 'ADMIN')),
    });
    await tripChanged(tx, it.tripId, 'itinerary_deleted', actorId);
  });
  return { ok: true };
}

// ── Customer copy ─────────────────────────────────────────────

export async function customerView(id: string) {
  const row = await load(prisma, id);
  const [pickups, company] = await Promise.all([
    row.tripId ? prisma.tripPickupPoint.findMany({ where: { tripId: row.tripId }, orderBy: { seq: 'asc' } }) : Promise.resolve([]),
    prisma.companySettings.findFirst({ select: { companyName: true, addressLine1: true, addressLine2: true, city: true, state: true, pincode: true, phone: true, email: true, website: true, logoUrl: true } }),
  ]);
  return toCustomerItinerary(toDoc(row, undefined), {
    pickupPoints: pickups.map(p => ({ name: p.name, landmark: p.landmark, address: p.address, time: toIstLocal(p.pickupAt), contactName: p.contactName, contactPhone: p.contactPhone, mapUrl: p.mapUrl })),
    company: {
      name: company?.companyName ?? 'GK Travels', phone: company?.phone ?? null, email: company?.email ?? null, website: company?.website ?? null, logoUrl: company?.logoUrl ?? null,
      address: [company?.addressLine1, company?.addressLine2, company?.city, company?.state, company?.pincode].filter(Boolean).join(', ') || null,
    },
  });
}
