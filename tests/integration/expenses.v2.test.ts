// Expenses: spending posted to the right account, GST held as input credit,
// staff money owed back and settled, cancellation by reversal, trip totals
// and permissions.
import { describe, it, expect, beforeEach } from 'vitest';
import { hasTestDb, prisma, resetDb, seedUser, seedCustomer, seedTrip, seedVendor } from './helpers/db';
import { as, USER_IDS } from './helpers/app';

const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const day = (d: number) => new Date(Date.parse(`${istToday()}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);
const expense = (over: Record<string, unknown> = {}) => ({ date: istToday(), category: 'TRIP_TRANSPORT', amount: 2_400, paidBy: 'CASH', description: 'Diesel and tolls to Varanasi', ...over });

describe.skipIf(!hasTestDb)('expenses v2', () => {
  beforeEach(async () => {
    await resetDb();
    for (const role of ['ADMIN', 'BOOKING', 'ACCOUNTS', 'OPERATIONS'] as const) await seedUser(USER_IDS[role], role);
    await seedCustomer();
    await seedTrip('GK-2026-0001', { customerId: 'CUS-2026-0001' });
  });

  it('spending on the road posts the cost and takes the money from where it came', async () => {
    const r = await as('OPERATIONS').post('/api/v2/expenses', expense({ tripId: 'GK-2026-0001' }));
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body).toMatchObject({ id: `EXP-${new Date().getFullYear()}-0001`, amount: 2_400, status: 'POSTED', categoryLabel: 'Fuel, tolls, parking', paidByLabel: 'Office cash', trip: { id: 'GK-2026-0001' } });

    const entry = (await as('ACCOUNTS').get(`/api/v2/ledger/entries/${r.body.ledgerTransactionId}`)).body;
    expect(entry.lines.map((l: { code: string; debit: number; credit: number }) => [l.code, l.debit, l.credit])).toEqual([['5010', 2_400, 0], ['1000', 0, 2_400]]);
    expect(entry).toMatchObject({ sourceType: 'expense', tripId: 'GK-2026-0001' });

    // With GST on the bill, the tax is held separately as input credit.
    const withGst = await as('ACCOUNTS').post('/api/v2/expenses', expense({ category: 'OFFICE', amount: 1_180, gstAmount: 180, description: 'Printer cartridges', paidBy: 'UPI' }));
    expect(withGst.status).toBe(201);
    expect((await as('ACCOUNTS').get(`/api/v2/ledger/entries/${withGst.body.ledgerTransactionId}`)).body.lines.map((l: { code: string; debit: number }) => [l.code, l.debit]))
      .toEqual([['6020', 1_000], ['1300', 180], ['1010', 0]]);
    expect((await as('ACCOUNTS').get('/api/v2/ledger/trial-balance')).body.difference).toBe(0);

    const list = (await as('ACCOUNTS').get('/api/v2/expenses')).body;
    expect(list.total).toBe(2);
    expect(list.byCategory.map((c: { category: string; amount: number }) => [c.category, c.amount])).toEqual([['TRIP_TRANSPORT', 2_400], ['OFFICE', 1_180]]);
    expect((await as('ACCOUNTS').get('/api/v2/expenses?tripId=GK-2026-0001')).body.total).toBe(1);
  });

  it('money a staff member put in is owed back to them until it is settled', async () => {
    const e = await as('OPERATIONS').post('/api/v2/expenses', expense({ paidBy: 'STAFF', paidByUserId: USER_IDS.OPERATIONS, amount: 1_500, description: 'Tips and parking at Kashi' }));
    expect(e.status, JSON.stringify(e.body)).toBe(201);
    expect((await as('ACCOUNTS').get(`/api/v2/ledger/entries/${e.body.ledgerTransactionId}`)).body.lines.map((l: { code: string; debit: number; credit: number }) => [l.code, l.debit, l.credit]))
      .toEqual([['5010', 1_500, 0], ['2400', 0, 1_500]]);
    expect((await as('ACCOUNTS').get('/api/v2/expenses/reimbursements')).body).toEqual([{ userId: USER_IDS.OPERATIONS, name: USER_IDS.OPERATIONS, owed: 1_500 }]);

    // Paying back more than is owed is refused.
    expect((await as('ACCOUNTS').post('/api/v2/expenses/reimbursements', { userId: USER_IDS.OPERATIONS, amount: 2_000, mode: 'CASH', paidAt: istToday() })).status).toBe(400);
    const paid = await as('ACCOUNTS').post('/api/v2/expenses/reimbursements', { userId: USER_IDS.OPERATIONS, amount: 1_500, mode: 'CASH', paidAt: istToday() });
    expect(paid.status).toBe(201);
    expect(paid.body.owed).toEqual([]);
    const tb = (await as('ACCOUNTS').get('/api/v2/ledger/trial-balance')).body;
    expect(tb.accounts.find((a: { code: string }) => a.code === '2400')?.balance ?? 0).toBe(0);
    expect(tb.accounts.find((a: { code: string }) => a.code === '1000').balance).toBe(-1_500);  // cash went out
    expect(tb.difference).toBe(0);
    // Operations record spending but do not settle it.
    expect((await as('OPERATIONS').post('/api/v2/expenses/reimbursements', { userId: USER_IDS.OPERATIONS, amount: 10, mode: 'CASH', paidAt: istToday() })).status).toBe(403);
  });

  it('cancelling reverses the posting and keeps the row; nonsense is refused', async () => {
    const e = (await as('ACCOUNTS').post('/api/v2/expenses', expense())).body;
    const cancelled = await as('ACCOUNTS').post(`/api/v2/expenses/${e.id}/cancel`, { reason: 'Recorded twice' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toMatchObject({ status: 'CANCELLED', cancelReason: 'Recorded twice' });
    expect((await as('ACCOUNTS').post(`/api/v2/expenses/${e.id}/cancel`, { reason: 'again' })).status).toBe(409);
    expect(await prisma.expense.count()).toBe(1);
    expect((await as('ACCOUNTS').get('/api/v2/ledger/trial-balance')).body.accounts.find((a: { code: string }) => a.code === '5010')?.balance ?? 0).toBe(0);
    expect((await as('ACCOUNTS').get('/api/v2/expenses')).body.total).toBe(0);
    expect((await as('ACCOUNTS').get('/api/v2/expenses?includeCancelled=true')).body.total).toBe(1);

    expect((await as('ACCOUNTS').post('/api/v2/expenses', expense({ amount: 0 }))).status).toBe(400);
    expect((await as('ACCOUNTS').post('/api/v2/expenses', expense({ gstAmount: 9_999 }))).status).toBe(400);
    expect((await as('ACCOUNTS').post('/api/v2/expenses', expense({ paidBy: 'STAFF' }))).status).toBe(400);           // who paid?
    expect((await as('ACCOUNTS').post('/api/v2/expenses', expense({ tripId: 'GK-9999-9999' }))).status).toBe(400);
    expect((await as('ACCOUNTS').post('/api/v2/expenses', expense({ description: '' }))).status).toBe(400);
  });

  it('a supplier can be named on an expense, and only the right roles may record or settle', async () => {
    await seedVendor('VEN-2026-0001', { name: 'Highway Dhaba' });
    const e = await as('OPERATIONS').post('/api/v2/expenses', expense({ category: 'TRIP_FOOD', vendorId: 'VEN-2026-0001', amount: 3_200, description: 'Lunch for 42 passengers', tripId: 'GK-2026-0001' }));
    expect(e.status).toBe(201);
    expect(e.body.vendor).toMatchObject({ name: 'Highway Dhaba' });
    expect((await as('ACCOUNTS').get(`/api/v2/ledger/entries/${e.body.ledgerTransactionId}`)).body.lines[0].code).toBe('5040');

    expect((await as('BOOKING').get('/api/v2/expenses')).status).toBe(200);          // sales can see trip spending
    expect((await as('BOOKING').post('/api/v2/expenses', expense())).status).toBe(403); // but not record it
    expect((await as('BOOKING').post(`/api/v2/expenses/${e.body.id}/cancel`, { reason: 'no' })).status).toBe(403);
    expect((await as('OPERATIONS').get('/api/v2/expenses/reimbursements')).status).toBe(200);
  });
});
