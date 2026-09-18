// Customers v2 through the real app: server-side numbering, validation,
// duplicate detection, search/pagination, the 360° aggregate, relationships,
// soft-delete guards and merge.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { hasTestDb, prisma, resetDb, seedUser, seedCompany, seedTrip } from './helpers/db';
import { as, USER_IDS } from './helpers/app';

const YEAR = new Date().getFullYear();

async function create(body: Record<string, unknown>, role: 'ADMIN' | 'BOOKING' = 'BOOKING') {
  return as(role).post('/api/v2/customers', { name: 'Asha Rao', phone: '+91 98765 43210', email: 'asha@example.com', ...body });
}

describe.skipIf(!hasTestDb)('customers v2', () => {
  beforeAll(async () => { await resetDb(); });
  beforeEach(async () => {
    await resetDb();
    await seedCompany();
    for (const role of ['ADMIN', 'BOOKING', 'ACCOUNTS', 'OPERATIONS'] as const) await seedUser(USER_IDS[role], role);
  });

  it('creates with a server-generated display id, normalised phone and an audit row', async () => {
    const r = await create({ tags: ['vip', 'honeymoon'], preferences: { mealPreference: 'veg' } });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.id).toBe(`CUS-${YEAR}-0001`);
    expect(r.body).toMatchObject({ phoneNormalized: '9876543210', type: 'INDIVIDUAL', tags: ['vip', 'honeymoon'], organizationId: 'org_gktravels' });
    const second = await create({ name: 'Other', phone: '9000000001', email: 'other@example.com' });
    expect(second.body.id).toBe(`CUS-${YEAR}-0002`);
    expect(await prisma.activityLog.count({ where: { action: 'customer_created' } })).toBe(2);
    expect((await prisma.activityLog.findFirst({ where: { action: 'customer_created' } }))?.userId).toBe(USER_IDS.BOOKING);
  });

  it('validates input and strips unknown keys', async () => {
    const r = await create({ name: 'A', phone: '12', email: 'not-an-email' });
    expect(r.status).toBe(400);
    expect(Object.keys(r.body.error.fields)).toEqual(expect.arrayContaining(['name', 'phone', 'email']));
    const ok = await create({ organizationId: 'org_evil', customerNumber: 999, deletedAt: '2020-01-01' });
    expect(ok.status).toBe(201);
    expect(ok.body.organizationId).toBe('org_gktravels');
    expect(ok.body.deletedAt).toBeNull();
  });

  it('blocks duplicates by phone (any formatting) or email unless forced', async () => {
    await create({});
    const dupe = await create({ name: 'Asha R', phone: '098765 43210', email: 'x@example.com' });
    expect(dupe.status).toBe(409);
    expect(dupe.body.error.code).toBe('CONFLICT');
    expect(dupe.body.error.fields.existingCustomerId).toBe(`CUS-${YEAR}-0001`);
    const byEmail = await create({ name: 'Someone', phone: '9111111111', email: 'ASHA@example.com' });
    expect(byEmail.status).toBe(409);
    const forced = await create({ name: 'Asha Husband', phone: '9876543210', email: 'h@example.com', force: true });
    expect(forced.status).toBe(201);
    const check = await as('BOOKING').get('/api/v2/customers/check-duplicates?phone=91-98765-43210');
    expect(check.body).toHaveLength(2);
    const groups = await as('ADMIN').get('/api/v2/customers/duplicates');
    expect(groups.body).toHaveLength(1);
    expect(groups.body[0].customers).toHaveLength(2);
  });

  it('lists with search on name/phone/email, filters, sorting and pagination', async () => {
    for (let i = 1; i <= 30; i++) await create({ name: `Customer ${String(i).padStart(2, '0')}`, phone: `90000000${String(i).padStart(2, '0')}`, email: `c${i}@example.com`, type: i % 5 === 0 ? 'CORPORATE' : 'INDIVIDUAL', tags: i % 3 === 0 ? ['repeat'] : [] });
    const page1 = await as('OPERATIONS').get('/api/v2/customers?pageSize=10&sort=name');
    expect(page1.status).toBe(200);
    expect(page1.body).toMatchObject({ total: 30, page: 1, pageSize: 10 });
    expect(page1.body.items[0].name).toBe('Customer 01');
    const page3 = await as('OPERATIONS').get('/api/v2/customers?pageSize=10&sort=name&page=3');
    expect(page3.body.items[9].name).toBe('Customer 30');

    expect((await as('BOOKING').get('/api/v2/customers?q=customer 07')).body.total).toBe(1);
    expect((await as('BOOKING').get('/api/v2/customers?q=+91 90000000 12')).body.items[0].name).toBe('Customer 12');
    expect((await as('BOOKING').get('/api/v2/customers?q=c25@example')).body.total).toBe(1);
    expect((await as('BOOKING').get('/api/v2/customers?type=CORPORATE')).body.total).toBe(6);
    expect((await as('BOOKING').get('/api/v2/customers?tag=repeat')).body.total).toBe(10);
    expect((await as('BOOKING').get('/api/v2/customers?pageSize=500')).status).toBe(400);
  });

  it('updates with an audit diff, keeps trip snapshots in sync, refuses a phone owned by someone else', async () => {
    const a = (await create({})).body;
    const b = (await create({ name: 'Bee', phone: '9333333333', email: 'b@example.com' })).body;
    await seedTrip('GK-2026-0001', { customerId: a.id, customer: 'Asha Rao' });

    const upd = await as('BOOKING').put(`/api/v2/customers/${a.id}`, { name: 'Asha Rao-Mehta', city: 'Belagavi', tags: ['vip'] });
    expect(upd.status).toBe(200);
    expect(upd.body.city).toBe('Belagavi');
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: 'GK-2026-0001' } })).customer).toBe('Asha Rao-Mehta');
    const log = await prisma.activityLog.findFirst({ where: { action: 'customer_updated', entityId: a.id } });
    expect(log?.before).toMatchObject({ name: 'Asha Rao', city: null });
    expect(log?.after).toMatchObject({ name: 'Asha Rao-Mehta', city: 'Belagavi' });

    const clash = await as('BOOKING').put(`/api/v2/customers/${a.id}`, { phone: '93333 33333' });
    expect(clash.status).toBe(409);
    expect(clash.body.error.fields.existingCustomerId).toBe(b.id);
  });

  it('returns a 360° view with trips, finance, travellers, documents, relationships and activity', async () => {
    const a = (await create({})).body;
    const b = (await create({ name: 'Bee', phone: '9333333333', email: 'b@example.com' })).body;
    await seedTrip('GK-2026-0001', { customerId: a.id, totalPayable: 105_000, paidAmount: 30_000, balanceDue: 75_000 });
    await prisma.traveller.create({ data: { id: 'PAX-1', customerId: a.id, firstName: 'Asha', lastName: 'Rao', createdDate: '2026-09-01' } });
    await prisma.receivable.create({ data: { id: 'RCV-1', customerId: a.id, customerName: 'Asha', invoiceAmount: 105_000, totalReceived: 30_000, balanceDue: 75_000, createdDate: '2026-09-01' } });
    const rel = await as('BOOKING').post(`/api/v2/customers/${a.id}/relationships`, { relatedCustomerId: b.id, kind: 'FAMILY', note: 'sister' });
    expect(rel.status).toBe(201);

    const view = await as('ACCOUNTS').get(`/api/v2/customers/${a.id}`);
    expect(view.status).toBe(200);
    expect(view.body.customer.id).toBe(a.id);
    expect(view.body.stats).toMatchObject({ tripCount: 1, lifetimeValue: 105_000, lifetimePaid: 30_000, outstanding: 75_000 });
    expect(view.body.trips[0].id).toBe('GK-2026-0001');
    expect(view.body.travellers[0].firstName).toBe('Asha');
    expect(view.body.customer.relationships).toEqual([expect.objectContaining({ kind: 'FAMILY', note: 'sister', customer: expect.objectContaining({ id: b.id }) })]);
    expect(view.body.activity.length).toBeGreaterThanOrEqual(2);

    // The relationship is visible from the other side too, and removable from either.
    const other = await as('ACCOUNTS').get(`/api/v2/customers/${b.id}`);
    expect(other.body.customer.relationships[0].customer.id).toBe(a.id);
    expect((await as('BOOKING').delete(`/api/v2/customers/${b.id}/relationships/${rel.body.id}`)).status).toBe(200);
    expect((await as('ACCOUNTS').get(`/api/v2/customers/${a.id}`)).body.customer.relationships).toHaveLength(0);
    expect((await as('ACCOUNTS').get('/api/v2/customers/CUS-0000-0000')).status).toBe(404);
  });

  it('soft delete is admin-only and refuses customers with active trips or balances', async () => {
    const a = (await create({})).body;
    expect((await as('BOOKING').delete(`/api/v2/customers/${a.id}`)).status).toBe(403);
    await seedTrip('GK-2026-0001', { customerId: a.id, status: 'confirmed' });
    const blocked = await as('ADMIN').delete(`/api/v2/customers/${a.id}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.message).toMatch(/active trip/);
    await prisma.trip.update({ where: { id: 'GK-2026-0001' }, data: { status: 'completed' } });
    expect((await as('ADMIN').delete(`/api/v2/customers/${a.id}`)).status).toBe(200);
    expect((await as('BOOKING').get('/api/v2/customers')).body.total).toBe(0);
    expect((await as('BOOKING').get('/api/v2/customers?includeDeleted=true')).body.total).toBe(1);
    expect((await as('BOOKING').put(`/api/v2/customers/${a.id}`, { city: 'x' })).status).toBe(404);
  });

  it('merge repoints every linked record, fills gaps, keeps the source as a merged tombstone', async () => {
    const target = (await create({ name: 'Asha Rao', phone: '9876543210', email: 'asha@example.com' })).body;
    const source = (await create({ name: 'Asha R.', phone: '9876543210', email: 'x@example.com', city: 'Belagavi', tags: ['old'], notes: 'from import', force: true })).body;
    await seedTrip('GK-2026-0001', { customerId: source.id, customer: 'Asha R.' });
    await prisma.enquiry.create({ data: { customerId: source.id, destination: 'Goa' } });
    await prisma.receivable.create({ data: { id: 'RCV-2', customerId: source.id, customerName: 'Asha R.', invoiceAmount: 10, balanceDue: 10, createdDate: '2026-09-01' } });
    await prisma.traveller.create({ data: { id: 'PAX-2', customerId: source.id, firstName: 'Kid', lastName: 'Rao', createdDate: '2026-09-01' } });
    const third = (await create({ name: 'Cee', phone: '9444444444', email: 'c@example.com' })).body;
    await as('BOOKING').post(`/api/v2/customers/${source.id}/relationships`, { relatedCustomerId: third.id, kind: 'FRIEND' });

    expect((await as('BOOKING').post(`/api/v2/customers/${target.id}/merge`, { sourceId: source.id })).status).toBe(403);
    const merged = await as('ADMIN').post(`/api/v2/customers/${target.id}/merge`, { sourceId: source.id });
    expect(merged.status, JSON.stringify(merged.body)).toBe(200);
    expect(merged.body.moved).toMatchObject({ trips: 1, enquiries: 1, receivables: 1, passengers: 1 });
    expect(merged.body.target).toMatchObject({ city: 'Belagavi', tags: ['old'] });
    expect(merged.body.target.notes).toContain('[merged from');

    expect((await prisma.trip.findUniqueOrThrow({ where: { id: 'GK-2026-0001' } }))).toMatchObject({ customerId: target.id, customer: 'Asha Rao' });
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: source.id } }))).toMatchObject({ mergedIntoId: target.id });
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: source.id } })).deletedAt).not.toBeNull();
    const view = await as('ADMIN').get(`/api/v2/customers/${target.id}`);
    expect(view.body.customer.relationships[0].customer.id).toBe(third.id);
    expect(view.body.stats.tripCount).toBe(1);
    expect(await prisma.activityLog.count({ where: { action: 'customer_merged' } })).toBe(2);
    expect((await as('ADMIN').post(`/api/v2/customers/${target.id}/merge`, { sourceId: target.id })).status).toBe(400);
  });
});
