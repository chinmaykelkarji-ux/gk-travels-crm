// Tax rules: rates as data with the day they start, admin-only edits, and
// the rest of the system taking its rates from them.
import { describe, it, expect, beforeEach } from 'vitest';
import { hasTestDb, prisma, resetDb, seedUser, seedCustomer } from './helpers/db';
import { as, USER_IDS } from './helpers/app';

const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const day = (d: number) => new Date(Date.parse(`${istToday()}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);

describe.skipIf(!hasTestDb)('tax rules v2', () => {
  beforeEach(async () => {
    await resetDb();
    for (const role of ['ADMIN', 'BOOKING', 'ACCOUNTS', 'OPERATIONS'] as const) await seedUser(USER_IDS[role], role);
    await seedCustomer();
  });

  it('lists the catalogue with its defaults and what each note says to verify', async () => {
    const r = await as('BOOKING').get('/api/v2/tax-rules');
    expect(r.status).toBe(200);
    const pkg = r.body.find((x: { code: string }) => x.code === 'GST_TOUR_PACKAGE');
    expect(pkg).toMatchObject({ name: 'GST on tour packages', kind: 'GST', basis: 'FULL_VALUE', defaultRate: 5, current: null, effectiveRate: 5 });
    expect(pkg.note).toMatch(/verify with CA/i);
    const tcs = r.body.find((x: { code: string }) => x.code === 'TCS_OVERSEAS_PACKAGE');
    expect(tcs).toMatchObject({ kind: 'TCS', defaultThreshold: 700_000, effectiveRate: 5 });
  });

  it('a rate change is a new row from a date, and the old one still applies to older days', async () => {
    expect((await as('BOOKING').put('/api/v2/tax-rules/GST_TOUR_PACKAGE', { rate: 12, effectiveFrom: day(0) })).status).toBe(403);
    const first = await as('ADMIN').put('/api/v2/tax-rules/GST_TOUR_PACKAGE', { rate: 5, effectiveFrom: '2024-04-01', note: 'Package rate without input credit' });
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    await as('ADMIN').put('/api/v2/tax-rules/GST_TOUR_PACKAGE', { rate: 12, effectiveFrom: day(0) });

    const today = (await as('ADMIN').get('/api/v2/tax-rules')).body.find((x: { code: string }) => x.code === 'GST_TOUR_PACKAGE');
    expect(today).toMatchObject({ effectiveRate: 12, current: { rate: 12, effectiveFrom: day(0) } });
    expect(today.history).toHaveLength(2);
    const back = (await as('ADMIN').get('/api/v2/tax-rules?on=2025-06-01')).body.find((x: { code: string }) => x.code === 'GST_TOUR_PACKAGE');
    expect(back.effectiveRate).toBe(5);

    // Saving the same start date again edits that row rather than stacking another.
    await as('ADMIN').put('/api/v2/tax-rules/GST_TOUR_PACKAGE', { rate: 18, effectiveFrom: day(0) });
    expect((await prisma.taxRule.count({ where: { code: 'GST_TOUR_PACKAGE' } }))).toBe(2);
    expect((await as('ADMIN').get('/api/v2/tax-rules')).body.find((x: { code: string }) => x.code === 'GST_TOUR_PACKAGE').effectiveRate).toBe(18);
    expect(await prisma.activityLog.count({ where: { action: 'tax_rule_set' } })).toBe(3);

    // Nonsense is refused.
    expect((await as('ADMIN').put('/api/v2/tax-rules/GST_TOUR_PACKAGE', { rate: 120, effectiveFrom: day(0) })).status).toBe(400);
    expect((await as('ADMIN').put('/api/v2/tax-rules/GST_TOUR_PACKAGE', { rate: 5, effectiveFrom: day(0), effectiveTo: day(-10) })).status).toBe(400);
    expect((await as('ADMIN').put('/api/v2/tax-rules/NOT_A_RULE', { rate: 5, effectiveFrom: day(0) })).status).toBe(404);
  });

  it('quotations and ticket fees take their rate from the rules', async () => {
    await as('ADMIN').put('/api/v2/tax-rules/GST_TOUR_PACKAGE', { rate: 12, effectiveFrom: '2024-04-01' });
    await as('ADMIN').put('/api/v2/tax-rules/GST_TICKET_SERVICE_FEE', { rate: 9, effectiveFrom: '2024-04-01' });

    const e = (await as('BOOKING').post('/api/v2/enquiries', { newCustomer: { name: 'Rao Family', phone: '9000000009' }, destination: 'Goa', adults: 2, departureDate: day(20) })).body;
    const q = await as('BOOKING').post('/api/v2/quotations', { enquiryId: e.id, items: [{ key: 'h', serviceType: 'HOTEL', description: 'Room', pricingBasis: 'PER_ROOM', costPrice: 4000, sellPrice: 5000, quantity: 1, nights: 1 }] });
    expect(q.status, JSON.stringify(q.body)).toBe(201);
    expect(q.body.gstRate).toBe(12);
    expect(q.body.totals.tax).toBe(600);                       // 12% of 5,000

    const ticket = await as('BOOKING').post('/api/v2/tickets', { mode: 'TRAIN', customerId: 'CUS-2026-0001', serviceFee: 200, segments: [{ fromName: 'Belagavi', toName: 'Pune', departAt: `${day(5)}T06:00` }], passengers: [{ name: 'Rao' }] });
    expect(ticket.status, JSON.stringify(ticket.body)).toBe(201);
    expect(ticket.body.fare).toMatchObject({ serviceFee: 200, serviceFeeGstPct: 9, serviceFeeGst: 18 });

    // A rate given by hand still wins.
    const fixed = await as('BOOKING').post('/api/v2/quotations', { enquiryId: e.id, gstRate: 5, items: [{ key: 'h', serviceType: 'HOTEL', description: 'Room', pricingBasis: 'PER_ROOM', costPrice: 4000, sellPrice: 5000, quantity: 1, nights: 1 }] });
    expect(fixed.body.gstRate).toBe(5);
  });
});
