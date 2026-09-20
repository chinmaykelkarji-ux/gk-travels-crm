// Customer receipts: recorded per family party, posted to the ledger in the
// same transaction, refunds limited to what was received, cancellation by
// reversal, the day book, the classic payments import and permissions.
import { describe, it, expect, beforeEach } from 'vitest';
import { hasTestDb, prisma, resetDb, seedUser, seedCustomer, seedTrip } from './helpers/db';
import { as, USER_IDS } from './helpers/app';

const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const day = (d: number) => new Date(Date.parse(`${istToday()}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);

async function tourWithParties() {
  const e = (await as('BOOKING').post('/api/v2/enquiries', { newCustomer: { name: 'Kelkar Family', phone: '9000000001' }, destination: 'Varanasi', adults: 4, departureDate: day(30), returnDate: day(35) })).body;
  const q = (await as('BOOKING').post('/api/v2/quotations', {
    enquiryId: e.id, gstMode: 'EXCLUDED', gstRate: 5,
    parties: [{ key: 'k', name: 'Kelkar', adults: 2 }, { key: 'j', name: 'Joshi', adults: 2 }],
    items: [
      { key: 'hk', serviceType: 'HOTEL', description: 'Room K', pricingBasis: 'PER_ROOM', costPrice: 4000, sellPrice: 5000, quantity: 1, nights: 2, partyKey: 'k' },
      { key: 'hj', serviceType: 'HOTEL', description: 'Room J', pricingBasis: 'PER_ROOM', costPrice: 4000, sellPrice: 5000, quantity: 1, nights: 2, partyKey: 'j' },
    ],
  })).body;
  await as('BOOKING').post(`/api/v2/quotations/${q.id}/send`);
  const acc = (await as('BOOKING').post(`/api/v2/quotations/${q.id}/accept`, { splitByParty: true })).body;
  const contracts = await Promise.all(acc.bookings.map((id: string) => as('ACCOUNTS').get(`/api/v2/contracts/${id}`).then(r => r.body)));
  return { customer: e.customer, kelkar: contracts.find(c => c.partyName === 'Kelkar'), joshi: contracts.find(c => c.partyName === 'Joshi'), tripId: contracts[0].tripId };
}

describe.skipIf(!hasTestDb)('customer receipts v2', () => {
  beforeEach(async () => {
    await resetDb();
    for (const role of ['ADMIN', 'BOOKING', 'ACCOUNTS', 'OPERATIONS'] as const) await seedUser(USER_IDS[role], role);
    await seedCustomer();
  });

  it('a family pays: the receipt posts to the books, moves only that family, and keeps the trip total in step', async () => {
    const { kelkar, joshi, tripId } = await tourWithParties();
    const r = await as('ACCOUNTS').post('/api/v2/receipts', { contractId: kelkar.id, amount: 5250, mode: 'UPI', receivedAt: day(-1), reference: 'UPI-7781' });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body).toMatchObject({ id: `RCP-${new Date().getFullYear()}-0001`, kind: 'RECEIPT', status: 'POSTED', amount: 5250, mode: 'UPI', modeLabel: 'UPI', tripId, contract: { partyName: 'Kelkar' } });

    // The ledger: money in against customer advances, in one balanced entry.
    const entry = (await as('ACCOUNTS').get(`/api/v2/ledger/entries/${r.body.ledgerTransactionId}`)).body;
    expect(entry).toMatchObject({ sourceType: 'receipt', sourceId: r.body.id, tripId, contractId: kelkar.id, amount: 5250 });
    expect(entry.lines.map((l: { code: string; debit: number; credit: number }) => [l.code, l.debit, l.credit])).toEqual([['1010', 5250, 0], ['2100', 0, 5250]]);
    expect((await as('ACCOUNTS').get('/api/v2/ledger/trial-balance')).body.difference).toBe(0);

    // Only the Kelkars' balance moves; the trip's cached total follows too.
    expect((await as('ACCOUNTS').get(`/api/v2/contracts/${kelkar.id}`)).body).toMatchObject({ received: 5250, payments: { paid: 5250 } });
    expect((await as('ACCOUNTS').get(`/api/v2/contracts/${joshi.id}`)).body).toMatchObject({ received: 0 });
    const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
    expect(Number(trip.paidAmount)).toBe(5250);
    expect(Number(trip.balanceDue)).toBe(Number(trip.totalPayable) - 5250);
    expect(await prisma.activityLog.count({ where: { action: 'receipt_recorded', entityId: kelkar.id } })).toBe(1);
  });

  it('refunds cannot exceed what that family paid, and cancelling a receipt reverses its posting without deleting it', async () => {
    const { kelkar } = await tourWithParties();
    const got = (await as('ACCOUNTS').post('/api/v2/receipts', { contractId: kelkar.id, amount: 4000, mode: 'CASH', receivedAt: day(-2) })).body;
    const tooMuch = await as('ACCOUNTS').post('/api/v2/receipts', { kind: 'REFUND', contractId: kelkar.id, amount: 6000, mode: 'CASH', receivedAt: day(0) });
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.error.message).toMatch(/a refund cannot be more/);

    const refund = await as('ACCOUNTS').post('/api/v2/receipts', { kind: 'REFUND', contractId: kelkar.id, amount: 1500, mode: 'CASH', receivedAt: day(0) });
    expect(refund.status).toBe(201);
    const refundEntry = (await as('ACCOUNTS').get(`/api/v2/ledger/entries/${refund.body.ledgerTransactionId}`)).body;
    expect(refundEntry.lines.map((l: { code: string; debit: number }) => [l.code, l.debit])).toEqual([['2100', 1500], ['1000', 0]]);
    expect((await as('ACCOUNTS').get(`/api/v2/contracts/${kelkar.id}`)).body.received).toBe(2500);

    const cancelled = await as('ACCOUNTS').post(`/api/v2/receipts/${got.id}/cancel`, { reason: 'Entered twice' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toMatchObject({ status: 'CANCELLED', cancelReason: 'Entered twice' });
    expect((await as('ACCOUNTS').post(`/api/v2/receipts/${got.id}/cancel`, { reason: 'again' })).status).toBe(409);
    // The row stays, the posting is reversed, and the family's paid amount drops.
    expect(await prisma.customerReceipt.count()).toBe(2);
    const original = (await as('ACCOUNTS').get(`/api/v2/ledger/entries/${got.ledgerTransactionId}`)).body;
    expect(original.reversedBy).not.toBeNull();
    expect((await as('ACCOUNTS').get('/api/v2/ledger/trial-balance')).body.accounts.find((a: { code: string }) => a.code === '1000').balance).toBe(-1500);
    expect((await as('ACCOUNTS').get(`/api/v2/contracts/${kelkar.id}`)).body.received).toBe(-1500);
  });

  it('money for the whole tour can be held on the trip; lists, totals and the day book add up', async () => {
    await seedTrip('GK-2026-0001', { customerId: 'CUS-2026-0001' });
    await as('ACCOUNTS').post('/api/v2/receipts', { tripId: 'GK-2026-0001', amount: 20_000, mode: 'BANK_TRANSFER', receivedAt: istToday(), reference: 'NEFT-9' });
    await as('ACCOUNTS').post('/api/v2/receipts', { tripId: 'GK-2026-0001', amount: 5_000, mode: 'CASH', receivedAt: istToday() });
    await as('ACCOUNTS').post('/api/v2/receipts', { kind: 'REFUND', tripId: 'GK-2026-0001', amount: 2_000, mode: 'CASH', receivedAt: istToday() });

    const list = (await as('ACCOUNTS').get('/api/v2/receipts?tripId=GK-2026-0001')).body;
    expect(list.total).toBe(3);
    expect(list.totals).toMatchObject({ received: 25_000, refunded: 2_000, net: 23_000 });
    expect(await prisma.trip.findUniqueOrThrow({ where: { id: 'GK-2026-0001' } })).toMatchObject({ paidAmount: 23_000 });

    const book = (await as('ACCOUNTS').get('/api/v2/receipts/day-book')).body;
    expect(book.day).toBe(istToday());
    expect(book.total).toBe(23_000);
    expect(book.byMode.map((m: { mode: string; amount: number }) => [m.mode, m.amount]).sort()).toEqual([['BANK_TRANSFER', 20_000], ['CASH', 3_000]]);
    expect((await as('ACCOUNTS').get('/api/v2/receipts?mode=CASH')).body.total).toBe(2);
    expect((await as('ACCOUNTS').get('/api/v2/receipts?q=NEFT-9')).body.total).toBe(1);
  });

  it('classic payments are carried into the books once, and an unrecorded method waits in Unsorted receipts', async () => {
    await seedTrip('GK-2026-0001', { customerId: 'CUS-2026-0001', totalPayable: 50_000 });
    await prisma.payment.createMany({ data: [
      { id: 'PAY-1', type: 'customer', tripId: 'GK-2026-0001', customerId: 'CUS-2026-0001', amount: 15_000, method: 'Cash', date: '2026-02-01', status: 'received', createdAt: new Date('2026-02-01') },
      { id: 'PAY-2', type: 'customer', tripId: 'GK-2026-0001', customerId: 'CUS-2026-0001', amount: 10_000, method: 'NEFT to ICICI', date: '2026-02-10', status: 'paid', createdAt: new Date('2026-02-10') },
      { id: 'PAY-3', type: 'customer', tripId: 'GK-2026-0001', customerId: 'CUS-2026-0001', amount: 5_000, method: '', date: '2026-02-12', status: 'received', createdAt: new Date('2026-02-12') },
      { id: 'PAY-4', type: 'customer', tripId: 'GK-2026-0001', amount: 9_000, method: 'Cash', date: 'not a date', status: 'received', createdAt: new Date('2026-02-13') },
      { id: 'PAY-5', type: 'supplier', tripId: 'GK-2026-0001', amount: 7_000, method: 'Cash', date: '2026-02-14', status: 'paid', createdAt: new Date('2026-02-14') },
      { id: 'PAY-6', type: 'customer', tripId: 'GK-2026-0001', amount: 3_000, method: 'Cash', date: '2026-02-15', status: 'pending', createdAt: new Date('2026-02-15') },
    ] });

    const first = (await as('ACCOUNTS').post('/api/v2/receipts/import-classic')).body;
    expect(first).toMatchObject({ imported: 3, skipped: 1, unsorted: 1 });     // supplier and pending rows are left alone
    const again = (await as('ACCOUNTS').post('/api/v2/receipts/import-classic')).body;
    expect(again.imported).toBe(0);                                            // idempotent

    const rows = await prisma.customerReceipt.findMany({ orderBy: { receivedAt: 'asc' } });
    expect(rows.map(r => [r.legacyPaymentId, r.mode, Number(r.amount)])).toEqual([['PAY-1', 'CASH', 15_000], ['PAY-2', 'BANK_TRANSFER', 10_000], ['PAY-3', 'OTHER', 5_000]]);
    expect(await prisma.payment.count()).toBe(6);                              // the classic rows are untouched
    expect(await prisma.trip.findUniqueOrThrow({ where: { id: 'GK-2026-0001' } })).toMatchObject({ paidAmount: 30_000, balanceDue: 20_000 });

    const tb = (await as('ACCOUNTS').get('/api/v2/ledger/trial-balance')).body;
    expect(tb.difference).toBe(0);
    expect(tb.accounts.find((a: { code: string }) => a.code === '1030')).toMatchObject({ name: 'Unsorted receipts', balance: 5_000 });
    expect(tb.accounts.find((a: { code: string }) => a.code === '2100').balance).toBe(30_000);
  });

  it('only finance roles record money; everyone else is refused', async () => {
    await seedTrip('GK-2026-0001', { customerId: 'CUS-2026-0001' });
    const body = { tripId: 'GK-2026-0001', amount: 1_000, mode: 'CASH', receivedAt: istToday() };
    for (const role of ['BOOKING', 'OPERATIONS'] as const) {
      expect((await as(role).post('/api/v2/receipts', body)).status, role).toBe(403);
      expect((await as(role).get('/api/v2/receipts')).status, role).toBe(403);
    }
    const ok = await as('ADMIN').post('/api/v2/receipts', body);
    expect(ok.status).toBe(201);
    expect((await as('BOOKING').post(`/api/v2/receipts/${ok.body.id}/cancel`, { reason: 'no' })).status).toBe(403);
    // Nonsense is refused: no amount, no owner, a cheque with no number.
    expect((await as('ACCOUNTS').post('/api/v2/receipts', { ...body, amount: 0 })).status).toBe(400);
    expect((await as('ACCOUNTS').post('/api/v2/receipts', { amount: 100, mode: 'CASH', receivedAt: istToday() })).status).toBe(400);
    expect((await as('ACCOUNTS').post('/api/v2/receipts', { ...body, mode: 'CHEQUE' })).status).toBe(400);
    expect((await as('ACCOUNTS').post('/api/v2/receipts', { ...body, tripId: 'GK-9999-9999' })).status).toBe(400);
  });
});
