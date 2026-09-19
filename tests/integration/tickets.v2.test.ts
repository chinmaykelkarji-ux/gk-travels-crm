// Tickets v2: a group train PNR with IRCTC statuses, a multi-leg flight,
// standalone tickets, fare redaction, and the classic-booking import.
import { describe, it, expect, beforeEach } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { hasTestDb, prisma, resetDb, seedUser, seedTrip, seedCustomer, TEST_DB_URL } from './helpers/db';
import { as, USER_IDS } from './helpers/app';

const YEAR = new Date().getFullYear();
const iso = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
const TRIP = 'GK-2026-0001';
const IMPORT_SQL = path.resolve('prisma/migrations/20260918230100_import_legacy_bookings/migration.sql');

async function travellers(n: number) {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) ids.push((await as('BOOKING').post('/api/v2/travellers', { firstName: `Yatri${i + 1}`, lastName: 'Kulkarni', customerId: 'CUS-2026-0001' })).body.id);
  return ids;
}

describe.skipIf(!hasTestDb)('tickets v2', () => {
  beforeEach(async () => {
    await resetDb();
    for (const role of ['ADMIN', 'BOOKING', 'ACCOUNTS', 'OPERATIONS'] as const) await seedUser(USER_IDS[role], role);
    await seedCustomer();
    await seedTrip(TRIP, { departure: iso(30), returnDate: iso(40) });
  });

  it('group train PNR: fare with GST on the fee, redaction, IRCTC statuses parsed (never guessed), chart, partial cancel', async () => {
    const ids = await travellers(3);
    const res = await as('BOOKING').post('/api/v2/tickets', {
      tripId: TRIP, mode: 'TRAIN', pnr: '4521 336 789'.replace(/\s/g, ''), carrier: 'Kashi Express', quota: 'GENERAL', travelClass: 'SL',
      segments: [{ carrierNumber: '15018', carrierName: 'Kashi Express', fromCode: 'bgm', fromName: 'Belagavi', toCode: 'BSB', toName: 'Varanasi', departAt: `${iso(30)}T05:30`, arriveAt: `${iso(31)}T22:00`, travelClass: 'SL', boardingPoint: 'Belagavi platform 1' }],
      passengers: [...ids.map(travellerId => ({ travellerId })), { name: 'Smt Sunanda Kulkarni', age: 68, paxType: 'SENIOR', boardingPoint: 'Miraj Jn' }],
      baseFare: 3200, serviceFee: 400, costAmount: 3200,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const t = res.body;
    expect(t).toMatchObject({ displayNumber: `TKT-${YEAR}-0001`, status: 'REQUESTED', pnr: '4521336789', customerId: 'CUS-2026-0001', paxCount: 4, route: 'BGM → BSB' });
    expect(t.fare).toMatchObject({ baseFare: 3200, serviceFee: 400, serviceFeeGstPct: 18, serviceFeeGst: 72, totalFare: 3672, costAmount: 3200 });
    expect(t.segments[0].passengers.map((p: { name: string; boardingPoint: string }) => [p.name, p.boardingPoint])).toEqual([['Yatri1 Kulkarni', 'Belagavi platform 1'], ['Yatri2 Kulkarni', 'Belagavi platform 1'], ['Yatri3 Kulkarni', 'Belagavi platform 1'], ['Smt Sunanda Kulkarni', 'Miraj Jn']]);
    expect((await as('OPERATIONS').get(`/api/v2/tickets/${t.id}`)).body.fare).toMatchObject({ totalFare: 3672, serviceFee: null, costAmount: null });

    const rows = t.segments[0].passengers.map((p: { id: string }) => p.id);
    const bad = await as('OPERATIONS').post(`/api/v2/tickets/${t.id}/statuses`, { rows: [{ rowId: rows[0], currentStatus: 'CNF/S5/34/LB' }, { rowId: rows[1], currentStatus: 'with agent' }] });
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toMatch(/Unable to confidently read 1/);
    expect((await prisma.ticketPassenger.findUniqueOrThrow({ where: { id: rows[0] } })).status).toBe('PENDING');

    const ok = await as('OPERATIONS').post(`/api/v2/tickets/${t.id}/statuses`, { chartPrepared: true, rows: [
      { rowId: rows[0], currentStatus: 'CNF/S5/34/LB' }, { rowId: rows[1], currentStatus: 'CNF S5 35' }, { rowId: rows[2], currentStatus: 'RAC 12' }, { rowId: rows[3], currentStatus: 'GNWL 7' },
    ] });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body).toMatchObject({ status: 'PARTIAL', chartPrepared: true });
    expect(ok.body.segments[0].passengers.map((p: { status: string; coach: string | null; seat: string | null; berth: string | null; waitlistPosition: number | null }) => [p.status, p.coach, p.seat, p.berth, p.waitlistPosition]))
      .toEqual([['CONFIRMED', 'S5', '34', 'LB', null], ['CONFIRMED', 'S5', '35', null, null], ['RAC', null, null, null, 12], ['WAITLISTED', null, null, null, 7]]);

    const oneRow = await as('OPERATIONS').put(`/api/v2/tickets/rows/${rows[2]}`, { currentStatus: 'CNF S6 1' });
    expect(oneRow.body.segments[0].passengers[2]).toMatchObject({ status: 'CONFIRMED', coach: 'S6', seat: '1' });
    expect((await as('OPERATIONS').put(`/api/v2/tickets/rows/${rows[3]}`, { currentStatus: '??' })).status).toBe(400);
    const cancelled = await as('OPERATIONS').post(`/api/v2/tickets/${t.id}/cancel`, { reason: 'Waitlist did not clear', paxIndexes: [3] });
    expect(cancelled.body.status).toBe('CONFIRMED');
    expect(cancelled.body.passengers[3].statuses).toEqual(['CANCELLED']);

    const tripLog = await prisma.activityLog.findMany({ where: { entityType: 'trip', entityId: TRIP }, select: { action: true } });
    expect(tripLog.map(l => l.action)).toEqual(expect.arrayContaining(['ticket_created', 'ticket_statuses_updated', 'ticket_passenger_updated', 'ticket_cancelled']));
    expect(await prisma.activityLog.count({ where: { entityType: 'ticket', entityId: t.id } })).toBe(4);
    expect((await as('ACCOUNTS').post(`/api/v2/tickets/${t.id}/cancel`, { reason: 'nope' })).status).toBe(403);
  });

  it('multi-leg flight: legs carry the passengers, booked passengers cannot be removed, cancellation closes the ticket', async () => {
    const [a, b] = await travellers(2);
    const t = (await as('BOOKING').post('/api/v2/tickets', {
      tripId: TRIP, mode: 'FLIGHT', pnr: 'x7k9pq', carrier: 'IndiGo',
      segments: [
        { carrierNumber: '6E 2135', fromCode: 'IXG', fromName: 'Belagavi', toCode: 'BOM', toName: 'Mumbai', departAt: `${iso(30)}T07:10`, arriveAt: `${iso(30)}T08:20`, baggage: '15 kg' },
        { carrierNumber: '6E 5313', fromCode: 'BOM', fromName: 'Mumbai', toCode: 'DXB', toName: 'Dubai', departAt: `${iso(30)}T11:00`, arriveAt: `${iso(30)}T12:45` },
      ],
      passengers: [{ travellerId: a }, { travellerId: b }], baseFare: 18000, taxes: 4200,
    })).body;
    expect(t.route).toBe('IXG → BOM → DXB');
    expect(t.segments.map((s: { passengers: unknown[] }) => s.passengers.length)).toEqual([2, 2]);
    expect(t.fare.totalFare).toBe(22200);

    const withLeg = (await as('OPERATIONS').post(`/api/v2/tickets/${t.id}/segments`, { carrierNumber: '6E 1478', fromName: 'Dubai', toName: 'Mumbai', departAt: `${iso(36)}T20:00` })).body;
    expect(withLeg.segments.map((s: { seq: number; passengers: unknown[] }) => [s.seq, s.passengers.length])).toEqual([[1, 2], [2, 2], [3, 2]]);
    const withPax = (await as('OPERATIONS').post(`/api/v2/tickets/${t.id}/passengers`, { passengers: [{ name: 'Master Aarav', paxType: 'CHILD', age: 8 }] })).body;
    expect(withPax.paxCount).toBe(3);
    expect(withPax.segments.every((s: { passengers: unknown[] }) => s.passengers.length === 3)).toBe(true);
    expect((await as('OPERATIONS').post(`/api/v2/tickets/${t.id}/passengers`, { passengers: [{ travellerId: a }] })).status).toBe(409);
    expect((await as('OPERATIONS').delete(`/api/v2/tickets/${t.id}/passengers/2`)).body.paxCount).toBe(2);

    await as('OPERATIONS').put(`/api/v2/tickets/rows/${withPax.segments[0].passengers[0].id}`, { status: 'CONFIRMED', ticketNumber: '312-4455667788' });
    expect((await as('OPERATIONS').delete(`/api/v2/tickets/${t.id}/passengers/0`)).status).toBe(409);
    expect((await as('OPERATIONS').delete(`/api/v2/tickets/segments/${withPax.segments[0].id}`)).status).toBe(409);
    expect((await as('OPERATIONS').put(`/api/v2/tickets/${t.id}`, { status: 'ON_HOLD' })).status).toBe(409);

    const moved = await as('OPERATIONS').put(`/api/v2/tickets/segments/${withPax.segments[1].id}`, { carrierNumber: '6E 5313', fromName: 'Mumbai', toName: 'Dubai', departAt: `${iso(30)}T13:00` });
    expect(moved.body.segments[1].departLocal).toBe(`${iso(30)}T13:00`);
    expect((await prisma.activityLog.findFirstOrThrow({ where: { action: 'ticket_segment_updated', entityType: 'ticket' } })).description).toMatch(/departure .* → /);

    const closed = await as('BOOKING').post(`/api/v2/tickets/${t.id}/cancel`, { reason: 'Customer cancelled the tour' });
    expect(closed.body.status).toBe('CANCELLED');
    expect((await as('OPERATIONS').post(`/api/v2/tickets/${t.id}/passengers`, { passengers: [{ name: 'Late' }] })).status).toBe(409);
  });

  it('standalone tickets for a walk-in customer; search by PNR, passenger and date', async () => {
    expect((await as('BOOKING').post('/api/v2/tickets', { mode: 'BUS', segments: [{ fromName: 'Belagavi', toName: 'Pune' }] })).status).toBe(400);
    const bus = await as('BOOKING').post('/api/v2/tickets', {
      customerId: 'CUS-2026-0001', mode: 'BUS', pnr: 'VRL998877', carrier: 'VRL Travels',
      segments: [{ fromName: 'Belagavi', toName: 'Pune', departAt: `${iso(5)}T21:30`, boardingPoint: 'Old PB Road, Belagavi', droppingPoint: 'Swargate' }],
      passengers: [{ name: 'Shri Mohan Joshi' }], baseFare: 900, serviceFee: 50, serviceFeeGstPct: 0,
    });
    expect(bus.status, JSON.stringify(bus.body)).toBe(201);
    expect(bus.body).toMatchObject({ tripId: null, fare: { totalFare: 950, serviceFeeGst: 0 } });
    expect((await as('ACCOUNTS').get('/api/v2/tickets?q=vrl998877')).body.total).toBe(1);
    expect((await as('ACCOUNTS').get('/api/v2/tickets?q=mohan')).body.total).toBe(1);
    expect((await as('ACCOUNTS').get(`/api/v2/tickets?from=${iso(5)}&to=${iso(5)}`)).body.total).toBe(1);
    expect((await as('ACCOUNTS').get(`/api/v2/tickets?from=${iso(6)}`)).body.total).toBe(0);
    expect((await as('ACCOUNTS').get(`/api/v2/tickets?customerId=CUS-2026-0001&mode=BUS`)).body.items[0].segments[0].droppingPoint).toBe('Swargate');
  });

  it('imports classic bookings once, keeps them untouched, and can be reversed', async () => {
    const [pax] = await travellers(1);
    const base = { customerName: 'Test Customer', customerId: 'CUS-2026-0001', createdDate: '2026-09-01', sellingPrice: 10000, supplierCost: 8000 };
    await prisma.booking.createMany({ data: [
      { ...base, id: 'BK-2026-0001', type: 'flight', status: 'issued', refId: TRIP, passengerIds: [pax], totalPayable: 10590, convenienceFee: 500, gstOnFee: 90,
        detail: { pnr: 'abc123', airline: 'IndiGo', legs: [{ airline: 'IndiGo', flightNumber: '6E 1', origin: 'IXG', destination: 'BOM', departDate: iso(30), departTime: '07:10', arrivalDate: iso(30), arrivalTime: '08:20' }, { airline: 'IndiGo', flightNumber: '6E 2', origin: 'BOM', destination: 'DEL', departDate: iso(30), departTime: '10:00', arrivalDate: iso(30), arrivalTime: '12:10' }] } },
      { ...base, id: 'BK-2026-0002', type: 'train', status: 'pending', detail: { pnr: '4521336789', trainName: 'Kashi Exp', trainNumber: '15018', fromStation: 'BGM', toStation: 'BSB', departure: iso(40), departureTime: '05:30', travelClass: 'SL', seatNumbers: '34, 35', coachNumber: 'S5' } },
      { ...base, id: 'BK-2026-0003', type: 'bus', status: 'confirmed', detail: { pnr: 'VRL1', operatorName: 'VRL', from: 'Belagavi', to: 'Pune', travelDate: iso(10), departureTime: '22:00', arrivalTime: '05:30', boardingPoint: 'Old PB Road', droppingPoint: 'Swargate' } },
      { ...base, id: 'BK-2026-0004', type: 'hotel', status: 'confirmed', refId: TRIP, detail: { hotelName: 'Ganga View', city: 'Varanasi', checkIn: iso(31), checkOut: iso(33), rooms: '10', mealPlan: 'cp', confirmationNumber: 'GV-1' } },
      { ...base, id: 'BK-2026-0005', type: 'hotel', status: 'confirmed', detail: { hotelName: 'No trip hotel', checkIn: iso(31), checkOut: iso(33) } },
      { ...base, id: 'BK-2026-0006', type: 'cab', status: 'confirmed', refId: TRIP, detail: { pickup: 'Varanasi Jn', drop: 'Ganga View', pickupDate: iso(31), pickupTime: '22:30', vehicleType: 'Tempo Traveller', cabNumber: 'UP65 AB 1', driverName: 'Ramesh', driverPhone: '9000000000' } },
      { ...base, id: 'BK-2026-0007', type: 'activity', status: 'pending', refId: TRIP, detail: { activityName: 'Ganga Aarti boat', date: iso(32), time: '18:30', pax: '40' } },
      { ...base, id: 'BK-2026-0008', type: 'visa', status: 'submitted', detail: { country: 'UAE' } },
    ] });

    const first = await as('ADMIN').post('/api/v2/tickets/import-classic');
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body).toEqual({ tickets: 3, hotels: 1, vehicles: 1, activities: 1, skipped: 1 });
    expect((await as('ADMIN').post('/api/v2/tickets/import-classic')).body).toEqual({ tickets: 0, hotels: 0, vehicles: 0, activities: 0, skipped: 1 });
    execSync(`npx prisma db execute --file "${IMPORT_SQL}" --url "${TEST_DB_URL}"`, { stdio: 'pipe' }); // the migration itself is re-runnable
    expect(await prisma.ticket.count()).toBe(3);

    const flight = (await as('BOOKING').get('/api/v2/tickets?q=ABC123')).body.items[0];
    expect(flight).toMatchObject({ displayNumber: 'BK-2026-0001', mode: 'FLIGHT', status: 'CONFIRMED', tripId: TRIP, route: 'IXG → BOM → DEL', legacyBookingId: 'BK-2026-0001', fare: { totalFare: 10590, serviceFee: 500, serviceFeeGst: 90, baseFare: 10000, costAmount: 8000 } });
    expect(flight.segments[1]).toMatchObject({ carrierNumber: '6E 2', departLocal: `${iso(30)}T10:00` });
    expect(flight.passengers).toEqual([expect.objectContaining({ travellerId: pax, name: 'Yatri1 Kulkarni', statuses: ['CONFIRMED', 'CONFIRMED'] })]);
    const train = (await as('BOOKING').get('/api/v2/tickets?q=4521336789')).body.items[0];
    expect(train).toMatchObject({ status: 'REQUESTED', carrier: 'Kashi Exp', travelClass: 'SL', tripId: null });
    expect(train.internalNotes).toContain('Classic seats: S5 34, 35');
    const bus = (await as('BOOKING').get('/api/v2/tickets?mode=BUS')).body.items[0];
    expect(bus.segments[0]).toMatchObject({ boardingPoint: 'Old PB Road', droppingPoint: 'Swargate', departLocal: `${iso(10)}T22:00`, arriveLocal: `${iso(11)}T05:30` });

    const hotel = (await as('BOOKING').get(`/api/v2/ops/trips/${TRIP}/hotel-bookings`)).body[0];
    expect(hotel).toMatchObject({ hotelName: 'Ganga View', rooms: 10, mealPlan: 'CP', status: 'CONFIRMED', confirmationNo: 'GV-1', nights: 2 });
    const cab = (await as('BOOKING').get(`/api/v2/ops/trips/${TRIP}/vehicle-assignments`)).body[0];
    expect(cab).toMatchObject({ vehicleLabel: 'UP65 AB 1 · Tempo Traveller', driverLabel: 'Ramesh · 9000000000', startLocal: `${iso(31)}T22:30`, status: 'CONFIRMED' });
    expect(cab.internalNotes).toContain('8 hours after pickup is assumed');
    expect((await as('BOOKING').get(`/api/v2/ops/trips/${TRIP}/activity-bookings`)).body[0]).toMatchObject({ name: 'Ganga Aarti boat', adults: 40, time: '18:30', status: 'REQUESTED' });

    // Classic rows are untouched; reversing removes only imported rows.
    expect(await prisma.booking.count()).toBe(8);
    await prisma.$executeRawUnsafe(`DELETE FROM "tickets" WHERE "legacyBookingId" IS NOT NULL`);
    await prisma.$executeRawUnsafe(`DELETE FROM "hotel_bookings" WHERE "legacyBookingId" IS NOT NULL`);
    expect(await prisma.ticketPassenger.count()).toBe(0);
    expect(await prisma.booking.count()).toBe(8);
    expect(await prisma.activityLog.count({ where: { action: 'legacy_bookings_imported' } })).toBe(1);
  });
});
