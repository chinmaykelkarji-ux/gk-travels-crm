// Unified quotation engine through the real app: per-person bands, option
// groups, parties, GST, approval gate, versions, acceptance and the
// customer-safe view.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { hasTestDb, prisma, resetDb, seedUser, seedCompany } from './helpers/db';
import { as, USER_IDS } from './helpers/app';

const YEAR = new Date().getFullYear();
const iso = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

async function enquiry() {
  const r = await as('BOOKING').post('/api/v2/enquiries', { newCustomer: { name: 'Kelkar Family', phone: '9000000001' }, destination: 'Bali', adults: 2, children: 1, infants: 1, departureDate: iso(40), returnDate: iso(46) });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body as { id: string; customer: { id: string } };
}

const flights = (key: string, sel: boolean, adult: number, child: number, desc: string) => ({
  key, serviceType: 'FLIGHT', description: desc, pricingBasis: 'PER_PERSON', optionGroupKey: 'flights', isSelectedOption: sel,
  rates: [{ band: 'ADULT', count: 2, costPrice: adult - 500, sellPrice: adult }, { band: 'CHILD', count: 1, costPrice: child - 500, sellPrice: child }, { band: 'INFANT', count: 1, costPrice: 1000, sellPrice: 1200 }],
});
const BODY = {
  title: 'Bali family package',
  gstMode: 'EXCLUDED', gstRate: 5,
  optionGroups: [{ key: 'flights', name: 'Flight options' }],
  items: [
    flights('fa', true, 6500, 5000, 'IndiGo 6E-123'),
    flights('fb', false, 9000, 7000, 'Air India AI-456'),
    { key: 'hotel', serviceType: 'HOTEL', description: 'Seminyak resort, 2 rooms × 3 nights', pricingBasis: 'PER_ROOM', costPrice: 4000, sellPrice: 5000, quantity: 2, nights: 3 },
    { key: 'xfer', serviceType: 'TRANSFER', description: 'Airport transfers', pricingBasis: 'PER_GROUP', costPrice: 3000, sellPrice: 4000, internalNote: 'Use Made' },
  ],
  inclusions: 'Breakfast', exclusions: 'Visa on arrival', paymentPolicy: '50% advance',
};

