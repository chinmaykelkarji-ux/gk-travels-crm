// ============================================================
// What a customer sees on their page — strict read models.
//
// Every object below is built field by field for the customer; nothing is
// spread from a database row, so a column added tomorrow (a cost, a margin,
// a supplier, an internal note, an identity number) can never reach the
// portal by accident. tests/integration/portal.v2.test.ts scans every
// response for internal keys.
//
// On a group tour with several families, a customer sees their own party
// only: its travellers, its seats, its money. The lead customer of a trip
// without parties sees the trip as a whole.
// ============================================================

import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../core/errors.js';
import { istToday } from '../../../../src/shared/calc/istTime.js';
import { allocatePayments } from '../../../../src/shared/calc/schedule.js';
import { travellerDisplayName } from '../../../../src/shared/calc/travellers.js';
import { customerView } from '../itineraries/service.js';

const STAGE_FOR_CUSTOMER: Record<string, string> = {
  PLANNING: 'Being planned', CONFIRMING: 'Being confirmed', READY: 'All set', ONGOING: 'On tour', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
};
const OPS_LABEL: Record<string, string> = { REQUESTED: 'Being arranged', ON_HOLD: 'Being arranged', CONFIRMED: 'Confirmed', COMPLETED: 'Done', CANCELLED: 'Cancelled' };
const TICKET_LABEL: Record<string, string> = { REQUESTED: 'Being booked', ON_HOLD: 'Being booked', CONFIRMED: 'Confirmed', PARTIAL: 'Partly confirmed', WAITLISTED: 'Waitlisted', RAC: 'RAC', CANCELLED: 'Cancelled' };
const MODE_LABEL: Record<string, string> = { CASH: 'Cash', UPI: 'UPI', BANK_TRANSFER: 'Bank transfer', CARD: 'Card', CHEQUE: 'Cheque', GATEWAY: 'Online', OTHER: 'Payment' };
const DRIVER_WINDOW_MS = 48 * 3_600_000;
const n = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

async function agency() {
  const c = await prisma.companySettings.findFirst({ select: { companyName: true, phone: true, email: true, website: true, addressLine1: true, city: true } });
  return {
    name: c?.companyName ?? 'GK Travels', phone: c?.phone ?? null, email: c?.email ?? null, website: c?.website ?? null,
    address: [c?.addressLine1, c?.city].filter(Boolean).join(', ') || null,
  };
}

/** The trips this customer may see: theirs as lead, or where a party is theirs. */
async function tripIdsFor(customerId: string): Promise<string[]> {
  const [lead, party] = await Promise.all([
    prisma.trip.findMany({ where: { customerId }, select: { id: true } }),
    prisma.bookingContract.findMany({ where: { customerId, tripId: { not: null } }, select: { tripId: true } }),
  ]);
  return [...new Set([...lead.map(t => t.id), ...party.map(c => c.tripId!)])];
}

export async function portalHome(customerId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { name: true } });
  if (!customer) throw notFound('Page');
  const ids = await tripIdsFor(customerId);
  const trips = await prisma.trip.findMany({ where: { id: { in: ids } }, orderBy: { departure: 'desc' }, select: { id: true, tourName: true, destination: true, departure: true, returnDate: true, stage: true } });
  return {
    customer: { name: customer.name },
    agency: await agency(),
    trips: trips.map(t => ({ id: t.id, name: t.tourName ?? t.destination, destination: t.destination, departure: t.departure, returnDate: t.returnDate, status: STAGE_FOR_CUSTOMER[t.stage] ?? 'Being planned' })),
  };
}

