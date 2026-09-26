// ============================================================
// What fills a template's {{placeholders}} — read from the records the
// message is about, never typed in. A value TravelOS does not have is simply
// absent, and rendering reports it as missing (calc/templates.ts), so a
// customer never receives a blank.
// ============================================================

import { prisma } from '../../lib/prisma.js';
import { formatInr, toPaise } from '../../../../src/shared/calc/money.js';
import { istToday } from '../../../../src/shared/calc/istTime.js';
import { allocatePayments } from '../../../../src/shared/calc/schedule.js';
import { formatPhone } from '../../../../src/shared/calc/phone.js';
import { travellerDisplayName } from '../../../../src/shared/calc/travellers.js';

export interface MessageContext {
  customerId?: string | null;
  tripId?: string | null;
  receiptId?: string | null;
  ticketId?: string | null;
  travellerId?: string | null;
  /** Values the caller knows better (an automation's due date, a document name). */
  extra?: Record<string, string | null | undefined>;
}

const day = (d: string | Date | null | undefined) => {
  if (!d) return null;
  const date = typeof d === 'string' ? new Date(d.length === 10 ? `${d}T00:00:00+05:30` : d) : d;
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
};
const when = (d: Date | null | undefined) => d ? d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : null;
const inr = (n: unknown) => (n === null || n === undefined ? null : formatInr(toPaise(Number(n))));

/**
 * When the money on a trip is due: the first instalment not yet fully paid
 * across its booking contracts (money received is applied in order), or the
 * departure date when there is no schedule.
 */
async function nextDueDate(tripId: string, departure: string | null): Promise<string | null> {
  const contracts = await prisma.bookingContract.findMany({
    where: { tripId, status: { not: 'CANCELLED' } },
    select: { schedule: { orderBy: { seq: 'asc' }, select: { seq: true, label: true, dueDate: true, amount: true } }, receipts: { where: { status: 'POSTED', kind: 'RECEIPT' }, select: { amount: true } } },
  });
  const today = istToday();
  const open = contracts.flatMap(c => allocatePayments(
    c.schedule.map(i => ({ seq: i.seq, label: i.label, dueDate: i.dueDate.toISOString().slice(0, 10), amount: Number(i.amount) })),
    c.receipts.reduce((s, r) => s + Number(r.amount), 0), today,
  ).filter(i => i.status !== 'PAID').map(i => i.dueDate)).sort();
  return day(open[0] ?? departure);
}

export async function templateValues(ctx: MessageContext): Promise<{ values: Record<string, string>; to: { phone: string | null; email: string | null; name: string | null } }> {
  const v: Record<string, string | null | undefined> = {};
  const company = await prisma.companySettings.findFirst();
  v.agency_name = company?.companyName ?? null;
  // As the office wrote it: a landline like 0831 240 0000 must keep its STD code.
  v.agency_phone = company?.phone?.trim() || null;

  const trip = ctx.tripId ? await prisma.trip.findUnique({
    where: { id: ctx.tripId },
    select: {
      id: true, tourName: true, destination: true, departure: true, returnDate: true, pax: true, balanceDue: true, customerId: true,
      pickupPoints: { orderBy: { seq: 'asc' }, take: 1, select: { name: true, pickupAt: true } },
      vehicleAssignments: { where: { status: 'CONFIRMED' }, orderBy: { startAt: 'asc' }, take: 1, select: { driverName: true, driverPhone: true, driver: { select: { name: true, phone: true } }, vehicle: { select: { registrationNo: true } } } },
    },
  }) : null;
  if (trip) {
    Object.assign(v, {
      trip_id: trip.id, trip_name: trip.tourName ?? trip.destination, destination: trip.destination,
      departure_date: day(trip.departure), return_date: day(trip.returnDate), pax: trip.pax ? String(trip.pax) : null,
      amount_due: Number(trip.balanceDue ?? 0) > 0 ? inr(trip.balanceDue) : null,
      pickup_point: trip.pickupPoints[0]?.name, pickup_time: when(trip.pickupPoints[0]?.pickupAt),
    });
    v.due_date = await nextDueDate(trip.id, trip.departure);
    const duty = trip.vehicleAssignments[0];
    if (duty) {
      v.driver_name = duty.driver?.name ?? duty.driverName;
      const phone = duty.driver?.phone ?? duty.driverPhone;
      v.driver_phone = phone ? formatPhone(phone) : null;
      v.vehicle_number = duty.vehicle?.registrationNo;
    }
  }

  const customerId = ctx.customerId ?? trip?.customerId ?? null;
  const customer = customerId ? await prisma.customer.findUnique({ where: { id: customerId }, select: { name: true, phone: true, email: true } }) : null;
  if (customer) v.customer_name = customer.name;

  if (ctx.receiptId) {
    const r = await prisma.customerReceipt.findUnique({ where: { id: ctx.receiptId }, select: { id: true, amount: true } });
    if (r) { v.receipt_number = r.id; v.amount_paid = inr(r.amount); }
  }
  if (ctx.ticketId) {
    const t = await prisma.ticket.findUnique({
      where: { id: ctx.ticketId },
      select: { pnr: true, status: true, segments: { orderBy: { seq: 'asc' }, select: { fromName: true, toName: true, carrierNumber: true, carrierName: true } } },
    });
    if (t) {
      const first = t.segments[0]; const last = t.segments[t.segments.length - 1];
      v.pnr = t.pnr;
      v.ticket_status = ({ REQUESTED: 'being booked', ON_HOLD: 'on hold', CONFIRMED: 'confirmed', PARTIAL: 'partly confirmed', WAITLISTED: 'waitlisted', RAC: 'RAC', CANCELLED: 'cancelled' } as Record<string, string>)[t.status];
      v.journey = first ? `${first.fromName} → ${last.toName}${first.carrierNumber ? `, ${[first.carrierNumber, first.carrierName].filter(Boolean).join(' ')}` : ''}` : null;
    }
  }
  if (ctx.travellerId) {
    const p = await prisma.traveller.findUnique({ where: { id: ctx.travellerId }, select: { title: true, firstName: true, lastName: true, displayName: true, passportExpiry: true } });
    if (p) { v.traveller_name = travellerDisplayName(p); v.passport_expiry = day(p.passportExpiry); }
  }
  Object.assign(v, ctx.extra ?? {});

  const values: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) if (val !== null && val !== undefined && String(val).trim()) values[k] = String(val);
  return { values, to: { phone: customer?.phone ?? null, email: customer?.email ?? null, name: customer?.name ?? null } };
}
