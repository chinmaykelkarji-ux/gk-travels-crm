// Trip operational records: hotel bookings (auto-pricing, confirmation,
// re-confirmation), vehicle assignments (double-booking refused even under a
// race, lapsed papers refused, warnings), activity bookings, permissions,
// commercial redaction and audit.
import { describe, it, expect, beforeEach } from 'vitest';
import { hasTestDb, prisma, resetDb, seedUser, seedTrip, seedVendor, seedCustomer } from './helpers/db';
import { as, USER_IDS } from './helpers/app';

const iso = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
const TRIP = 'GK-2026-0001';

async function fixtures() {
  await seedCustomer();
  await seedTrip(TRIP, { departure: iso(30), returnDate: iso(36) });
  await seedTrip('GK-2026-0002', { departure: iso(31), returnDate: iso(33) });
  await seedVendor('VEN-2026-0001', { name: 'Shree Sai Tours', type: 'transport' });
  const hotel = await prisma.hotel.create({ data: { name: 'Hotel Ganga View', city: 'Varanasi', vendorId: 'VEN-2026-0001', roomTypes: { create: [{ name: 'Deluxe', mealPlans: ['CP'] }] } }, include: { roomTypes: true } });
  const rt = hotel.roomTypes[0];
  await prisma.hotelRate.create({ data: { roomTypeId: rt.id, mealPlan: 'CP', validFrom: new Date(`${iso(0)}T00:00:00Z`), validTo: new Date(`${iso(90)}T00:00:00Z`), costPerNight: 2800, sellPerNight: 3400 } });
  const far = new Date(`${iso(400)}T00:00:00Z`);
  const bus = await prisma.vehicle.create({ data: { registrationNo: 'KA 22 AB 1234', type: 'Bus 45', seats: 45, vendorId: 'VEN-2026-0001', ownership: 'VENDOR', insuranceExpiry: far, permitExpiry: far, fitnessExpiry: far, pucExpiry: far } });
  const car = await prisma.vehicle.create({ data: { registrationNo: 'KA 22 CD 9999', type: 'Sedan', seats: 4, insuranceExpiry: new Date(`${iso(31)}T00:00:00Z`) } });
  const d1 = await prisma.driver.create({ data: { name: 'Shri Mahesh Naik', phone: '9845012345', licenceExpiry: far } });
  const d2 = await prisma.driver.create({ data: { name: 'Shri Ravi Kamble', phone: '9845099999', licenceExpiry: far } });
  const act = await prisma.activity.create({ data: { name: 'Ganga Aarti boat ride', city: 'Varanasi', costAdult: 300, costChild: 150, sellAdult: 450, sellChild: 250 } });
  return { hotel, rt, bus, car, d1, d2, act };
}

