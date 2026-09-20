// Booking contracts: created on quotation acceptance (whole group or per
// party), with legacy Trip + TripService rows, traveller membership, default
// payment schedule, schedule edits, lifecycle synced to the trip.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { hasTestDb, prisma, resetDb, seedUser, seedCompany } from './helpers/db';
import { as, USER_IDS } from './helpers/app';

const YEAR = new Date().getFullYear();
const iso = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

async function acceptedQuote(split: boolean) {
  const e = (await as('BOOKING').post('/api/v2/enquiries', { newCustomer: { name: 'Kelkar Family', phone: '9000000001' }, destination: 'Bali', adults: 4, children: 1, departureDate: iso(40), returnDate: iso(46) })).body;
  const t1 = (await as('BOOKING').post('/api/v2/travellers', { firstName: 'Chinmay', lastName: 'Kelkar', customerId: e.customer.id })).body;
  const t2 = (await as('BOOKING').post('/api/v2/travellers', { firstName: 'Rohan', lastName: 'Shah', customerId: e.customer.id })).body;
  const body = {
    enquiryId: e.id, gstMode: 'EXCLUDED', gstRate: 5,
    parties: [{ key: 'k', name: 'Kelkar', adults: 2, children: 1, travellerIds: [t1.id] }, { key: 's', name: 'Shah', adults: 2, travellerIds: [t2.id] }],
    items: [
      { key: 'hk', serviceType: 'HOTEL', description: 'Room K', pricingBasis: 'PER_ROOM', costPrice: 4000, sellPrice: 5000, quantity: 1, nights: 2, partyKey: 'k' },
      { key: 'hs', serviceType: 'HOTEL', description: 'Room S', pricingBasis: 'PER_ROOM', costPrice: 4000, sellPrice: 6000, quantity: 1, nights: 2, partyKey: 's' },
      { key: 'bus', serviceType: 'VEHICLE', description: 'Tempo traveller', pricingBasis: 'PER_GROUP', costPrice: 8000, sellPrice: 10000 },
    ],
  };
  const q = (await as('BOOKING').post('/api/v2/quotations', body)).body;
  await as('BOOKING').post(`/api/v2/quotations/${q.id}/send`);
  const acc = await as('BOOKING').post(`/api/v2/quotations/${q.id}/accept`, { splitByParty: split });
  expect(acc.status, JSON.stringify(acc.body)).toBe(200);
  return { enquiry: e, quote: q, accepted: acc.body, travellers: [t1, t2] };
}

