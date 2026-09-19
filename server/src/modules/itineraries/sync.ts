// ============================================================
// Sync an itinerary with its trip: days follow the trip dates, and the
// trip's hotels, vehicle duties, activities and ticket legs become day items
// (customer-safe text generated in calc/itinerary.ts). Manual items and
// everything a person typed on a day are left alone; the night's hotel on a
// day follows the hotel booking.
// ============================================================

import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma, type DbClient } from '../../lib/prisma.js';
import { audit } from '../../core/audit.js';
import { stateConflict } from '../../core/errors.js';
import { toIstLocal } from '../../../../src/shared/calc/istTime.js';
import { alignDays, bookingItems, defaultDayTitle, sortItems, syncPlan, type BookingSources } from '../../../../src/shared/calc/itinerary.js';
import { assertOpenTrip, isoDay } from '../operations/common.js';
import { tripChanged } from '../operations/hooks.js';
import { getItinerary, ITINERARY_INCLUDE, toDoc } from './service.js';

async function loadSources(db: DbClient, tripId: string): Promise<BookingSources> {
  const [hotels, vehicles, activities, segments] = await Promise.all([
    db.hotelBooking.findMany({ where: { tripId }, include: { hotel: { select: { address: true } } }, orderBy: { checkIn: 'asc' } }),
    db.vehicleAssignment.findMany({ where: { tripId }, include: { vehicle: { select: { registrationNo: true, type: true } }, driver: { select: { name: true, phone: true } } }, orderBy: { startAt: 'asc' } }),
    db.activityBooking.findMany({ where: { tripId }, orderBy: [{ date: 'asc' }, { time: 'asc' }] }),
    db.ticketSegment.findMany({ where: { ticket: { tripId } }, include: { ticket: { select: { mode: true, carrier: true, pnr: true, travelClass: true, status: true } } }, orderBy: [{ departAt: 'asc' }, { seq: 'asc' }] }),
  ]);
  return {
    hotels: hotels.map(h => ({ id: h.id, hotelName: h.hotelName, city: h.city, address: h.hotel?.address ?? null, roomTypeName: h.roomTypeName, mealPlan: h.mealPlan, checkIn: isoDay(h.checkIn)!, checkOut: isoDay(h.checkOut)!, rooms: h.rooms, status: h.status, confirmationNo: h.confirmationNo, customerNotes: h.customerNotes })),
    vehicles: vehicles.map(v => ({
      id: v.id, startLocal: toIstLocal(v.startAt)!, endLocal: toIstLocal(v.endAt)!, pickupPoint: v.pickupPoint, dropPoint: v.dropPoint, route: v.route,
      vehicleType: v.vehicleType ?? v.vehicle?.type ?? null, vehicleRegNo: v.vehicle?.registrationNo ?? v.vehicleRegNo, driverName: v.driver?.name ?? v.driverName, driverPhone: v.driver?.phone ?? v.driverPhone,
      status: v.status, customerNotes: v.customerNotes,
    })),
    activities: activities.map(a => ({ id: a.id, name: a.name, city: a.city, date: isoDay(a.date)!, time: a.time, status: a.status, confirmationNo: a.confirmationNo, customerNotes: a.customerNotes })),
    segments: segments.map(s => ({
      id: s.id, mode: s.ticket.mode, carrier: s.ticket.carrier, carrierName: s.carrierName, carrierNumber: s.carrierNumber, fromName: s.fromName, toName: s.toName,
      departLocal: toIstLocal(s.departAt), arriveLocal: toIstLocal(s.arriveAt), pnr: s.ticket.pnr, travelClass: s.travelClass ?? s.ticket.travelClass, boardingPoint: s.boardingPoint, ticketStatus: s.ticket.status,
    })),
  };
}

export interface SyncResult { added: number; updated: number; removed: number; daysAdded: number; daysRemoved: number; staysSet: number; unplaced: { title: string; date: string }[]; daysBeyondTrip: number[]; noDates: boolean }