describe.skipIf(!hasTestDb)('trip operations v2', () => {
  beforeEach(async () => {
    await resetDb();
    for (const role of ['ADMIN', 'BOOKING', 'ACCOUNTS', 'OPERATIONS'] as const) await seedUser(USER_IDS[role], role);
  });

  it('hotel bookings: priced from the rate sheet, confirmation required, re-confirmation after changes, redaction and audit', async () => {
    const { hotel, rt } = await fixtures();
    const res = await as('BOOKING').post(`/api/v2/ops/trips/${TRIP}/hotel-bookings`, { hotelId: hotel.id, roomTypeId: rt.id, mealPlan: 'CP', checkIn: iso(30), checkOut: iso(33), rooms: 10, adults: 20 });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({ hotelName: 'Hotel Ganga View', city: 'Varanasi', roomTypeName: 'Deluxe', nights: 3, costAmount: 84000, sellAmount: 102000, status: 'REQUESTED', vendorId: 'VEN-2026-0001', rateGaps: [] });
    const id = res.body.id;

    const opsView = (await as('OPERATIONS').get(`/api/v2/ops/trips/${TRIP}/hotel-bookings`)).body;
    expect(opsView[0]).toMatchObject({ costAmount: null, sellAmount: null, status: 'REQUESTED' });
    // OPERATIONS may edit the stay but never the money.
    await as('OPERATIONS').put(`/api/v2/ops/hotel-bookings/${id}`, { costAmount: 1, internalNotes: 'Ground floor for elders' });
    expect(Number((await prisma.hotelBooking.findUniqueOrThrow({ where: { id } })).costAmount)).toBe(84000);

    const noConf = await as('OPERATIONS').post(`/api/v2/ops/hotel-bookings/${id}/status`, { status: 'CONFIRMED' });
    expect(noConf.status).toBe(400);
    expect(noConf.body.error.fields.confirmationNo).toBeDefined();
    const conf = await as('OPERATIONS').post(`/api/v2/ops/hotel-bookings/${id}/status`, { status: 'CONFIRMED', confirmationNo: 'GV-7788' });
    expect(conf.body).toMatchObject({ status: 'CONFIRMED', confirmationNo: 'GV-7788' });

    const changed = await as('OPERATIONS').put(`/api/v2/ops/hotel-bookings/${id}`, { rooms: 12 });
    expect(changed.body.status).toBe('REQUESTED');
    expect((await as('OPERATIONS').put(`/api/v2/ops/hotel-bookings/${id}`, { checkOut: iso(29) })).status).toBe(400);
    expect((await as('OPERATIONS').post(`/api/v2/ops/hotel-bookings/${id}/status`, { status: 'CANCELLED' })).status).toBe(400);
    expect((await as('OPERATIONS').post(`/api/v2/ops/hotel-bookings/${id}/status`, { status: 'CANCELLED', reason: 'Group moved to Ayodhya' })).body.status).toBe('CANCELLED');
    expect((await as('OPERATIONS').post(`/api/v2/ops/hotel-bookings/${id}/status`, { status: 'CONFIRMED', confirmationNo: 'X' })).status).toBe(409);

    const log = await prisma.activityLog.findMany({ where: { entityType: 'trip', entityId: TRIP }, orderBy: { createdAt: 'asc' } });
    expect(log.map(l => l.action)).toEqual(['hotel_booking_created', 'hotel_booking_updated', 'hotel_booking_status', 'hotel_booking_updated', 'hotel_booking_status']);
    expect(log[3].description).toContain('needs re-confirmation');

    const gap = await as('BOOKING').post(`/api/v2/ops/trips/${TRIP}/hotel-bookings`, { hotelId: hotel.id, roomTypeId: rt.id, mealPlan: 'CP', checkIn: iso(89), checkOut: iso(92) });
    expect(gap.body.rateGaps).toEqual([iso(91)]);
    expect((await as('ACCOUNTS').post(`/api/v2/ops/trips/${TRIP}/hotel-bookings`, { hotelName: 'X', checkIn: iso(30), checkOut: iso(31) })).status).toBe(403);
    expect((await as('ACCOUNTS').get(`/api/v2/ops/trips/${TRIP}/hotel-bookings`)).status).toBe(200);
  });

  it('vehicle assignments: no double-booking of vehicle or driver, lapsed papers refused, warnings, reinstating re-checks', async () => {
    const { bus, car, d1, d2 } = await fixtures();
    const day = iso(30);
    const first = await as('OPERATIONS').post(`/api/v2/ops/trips/${TRIP}/vehicle-assignments`, { vehicleId: bus.id, driverId: d1.id, startAt: `${day}T05:30`, endAt: `${day}T21:00`, pickupPoint: 'Belagavi bus stand', pax: 42 });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body).toMatchObject({ vendorId: 'VEN-2026-0001', startLocal: `${day}T05:30`, pickupTime: '05:30', driverStatus: 'ASSIGNED', warnings: [] });

    const sameBus = await as('OPERATIONS').post('/api/v2/ops/trips/GK-2026-0002/vehicle-assignments', { vehicleId: bus.id, driverId: d2.id, startAt: `${day}T20:00`, endAt: `${iso(31)}T08:00` });
    expect(sameBus.status).toBe(409);
    expect(sameBus.body.error.message).toContain(TRIP);
    const sameDriver = await as('OPERATIONS').post('/api/v2/ops/trips/GK-2026-0002/vehicle-assignments', { vehicleType: 'Sedan', driverId: d1.id, startAt: `${day}T10:00`, endAt: `${day}T12:00` });
    expect(sameDriver.status).toBe(409);
    expect(sameDriver.body.error.fields.driverId).toBeDefined();
    const back2back = await as('OPERATIONS').post('/api/v2/ops/trips/GK-2026-0002/vehicle-assignments', { vehicleId: bus.id, driverId: d1.id, startAt: `${day}T21:00`, endAt: `${iso(31)}T06:00`, pax: 50 });
    expect(back2back.status).toBe(201);
    expect(back2back.body.warnings[0]).toMatch(/45 seats for 50/);

    const conflicts = (await as('BOOKING').get(`/api/v2/ops/vehicle-assignments/conflicts?vehicleId=${bus.id}&startAt=${day}T12:00&endAt=${day}T22:00`)).body;
    expect(conflicts.map((c: { assignmentId: string }) => c.assignmentId).sort()).toEqual([first.body.id, back2back.body.id].sort());

    const lapsed = await as('OPERATIONS').post(`/api/v2/ops/trips/${TRIP}/vehicle-assignments`, { vehicleId: car.id, startAt: `${iso(31)}T09:00`, endAt: `${iso(32)}T18:00` });
    expect(lapsed.status).toBe(400);
    expect(lapsed.body.error.message).toMatch(/insurance/);

    // Moving the first duty onto the second one's slot is refused; cancelling frees the slot; reinstating re-checks.
    expect((await as('OPERATIONS').put(`/api/v2/ops/vehicle-assignments/${first.body.id}`, { endAt: `${day}T23:00` })).status).toBe(409);
    expect((await as('OPERATIONS').post(`/api/v2/ops/vehicle-assignments/${first.body.id}/status`, { status: 'CONFIRMED' })).body.status).toBe('CONFIRMED');
    const moved = await as('OPERATIONS').put(`/api/v2/ops/vehicle-assignments/${first.body.id}`, { startAt: `${day}T06:00` });
    expect(moved.body).toMatchObject({ status: 'REQUESTED', driverStatus: 'ASSIGNED' });
    await as('OPERATIONS').post(`/api/v2/ops/vehicle-assignments/${back2back.body.id}/status`, { status: 'CANCELLED', reason: 'Trip postponed' });
    const taken = await as('OPERATIONS').post('/api/v2/ops/trips/GK-2026-0002/vehicle-assignments', { vehicleId: bus.id, startAt: `${day}T21:30`, endAt: `${iso(31)}T05:00` });
    expect(taken.status).toBe(201);
    expect((await as('OPERATIONS').post(`/api/v2/ops/vehicle-assignments/${back2back.body.id}/status`, { status: 'REQUESTED' })).status).toBe(409);

    const vendorCab = await as('OPERATIONS').post(`/api/v2/ops/trips/${TRIP}/vehicle-assignments`, { vehicleType: 'Innova Crysta', startAt: `${iso(33)}T07:00`, endAt: `${iso(33)}T19:00` });
    expect((await as('OPERATIONS').post(`/api/v2/ops/vehicle-assignments/${vendorCab.body.id}/status`, { status: 'CONFIRMED' })).status).toBe(400);
    await as('OPERATIONS').put(`/api/v2/ops/vehicle-assignments/${vendorCab.body.id}`, { vehicleRegNo: 'MH 09 AB 4321', driverName: 'Shri Sunil', driverPhone: '9811100000' });
    const ok = await as('OPERATIONS').post(`/api/v2/ops/vehicle-assignments/${vendorCab.body.id}/status`, { status: 'CONFIRMED', confirmationNo: 'SAI-55' });
    expect(ok.body).toMatchObject({ status: 'CONFIRMED', vehicleLabel: 'MH 09 AB 4321 · Innova Crysta', driverLabel: 'Shri Sunil · 9811100000' });
    expect((await as('OPERATIONS').post(`/api/v2/ops/vehicle-assignments/${vendorCab.body.id}/status`, { status: 'COMPLETED' })).status).toBe(409);

    const sched = (await as('ACCOUNTS').get(`/api/v2/ops/schedule?from=${day}T00:00&to=${iso(32)}T00:00`)).body;
    expect(sched.map((s: { trip: { id: string } }) => s.trip.id)).toEqual([TRIP, 'GK-2026-0002']);
  });

  it('two simultaneous saves for the same bus: exactly one wins', async () => {
    const { bus } = await fixtures();
    const day = iso(40);
    const results = await Promise.all([0, 1, 2].map(i => as('OPERATIONS').post(`/api/v2/ops/trips/${i % 2 ? 'GK-2026-0002' : TRIP}/vehicle-assignments`, { vehicleId: bus.id, startAt: `${day}T06:00`, endAt: `${day}T20:00` })));
    expect(results.map(r => r.status).sort()).toEqual([201, 409, 409]);
    expect(await prisma.vehicleAssignment.count({ where: { vehicleId: bus.id } })).toBe(1);
  });

  it('activity bookings priced from the master; cancelled trips are closed for changes', async () => {
    const { act } = await fixtures();
    const a = await as('BOOKING').post(`/api/v2/ops/trips/${TRIP}/activity-bookings`, { activityId: act.id, date: iso(31), time: '18:30', adults: 40, children: 4 });
    expect(a.status, JSON.stringify(a.body)).toBe(201);
    expect(a.body).toMatchObject({ name: 'Ganga Aarti boat ride', costAmount: 12600, sellAmount: 19000, status: 'REQUESTED' });
    expect((await as('OPERATIONS').post(`/api/v2/ops/activity-bookings/${a.body.id}/status`, { status: 'CONFIRMED', confirmationNo: 'BOAT-12' })).body.status).toBe('CONFIRMED');
    expect((await as('OPERATIONS').put(`/api/v2/ops/activity-bookings/${a.body.id}`, { time: '19:00' })).body.status).toBe('REQUESTED');

    await prisma.trip.update({ where: { id: TRIP }, data: { stage: 'CANCELLED', status: 'cancelled' } });
    const closed = await as('BOOKING').post(`/api/v2/ops/trips/${TRIP}/activity-bookings`, { name: 'Sarnath', date: iso(32) });
    expect(closed.status).toBe(409);
    expect((await as('BOOKING').post('/api/v2/ops/trips/GK-9999-0001/activity-bookings', { name: 'Sarnath', date: iso(32) })).status).toBe(404);
  });
});
