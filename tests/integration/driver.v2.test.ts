// Driver view: a DRIVER login linked to one driver sees only that driver's
// confirmed duties with minimum passenger information, moves the duty status
// step by step (audited), reports problems (urgent task for the ops owner),
// and cannot reach anything else in the API.
import { describe, it, expect, beforeEach } from 'vitest';
import { hasTestDb, prisma, resetDb, seedUser, seedCustomer } from './helpers/db';
import { as, USER_IDS } from './helpers/app';

const SECRET = 'OFFICE-ONLY-91ab';
const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const day = (d: number) => new Date(Date.parse(`${istToday()}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);

async function setup() {
  const ramesh = (await as('BOOKING').post('/api/v2/drivers', { name: 'Ramesh Patil', phone: '9876500001' })).body;
  const suresh = (await as('BOOKING').post('/api/v2/drivers', { name: 'Suresh Jadhav', phone: '9876500002' })).body;
  expect((await as('ADMIN').put(`/api/v2/drivers/${ramesh.id}/login`, { userId: USER_IDS.DRIVER })).status).toBe(200);

  const trip = (await as('BOOKING').post('/api/v2/trips', { tourName: 'Kashi Yatra', destination: 'Varanasi', departure: day(1), returnDate: day(5), customerId: 'CUS-2026-0001' })).body.trip;
  await as('OPERATIONS').put(`/api/v2/trips/${trip.id}`, { assignedOpsUserId: USER_IDS.OPERATIONS });
  const a = (await as('BOOKING').post('/api/v2/travellers', { firstName: 'Asha', lastName: 'Kulkarni', email: 'asha@example.test', dateOfBirth: '1960-01-01', passportNumber: 'P9912345' })).body;
  const b = (await as('BOOKING').post('/api/v2/travellers', { firstName: 'Vinay', lastName: 'Kulkarni' })).body;
  const c = (await as('BOOKING').post('/api/v2/travellers', { firstName: 'Meera', lastName: 'Joshi' })).body;
  await as('BOOKING').put(`/api/v2/trips/${trip.id}/travellers`, { travellers: [{ travellerId: a.id }, { travellerId: b.id }, { travellerId: c.id }] });
  const ws = (await as('OPERATIONS').put(`/api/v2/trips/${trip.id}/pickup-points`, { points: [{ name: 'Karad', pickupAt: `${day(1)}T04:30`, contactPhone: '9800000001' }, { name: 'Belagavi', pickupAt: `${day(1)}T07:00` }] })).body;
  await as('OPERATIONS').put(`/api/v2/trips/${trip.id}/assignments`, { rows: [{ travellerId: a.id, pickupPointId: ws.pickupPoints[0].id }, { travellerId: b.id, pickupPointId: ws.pickupPoints[0].id }] });

  const duty = (await as('BOOKING').post(`/api/v2/ops/trips/${trip.id}/vehicle-assignments`, { vehicleType: 'Tempo Traveller', vehicleRegNo: 'KA-22-AB-1234', driverId: ramesh.id, startAt: `${day(1)}T04:00`, endAt: `${day(1)}T10:00`, pickupPoint: 'Karad', dropPoint: 'Belagavi station', pax: 3, costAmount: 7777, sellAmount: 8888, customerNotes: 'Carry water for the group', internalNotes: `${SECRET} owner owes a trip` })).body;
  const other = (await as('BOOKING').post(`/api/v2/ops/trips/${trip.id}/vehicle-assignments`, { vehicleType: 'Bus', vehicleRegNo: 'KA-22-XY-9999', driverId: suresh.id, startAt: `${day(2)}T06:00`, endAt: `${day(2)}T20:00`, pax: 3 })).body;
  const pending = (await as('BOOKING').post(`/api/v2/ops/trips/${trip.id}/vehicle-assignments`, { vehicleType: 'Car', driverId: ramesh.id, startAt: `${day(3)}T06:00`, endAt: `${day(3)}T09:00`, pax: 2 })).body;
  for (const d of [duty, other]) expect((await as('OPERATIONS').post(`/api/v2/ops/vehicle-assignments/${d.id}/status`, { status: 'CONFIRMED' })).status).toBe(200);
  return { trip, ramesh, suresh, duty, other, pending };
}

describe.skipIf(!hasTestDb)('driver view v2', () => {
  beforeEach(async () => {
    await resetDb();
    for (const role of ['ADMIN', 'BOOKING', 'ACCOUNTS', 'OPERATIONS', 'DRIVER'] as const) await seedUser(USER_IDS[role], role);
    await seedCustomer();
  });

  it('shows only the linked driver\'s confirmed duties, with minimum passenger information', async () => {
    const { duty } = await setup();
    const r = await as('DRIVER').get('/api/v2/driver/duties');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.driver.name).toBe('Ramesh Patil');
    expect(r.body.duties.map((d: { id: string }) => d.id)).toEqual([duty.id]); // not Suresh's, not the unconfirmed one
    const d = r.body.duties[0];
    expect(d).toMatchObject({ tripLabel: 'Kashi Yatra', startLocal: `${day(1)}T04:00`, pickupPoint: 'Karad', dropPoint: 'Belagavi station', pax: 3, vehicle: 'KA-22-AB-1234 · Tempo Traveller', instructions: 'Carry water for the group', driverStatus: 'ASSIGNED' });
    expect(d.pickupPoints.map((p: { name: string; passengers: string[] }) => [p.name, p.passengers])).toEqual([['Karad', ['Asha Kulkarni', 'Vinay Kulkarni']], ['Belagavi', []]]);
    expect(d.unassignedPassengers).toBe(1);
    const json = JSON.stringify(r.body);
    for (const leak of [SECRET, '7777', '8888', 'P9912345', '9912', '1960', 'asha@example.test', 'costAmount', 'sellAmount', 'vendor', 'internal']) expect(json, leak).not.toContain(leak);
  });

  it('a driver login reaches nothing but the driver view', async () => {
    await setup();
    for (const path of ['/api/data/all', '/api/v2/trips', '/api/v2/me/team', '/api/customers', '/api/v2/tasks/today', '/api/v2/travellers', '/api/trips', '/api/v2/ops/vehicle-assignments/conflicts?driverId=x&startAt=2026-01-01T00:00&endAt=2026-01-01T01:00']) {
      expect((await as('DRIVER').get(path)).status, path).toBe(403);
    }
    expect((await as('DRIVER').get('/api/v2/me')).status).toBe(200);
    // Staff cannot use the driver API; an admin without a linked driver gets a clear refusal.
    expect((await as('BOOKING').get('/api/v2/driver/duties')).status).toBe(403);
    const admin = await as('ADMIN').get('/api/v2/driver/duties');
    expect(admin.status).toBe(403);
    expect(admin.body.error.message).toMatch(/not linked to a driver/);
  });

  it('status moves step by step, is audited, completes the duty, and a reported problem raises an urgent task', async () => {
    const { duty, other, trip } = await setup();
    const step = (id: string, status: string, note?: string) => as('DRIVER').post(`/api/v2/driver/duties/${id}/status`, { status, note });
    expect((await step(duty.id, 'ACKNOWLEDGED')).status).toBe(200);
    expect((await step(duty.id, 'COMPLETED')).status).toBe(409);            // cannot skip steps
    expect((await step(other.id, 'ACKNOWLEDGED')).status).toBe(404);         // Suresh's duty
    expect((await step(duty.id, 'STARTED')).status).toBe(200);
    expect((await step(duty.id, 'ISSUE')).status).toBe(400);                 // a problem needs words
    const issue = await step(duty.id, 'ISSUE', 'Tyre puncture near Kolhapur, 30 min late');
    expect(issue.status).toBe(200);
    const task = await prisma.task.findFirstOrThrow({ where: { tripId: trip.id, source: 'SYSTEM', entityId: duty.id } });
    expect(task).toMatchObject({ priority: 'urgent', status: 'pending', assignedToUserId: USER_IDS.OPERATIONS });
    expect(task.description).toContain('Tyre puncture');
    // The office sees it on the trip.
    const ws = (await as('OPERATIONS').get(`/api/v2/trips/${trip.id}`)).body;
    expect(ws.vehicles.find((v: { id: string }) => v.id === duty.id)).toMatchObject({ driverStatus: 'ISSUE', driverNote: 'Tyre puncture near Kolhapur, 30 min late' });

    for (const s of ['ARRIVED', 'ON_BOARD', 'COMPLETED']) expect((await step(duty.id, s)).status, s).toBe(200);
    const done = await prisma.vehicleAssignment.findUniqueOrThrow({ where: { id: duty.id } });
    expect(done).toMatchObject({ driverStatus: 'COMPLETED', status: 'COMPLETED' });
    expect((await step(duty.id, 'ISSUE', 'late')).status).toBe(409);         // completed duties are closed
    expect((await as('DRIVER').get('/api/v2/driver/duties')).body.duties).toEqual([]);
    expect((await as('DRIVER').get('/api/v2/driver/duties?range=past')).body.duties).toEqual([]); // ends later today or tomorrow: not "past" yet

    const log = await prisma.activityLog.findMany({ where: { entityId: trip.id, action: 'driver_status' }, orderBy: { createdAt: 'asc' } });
    expect(log.map(l => (l.after as { driverStatus: string }).driverStatus)).toEqual(['ACKNOWLEDGED', 'STARTED', 'ISSUE', 'ARRIVED', 'ON_BOARD', 'COMPLETED']);
    expect(log.every(l => l.userId === USER_IDS.DRIVER && l.source === 'HUMAN')).toBe(true);
  });

  it('linking logins: admin only, DRIVER accounts only, one driver per login; unlinked or inactive logins see nothing', async () => {
    const ramesh = (await as('BOOKING').post('/api/v2/drivers', { name: 'Ramesh Patil', phone: '9876500001' })).body;
    const suresh = (await as('BOOKING').post('/api/v2/drivers', { name: 'Suresh Jadhav', phone: '9876500002' })).body;
    expect((await as('DRIVER').get('/api/v2/driver/duties')).status).toBe(403);           // not linked yet
    expect((await as('BOOKING').put(`/api/v2/drivers/${ramesh.id}/login`, { userId: USER_IDS.DRIVER })).status).toBe(403);
    expect((await as('ADMIN').put(`/api/v2/drivers/${ramesh.id}/login`, { userId: USER_IDS.OPERATIONS })).status).toBe(400);
    expect((await as('ADMIN').put(`/api/v2/drivers/${ramesh.id}/login`, { userId: USER_IDS.DRIVER })).status).toBe(200);
    expect((await as('ADMIN').put(`/api/v2/drivers/${suresh.id}/login`, { userId: USER_IDS.DRIVER })).status).toBe(409);
    const logins = (await as('ADMIN').get('/api/v2/drivers/logins')).body;
    expect(logins).toEqual([expect.objectContaining({ id: USER_IDS.DRIVER, driverId: ramesh.id })]);
    expect((await as('BOOKING').get(`/api/v2/drivers/${ramesh.id}`)).body.appAccess).toMatchObject({ userId: USER_IDS.DRIVER });
    expect((await as('DRIVER').get('/api/v2/driver/duties')).status).toBe(200);
    await as('BOOKING').put(`/api/v2/drivers/${ramesh.id}`, { isActive: false });
    expect((await as('DRIVER').get('/api/v2/driver/duties')).status).toBe(403);
    expect((await as('ADMIN').put(`/api/v2/drivers/${ramesh.id}/login`, { userId: null })).status).toBe(200);
    const audit = await prisma.activityLog.findMany({ where: { entityType: 'driver', entityId: ramesh.id, action: 'driver_login_linked' } });
    expect(audit).toHaveLength(2);
  });
});
