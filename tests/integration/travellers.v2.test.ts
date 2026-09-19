// Travellers v2: ids, validation (no Aadhaar, date sanity), passport duplicate
// guard, list filters, trip membership with legacy passengerIds mirroring,
// soft-delete guard, passport alerts, and the scheduler rule that raises tasks.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { hasTestDb, prisma, resetDb, seedUser, seedCompany, seedTrip } from './helpers/db';
import { as, USER_IDS } from './helpers/app';

const YEAR = new Date().getFullYear();
const iso = (daysFromNow: number) => new Date(Date.now() + daysFromNow * 86_400_000).toISOString().slice(0, 10);

async function customer(name = 'Asha Rao', phone = '9876543210') {
  const r = await as('BOOKING').post('/api/v2/customers', { name, phone, email: `${phone}@example.com` });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body as { id: string };
}
async function traveller(body: Record<string, unknown>) {
  const r = await as('BOOKING').post('/api/v2/travellers', { firstName: 'Asha', lastName: 'Rao', ...body });
  return r;
}

describe.skipIf(!hasTestDb)('travellers v2', () => {
  beforeAll(async () => { await resetDb(); });
  beforeEach(async () => {
    await resetDb();
    await seedCompany();
    for (const role of ['ADMIN', 'BOOKING', 'ACCOUNTS', 'OPERATIONS'] as const) await seedUser(USER_IDS[role], role);
  });

  it('creates with a PAX display id, seals and masks the passport, links to a customer and audits', async () => {
    const c = await customer();
    const r = await traveller({ customerId: c.id, title: 'Mrs', dateOfBirth: '1990-04-12', passportNumber: 'z1234567', passportExpiry: iso(400), govtIdType: 'PAN', govtIdNumber: 'ABCDE1234F' });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.id).toBe(`PAX-${YEAR}-0001`);
    expect(r.body).toMatchObject({ customerId: c.id, passportNumber: 'XXXX-XXXX-4567', govtIdNumber: 'XXXX-XXXX-234F', organizationId: 'org_gktravels' });
    expect(await prisma.activityLog.count({ where: { action: 'traveller_created', entityId: r.body.id } })).toBe(1);
    const view = await as('ACCOUNTS').get(`/api/v2/customers/${c.id}`);
    expect(view.body.travellers).toHaveLength(1);
  });

  it('validates: unknown customer, future DOB, expiry before issue, invalid Aadhaar rejected, ID number required', async () => {
    const bad = await traveller({ customerId: 'CUS-0000-0000' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields.customerId).toBeDefined();
    const dates = await traveller({ dateOfBirth: iso(10), passportIssueDate: '2026-01-01', passportExpiry: '2025-01-01' });
    expect(dates.status).toBe(400);
    expect(Object.keys(dates.body.error.fields)).toEqual(expect.arrayContaining(['dateOfBirth', 'passportExpiry']));
    expect((await traveller({ govtIdType: 'AADHAAR', govtIdNumber: '123412341234' })).status).toBe(400);
    expect((await traveller({ govtIdType: 'PAN' })).body.error.fields.govtIdNumber).toBeDefined();
  });

  it('refuses a duplicate passport number unless forced', async () => {
    await traveller({ passportNumber: 'A1' + '234567' });
    const dupe = await traveller({ firstName: 'Other', passportNumber: 'a1234567' });
    expect(dupe.status).toBe(409);
    expect(dupe.body.error.fields.existingTravellerId).toBe(`PAX-${YEAR}-0001`);
    expect((await traveller({ firstName: 'Other', passportNumber: 'a1234567', force: true })).status).toBe(201);
    const upd = await as('BOOKING').put(`/api/v2/travellers/PAX-${YEAR}-0002`, { passportNumber: 'B7654321' });
    expect(upd.status).toBe(200);
    const clash = await as('BOOKING').put(`/api/v2/travellers/PAX-${YEAR}-0001`, { passportNumber: 'b7654321' });
    expect(clash.status).toBe(409);
  });

  it('lists with search and passport filters, paginated', async () => {
    const c = await customer('Kelkar Family', '9000000001');
    await traveller({ firstName: 'Chinmay', lastName: 'Kelkar', customerId: c.id, passportNumber: 'K1111111', passportExpiry: iso(-5) });
    await traveller({ firstName: 'Neha', lastName: 'Kelkar', customerId: c.id, passportNumber: 'K2222222', passportExpiry: iso(90) });
    await traveller({ firstName: 'Aarav', lastName: 'Kelkar', customerId: c.id });
    await traveller({ firstName: 'Zoya', lastName: 'Khan', passportNumber: 'Z9999999', passportExpiry: iso(900) });

    const all = await as('OPERATIONS').get('/api/v2/travellers');
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(4);
    expect(all.body.items[0]).toMatchObject({ firstName: 'Aarav', customerName: 'Kelkar Family', passportStatus: 'UNKNOWN' });
    expect((await as('BOOKING').get('/api/v2/travellers?q=kelkar')).body.total).toBe(3);
    // Passport numbers are sealed: search is an exact blind-index match, never a substring.
    expect((await as('BOOKING').get('/api/v2/travellers?q=k2222222')).body.items[0].firstName).toBe('Neha');
    expect((await as('BOOKING').get('/api/v2/travellers?q=K222')).body.total).toBe(0);
    expect((await as('BOOKING').get(`/api/v2/travellers?customerId=${c.id}`)).body.total).toBe(3);
    expect((await as('BOOKING').get('/api/v2/travellers?passport=EXPIRED')).body.items.map((t: { firstName: string }) => t.firstName)).toEqual(['Chinmay']);
    expect((await as('BOOKING').get('/api/v2/travellers?passport=EXPIRING')).body.items.map((t: { firstName: string }) => t.firstName)).toEqual(['Neha']);
    expect((await as('BOOKING').get('/api/v2/travellers?passport=MISSING')).body.total).toBe(1);
    expect((await as('BOOKING').get('/api/v2/travellers?pageSize=2&page=2')).body.items).toHaveLength(2);
  });

  it('sets trip travellers, mirrors trips.passengerIds and pax, one lead only, and guards deletion', async () => {
    const c = await customer();
    await seedTrip('GK-2026-0001', { customerId: c.id, departure: iso(30), status: 'confirmed', pax: 1 });
    const a = (await traveller({ customerId: c.id, passportExpiry: iso(60) })).body;
    const b = (await traveller({ firstName: 'Rohan', customerId: c.id, dateOfBirth: iso(-400) })).body;

    const twoLeads = await as('BOOKING').put('/api/v2/trips/GK-2026-0001/travellers', { travellers: [{ travellerId: a.id, role: 'LEAD' }, { travellerId: b.id, role: 'LEAD' }] });
    expect(twoLeads.status).toBe(400);
    const unknown = await as('BOOKING').put('/api/v2/trips/GK-2026-0001/travellers', { travellers: [{ travellerId: 'PAX-0000-0000' }] });
    expect(unknown.status).toBe(400);

    const set = await as('BOOKING').put('/api/v2/trips/GK-2026-0001/travellers', { travellers: [{ travellerId: a.id, role: 'LEAD' }, { travellerId: b.id, role: 'INFANT' }] });
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    expect(set.body.travellers.map((t: { id: string; role: string }) => [t.id, t.role])).toEqual([[a.id, 'LEAD'], [b.id, 'INFANT']]);
    const trip = await prisma.trip.findUniqueOrThrow({ where: { id: 'GK-2026-0001' } });
    expect(trip.passengerIds).toEqual([a.id, b.id]);
    expect(trip.pax).toBe(2);

    const get = await as('OPERATIONS').get('/api/v2/trips/GK-2026-0001/travellers');
    expect(get.status).toBe(200);
    expect(get.body.travellers[0].passportStatus).toBe('INSUFFICIENT');
    expect((await as('OPERATIONS').put('/api/v2/trips/GK-2026-0001/travellers', { travellers: [] })).status).toBe(403);

    const blocked = await as('BOOKING').delete(`/api/v2/travellers/${a.id}`);
    expect(blocked.status).toBe(409);
    const shrink = await as('BOOKING').put('/api/v2/trips/GK-2026-0001/travellers', { travellers: [{ travellerId: b.id, role: 'ADULT' }], syncPax: false });
    expect(shrink.body.travellers).toHaveLength(1);
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: 'GK-2026-0001' } })).pax).toBe(2);
    expect((await as('BOOKING').delete(`/api/v2/travellers/${a.id}`)).status).toBe(200);
    expect((await as('BOOKING').get('/api/v2/travellers')).body.total).toBe(1);
    expect((await as('BOOKING').get(`/api/v2/travellers/${a.id}`)).body.deletedAt).not.toBeNull();
  });

  it('legacy trip PUT with passengerIds keeps trip_travellers in step', async () => {
    const c = await customer();
    await seedTrip('GK-2026-0001', { customerId: c.id, departure: iso(30) });
    const a = (await traveller({ customerId: c.id })).body;
    const r = await as('BOOKING').put('/api/trips/GK-2026-0001', { passengerIds: [a.id, 'PAX-9999-9999'] });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const links = await prisma.tripTraveller.findMany({ where: { tripId: 'GK-2026-0001' } });
    expect(links.map(l => l.travellerId)).toEqual([a.id]);
  });

  it('passport alerts list expiring passports with upcoming trips; the task engine raises one task per problem', async () => {
    const c = await customer();
    await seedTrip('GK-2026-0001', { customerId: c.id, customer: 'Asha Rao', destination: 'Bali', departure: iso(20), status: 'confirmed' });
    await seedTrip('GK-2026-0002', { customerId: c.id, destination: 'Goa', departure: iso(-10), status: 'completed' });
    const short = (await traveller({ customerId: c.id, passportNumber: 'S1111111', passportExpiry: iso(100) })).body;   // < 6 months after departure
    const fine  = (await traveller({ firstName: 'Fine', customerId: c.id, passportNumber: 'F1111111', passportExpiry: iso(800) })).body;
    const idle  = (await traveller({ firstName: 'Idle', passportNumber: 'I1111111', passportExpiry: iso(30) })).body;       // expiring, no trip
    await as('BOOKING').put('/api/v2/trips/GK-2026-0001/travellers', { travellers: [{ travellerId: short.id }, { travellerId: fine.id }] });
    await as('BOOKING').put('/api/v2/trips/GK-2026-0002/travellers', { travellers: [{ travellerId: short.id }] });

    const alerts = await as('BOOKING').get('/api/v2/travellers/passport-alerts?days=180');
    expect(alerts.status).toBe(200);
    expect(alerts.body.map((a: { id: string }) => a.id).sort()).toEqual([idle.id, short.id].sort());
    const s = alerts.body.find((a: { id: string }) => a.id === short.id);
    expect(s.upcomingTrips).toEqual([expect.objectContaining({ id: 'GK-2026-0001', status: 'INSUFFICIENT' })]);

    // The task engine (Phase 3.6) raises one task per problem; a sweep is idempotent.
    const { sweep } = await import('../../server/src/modules/tasks/engine');
    const { runWithContext } = await import('../../server/src/core/requestContext');
    await runWithContext({ organizationId: 'org_gktravels', source: 'SYSTEM' }, () => sweep());
    // (The seeded trip also carries a balance, so the balance rule raises its own task.)
    const tasks = await prisma.task.findMany({ where: { tripId: 'GK-2026-0001', ruleCode: 'PASSPORT_VALIDITY' } });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ source: 'RULE', ruleCode: 'PASSPORT_VALIDITY', customerId: c.id, entityId: short.id });
    expect(tasks[0].title).toMatch(/Passport validity short/);
    await runWithContext({ organizationId: 'org_gktravels', source: 'SYSTEM' }, () => sweep());
    expect(await prisma.task.count({ where: { tripId: 'GK-2026-0001', ruleCode: 'PASSPORT_VALIDITY' } })).toBe(1);
  });
});
