// Supplier bills and payments: cost to the right account, GST held as input
// credit, part payments and advances, aging, cancellation by reversal, the
// classic payables import and permissions.
import { describe, it, expect, beforeEach } from 'vitest';
import { hasTestDb, prisma, resetDb, seedUser, seedCustomer, seedTrip, seedVendor } from './helpers/db';
import { as, USER_IDS } from './helpers/app';

const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const day = (d: number) => new Date(Date.parse(`${istToday()}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);
const bill = (over: Record<string, unknown> = {}) => ({ vendorId: 'VEN-2026-0001', billNumber: 'GV/2026/41', billDate: day(-10), dueDate: day(5), category: 'HOTEL', amount: 47_200, gstAmount: 2_200, ...over });

describe.skipIf(!hasTestDb)('supplier bills v2', () => {
  beforeEach(async () => {
    await resetDb();
    for (const role of ['ADMIN', 'BOOKING', 'ACCOUNTS', 'OPERATIONS'] as const) await seedUser(USER_IDS[role], role);
    await seedCustomer();
    await seedVendor('VEN-2026-0001', { name: 'Ganga View Hotel', kind: 'HOTEL' });
    await seedTrip('GK-2026-0001', { customerId: 'CUS-2026-0001' });
  });

  it('a hotel bill books the cost, holds the GST as input credit and owes the supplier', async () => {
    const r = await as('ACCOUNTS').post('/api/v2/payables/bills', bill({ tripId: 'GK-2026-0001', description: 'Group stay, 20 rooms' }));
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body).toMatchObject({ id: `BILL-${new Date().getFullYear()}-0001`, status: 'OPEN', amount: 47_200, gstAmount: 2_200, netAmount: 45_000, paid: 0, outstanding: 47_200, categoryLabel: 'Hotel', vendor: { name: 'Ganga View Hotel' } });

    const entry = (await as('ACCOUNTS').get(`/api/v2/ledger/entries/${r.body.ledgerTransactionId}`)).body;
    expect(entry.lines.map((l: { code: string; debit: number; credit: number }) => [l.code, l.debit, l.credit])).toEqual([['5000', 45_000, 0], ['1300', 2_200, 0], ['2000', 0, 47_200]]);
    expect(entry).toMatchObject({ sourceType: 'vendor_bill', vendorId: 'VEN-2026-0001', tripId: 'GK-2026-0001' });
    expect((await as('ACCOUNTS').get('/api/v2/ledger/trial-balance')).body.difference).toBe(0);

    // The same bill number from the same supplier is refused.
    expect((await as('ACCOUNTS').post('/api/v2/payables/bills', bill())).status).toBe(409);
    // Nonsense is refused: more GST than the bill, a due date before the bill date, an unknown supplier.
    expect((await as('ACCOUNTS').post('/api/v2/payables/bills', bill({ billNumber: 'X1', gstAmount: 99_000 }))).status).toBe(400);
    expect((await as('ACCOUNTS').post('/api/v2/payables/bills', bill({ billNumber: 'X2', dueDate: day(-20) }))).status).toBe(400);
    expect((await as('ACCOUNTS').post('/api/v2/payables/bills', bill({ billNumber: 'X3', vendorId: 'VEN-9999-9999' }))).status).toBe(400);
  });

  it('payments settle a bill, cannot overpay it, and an advance waits until a bill arrives', async () => {
    const b = (await as('ACCOUNTS').post('/api/v2/payables/bills', bill({ gstAmount: 0, amount: 40_000 }))).body;
    const part = await as('ACCOUNTS').post('/api/v2/payables/payments', { vendorId: 'VEN-2026-0001', billId: b.id, amount: 15_000, mode: 'BANK_TRANSFER', paidAt: day(-2), reference: 'NEFT-22' });
    expect(part.status, JSON.stringify(part.body)).toBe(201);
    expect((await as('ACCOUNTS').get(`/api/v2/ledger/entries/${part.body.ledgerTransactionId}`)).body.lines.map((l: { code: string; debit: number }) => [l.code, l.debit])).toEqual([['2000', 15_000], ['1010', 0]]);
    expect((await as('ACCOUNTS').get(`/api/v2/payables/bills/${b.id}`)).body).toMatchObject({ paid: 15_000, outstanding: 25_000, status: 'OPEN' });

    const tooMuch = await as('ACCOUNTS').post('/api/v2/payables/payments', { vendorId: 'VEN-2026-0001', billId: b.id, amount: 30_000, mode: 'CASH', paidAt: day(0) });
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.error.message).toMatch(/Only ₹25,000 is left/);
    await as('ACCOUNTS').post('/api/v2/payables/payments', { vendorId: 'VEN-2026-0001', billId: b.id, amount: 25_000, mode: 'CASH', paidAt: day(0) });
    expect((await as('ACCOUNTS').get(`/api/v2/payables/bills/${b.id}`)).body).toMatchObject({ outstanding: 0, status: 'PAID' });

    // An advance with no bill sits in "Advances to suppliers" until it is applied.
    const adv = (await as('ACCOUNTS').post('/api/v2/payables/payments', { vendorId: 'VEN-2026-0001', amount: 10_000, mode: 'UPI', paidAt: day(0) })).body;
    expect((await as('ACCOUNTS').get(`/api/v2/ledger/entries/${adv.ledgerTransactionId}`)).body.lines.map((l: { code: string; debit: number }) => [l.code, l.debit])).toEqual([['1200', 10_000], ['1010', 0]]);
    const later = (await as('ACCOUNTS').post('/api/v2/payables/bills', bill({ billNumber: 'GV/2026/55', amount: 12_000, gstAmount: 0 }))).body;
    const applied = await as('ACCOUNTS').post(`/api/v2/payables/payments/${adv.id}/apply`, { billId: later.id });
    expect(applied.status, JSON.stringify(applied.body)).toBe(200);
    expect(applied.body.billId).toBe(later.id);
    expect((await as('ACCOUNTS').get(`/api/v2/payables/bills/${later.id}`)).body).toMatchObject({ paid: 10_000, outstanding: 2_000 });
    const tb = (await as('ACCOUNTS').get('/api/v2/ledger/trial-balance')).body;
    expect(tb.accounts.find((a: { code: string }) => a.code === '1200').balance).toBe(0);   // the advance is used up
    expect(tb.difference).toBe(0);
  });

  it('what is owed is grouped by how late it is, worst supplier first', async () => {
    await seedVendor('VEN-2026-0002', { name: 'Sai Travels', kind: 'TRANSPORT' });
    await as('ACCOUNTS').post('/api/v2/payables/bills', bill({ billNumber: 'A', amount: 10_000, gstAmount: 0, billDate: day(-100), dueDate: day(-95) }));
    await as('ACCOUNTS').post('/api/v2/payables/bills', bill({ billNumber: 'B', amount: 20_000, gstAmount: 0, billDate: day(-40), dueDate: day(-35) }));
    await as('ACCOUNTS').post('/api/v2/payables/bills', bill({ billNumber: 'C', vendorId: 'VEN-2026-0002', category: 'TRANSPORT', amount: 5_000, gstAmount: 0, billDate: day(-3), dueDate: day(10) }));

    const aging = (await as('ACCOUNTS').get('/api/v2/payables/aging')).body;
    expect(aging.total).toBe(35_000);
    expect(aging.overdue).toBe(30_000);
    expect(aging.buckets.map((b: { key: string; amount: number }) => [b.key, b.amount])).toEqual([['current', 5_000], ['1-30', 0], ['31-60', 20_000], ['61-90', 0], ['90+', 10_000]]);
    expect(aging.vendors.map((v: { vendor: string; outstanding: number; overdue: number }) => [v.vendor, v.outstanding, v.overdue])).toEqual([['Ganga View Hotel', 30_000, 30_000], ['Sai Travels', 5_000, 0]]);

    const statement = (await as('ACCOUNTS').get('/api/v2/payables/vendors/VEN-2026-0001/statement')).body;
    expect(statement).toMatchObject({ vendor: { name: 'Ganga View Hotel' }, outstanding: 30_000, overdue: 30_000, unappliedAdvances: 0 });
    expect((await as('ACCOUNTS').get('/api/v2/payables/bills?vendorId=VEN-2026-0002')).body.items.map((b: { billNumber: string }) => b.billNumber)).toEqual(['C']);
  });

  it('cancelling reverses the posting and keeps the row; a bill with payments must be settled first', async () => {
    const b = (await as('ACCOUNTS').post('/api/v2/payables/bills', bill({ amount: 10_000, gstAmount: 0 }))).body;
    const pay = (await as('ACCOUNTS').post('/api/v2/payables/payments', { vendorId: 'VEN-2026-0001', billId: b.id, amount: 4_000, mode: 'CASH', paidAt: day(0) })).body;
    expect((await as('ACCOUNTS').post(`/api/v2/payables/bills/${b.id}/cancel`, { reason: 'Duplicate' })).status).toBe(409);

    expect((await as('ACCOUNTS').post(`/api/v2/payables/payments/${pay.id}/cancel`, { reason: 'Paid twice' })).status).toBe(200);
    expect((await as('ACCOUNTS').get(`/api/v2/payables/bills/${b.id}`)).body).toMatchObject({ paid: 0, outstanding: 10_000 });
    const cancelled = await as('ACCOUNTS').post(`/api/v2/payables/bills/${b.id}/cancel`, { reason: 'Supplier sent it twice' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toMatchObject({ status: 'CANCELLED', outstanding: 0 });
    expect(await prisma.vendorBill.count()).toBe(1);
    expect(await prisma.vendorPaymentV2.count()).toBe(1);
    const tb = (await as('ACCOUNTS').get('/api/v2/ledger/trial-balance')).body;
    expect(tb.accounts.find((a: { code: string }) => a.code === '2000')?.balance ?? 0).toBe(0);
    expect(tb.accounts.find((a: { code: string }) => a.code === '5000')?.balance ?? 0).toBe(0);
  });

  it('classic payables are brought in once, with what the old screen said was paid', async () => {
    await prisma.vendorPayment.createMany({ data: [
      { id: 'VP-OLD-1', vendorId: 'VEN-2026-0001', vendorName: 'Ganga View Hotel', tripId: 'GK-2026-0001', tripName: 'Kashi', description: 'Hotel rooms for the group', totalCost: 30_000, advancePaid: 10_000, outstanding: 20_000, isPaid: false, dueDate: day(-5), createdDate: day(-20), createdAt: new Date() },
      { id: 'VP-OLD-2', vendorId: 'VEN-2026-0001', vendorName: 'Ganga View Hotel', description: 'Bus hire to Sarnath', totalCost: 8_000, advancePaid: 0, outstanding: 0, isPaid: true, paidDate: day(-6), createdDate: day(-15), createdAt: new Date() },
      { id: 'VP-OLD-3', vendorId: 'VEN-2026-0001', vendorName: 'Ganga View Hotel', description: 'Placeholder row', totalCost: 0, advancePaid: 0, outstanding: 0, isPaid: false, createdDate: day(-9), createdAt: new Date() },
    ] });
    const r = (await as('ACCOUNTS').post('/api/v2/payables/import-classic')).body;
    expect(r).toMatchObject({ bills: 2, payments: 2, skipped: 1 });   // the empty row is skipped, not guessed at
    expect((await as('ACCOUNTS').post('/api/v2/payables/import-classic')).body.bills).toBe(0);

    const bills = await prisma.vendorBill.findMany({ orderBy: { billDate: 'asc' } });
    expect(bills.map(b => [b.legacyPayableId, b.category, Number(b.amount)])).toEqual([['VP-OLD-1', 'HOTEL', 30_000], ['VP-OLD-2', 'TRANSPORT', 8_000]]);
    expect(await prisma.vendorPayment.count()).toBe(3);               // the classic rows are untouched
    const aging = (await as('ACCOUNTS').get('/api/v2/payables/aging')).body;
    expect(aging.total).toBe(20_000);                                  // 30,000 less the 10,000 advance; the paid one is settled
    expect((await as('ACCOUNTS').get('/api/v2/ledger/trial-balance')).body.difference).toBe(0);
  });

  it('only finance roles see or record supplier money', async () => {
    const b = (await as('ADMIN').post('/api/v2/payables/bills', bill())).body;
    for (const role of ['BOOKING', 'OPERATIONS'] as const) {
      expect((await as(role).get('/api/v2/payables/bills')).status, role).toBe(403);
      expect((await as(role).get('/api/v2/payables/aging')).status, role).toBe(403);
      expect((await as(role).post('/api/v2/payables/bills', bill({ billNumber: 'Z' }))).status, role).toBe(403);
      expect((await as(role).post(`/api/v2/payables/bills/${b.id}/cancel`, { reason: 'no' })).status, role).toBe(403);
    }
    expect((await as('ACCOUNTS').get('/api/v2/payables/bills')).status).toBe(200);
  });
});
