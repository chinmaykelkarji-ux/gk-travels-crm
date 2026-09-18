// Sales pipeline v2: leads (ids, duplicates, lifecycle, assignment to real
// users, notes, conversion into customer + enquiry) and enquiries (pax
// breakdown, inline customer, transitions, follow-up tasks, listing).
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { hasTestDb, prisma, resetDb, seedUser, seedCompany } from './helpers/db';
import { as, USER_IDS } from './helpers/app';

const YEAR = new Date().getFullYear();
const iso = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

async function lead(body: Record<string, unknown> = {}) {
  return as('BOOKING').post('/api/v2/leads', { name: 'Ravi Kumar', phone: '+91 91234 56789', source: 'WhatsApp', destination: 'Kerala', pax: 4, ...body });
}

describe.skipIf(!hasTestDb)('sales v2 — leads', () => {
  beforeAll(async () => { await resetDb(); });
  beforeEach(async () => {
    await resetDb();
    await seedCompany();
    for (const role of ['ADMIN', 'BOOKING', 'ACCOUNTS', 'OPERATIONS'] as const) await seedUser(USER_IDS[role], role);
  });

  it('creates with an L display id, normalised phone, timeline and audit; permissions apply', async () => {
    const r = await lead();
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.id).toBe(`L-${YEAR}-0001`);
    expect(r.body).toMatchObject({ status: 'new', phoneNormalized: '9123456789', assignedToUserId: null });
    expect(r.body.timeline).toHaveLength(1);
    expect(await prisma.activityLog.count({ where: { action: 'lead_created' } })).toBe(1);
    expect((await as('OPERATIONS').post('/api/v2/leads', { name: 'x', phone: '9000000000', source: 'Phone' })).status).toBe(403);
    expect((await as('OPERATIONS').get('/api/v2/leads')).status).toBe(403);
    expect((await as('ADMIN').get('/api/v2/leads')).body.total).toBe(1);
  });

  it('flags duplicates against open leads and live customers unless forced', async () => {
    await lead();
    const dupe = await lead({ name: 'Ravi K' });
    expect(dupe.status).toBe(409);
    expect(dupe.body.error.fields.existingLeadId).toBe(`L-${YEAR}-0001`);
    await as('BOOKING').post('/api/v2/customers', { name: 'Meena', phone: '9555555555', email: 'm@example.com' });
    const cust = await lead({ name: 'Meena again', phone: '95555 55555' });
    expect(cust.status).toBe(409);
    expect(cust.body.error.fields.existingCustomerId).toBe(`CUS-${YEAR}-0001`);
    expect((await lead({ name: 'Meena again', phone: '95555 55555', force: true })).status).toBe(201);
    const check = await as('BOOKING').get('/api/v2/leads/check-duplicates?phone=9123456789');
    expect(check.body.leads).toHaveLength(1);
  });

  it('enforces the lifecycle, requires a lost reason, assigns only active users, keeps notes', async () => {
    const l = (await lead()).body;
    expect((await as('BOOKING').post(`/api/v2/leads/${l.id}/status`, { status: 'converted' })).status).toBe(409);
    expect((await as('BOOKING').post(`/api/v2/leads/${l.id}/status`, { status: 'lost' })).status).toBe(400);
    const contacted = await as('BOOKING').post(`/api/v2/leads/${l.id}/status`, { status: 'contacted', note: 'Called, wants Munnar' });
    expect(contacted.status).toBe(200);
    expect(contacted.body.status).toBe('contacted');
    expect(contacted.body.lastContactedAt).not.toBeNull();

    expect((await as('BOOKING').post(`/api/v2/leads/${l.id}/assign`, { userId: 'nope' })).status).toBe(400);
    await prisma.user.update({ where: { id: USER_IDS.ACCOUNTS }, data: { isActive: false } });
    expect((await as('BOOKING').post(`/api/v2/leads/${l.id}/assign`, { userId: USER_IDS.ACCOUNTS })).status).toBe(400);
    const assigned = await as('BOOKING').post(`/api/v2/leads/${l.id}/assign`, { userId: USER_IDS.BOOKING });
    expect(assigned.body.assignee).toMatchObject({ id: USER_IDS.BOOKING });
    expect(assigned.body.assignedTo).toBe('U-BOOKING');
    expect((await as('BOOKING').get(`/api/v2/leads?assignedToUserId=${USER_IDS.BOOKING}`)).body.total).toBe(1);

    const noted = await as('BOOKING').post(`/api/v2/leads/${l.id}/notes`, { note: 'Sent sample itinerary' });
    expect(noted.body.timeline.at(-1)).toMatchObject({ type: 'note', text: 'Sent sample itinerary', userId: USER_IDS.BOOKING });

    const lost = await as('BOOKING').post(`/api/v2/leads/${l.id}/status`, { status: 'lost', lostReason: 'Budget too low' });
    expect(lost.body).toMatchObject({ status: 'lost', lostReason: 'Budget too low' });
    expect((await as('BOOKING').get('/api/v2/leads')).body.total).toBe(0);
    expect((await as('BOOKING').get('/api/v2/leads?includeClosed=true')).body.total).toBe(1);
    const view = await as('BOOKING').get(`/api/v2/leads/${l.id}`);
    expect(view.body.activity.map((a: { action: string }) => a.action)).toContain('lead_status_changed');
  });

  it('converts into a customer (matched by phone or created) and an enquiry, and refuses twice', async () => {
    const l = (await lead({ travelDate: iso(40), budget: 80000, tripType: 'Family', notes: 'Prefers houseboat' })).body;
    await as('BOOKING').post(`/api/v2/leads/${l.id}/assign`, { userId: USER_IDS.BOOKING });
    const conv = await as('BOOKING').post(`/api/v2/leads/${l.id}/convert`, { children: 1 });
    expect(conv.status, JSON.stringify(conv.body)).toBe(200);
    expect(conv.body.customerId).toBe(`CUS-${YEAR}-0001`);
    expect(conv.body.lead).toMatchObject({ status: 'converted', convertedCustomerId: `CUS-${YEAR}-0001` });
    expect(conv.body.enquiry).toMatchObject({ enquiryNumber: `ENQ-${YEAR}-0001`, destination: 'Kerala', adults: 3, children: 1, infants: 0, pax: 4, budget: 80000, tripType: 'Family', assignedToUserId: USER_IDS.BOOKING, leadId: l.id, departureDate: iso(40) });
    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: conv.body.customerId } });
    expect(customer).toMatchObject({ name: 'Ravi Kumar', phoneNormalized: '9123456789', sourceLeadId: l.id, source: 'WhatsApp' });
    expect((await as('BOOKING').post(`/api/v2/leads/${l.id}/convert`, {})).status).toBe(409);
    expect((await as('BOOKING').delete(`/api/v2/leads/${l.id}`)).status).toBe(409);

    // Second lead with the same phone (forced) converts onto the existing customer.
    const l2 = (await lead({ name: 'Ravi again', force: true })).body;
    const conv2 = await as('BOOKING').post(`/api/v2/leads/${l2.id}/convert`, {});
    expect(conv2.body.customerId).toBe(`CUS-${YEAR}-0001`);
    expect(await prisma.customer.count()).toBe(1);
    expect(await prisma.enquiry.count()).toBe(2);
  });
});

