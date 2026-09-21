// Invoices in the books: issuing recognises sales, GST and TCS, money already
// received moves against the invoice, cancelling reverses everything, and
// credit and debit notes move the customer's dues the right way.
import { describe, it, expect, beforeEach } from 'vitest';
import { hasTestDb, prisma, resetDb, seedUser, seedCustomer, seedCompany, seedTrip } from './helpers/db';
import { as, USER_IDS } from './helpers/app';

const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const line = (over: Record<string, unknown> = {}) => ({ description: 'Kashi Yatra package', quantity: 1, rate: 100_000, gstRate: 5, ...over });
const invoiceBody = (over: Record<string, unknown> = {}) => ({
  invoiceDate: istToday(), customerId: 'CUS-2026-0001', customerName: 'Test Customer', placeOfSupplyStateCode: '29',
  tripIds: ['GK-2026-0001'], items: [line()], ...over,
});
const balance = async (code: string) => {
  const tb = (await as('ACCOUNTS').get('/api/v2/ledger/trial-balance')).body;
  return tb.accounts.find((a: { code: string }) => a.code === code)?.balance ?? 0;
};

describe.skipIf(!hasTestDb)('invoices in the books', () => {
  beforeEach(async () => {
    await resetDb();
    for (const role of ['ADMIN', 'BOOKING', 'ACCOUNTS', 'OPERATIONS'] as const) await seedUser(USER_IDS[role], role);
    await seedCompany({ stateCode: '29', state: 'Karnataka' });
    await seedCustomer();
    await seedTrip('GK-2026-0001', { customerId: 'CUS-2026-0001', totalPayable: 105_000 });
  });

  it('issuing an invoice recognises the sale and its GST, and moves money already received against it', async () => {
    await as('ACCOUNTS').post('/api/v2/receipts', { tripId: 'GK-2026-0001', amount: 40_000, mode: 'BANK_TRANSFER', receivedAt: istToday() });
    expect(await balance('2100')).toBe(40_000);              // held as a customer advance

    const inv = await as('ACCOUNTS').post('/api/invoices', invoiceBody());
    expect(inv.status, JSON.stringify(inv.body)).toBe(201);
    expect(inv.body).toMatchObject({ taxableAmount: 100_000, totalGstAmount: 5_000, totalAmount: 105_000, gstType: 'INTRA' });

    // Sales and GST are recognised; the customer owes the rest after the advance.
    expect(await balance('4000')).toBe(100_000);
    expect(await balance('2200')).toBe(5_000);
    expect(await balance('2100')).toBe(0);
    expect(await balance('1100')).toBe(65_000);
    expect((await as('ACCOUNTS').get('/api/v2/ledger/trial-balance')).body.difference).toBe(0);

    const entries = (await as('ACCOUNTS').get('/api/v2/ledger/entries?sourceType=invoice')).body.items;
    expect(entries[0]).toMatchObject({ sourceType: 'invoice', sourceId: inv.body.id, customerId: 'CUS-2026-0001', tripId: 'GK-2026-0001' });
    expect((await as('ACCOUNTS').get('/api/v2/ledger/entries?sourceType=advance_adjust')).body.total).toBe(1);
  });

  it('cancelling an invoice reverses the sale and puts the advance back', async () => {
    await as('ACCOUNTS').post('/api/v2/receipts', { tripId: 'GK-2026-0001', amount: 40_000, mode: 'CASH', receivedAt: istToday() });
    const inv = (await as('ACCOUNTS').post('/api/invoices', invoiceBody())).body;
    const cancelled = await as('ACCOUNTS').post(`/api/invoices/${inv.id}/cancel`, { reason: 'Raised on the wrong customer' });
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);

    expect(await balance('4000')).toBe(0);
    expect(await balance('2200')).toBe(0);
    expect(await balance('1100')).toBe(0);
    expect(await balance('2100')).toBe(40_000);              // the money is an advance again
    expect((await as('ACCOUNTS').get('/api/v2/ledger/trial-balance')).body.difference).toBe(0);
    expect(await prisma.invoice.count()).toBe(1);            // the invoice itself is kept, cancelled
  });

  it('a credit note takes the sale back; a debit note charges more', async () => {
    const inv = (await as('ACCOUNTS').post('/api/invoices', invoiceBody())).body;
    const cn = await as('ACCOUNTS').post('/api/credit-notes', {
      invoiceId: inv.id, date: istToday(), reason: 'Two seats cancelled', items: [line({ rate: 20_000 })],
    });
    expect(cn.status, JSON.stringify(cn.body)).toBe(201);
    expect(await balance('4000')).toBe(80_000);
    expect(await balance('1100')).toBe(84_000);

    const dn = await as('ACCOUNTS').post('/api/debit-notes', {
      invoiceId: inv.id, date: istToday(), reason: 'Extra night added', items: [line({ rate: 10_000 })],
    });
    expect(dn.status, JSON.stringify(dn.body)).toBe(201);
    expect(await balance('4000')).toBe(90_000);
    expect(await balance('1100')).toBe(94_500);
    expect((await as('ACCOUNTS').get('/api/v2/ledger/trial-balance')).body.difference).toBe(0);
  });

  it('TCS is charged on an overseas package only above the year’s limit, and only when the rule is on', async () => {
    await prisma.trip.update({ where: { id: 'GK-2026-0001' }, data: { isInternational: true } });
    const off = (await as('ACCOUNTS').post('/api/invoices', invoiceBody({ items: [line({ rate: 800_000 })] }))).body;
    expect(off.tcsAmount ?? 0).toBe(0);                       // the rule ships switched off
    await as('ACCOUNTS').post(`/api/invoices/${off.id}/cancel`, { reason: 'Testing the rule' });

    await as('ADMIN').put('/api/v2/tax-rules/TCS_OVERSEAS_PACKAGE', { rate: 5, threshold: 700_000, enabled: true, effectiveFrom: '2024-04-01' });
    const inv = await as('ACCOUNTS').post('/api/invoices', invoiceBody({ items: [line({ rate: 800_000 })] }));
    expect(inv.status, JSON.stringify(inv.body)).toBe(201);
    // 8,40,000 billed, 7,00,000 free this year → 5% of 1,40,000.
    expect(inv.body).toMatchObject({ taxableAmount: 800_000, totalGstAmount: 40_000, tcsRate: 5, tcsAmount: 7_000, totalAmount: 847_000 });
    expect(await balance('2210')).toBe(7_000);
    expect(await balance('1100')).toBe(847_000);
    expect((await as('ACCOUNTS').get('/api/v2/ledger/trial-balance')).body.difference).toBe(0);
  });
});
