// Trip control centre: a group tour created by hand, pickup points and party
// assignment, the stage machine with blocking checks, automatic demotion of a
// READY trip, contracts following the trip, the classic screen kept in step,
// redaction and permissions.
import { describe, it, expect, beforeEach } from 'vitest';
import { hasTestDb, prisma, resetDb, seedUser, seedCustomer } from './helpers/db';
import { as, USER_IDS } from './helpers/app';

const YEAR = new Date().getFullYear();
const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const day = (d: number) => new Date(Date.parse(`${istToday()}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);

async function tourWithTravellers(n = 3) {
  const trip = (await as('BOOKING').post('/api/v2/trips', { tourName: 'Kashi Yatra Oct', destination: 'Varanasi', departure: day(20), returnDate: day(27), customerId: 'CUS-2026-0001' })).body.trip;
  const ids: string[] = [];
  for (let i = 0; i < n; i++) ids.push((await as('BOOKING').post('/api/v2/travellers', { firstName: `Yatri${i + 1}`, lastName: 'Patil' })).body.id);
  await as('BOOKING').put(`/api/v2/trips/${trip.id}/travellers`, { travellers: ids.map(travellerId => ({ travellerId })) });
  return { trip, ids };
}

describe.skipIf(!hasTestDb)('trip control centre v2', () => {
  beforeEach(async () => {
    await resetDb();
    for (const role of ['ADMIN', 'BOOKING', 'ACCOUNTS', 'OPERATIONS'] as const) await seedUser(USER_IDS[role], role);
    await seedCustomer();
  });

  it('creates a tour, sets pickup points in route order and assigns travellers to them', async () => {
    const { trip, ids } = await tourWithTravellers(3);
    expect(trip).toMatchObject({ id: `GK-${YEAR}-0001`, tourName: 'Kashi Yatra Oct', stage: 'PLANNING', status: 'draft', nights: 7, customer: 'Test Customer' });
    const ws = (await as('OPERATIONS').put(`/api/v2/trips/${trip.id}/pickup-points`, { points: [
      { name: 'Karad', pickupAt: `${day(20)}T04:30`, contactName: 'Shri Jadhav', contactPhone: '9800000001' }, { name: 'Sangli', pickupAt: `${day(20)}T05:45` },
      { name: 'Miraj' }, { name: 'Belagavi', address: 'Central bus stand' },
    ] })).body;
    expect(ws.pickupPoints.map((p: { seq: number; name: string }) => `${p.seq}.${p.name}`)).toEqual(['1.Karad', '2.Sangli', '3.Miraj', '4.Belagavi']);
    expect(ws.pickupPoints[0].pickupLocal).toBe(`${day(20)}T04:30`);
    const [karad, , , belagavi] = ws.pickupPoints;
    const assigned = (await as('OPERATIONS').put(`/api/v2/trips/${trip.id}/assignments`, { rows: [{ travellerId: ids[0], pickupPointId: karad.id }, { travellerId: ids[1], pickupPointId: karad.id }, { travellerId: ids[2], pickupPointId: belagavi.id }] })).body;
    expect(assigned.pickupPoints.map((p: { travellers: number }) => p.travellers)).toEqual([2, 0, 0, 1]);

    // Reordering keeps ids (and assignments); dropping a point un-assigns its travellers.
    const reordered = (await as('OPERATIONS').put(`/api/v2/trips/${trip.id}/pickup-points`, { points: [{ id: belagavi.id, name: 'Belagavi' }, { id: karad.id, name: 'Karad' }] })).body;
    expect(reordered.pickupPoints.map((p: { name: string; travellers: number }) => [p.name, p.travellers])).toEqual([['Belagavi', 1], ['Karad', 2]]);
    const other = (await as('BOOKING').post('/api/v2/trips', { destination: 'Pandharpur' })).body.trip;
    expect((await as('OPERATIONS').put(`/api/v2/trips/${other.id}/pickup-points`, { points: [{ id: karad.id, name: 'Karad' }] })).status).toBe(400);
    expect((await as('OPERATIONS').put(`/api/v2/trips/${other.id}/assignments`, { rows: [{ travellerId: ids[0], pickupPointId: karad.id }] })).status).toBe(400);
    expect((await as('ACCOUNTS').put(`/api/v2/trips/${trip.id}/pickup-points`, { points: [] })).status).toBe(403);
    expect((await as('OPERATIONS').post('/api/v2/trips', { destination: 'Goa' })).status).toBe(403);

    const list = (await as('ACCOUNTS').get('/api/v2/trips?q=kashi')).body;
    expect(list.items).toEqual([expect.objectContaining({ id: trip.id, travellers: 3, stage: 'PLANNING' })]);
  });

  it('stage machine: READY is blocked by unconfirmed bookings, a READY trip falls back when a blocker appears, contracts follow the tour', async () => {
    const { trip } = await tourWithTravellers(2);
    const id = trip.id;
    expect((await as('OPERATIONS').post(`/api/v2/trips/${id}/stage`, { stage: 'READY' })).status).toBe(409); // PLANNING → READY not allowed
    expect((await as('OPERATIONS').post(`/api/v2/trips/${id}/stage`, { stage: 'CONFIRMING' })).body.trip).toMatchObject({ stage: 'CONFIRMING', status: 'confirmed' });

    const hotel = (await as('OPERATIONS').post(`/api/v2/ops/trips/${id}/hotel-bookings`, { hotelName: 'Ganga View', checkIn: day(21), checkOut: day(24), rooms: 1 })).body;
    const tk = (await as('BOOKING').post('/api/v2/tickets', { tripId: id, mode: 'TRAIN', segments: [{ fromName: 'Belagavi', toName: 'Varanasi', departAt: `${day(20)}T05:30` }], passengers: [{ name: 'Yatri1 Patil' }] })).body;
    const blocked = await as('OPERATIONS').post(`/api/v2/trips/${id}/stage`, { stage: 'READY' });
    expect(blocked.status).toBe(409);
    expect(Object.keys(blocked.body.error.fields)).toEqual(['HOTEL_UNCONFIRMED', 'TICKET_NOT_BOOKED']);
    const ws = (await as('OPERATIONS').get(`/api/v2/trips/${id}`)).body;
    expect(ws.readiness.transitions.find((t: { to: string }) => t.to === 'READY')).toMatchObject({ allowed: false });

    await as('OPERATIONS').post(`/api/v2/ops/hotel-bookings/${hotel.id}/status`, { status: 'CONFIRMED', confirmationNo: 'GV-1' });
    await as('OPERATIONS').put(`/api/v2/tickets/rows/${tk.segments[0].passengers[0].id}`, { currentStatus: 'CNF S5 1' });
    const ready = await as('OPERATIONS').post(`/api/v2/trips/${id}/stage`, { stage: 'READY' });
    expect(ready.status, JSON.stringify(ready.body)).toBe(200);
    expect(ready.body.trip.stage).toBe('READY');

    // A new unconfirmed booking drops the trip back to CONFIRMING, recorded as a SYSTEM action.
    await as('OPERATIONS').post(`/api/v2/ops/trips/${id}/activity-bookings`, { name: 'Sarnath visit', date: day(22) });
    const back = await prisma.trip.findUniqueOrThrow({ where: { id } });
    expect(back.stage).toBe('CONFIRMING');
    const sys = await prisma.activityLog.findFirstOrThrow({ where: { entityId: id, action: 'trip_stage_changed', source: 'SYSTEM' } });
    expect(sys.description).toMatch(/no longer ready: 1 activity booking/);

    const act = (await as('OPERATIONS').get(`/api/v2/ops/trips/${id}/activity-bookings`)).body[0];
    await as('OPERATIONS').post(`/api/v2/ops/activity-bookings/${act.id}/status`, { status: 'CANCELLED', reason: 'Not needed' });
    await as('OPERATIONS').post(`/api/v2/trips/${id}/stage`, { stage: 'READY' });
    const early = await as('OPERATIONS').post(`/api/v2/trips/${id}/stage`, { stage: 'ONGOING' });
    expect(early.status).toBe(409);
    expect(early.body.error.fields.NOT_STARTED).toContain(day(20));

    // Dates moved to today: the tour can start; bookings follow; completion waits for the return date.
    await prisma.trip.update({ where: { id }, data: { departure: istToday(), returnDate: day(1) } });
    expect((await as('OPERATIONS').post(`/api/v2/trips/${id}/stage`, { stage: 'ONGOING' })).body.trip).toMatchObject({ stage: 'ONGOING', status: 'in_progress' });
    expect((await as('OPERATIONS').post(`/api/v2/trips/${id}/stage`, { stage: 'COMPLETED' })).status).toBe(409);
    expect((await as('ACCOUNTS').post(`/api/v2/trips/${id}/stage`, { stage: 'COMPLETED' })).status).toBe(403);
    await prisma.trip.update({ where: { id }, data: { returnDate: istToday() } });
    expect((await as('OPERATIONS').post(`/api/v2/trips/${id}/stage`, { stage: 'COMPLETED' })).body.trip.stage).toBe('COMPLETED');
    expect((await as('OPERATIONS').post(`/api/v2/ops/trips/${id}/hotel-bookings`, { hotelName: 'Late', checkIn: day(2), checkOut: day(3) })).status).toBe(409);
    expect((await as('OPERATIONS').put(`/api/v2/trips/${id}`, { tourName: 'x' })).status).toBe(409);
    expect((await as('OPERATIONS').post(`/api/v2/trips/${id}/stage`, { stage: 'CANCELLED', reason: 'x' })).status).toBe(409);
  });

  it('a family leaving a shared tour takes its travellers and total with it; the last booking cancelling cancels the tour', async () => {
    const eRes = await as('BOOKING').post('/api/v2/enquiries', { newCustomer: { name: 'Yatra Mandal', phone: '9000000001' }, destination: 'Varanasi', adults: 4, departureDate: day(40), returnDate: day(46) });
    expect(eRes.status, JSON.stringify(eRes.body)).toBe(201);
    const e = eRes.body;
    // A classic-screen customer already holds CUS-<year>-0001: the sequence skips it instead of failing.
    expect(e.customer.id).toBe(`CUS-${YEAR}-0002`);
    const t1 = (await as('BOOKING').post('/api/v2/travellers', { firstName: 'Shri A', lastName: 'Kulkarni' })).body;
    const t2 = (await as('BOOKING').post('/api/v2/travellers', { firstName: 'Shri B', lastName: 'Deshpande' })).body;
    const q = (await as('BOOKING').post('/api/v2/quotations', { enquiryId: e.id, gstMode: 'NONE',
      parties: [{ key: 'k', name: 'Kulkarni', adults: 2, travellerIds: [t1.id] }, { key: 'd', name: 'Deshpande', adults: 2, travellerIds: [t2.id] }],
      items: [{ key: 'bus', serviceType: 'VEHICLE', description: 'Bus', pricingBasis: 'PER_GROUP', costPrice: 20000, sellPrice: 24000 }] })).body;
    await as('BOOKING').post(`/api/v2/quotations/${q.id}/send`);
    expect(q.id, JSON.stringify(q)).toBeDefined();
    const accRes = await as('BOOKING').post(`/api/v2/quotations/${q.id}/accept`, { splitByParty: true });
    expect(accRes.status, JSON.stringify(accRes.body)).toBe(200);
    const acc = accRes.body;
    const tripId = (await prisma.bookingContract.findFirstOrThrow({ where: { id: acc.bookings[0] } })).tripId!;
    const ws = (await as('BOOKING').get(`/api/v2/trips/${tripId}`)).body;
    expect(ws.parties.map((p: { partyName: string; travellers: number; paymentTracking: string }) => [p.partyName, p.travellers, p.paymentTracking])).toEqual([['Kulkarni', 1, 'TOUR'], ['Deshpande', 1, 'TOUR']]);
    expect(ws.money.totalPayable).toBe(24000);

    const [kul, desh] = ws.parties;
    await as('BOOKING').post(`/api/v2/contracts/${desh.id}/status`, { status: 'CANCELLED', reason: 'Health reasons' });
    const after = (await as('BOOKING').get(`/api/v2/trips/${tripId}`)).body;
    expect(after.travellers.map((t: { travellerId: string }) => t.travellerId)).toEqual([t1.id]);
    expect(after.trip).toMatchObject({ pax: 1, stage: 'CONFIRMING' });
    expect(after.money.totalPayable).toBe(12000);
    expect(after.parties.find((p: { id: string }) => p.id === kul.id).paymentTracking).toBe('TOUR'); // still two contracts on the trip

    await as('BOOKING').post(`/api/v2/contracts/${kul.id}/status`, { status: 'CANCELLED', reason: 'Tour called off' });
    expect(await prisma.trip.findUniqueOrThrow({ where: { id: tripId } })).toMatchObject({ stage: 'CANCELLED', status: 'cancelled' });
  });

  it('keeps the classic screen in step, protects v2 fields, redacts margins and blocks deleting trips with bookings', async () => {
    const { trip } = await tourWithTravellers(1);
    const id = trip.id;
    const classic = (await as('BOOKING').get(`/api/trips/${id}`)).body;
    const put = await as('BOOKING').put(`/api/trips/${id}`, { ...classic, status: 'in_progress', stage: 'COMPLETED', tourName: 'Hacked', notes: 'classic edit' });
    expect(put.status).toBe(200);
    expect(await prisma.trip.findUniqueOrThrow({ where: { id } })).toMatchObject({ stage: 'ONGOING', tourName: 'Kashi Yatra Oct', notes: 'classic edit' });
    expect(await prisma.activityLog.count({ where: { entityId: id, action: 'trip_stage_changed' } })).toBe(1);

    await prisma.trip.update({ where: { id }, data: { supplierCost: 1000, grossMargin: 500, totalPayable: 1500 } });
    expect((await as('OPERATIONS').get(`/api/v2/trips/${id}`)).body.money).toEqual({ totalPayable: 1500, paid: 0, balance: 0 });
    expect((await as('BOOKING').get(`/api/v2/trips/${id}`)).body.money).toMatchObject({ grossMargin: 500, quotedCost: 1000 });

    await prisma.trip.update({ where: { id }, data: { stage: 'CONFIRMING' } });
    await as('OPERATIONS').post(`/api/v2/ops/trips/${id}/hotel-bookings`, { hotelName: 'Ganga View', checkIn: day(21), checkOut: day(22) });
    const del = await as('ADMIN').delete(`/api/trips/${id}`);
    expect(del.status).toBe(409);
    expect(del.body.error).toMatch(/1 hotel booking/);
    const empty = (await as('BOOKING').post('/api/v2/trips', { destination: 'Tuljapur' })).body.trip;
    expect((await as('ADMIN').delete(`/api/trips/${empty.id}`)).status).toBe(200);
  });
});