export async function portalTrip(customerId: string, tripId: string, now = new Date()) {
  if (!(await tripIdsFor(customerId)).includes(tripId)) throw notFound('Trip');
  const trip = await prisma.trip.findUniqueOrThrow({
    where: { id: tripId },
    select: { id: true, tourName: true, destination: true, departure: true, returnDate: true, stage: true, customerId: true, totalPayable: true, paidAmount: true, balanceDue: true },
  });
  const contracts = await prisma.bookingContract.findMany({ where: { tripId, customerId, status: { not: 'CANCELLED' } }, select: { id: true, partyName: true, contractNumber: true, totalAmount: true } });
  const contractIds = contracts.map(c => c.id);
  const whole = contracts.length === 0 && trip.customerId === customerId;   // lead of a trip without parties

  const links = await prisma.tripTraveller.findMany({
    where: { tripId, ...(whole ? {} : { contractId: { in: contractIds } }) },
    orderBy: [{ position: 'asc' }], select: { role: true, traveller: { select: { id: true, title: true, firstName: true, lastName: true, displayName: true } } },
  });
  const travellerIds = new Set(links.map(l => l.traveller.id));
  const scope = whole ? {} : { OR: [{ contractId: { in: contractIds } }, { contractId: null }] };

  const [tickets, hotels, duties, pickups, receipts, docs, sent, feedback, itinerary] = await Promise.all([
    prisma.ticket.findMany({
      where: { tripId, status: { not: 'CANCELLED' } },
      select: {
        id: true, mode: true, pnr: true, carrier: true, travelClass: true, status: true, contractId: true, customerId: true,
        segments: { orderBy: { seq: 'asc' }, select: { id: true, fromName: true, toName: true, departAt: true, arriveAt: true, carrierNumber: true, carrierName: true, boardingPoint: true, platform: true, terminal: true } },
        passengers: { select: { segmentId: true, travellerId: true, name: true, status: true, coach: true, seat: true, berth: true } },
      },
    }),
    prisma.hotelBooking.findMany({ where: { tripId, status: { not: 'CANCELLED' }, ...scope }, orderBy: { checkIn: 'asc' }, select: { hotelName: true, city: true, checkIn: true, checkOut: true, rooms: true, roomTypeName: true, mealPlan: true, confirmationNo: true, status: true } }),
    prisma.vehicleAssignment.findMany({
      where: { tripId, status: { not: 'CANCELLED' }, ...scope }, orderBy: { startAt: 'asc' },
      select: { vehicleType: true, startAt: true, endAt: true, pickupPoint: true, status: true, driverName: true, driverPhone: true, driver: { select: { name: true, phone: true } }, vehicle: { select: { registrationNo: true } } },
    }),
    prisma.tripPickupPoint.findMany({ where: { tripId }, orderBy: { seq: 'asc' }, select: { name: true, landmark: true, address: true, pickupAt: true, mapUrl: true } }),
    prisma.customerReceipt.findMany({
      where: { status: 'POSTED', kind: 'RECEIPT', ...(whole ? { tripId, customerId } : { contractId: { in: contractIds } }) },
      orderBy: { receivedAt: 'asc' }, select: { id: true, amount: true, mode: true, receivedAt: true, contractId: true },
    }),
    prisma.document.findMany({
      where: { customerVisible: true, status: { notIn: ['PENDING_UPLOAD'] }, links: { some: { OR: [{ entityType: 'trip', entityId: tripId }, { entityType: 'customer', entityId: customerId }] } } },
      orderBy: { createdAt: 'desc' }, select: { id: true, title: true, fileName: true, sizeBytes: true },
    }),
    prisma.communication.findMany({
      where: { tripId, customerId, via: 'TRAVELOS', status: { in: ['SENT', 'DELIVERED', 'READ'] }, templateKey: { notIn: ['portal_code'] } },
      orderBy: { createdAt: 'desc' }, take: 20, select: { subject: true, body: true, sentAt: true, createdAt: true },
    }),
    prisma.feedback.findFirst({ where: { tripId, customerId }, select: { rating: true, comments: true, updatedAt: true } }),
    prisma.itinerary.findFirst({ where: { tripId, sharedAt: { not: null } }, orderBy: { sharedAt: 'desc' }, select: { id: true, revision: true, sharedRevision: true, sharedAt: true } }),
  ]);

  // Only the newest version of a document: anything a later version points back at is old.
  const newer = new Set((await prisma.document.findMany({ where: { previousVersionId: { in: docs.map(d => d.id) } }, select: { previousVersionId: true } })).map(d => d.previousVersionId));
  const latestDocs = docs.filter(d => !newer.has(d.id));

  const mine = tickets.filter(t => whole || t.customerId === customerId || (t.contractId && contractIds.includes(t.contractId)) || t.passengers.some(p => p.travellerId && travellerIds.has(p.travellerId)));

  // The itinerary as it was shared; while the office is changing it, say so rather than show a draft.
  let itineraryView: Awaited<ReturnType<typeof customerView>> | null = null;
  let itineraryNote: string | null = null;
  if (itinerary && itinerary.sharedRevision === itinerary.revision) itineraryView = await customerView(itinerary.id);
  else if (itinerary) itineraryNote = 'Your itinerary is being updated. We will share the new one with you soon.';

  const today = istToday(now);
  const money = whole
    // The trip's own money figures (one writer: refreshTripMoney), so total, received and balance always agree.
    ? [{ party: null, total: n(trip.totalPayable), received: n(trip.paidAmount), balance: n(trip.balanceDue), instalments: [] as { label: string; dueDate: string; amount: number; paid: number; status: string }[] }]
    : await Promise.all(contracts.map(async c => {
      const schedule = await prisma.paymentScheduleItem.findMany({ where: { contractId: c.id }, orderBy: { seq: 'asc' }, select: { seq: true, label: true, dueDate: true, amount: true } });
      const received = receipts.filter(r => r.contractId === c.id).reduce((s, r) => s + Number(r.amount), 0);
      const states = allocatePayments(schedule.map(i => ({ seq: i.seq, label: i.label, dueDate: i.dueDate.toISOString().slice(0, 10), amount: Number(i.amount) })), received, today);
      return {
        party: c.partyName ?? c.contractNumber, total: n(c.totalAmount), received: n(received), balance: n(Number(c.totalAmount) - received),
        instalments: states.map(s => ({ label: s.label, dueDate: s.dueDate, amount: n(s.amount), paid: n(s.paidAmount), status: s.status })),
      };
    }));

  return {
    trip: { id: trip.id, name: trip.tourName ?? trip.destination, destination: trip.destination, departure: trip.departure, returnDate: trip.returnDate, status: STAGE_FOR_CUSTOMER[trip.stage] ?? 'Being planned' },
    agency: await agency(),
    travellers: links.map(l => ({ name: travellerDisplayName(l.traveller), role: l.role === 'CHILD' ? 'Child' : l.role === 'INFANT' ? 'Infant' : 'Adult' })),
    itinerary: itineraryView, itineraryNote,
    pickupPoints: pickups.map(p => ({ name: p.name, landmark: p.landmark, address: p.address, time: iso(p.pickupAt), mapUrl: p.mapUrl })),
    tickets: mine.map(t => ({
      mode: t.mode === 'TRAIN' ? 'Train' : t.mode === 'FLIGHT' ? 'Flight' : 'Bus', pnr: t.pnr, carrier: t.carrier, travelClass: t.travelClass, status: TICKET_LABEL[t.status] ?? 'Being booked',
      legs: t.segments.map(s => ({
        from: s.fromName, to: s.toName, departs: iso(s.departAt), arrives: iso(s.arriveAt), service: [s.carrierNumber, s.carrierName].filter(Boolean).join(' ') || null,
        boardingPoint: s.boardingPoint, platform: s.platform, terminal: s.terminal,
        passengers: t.passengers.filter(p => p.segmentId === s.id && (whole || (p.travellerId && travellerIds.has(p.travellerId))))
          .map(p => ({ name: p.name, status: p.status === 'CONFIRMED' ? 'Confirmed' : p.status === 'WAITLISTED' ? 'Waitlisted' : p.status === 'RAC' ? 'RAC' : p.status === 'CANCELLED' ? 'Cancelled' : 'Being booked', coach: p.coach, seat: p.seat, berth: p.berth })),
      })),
    })),
    stays: hotels.map(h => ({ hotel: h.hotelName, city: h.city, checkIn: h.checkIn.toISOString().slice(0, 10), checkOut: h.checkOut.toISOString().slice(0, 10), rooms: h.rooms, roomType: h.roomTypeName, meals: h.mealPlan, confirmationNo: h.status === 'CONFIRMED' ? h.confirmationNo : null, status: OPS_LABEL[h.status] ?? 'Being arranged' })),
    transport: duties.map(d => {
      // The driver is shared only for a confirmed duty from two days before it starts until it ends.
      const showDriver = d.status === 'CONFIRMED' && now.getTime() >= d.startAt.getTime() - DRIVER_WINDOW_MS && now.getTime() <= d.endAt.getTime();
      return {
        vehicle: d.vehicleType, starts: iso(d.startAt), ends: iso(d.endAt), pickup: d.pickupPoint, status: OPS_LABEL[d.status] ?? 'Being arranged',
        driver: showDriver ? { name: d.driver?.name ?? d.driverName, phone: d.driver?.phone ?? d.driverPhone, vehicleNumber: d.vehicle?.registrationNo ?? null } : null,
        driverNote: showDriver || d.status !== 'CONFIRMED' ? null : 'Driver details appear here two days before.',
      };
    }),
    payments: money,
    receipts: receipts.map(r => ({ number: r.id, date: r.receivedAt.toISOString().slice(0, 10), amount: n(r.amount), mode: MODE_LABEL[r.mode] ?? 'Payment' })),
    documents: latestDocs.map(d => ({ id: d.id, title: d.title, fileName: d.fileName, sizeBytes: d.sizeBytes })),
    updates: sent.map(m => ({ subject: m.subject, text: m.body, at: iso(m.sentAt ?? m.createdAt) })),
    feedback: feedback ? { rating: feedback.rating, comments: feedback.comments, at: feedback.updatedAt.toISOString() } : null,
    canGiveFeedback: trip.stage === 'ONGOING' || trip.stage === 'COMPLETED',
  };
}

/** A document the customer may open: customer-visible, and attached to their trip or to them. */
export async function portalDocument(customerId: string, documentId: string) {
  const ids = await tripIdsFor(customerId);
  const doc = await prisma.document.findFirst({
    where: {
      id: documentId, customerVisible: true, status: { notIn: ['PENDING_UPLOAD'] },
      links: { some: { OR: [{ entityType: 'trip', entityId: { in: ids } }, { entityType: 'customer', entityId: customerId }] } },
    },
    select: { id: true },
  });
  if (!doc) throw notFound('Document');
  return doc.id;
}