export async function syncItinerary(id: string, role: string | undefined, actorId?: string | null, opts: { quiet?: boolean } = {}) {
  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "itineraries" WHERE "id" = ${id} FOR UPDATE`;
    const row = await tx.itinerary.findUnique({ where: { id }, include: ITINERARY_INCLUDE });
    if (!row) throw stateConflict('Itinerary not found');
    if (!row.tripId) throw stateConflict('This itinerary is not linked to a trip, so there are no bookings to bring in');
    const trip = await assertOpenTrip(tx, row.tripId);
    const out: SyncResult = { added: 0, updated: 0, removed: 0, daysAdded: 0, daysRemoved: 0, staysSet: 0, unplaced: [], daysBeyondTrip: [], noDates: !trip.departure };

    // 1. Days follow the trip dates.
    const doc = toDoc(row, 'ADMIN');
    const aligned = alignDays(doc.days, trip.departure, trip.returnDate);
    for (const d of aligned.keep) {
      const was = row.days.find(x => x.id === d.id)!;
      if (was.date !== d.date) await tx.itineraryDay.update({ where: { id: d.id! }, data: { date: d.date } });
    }
    if (aligned.drop.length) {
      await tx.itineraryDay.deleteMany({ where: { id: { in: aligned.drop.map(d => d.id!) } } });
      out.daysRemoved = aligned.drop.length;
    }
    if (aligned.add.length) {
      await tx.itineraryDay.createMany({ data: aligned.add.map(a => ({ id: randomUUID(), itineraryId: id, dayNumber: a.dayNumber, sortOrder: a.dayNumber - 1, date: a.date, title: defaultDayTitle(a.dayNumber), meals: [], activities: [] })) });
      out.daysAdded = aligned.add.length;
    }
    out.daysBeyondTrip = aligned.beyond.map(d => d.dayNumber);

    // 2. Booking items.
    const days = await tx.itineraryDay.findMany({ where: { itineraryId: id }, orderBy: { dayNumber: 'asc' }, include: { items: { orderBy: { sortOrder: 'asc' } } } });
    const dayByNumber = new Map(days.map(d => [d.dayNumber, d]));
    const dayNumberOf = new Map(days.map(d => [d.id, d.dayNumber]));
    const linked = days.flatMap(d => d.items).filter(i => i.sourceType && i.sourceId)
      .map(i => ({ id: i.id, sourceType: i.sourceType!, sourceId: i.sourceId!, dayNumber: dayNumberOf.get(i.dayId)!, time: i.time, kind: i.kind, title: i.title, details: i.details }));
    const proposed = bookingItems(await loadSources(tx, row.tripId));
    const plan = syncPlan(linked, proposed.items, proposed.stays, trip.departure, days.length);
    out.unplaced = plan.unplaced.map(p => ({ title: p.title, date: p.date }));

    if (plan.remove.length) await tx.itineraryItem.deleteMany({ where: { id: { in: plan.remove } } });
    for (const u of plan.update) {
      await tx.itineraryItem.update({ where: { id: u.id }, data: { dayId: dayByNumber.get(u.dayNumber)!.id, time: u.time, kind: u.kind, title: u.title, details: u.details } });
    }
    if (plan.add.length) {
      await tx.itineraryItem.createMany({
        data: plan.add.map(a => ({ itineraryId: id, dayId: dayByNumber.get(a.dayNumber)!.id, sortOrder: 999, time: a.time, kind: a.kind, title: a.title, details: a.details, sourceType: a.sourceType, sourceId: a.sourceId })),
      });
    }
    out.added = plan.add.length; out.updated = plan.update.length; out.removed = plan.remove.length;

    // 3. The night's hotel follows the hotel booking.
    for (const s of plan.stays) {
      const d = dayByNumber.get(s.dayNumber)!;
      if (d.hotelName !== s.hotelName || (s.hotelAddress && d.hotelAddress !== s.hotelAddress)) {
        await tx.itineraryDay.update({ where: { id: d.id }, data: { hotelName: s.hotelName, ...(s.hotelAddress ? { hotelAddress: s.hotelAddress } : {}) } });
        out.staysSet++;
      }
    }

    // 4. Keep each touched day in time order.
    const touched = new Set([...plan.add, ...plan.update].map(x => x.dayNumber));
    for (const n of touched) {
      const items = await tx.itineraryItem.findMany({ where: { dayId: dayByNumber.get(n)!.id }, orderBy: { sortOrder: 'asc' }, select: { id: true, time: true, sortOrder: true } });
      const sorted = sortItems(items);
      for (let k = 0; k < sorted.length; k++) if (sorted[k].sortOrder !== k) await tx.itineraryItem.update({ where: { id: sorted[k].id }, data: { sortOrder: k } });
    }

    const changed = out.added + out.updated + out.removed + out.daysAdded + out.daysRemoved + out.staysSet > 0;
    if (changed) {
      const last = await tx.itineraryDay.findFirst({ where: { itineraryId: id }, orderBy: { dayNumber: 'desc' }, select: { date: true } });
      await tx.itinerary.update({
        where: { id },
        data: { revision: { increment: 1 }, format: 'V2', status: 'draft', updatedById: actorId ?? null, ...(trip.departure ? { startDate: trip.departure, endDate: last?.date ?? trip.returnDate } : {}) } satisfies Prisma.ItineraryUpdateInput,
      });
      if (!opts.quiet) {
        await audit(tx, {
          action: 'itinerary_synced', entityType: 'trip', entityId: row.tripId, userId: actorId,
          description: `Itinerary ${id} brought in line with the bookings: ${out.added} added, ${out.updated} updated, ${out.removed} removed${out.daysAdded || out.daysRemoved ? `; days +${out.daysAdded}/-${out.daysRemoved}` : ''}`,
          before: { revision: row.revision }, after: { ...out, revision: row.revision + 1 },
        });
      }
      await tripChanged(tx, row.tripId, 'itinerary_synced', actorId);
    }
    return out;
  });
  return { itinerary: await getItinerary(id, role), result };
}
