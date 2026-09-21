// What customers owe (oldest invoice first, grouped by how late it is) and
// what a trip made — both read from the books, so they can never disagree
// with the ledger.
import { describe, it, expect, beforeEach } from 'vitest';
import { hasTestDb, prisma, resetDb, seedUser, seedCustomer, seedCompany, seedTrip, seedVendor } from './helpers/db';
import { as, USER_IDS } from './helpers/app';

const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const day = (d: number) => new Date(Date.parse(`${istToday()}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);
const line = (over: Record<string, unknown> = {}) => ({ description: 'Tour package', quantity: 1, rate: 100_000, gstRate: 5, ...over });
const invoice = (over: Record<string, unknown> = {}) => ({
  invoiceDate: istToday(), customerId: 'CUS-2026-0001', customerName: 'Test Customer', placeOfSupplyStateCode: '29',
  tripIds: ['GK-2026-0001'], items: [line()], ...over,
});

describe.skipIf(!hasTestDb)('finance read models', () => {
  beforeEach(async () => {
    await resetDb();
    for (const role of ['ADMIN', 'BOOKING', 'ACCOUNTS', 'OPERATIONS'] as const) await seedUser(USER_IDS[role], role);
    await seedCompany({ stateCode: '29', state: 'Karnataka' });
    await seedCustomer();
    await seedTrip('GK-2026-0001', { customerId: 'CUS-2026-0001', totalPayable: 105_000 });
  });

  it('money received settles what is owed first and only then waits as an advance', async () => {
    await as('ACCOUNTS').post('/api/invoices', invoice({ dueDate: day(-40) }));
    const r = await as('ACCOUNTS').post('/api/v2/receipts', { tripId: 'GK-2026-0001', amount: 130_000, mode: 'BANK_TRANSFER', receivedAt: istToday() });
    expect(r.status).toBe(201);
    const entry = (await as('ACCOUNTS').get(`/api/v2/ledger/entries/${r.body.ledgerTransactionId}`)).body;
    expect(entry.lines.map((l: { code: string; debit: number; credit: number }) => [l.code, l.debit, l.credit]))
      .toEqual([['1010', 130_000, 0], ['1100', 0, 105_000], ['2100', 0, 25_000]]);   // dues cleared, the rest held
    expect((await as('ACCOUNTS').get('/api/v2/ledger/trial-balance')).body.difference).toBe(0);
  });

  it('what customers owe is aged from the oldest invoice, and unused money is shown against it', async () => {
    await as('ACCOUNTS').post('/api/invoices', invoice({ invoiceDate: day(-75), dueDate: day(-70), items: [line({ rate: 50_000 })] }));
    // A trip can only be invoiced once, so the later bills are plain customer invoices.
    await as('ACCOUNTS').post('/api/invoices', invoice({ invoiceDate: day(-20), dueDate: day(-10), tripIds: [], items: [line({ rate: 30_000 })] }));
    await as('ACCOUNTS').post('/api/invoices', invoice({ invoiceDate: day(-2), dueDate: day(20), tripIds: [], items: [line({ rate: 20_000 })] }));
    // Pays off the oldest and part of the next.
    await as('ACCOUNTS').post('/api/v2/receipts', { customerId: 'CUS-2026-0001', amount: 60_000, mode: 'CASH', receivedAt: istToday() });

    const r = await as('ACCOUNTS').get('/api/v2/finance/receivables');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const customer = r.body.customers[0];
    expect(customer).toMatchObject({ customerId: 'CUS-2026-0001', customerName: 'Test Customer' });
    // 52,500 + 31,500 + 21,000 billed; 60,000 received → 45,000 left.
    expect(customer.outstanding).toBe(45_000);
    expect(customer.invoices.map((i: { outstanding: number; daysOverdue: number }) => i.outstanding)).toEqual([24_000, 21_000]);
    expect(customer.invoices[0].daysOverdue).toBe(10);
    expect(r.body.total).toBe(45_000);
    expect(r.body.overdue).toBe(24_000);
    expect(r.body.buckets.find((b: { key: string }) => b.key === '1-30').amount).toBe(24_000);
    expect(r.body.buckets.find((b: { key: string }) => b.key === 'current').amount).toBe(21_000);
  });

  it('a trip shows what it billed, what it really cost and the margin, next to what was planned', async () => {
    await seedVendor('VEN-2026-0001', { name: 'Ganga View Hotel' });
    // Planned: a hotel booking costed at 30,000.
    await as('BOOKING').post('/api/v2/ops/trips/GK-2026-0001/hotel-bookings', { hotelName: 'Ganga View', checkIn: day(5), checkOut: day(7), costAmount: 30_000, sellAmount: 40_000 });
    // Actual: the hotel bill came in higher, plus fuel on the road.
    await as('ACCOUNTS').post('/api/v2/payables/bills', { vendorId: 'VEN-2026-0001', billNumber: 'GV/9', billDate: day(-1), category: 'HOTEL', amount: 34_000, gstAmount: 0, tripId: 'GK-2026-0001' });
    await as('OPERATIONS').post('/api/v2/expenses', { date: day(-1), category: 'TRIP_TRANSPORT', amount: 6_000, paidBy: 'CASH', description: 'Diesel and tolls', tripId: 'GK-2026-0001' });
    await as('ACCOUNTS').post('/api/invoices', invoice());
    await as('ACCOUNTS').post('/api/v2/receipts', { tripId: 'GK-2026-0001', amount: 50_000, mode: 'UPI', receivedAt: istToday() });

    const p = await as('BOOKING').get('/api/v2/finance/trips/GK-2026-0001/profit');
    expect(p.status, JSON.stringify(p.body)).toBe(200);
    expect(p.body).toMatchObject({ revenue: 100_000, revenueBasis: 'invoiced', actualCost: 40_000, plannedCost: 30_000, margin: 60_000, marginPct: 60, received: 50_000, balance: 50_000 });
    expect(p.body.costLines.map((l: { label: string; actual: number; planned: number }) => [l.label, l.actual, l.planned]))
      .toEqual([['Hotels', 34_000, 30_000], ['Transport', 6_000, 0]]);

    // Before any invoice, the bookings' value is used and the answer says so.
    await seedTrip('GK-2026-0002', { customerId: 'CUS-2026-0001', totalPayable: 60_000 });
    const early = (await as('BOOKING').get('/api/v2/finance/trips/GK-2026-0002/profit')).body;
    expect(early).toMatchObject({ revenue: 60_000, revenueBasis: 'contracted', actualCost: 0, margin: 60_000 });

    expect((await as('OPERATIONS').get('/api/v2/finance/trips/GK-2026-0001/profit')).status).toBe(403);
    expect((await as('OPERATIONS').get('/api/v2/finance/receivables')).status).toBe(403);
  });

  it('the money page adds up the period from the books: billed, spent, in hand and owed both ways', async () => {
    await seedVendor('VEN-2026-0001', { name: 'Ganga View Hotel' });
    await as('ACCOUNTS').post('/api/invoices', invoice());                                     // 1,00,000 + 5,000 GST
    await as('ACCOUNTS').post('/api/v2/receipts', { tripId: 'GK-2026-0001', amount: 60_000, mode: 'CASH', receivedAt: istToday() });
    await as('ACCOUNTS').post('/api/v2/payables/bills', { vendorId: 'VEN-2026-0001', billNumber: 'GV/11', billDate: istToday(), category: 'HOTEL', amount: 31_500, gstAmount: 1_500, tripId: 'GK-2026-0001' });
    await as('OPERATIONS').post('/api/v2/expenses', { date: istToday(), category: 'OFFICE', amount: 2_000, paidBy: 'CASH', description: 'Stationery' });

    const s = (await as('ACCOUNTS').get(`/api/v2/finance/summary?from=${day(-30)}&to=${istToday()}`)).body;
    expect(s).toMatchObject({ income: 100_000, expense: 32_000, profit: 68_000 });
    expect(s.cashInHand).toBe(58_000);                       // 60,000 in, 2,000 out
    expect(s.owedToUs).toBe(45_000);                         // 1,05,000 billed less 60,000 received
    expect(s.owedBySupplier).toBe(31_500);
    expect(s.tax).toMatchObject({ outputGst: 5_000, inputGst: 1_500, netGst: 3_500 });
    expect(s.months.at(-1)).toMatchObject({ income: 100_000, expense: 32_000 });
    expect(s.topTrips[0]).toMatchObject({ tripId: 'GK-2026-0001', billed: 100_000, cost: 30_000, margin: 70_000 });
    expect((await as('BOOKING').get('/api/v2/finance/summary')).status).toBe(403);
  });
});