describe.skipIf(!hasTestDb)('quotations v2', () => {
  beforeAll(async () => { await resetDb(); });
  beforeEach(async () => {
    await resetDb();
    await seedCompany();
    for (const role of ['ADMIN', 'BOOKING', 'ACCOUNTS', 'OPERATIONS'] as const) await seedUser(USER_IDS[role], role);
  });

  it('creates a draft with a GK-Q number, snapshots pax, stores computed totals and moves the enquiry to IN_PROGRESS', async () => {
    const e = await enquiry();
    const r = await as('BOOKING').post('/api/v2/quotations', { enquiryId: e.id, ...BODY });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body).toMatchObject({ quoteNumber: `GK-Q-${YEAR}-0001`, status: 'DRAFT', version: 1, isCurrent: true, approvalStatus: 'NOT_REQUIRED', adults: 2, children: 1, infants: 1 });
    expect(r.body.totals).toMatchObject({ subtotal: 53200, tax: 2660, total: 55860, cost: 44500, pax: 4, perPerson: 13965 });
    expect(r.body.items.find((i: { description: string }) => i.description === 'Air India AI-456').totals.included).toBe(false);
    const row = await prisma.salesQuote.findUniqueOrThrow({ where: { id: r.body.id } });
    expect(Number(row.totalAmount)).toBe(55860);
    expect(Number(row.costAmount)).toBe(44500);
    expect((await prisma.enquiry.findUniqueOrThrow({ where: { id: e.id } })).status).toBe('IN_PROGRESS');
    expect((await as('OPERATIONS').post('/api/v2/quotations', { enquiryId: e.id, ...BODY })).status).toBe(403);
    // v1 list still reads the same quote with the same total.
    const v1 = await as('BOOKING').get('/api/sales-quotes');
    expect(v1.body[0].totalAmount).toBe(55860);
  });

  it('validates option groups (one selected), unknown parties, per-person bands', async () => {
    const e = await enquiry();
    const two = await as('BOOKING').post('/api/v2/quotations', { enquiryId: e.id, ...BODY, items: [flights('fa', true, 6500, 5000, 'A'), flights('fb', true, 9000, 7000, 'B')] });
    expect(two.status).toBe(400);
    expect(JSON.stringify(two.body.error.fields)).toMatch(/exactly one selected/);
    const orphan = await as('BOOKING').post('/api/v2/quotations', { enquiryId: e.id, items: [{ key: 'x', description: 'x', pricingBasis: 'PER_UNIT', partyKey: 'ghost', sellPrice: 1 }] });
    expect(orphan.status).toBe(400);
    const noBand = await as('BOOKING').post('/api/v2/quotations', { enquiryId: e.id, items: [{ key: 'x', description: 'x', pricingBasis: 'PER_PERSON', rates: [] }] });
    expect(noBand.status).toBe(400);
  });

  it('selecting another option recomputes totals; edits are refused once sent; new versions carry everything across', async () => {
    const e = await enquiry();
    const q = (await as('BOOKING').post('/api/v2/quotations', { enquiryId: e.id, ...BODY })).body;
    const group = q.optionGroups[0];
    const ai = q.items.find((i: { description: string }) => i.description === 'Air India AI-456');
    const sel = await as('BOOKING').post(`/api/v2/quotations/${q.id}/select-option`, { optionGroupId: group.id, itemId: ai.id });
    expect(sel.status).toBe(200);
    expect(sel.body.totals.subtotal).toBe(30000 + 26200 + 4000);
    expect((await as('BOOKING').post(`/api/v2/quotations/${q.id}/select-option`, { optionGroupId: group.id, itemId: q.items[2].id })).status).toBe(400);

    const sent = await as('BOOKING').post(`/api/v2/quotations/${q.id}/send`);
    expect(sent.status).toBe(200);
    expect(sent.body.status).toBe('SENT');
    expect((await prisma.enquiry.findUniqueOrThrow({ where: { id: e.id } })).status).toBe('QUOTED');
    expect((await as('BOOKING').put(`/api/v2/quotations/${q.id}`, { ...BODY })).status).toBe(409);
    expect((await as('BOOKING').post(`/api/v2/quotations/${q.id}/send`)).status).toBe(409);

    const v2 = await as('BOOKING').post(`/api/v2/quotations/${q.id}/new-version`);
    expect(v2.status, JSON.stringify(v2.body)).toBe(201);
    expect(v2.body).toMatchObject({ quoteNumber: `GK-Q-${YEAR}-0001-v2`, version: 2, status: 'DRAFT', parentQuoteId: q.id, isCurrent: true });
    expect(v2.body.items).toHaveLength(4);
    expect(v2.body.optionGroups).toHaveLength(1);
    expect(v2.body.totals.subtotal).toBe(60200);
    expect((await as('BOOKING').get(`/api/v2/quotations/${q.id}`)).body.isCurrent).toBe(false);
    const list = await as('BOOKING').get('/api/v2/quotations');
    expect(list.body.total).toBe(1);
    expect(list.body.items[0].quoteNumber).toBe(`GK-Q-${YEAR}-0001-v2`);
    expect((await as('BOOKING').get('/api/v2/quotations?currentOnly=false')).body.total).toBe(2);
    expect((await as('BOOKING').get(`/api/v2/quotations/${q.id}`)).body.versions).toHaveLength(2);

    // Editing the new version keeps totals in sync and the discount pro-rata.
    const upd = await as('BOOKING').put(`/api/v2/quotations/${v2.body.id}`, { ...BODY, discountAmount: 2000, items: BODY.items.filter(i => i.key !== 'fb').map(i => ({ ...i, optionGroupKey: undefined })), optionGroups: [] });
    expect(upd.status, JSON.stringify(upd.body)).toBe(200);
    expect(upd.body.items).toHaveLength(3);
    expect(upd.body.totals.discountAmount).toBe(2000);
    expect(upd.body.totals.total).toBe(Math.round((53200 - 2000) * 1.05));
  });

  it('gates thin or negative margins behind admin approval before sending', async () => {
    const e = await enquiry();
    const loss = { ...BODY, optionGroups: [], items: [{ key: 'x', serviceType: 'HOTEL', description: 'Loss', pricingBasis: 'PER_UNIT', costPrice: 10000, sellPrice: 9000, quantity: 1 }] };
    const q = (await as('BOOKING').post('/api/v2/quotations', { enquiryId: e.id, ...loss })).body;
    expect(q.approvalStatus).toBe('PENDING');
    expect(q.totals.warnings[0]).toMatch(/cost exceeds sell/);
    const blocked = await as('BOOKING').post(`/api/v2/quotations/${q.id}/send`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.message).toMatch(/approval/);
    expect((await as('BOOKING').post(`/api/v2/quotations/${q.id}/approval`, { approve: true })).status).toBe(403);
    const approved = await as('ADMIN').post(`/api/v2/quotations/${q.id}/approval`, { approve: true, comment: 'Strategic customer' });
    expect(approved.body.approvalStatus).toBe('APPROVED');
    expect((await as('BOOKING').post(`/api/v2/quotations/${q.id}/send`)).status).toBe(200);
    expect(await prisma.activityLog.count({ where: { action: 'quote_approved' } })).toBe(1);
  });

  it('accepts with parties, marks the enquiry won, rejects need a reason, drafts alone can be deleted', async () => {
    const e = await enquiry();
    const withParties = {
      ...BODY, optionGroups: [], parties: [{ key: 'k', name: 'Kelkar', adults: 2, children: 1, infants: 1 }, { key: 's', name: 'Shah', adults: 2 }],
      items: [
        { key: 'hk', serviceType: 'HOTEL', description: 'Room K', pricingBasis: 'PER_ROOM', costPrice: 4000, sellPrice: 5000, quantity: 1, nights: 2, partyKey: 'k' },
        { key: 'hs', serviceType: 'HOTEL', description: 'Room S', pricingBasis: 'PER_ROOM', costPrice: 4000, sellPrice: 6000, quantity: 1, nights: 2, partyKey: 's' },
        { key: 'bus', serviceType: 'VEHICLE', description: 'Tempo traveller', pricingBasis: 'PER_GROUP', costPrice: 8000, sellPrice: 10000 },
      ],
      gstMode: 'NONE', gstRate: 0,
    };
    const q = (await as('BOOKING').post('/api/v2/quotations', { enquiryId: e.id, ...withParties })).body;
    expect(q.totals.parties.map((p: { name: string; total: number }) => [p.name, p.total])).toEqual([['Kelkar', 16667], ['Shah', 15333]]); // shared bus split 4:2 by pax
    expect((await as('BOOKING').post(`/api/v2/quotations/${q.id}/accept`, {})).status).toBe(409);      // draft
    await as('BOOKING').post(`/api/v2/quotations/${q.id}/send`);
    const viewed = await as('BOOKING').post(`/api/v2/quotations/${q.id}/status`, { status: 'VIEWED' });
    expect(viewed.body.viewedAt).not.toBeNull();
    expect((await as('BOOKING').post(`/api/v2/quotations/${q.id}/status`, { status: 'REJECTED' })).status).toBe(400);
    const acc = await as('BOOKING').post(`/api/v2/quotations/${q.id}/accept`, { splitByParty: true, note: 'Advance received' });
    expect(acc.status, JSON.stringify(acc.body)).toBe(200);
    expect(acc.body.quote.status).toBe('ACCEPTED');
    expect((await prisma.enquiry.findUniqueOrThrow({ where: { id: e.id } })).status).toBe('WON');
    expect((await as('BOOKING').post(`/api/v2/quotations/${q.id}/new-version`)).status).toBe(409);
    expect((await as('BOOKING').delete(`/api/v2/quotations/${q.id}`)).status).toBe(409);

    const dup = await as('BOOKING').post(`/api/v2/quotations/${q.id}/duplicate`);
    expect(dup.body).toMatchObject({ quoteNumber: `GK-Q-${YEAR}-0002`, status: 'DRAFT', version: 1 });
    expect(dup.body.parties).toHaveLength(2);
    expect((await as('BOOKING').delete(`/api/v2/quotations/${dup.body.id}`)).status).toBe(200);
    expect((await as('BOOKING').get('/api/v2/quotations')).body.total).toBe(1);
  });

  it('customer view carries selected options, per-band sell rates and party totals but never cost, margin, supplier or internal notes', async () => {
    const e = await enquiry();
    const q = (await as('BOOKING').post('/api/v2/quotations', { enquiryId: e.id, ...BODY })).body;
    const v = await as('BOOKING').get(`/api/v2/quotations/${q.id}/customer-view`);
    expect(v.status).toBe(200);
    const text = JSON.stringify(v.body);
    expect(text).not.toMatch(/costPrice|margin|internalNote|supplier|Use Made/i);
    expect(v.body.totals.total).toBe(55860);
    expect(v.body.optionGroups[0].options).toHaveLength(2);
    expect(v.body.optionGroups[0].options[0].rates[0]).toEqual({ band: 'ADULT', count: 2, sellPrice: 6500 });
    expect(v.body.items.map((i: { description: string }) => i.description)).toEqual(['Seminyak resort, 2 rooms × 3 nights', 'Airport transfers']);
    expect(v.body.inclusions).toBe('Breakfast');
  });
});