describe.skipIf(!hasTestDb)('booking contracts v2', () => {
  beforeAll(async () => { await resetDb(); });
  beforeEach(async () => {
    await resetDb();
    await seedCompany();
    for (const role of ['ADMIN', 'BOOKING', 'ACCOUNTS', 'OPERATIONS'] as const) await seedUser(USER_IDS[role], role);
    await prisma.trip.create({ data: { id: `GK-${YEAR}-0007`, customer: 'Legacy', destination: 'Goa', createdDate: '2026-01-01' } });
    await prisma.numberingSequence.upsert({ where: { organizationId_docType_financialYear: { organizationId: 'org_gktravels', docType: 'GK', financialYear: String(YEAR) } }, create: { id: `org_gktravels-GK-${YEAR}`, organizationId: 'org_gktravels', docType: 'GK', financialYear: String(YEAR), lastNumber: 7 }, update: { lastNumber: 7 } });
  });

  it('accepting without a split creates one contract, one trip with services and travellers, and a two-part schedule', async () => {
    const { accepted, travellers } = await acceptedQuote(false);
    expect(accepted.bookings).toHaveLength(1);
    const c = (await as('ACCOUNTS').get(`/api/v2/contracts/${accepted.bookings[0]}`)).body;
    expect(c).toMatchObject({ contractNumber: `BK-${YEAR}-0001`, status: 'CONFIRMED', tripId: `GK-${YEAR}-0008`, totalAmount: 32000 * 1.05, taxAmount: 1600, costAmount: 24000, adults: 4, children: 1, partyId: null });
    expect(c.schedule.map((s: { label: string; amount: number; status: string }) => [s.label, s.amount, s.status])).toEqual([['Advance', 16800, 'DUE'], ['Balance', 16800, 'UPCOMING']]);
    expect(c.payments).toMatchObject({ total: 33600, paid: 0, balance: 33600 });
    expect(c.services).toHaveLength(3);
    const trip = await prisma.trip.findUniqueOrThrow({ where: { id: c.tripId }, include: { travellers: true } });
    expect(trip).toMatchObject({ status: 'confirmed', totalPayable: 33600, balanceDue: 33600, supplierCost: 24000, pax: 5, customer: 'Kelkar Family' });
    expect(trip.travellers.map(t => t.travellerId).sort()).toEqual(travellers.map(t => t.id).sort());
    expect(trip.passengerIds).toEqual(travellers.map(t => t.id));
    expect((await prisma.salesQuote.findUniqueOrThrow({ where: { id: accepted.quote.id } })).convertedTripId).toBe(c.tripId);
    expect(await prisma.outboxEvent.count({ where: { eventType: 'BOOKING_CONFIRMED' } })).toBe(1);
    expect(await prisma.activityLog.count({ where: { action: 'contract_created' } })).toBe(1);
    expect((await as('OPERATIONS').get('/api/v2/contracts')).body.total).toBe(1);
  });

  it('family-wise split: one tour, one contract per party whose totals add up; party payments are not guessed', async () => {
    const { accepted, travellers } = await acceptedQuote(true);
    expect(accepted.bookings).toHaveLength(2);
    const list = (await as('BOOKING').get('/api/v2/contracts')).body;
    expect(list.total).toBe(2);
    const [k, s] = [list.items.find((c: { partyName: string }) => c.partyName === 'Kelkar'), list.items.find((c: { partyName: string }) => c.partyName === 'Shah')];
    expect(k.contractNumber).toBe(`BK-${YEAR}-0001`);
    expect(k.totalAmount + s.totalAmount).toBe(33600);
    expect(k.adults + k.children).toBe(3);
    expect(k.tripId).toBe(s.tripId);
    const trip = await prisma.trip.findUniqueOrThrow({ where: { id: k.tripId }, include: { travellers: true, services: true } });
    expect(trip).toMatchObject({ pax: 5, totalPayable: 33600, stage: 'CONFIRMING', status: 'confirmed' });
    expect(trip.services).toHaveLength(3);
    expect(trip.travellers.find(t => t.travellerId === travellers[0].id)?.contractId).toBe(k.id);
    expect(trip.travellers.find(t => t.travellerId === travellers[1].id)?.contractId).toBe(s.id);
    // Each family's money is its own: a receipt for the Kelkars leaves the Shah balance untouched.
    expect((await as('ACCOUNTS').post('/api/v2/receipts', { contractId: k.id, amount: 10000, mode: 'CASH', receivedAt: iso(0) })).status).toBe(201);
    const kd = (await as('BOOKING').get(`/api/v2/contracts/${k.id}`)).body;
    expect(kd).toMatchObject({ received: 10000, payments: { paid: 10000, balance: k.totalAmount - 10000 } });
    expect((await as('BOOKING').get(`/api/v2/contracts/${s.id}`)).body).toMatchObject({ received: 0, payments: { paid: 0, balance: s.totalAmount } });
    const due = (await as('BOOKING').get('/api/v2/contracts/payments-due?days=90')).body;
    expect([...new Set(due.map((d: { contractId: string }) => d.contractId))].sort()).toEqual([k.id, s.id].sort());
  });

  it('schedule edits must add up to the total and stay ordered; cancelling the only booking cancels the trip', async () => {
    const { accepted } = await acceptedQuote(false);
    const id = accepted.bookings[0];
    const bad = await as('BOOKING').put(`/api/v2/contracts/${id}/schedule`, { items: [{ seq: 1, label: 'Advance', dueDate: iso(0), amount: 10000 }, { seq: 2, label: 'Balance', dueDate: iso(-5), amount: 10000 }] });
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields.items).toMatch(/total ₹20,000/);
    const ok = await as('BOOKING').put(`/api/v2/contracts/${id}/schedule`, { items: [{ seq: 1, label: 'Token', dueDate: iso(0), amount: 5000 }, { seq: 2, label: 'Advance', dueDate: iso(7), amount: 15000 }, { seq: 3, label: 'Balance', dueDate: iso(25), amount: 13600 }] });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.schedule).toHaveLength(3);
    expect((await as('OPERATIONS').put(`/api/v2/contracts/${id}/schedule`, { items: [] })).status).toBe(403);

    // Money received from the family flows into instalment states.
    expect((await as('ACCOUNTS').post('/api/v2/receipts', { contractId: id, amount: 12000, mode: 'UPI', receivedAt: iso(0) })).status).toBe(201);
    const paid = (await as('BOOKING').get(`/api/v2/contracts/${id}`)).body;
    expect(paid.schedule.map((s: { status: string; paidAmount: number }) => [s.status, s.paidAmount])).toEqual([['PAID', 5000], ['PARTIAL', 7000], ['UPCOMING', 0]]);
    expect(paid.payments).toMatchObject({ paid: 12000, balance: 21600 });
    const due = await as('BOOKING').get('/api/v2/contracts/payments-due?days=10');
    expect(due.body.map((d: { label: string; outstanding: number }) => [d.label, d.outstanding])).toEqual([['Advance', 8000]]);

    // In progress / completed follow the trip stage; only cancellation is set on the booking itself.
    expect((await as('BOOKING').post(`/api/v2/contracts/${id}/status`, { status: 'IN_PROGRESS' })).status).toBe(409);
    expect((await as('BOOKING').post(`/api/v2/contracts/${id}/status`, { status: 'CANCELLED' })).status).toBe(400);
    const cancelled = await as('BOOKING').post(`/api/v2/contracts/${id}/status`, { status: 'CANCELLED', reason: 'Family emergency' });
    expect(cancelled.body.status).toBe('CANCELLED');
    // The last open booking on the trip: the trip is cancelled with it.
    expect(await prisma.trip.findUniqueOrThrow({ where: { id: ok.body.tripId } })).toMatchObject({ stage: 'CANCELLED', status: 'cancelled' });
    expect((await as('BOOKING').put(`/api/v2/contracts/${id}/schedule`, { items: [{ seq: 1, label: 'All', dueDate: iso(0), amount: 33600 }] })).status).toBe(409);
    expect((await as('BOOKING').get('/api/v2/contracts')).body.total).toBe(0);
    expect((await as('BOOKING').get('/api/v2/contracts?includeClosed=true')).body.total).toBe(1);
  });
});
