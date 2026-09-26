// ============================================================
// What each trigger sees happening — plain queries, one per trigger.
//
// Every event has a key that is stable for "this thing, this occasion", so
// the engine acts on it once: a trip's 3-day reminder, one hotel booking's
// missing confirmation, a ticket in one waitlist state.
// ============================================================

import { prisma } from '../../lib/prisma.js';
import { addDays, istToday } from '../../../../src/shared/calc/istTime.js';
import type { TriggerCode } from '../../../../src/shared/calc/automation.js';

export interface AutomationEvent {
  key: string;
  entityType: string;
  entityId: string;
  /** For the message: which records fill the template. */
  tripId?: string | null;
  customerId?: string | null;
  receiptId?: string | null;
  ticketId?: string | null;
  extra?: Record<string, string>;
  /** For the team: what happened, in a line. */
  title: string;
  link: string | null;
}

const OPEN = ['PLANNING', 'CONFIRMING', 'READY', 'ONGOING'] as const;
const fmt = (d: string | Date) => (typeof d === 'string' ? new Date(`${d}T00:00:00+05:30`) : d)
  .toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const tripLabel = (t: { id: string; tourName: string | null; destination: string }) => `${t.tourName ?? t.destination} (${t.id})`;

export async function eventsFor(trigger: TriggerCode, params: Record<string, number | number[]>, since: Date, now = new Date()): Promise<AutomationEvent[]> {
  const today = istToday(now);
  switch (trigger) {
    case 'PAYMENT_DUE_BEFORE_DEPARTURE': {
      const days = (params.days as number[]) ?? [];
      const trips = await prisma.trip.findMany({
        where: { stage: { in: ['CONFIRMING', 'READY'] }, balanceDue: { gt: 0 }, departure: { in: days.map(d => addDays(today, d)) } },
        select: { id: true, tourName: true, destination: true, departure: true, customerId: true },
      });
      return trips.map(t => {
        const d = days.find(n => addDays(today, n) === t.departure)!;
        return {
          key: `${t.id}:${d}d`, entityType: 'trip', entityId: t.id, tripId: t.id, customerId: t.customerId,
          extra: { due_date: fmt(t.departure!) }, title: `Payment reminder for ${tripLabel(t)} — leaves in ${d} day${d === 1 ? '' : 's'}`, link: `/trips/${t.id}`,
        };
      });
    }
    case 'DEPARTS_TOMORROW': {
      const trips = await prisma.trip.findMany({
        where: { stage: { in: [...OPEN] }, departure: addDays(today, 1) },
        select: { id: true, tourName: true, destination: true, customerId: true },
      });
      return trips.map(t => ({ key: `${t.id}:departure`, entityType: 'trip', entityId: t.id, tripId: t.id, customerId: t.customerId, title: `${tripLabel(t)} leaves tomorrow`, link: `/trips/${t.id}` }));
    }
    case 'SUPPLIER_UNCONFIRMED': {
      const until = new Date(now.getTime() + (params.hours as number) * 3_600_000);
      const [hotels, duties, services] = await Promise.all([
        prisma.hotelBooking.findMany({
          where: { status: { in: ['REQUESTED', 'ON_HOLD'] }, checkIn: { gte: new Date(`${today}T00:00:00Z`), lte: until } },
          select: { id: true, hotelName: true, checkIn: true, trip: { select: { id: true, tourName: true, destination: true } } },
        }),
        prisma.vehicleAssignment.findMany({
          where: { status: 'REQUESTED', startAt: { gte: now, lte: until } },
          select: { id: true, startAt: true, trip: { select: { id: true, tourName: true, destination: true } } },
        }),
        prisma.tripService.findMany({
          where: { status: 'REQUESTED', serviceDate: { gte: now, lte: until } },
          select: { id: true, type: true, serviceDate: true, trip: { select: { id: true, tourName: true, destination: true } } },
        }),
      ]);
      return [
        ...hotels.map(h => ({ key: `hotel:${h.id}`, entityType: 'hotel_booking', entityId: h.id, tripId: h.trip?.id ?? null, title: `${h.hotelName} is not confirmed — check-in ${fmt(h.checkIn)}${h.trip ? `, ${tripLabel(h.trip)}` : ''}`, link: h.trip ? `/trips/${h.trip.id}?tab=hotels` : null })),
        ...duties.map(v => ({ key: `vehicle:${v.id}`, entityType: 'vehicle_assignment', entityId: v.id, tripId: v.trip?.id ?? null, title: `Vehicle not confirmed — starts ${fmt(v.startAt)}${v.trip ? `, ${tripLabel(v.trip)}` : ''}`, link: v.trip ? `/trips/${v.trip.id}?tab=transport` : null })),
        ...services.map(s => ({ key: `service:${s.id}`, entityType: 'trip_service', entityId: s.id, tripId: s.trip.id, title: `${String(s.type).toLowerCase()} not confirmed — ${fmt(s.serviceDate)}, ${tripLabel(s.trip)}`, link: `/trips/${s.trip.id}` })),
      ];
    }
    case 'TICKET_WAITLISTED': {
      const until = new Date(now.getTime() + (params.days as number) * 86_400_000);
      const tickets = await prisma.ticket.findMany({
        where: { status: { in: ['WAITLISTED', 'RAC', 'PARTIAL'] }, segments: { some: { departAt: { gte: now, lte: until } } } },
        select: { id: true, pnr: true, status: true, tripId: true, customerId: true, segments: { orderBy: { seq: 'asc' }, take: 1, select: { fromName: true, toName: true, departAt: true } } },
      });
      return tickets.map(t => {
        const s = t.segments[0];
        return {
          key: `${t.id}:${t.status}`, entityType: 'ticket', entityId: t.id, tripId: t.tripId, customerId: t.customerId, ticketId: t.id,
          title: `Ticket ${t.pnr ? `PNR ${t.pnr}` : ''} ${s ? `${s.fromName} → ${s.toName}` : ''} is still ${t.status === 'PARTIAL' ? 'part confirmed' : t.status === 'RAC' ? 'RAC' : 'waitlisted'}${s?.departAt ? ` — travels ${fmt(s.departAt)}` : ''}`.replace(/\s+/g, ' '),
          link: `/tickets/${t.id}`,
        };
      });
    }
    case 'PAYMENT_RECEIVED': {
      const receipts = await prisma.customerReceipt.findMany({
        where: { kind: 'RECEIPT', status: 'POSTED', createdAt: { gte: since } },
        select: { id: true, tripId: true, customerId: true },
      });
      return receipts.map(r => ({ key: r.id, entityType: 'receipt', entityId: r.id, tripId: r.tripId, customerId: r.customerId, receiptId: r.id, title: `Payment ${r.id} recorded`, link: r.tripId ? `/trips/${r.tripId}` : null }));
    }
    case 'TRIP_COMPLETED': {
      const trips = await prisma.trip.findMany({
        where: { stage: 'COMPLETED', stageChangedAt: { gte: since } },
        select: { id: true, tourName: true, destination: true, customerId: true },
      });
      return trips.map(t => ({ key: t.id, entityType: 'trip', entityId: t.id, tripId: t.id, customerId: t.customerId, title: `${tripLabel(t)} completed`, link: `/trips/${t.id}` }));
    }
  }
}