describe.skipIf(!hasTestDb)('sales v2 — enquiries', () => {
  beforeAll(async () => { await resetDb(); });
  beforeEach(async () => {
    await resetDb();
    await seedCompany();
    for (const role of ['ADMIN', 'BOOKING', 'ACCOUNTS', 'OPERATIONS'] as const) await seedUser(USER_IDS[role], role);
  });

  it('creates with pax breakdown, inline customer creation (deduped by phone), display number and audit', async () => {
    const bad = await as('BOOKING').post('/api/v2/enquiries', { destination: 'Bali', adults: 2, departureDate: iso(30), returnDate: iso(20) });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.error.fields)).toEqual(expect.arrayContaining(['customerId', 'returnDate']));

    const r = await as('BOOKING').post('/api/v2/enquiries', { newCustomer: { name: 'Priya Shah', phone: '98111 22233' }, source: 'WHATSAPP', destination: 'Bali', adults: 2, children: 1, infants: 1, rooms: 1, departureDate: iso(30), returnDate: iso(36), budget: 150000, budgetMax: 200000, hotelCategory: '4 star', preferences: { pool: 'yes' } });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body).toMatchObject({ enquiryNumber: `ENQ-${YEAR}-0001`, pax: 4, adults: 2, children: 1, infants: 1, status: 'NEW', budget: 150000, budgetMax: 200000, quoteCount: 0 });
    expect(r.body.customer).toMatchObject({ id: `CUS-${YEAR}-0001`, name: 'Priya Shah' });

    const again = await as('BOOKING').post('/api/v2/enquiries', { newCustomer: { name: 'P Shah', phone: '+91 98111 22233' }, destination: 'Goa', adults: 2 });
    expect(again.body.customer.id).toBe(`CUS-${YEAR}-0001`);
    expect(again.body.enquiryNumber).toBe(`ENQ-${YEAR}-0002`);
    expect(await prisma.customer.count()).toBe(1);
    expect(await prisma.activityLog.count({ where: { action: 'enquiry_created' } })).toBe(2);
    // v1 list still works and reports the same enquiries.
    expect((await as('BOOKING').get('/api/enquiries')).body).toHaveLength(2);
  });

  it('updates keep pax in step; closed enquiries are read-only; transitions and lost reasons are enforced', async () => {
    const e = (await as('BOOKING').post('/api/v2/enquiries', { newCustomer: { name: 'Priya', phone: '9811122233' }, destination: 'Bali', adults: 2 })).body;
    const upd = await as('BOOKING').put(`/api/v2/enquiries/${e.id}`, { children: 2, hotelCategory: '5 star' });
    expect(upd.status).toBe(200);
    expect(upd.body).toMatchObject({ pax: 4, adults: 2, children: 2, hotelCategory: '5 star' });

    expect((await as('BOOKING').post(`/api/v2/enquiries/${e.id}/status`, { status: 'WON' })).status).toBe(409);
    expect((await as('BOOKING').post(`/api/v2/enquiries/${e.id}/status`, { status: 'LOST' })).status).toBe(400);
    const ip = await as('BOOKING').post(`/api/v2/enquiries/${e.id}/status`, { status: 'IN_PROGRESS' });
    expect(ip.body.status).toBe('IN_PROGRESS');
    const quoted = await as('BOOKING').post(`/api/v2/enquiries/${e.id}/status`, { status: 'QUOTED' });
    const won = await as('BOOKING').post(`/api/v2/enquiries/${e.id}/status`, { status: 'WON', note: 'Paid advance' });
    expect(quoted.body.status).toBe('QUOTED');
    expect(won.body.status).toBe('WON');
    expect(won.body.wonAt).not.toBeNull();
    expect((await as('BOOKING').put(`/api/v2/enquiries/${e.id}`, { adults: 3 })).status).toBe(409);
    expect((await as('BOOKING').get('/api/v2/enquiries')).body.total).toBe(0);
    expect((await as('BOOKING').get('/api/v2/enquiries?includeClosed=true')).body.total).toBe(1);
    expect((await as('BOOKING').get('/api/v2/enquiries?q=priya&includeClosed=true')).body.total).toBe(1);
    expect((await as('BOOKING').get('/api/v2/enquiries?q=9811122233&includeClosed=true')).body.total).toBe(1);
  });

  it('assigns to active users, records notes, and raises follow-up tasks visible on the detail view', async () => {
    const e = (await as('BOOKING').post('/api/v2/enquiries', { newCustomer: { name: 'Priya', phone: '9811122233' }, destination: 'Bali', adults: 2 })).body;
    const assigned = await as('BOOKING').post(`/api/v2/enquiries/${e.id}/assign`, { userId: USER_IDS.ADMIN });
    expect(assigned.status).toBe(200);
    expect(assigned.body.assignee.id).toBe(USER_IDS.ADMIN);
    expect((await as('BOOKING').post(`/api/v2/enquiries/${e.id}/assign`, { userId: 'ghost' })).status).toBe(400);

    const fu = await as('BOOKING').post(`/api/v2/enquiries/${e.id}/follow-up`, { dueDate: iso(2), note: 'Share hotel options' });
    expect(fu.status, JSON.stringify(fu.body)).toBe(201);
    expect(fu.body).toMatchObject({ customerId: e.customer.id, dueDate: iso(2), assignedTo: 'U-ADMIN', status: 'pending' });
    await as('BOOKING').post(`/api/v2/enquiries/${e.id}/notes`, { note: 'Customer prefers Seminyak' });

    const view = await as('BOOKING').get(`/api/v2/enquiries/${e.id}`);
    expect(view.status).toBe(200);
    expect(view.body.tasks).toHaveLength(1);
    expect(view.body.activity.map((a: { action: string }) => a.action)).toEqual(expect.arrayContaining(['enquiry_created', 'enquiry_assigned', 'enquiry_follow_up', 'enquiry_note']));
    expect(view.body.customer.name).toBe('Priya');
    const team = await as('OPERATIONS').get('/api/v2/me/team');
    expect(team.status).toBe(200);
    expect(team.body.map((u: { id: string }) => u.id)).toEqual(expect.arrayContaining([USER_IDS.ADMIN, USER_IDS.BOOKING]));
    expect(Object.keys(team.body[0]).sort()).toEqual(['id', 'name', 'role']);
  });
});
