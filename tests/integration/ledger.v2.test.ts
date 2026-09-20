// The ledger: balanced postings only, nothing edited or deleted (reversal
// instead), trial balance and account statements, permissions and audit.
import { describe, it, expect, beforeEach } from 'vitest';
import { hasTestDb, prisma, resetDb, seedUser, seedCustomer, seedTrip } from './helpers/db';
import { as, USER_IDS } from './helpers/app';

const entry = (over: Record<string, unknown> = {}) => ({
  date: '2026-04-10', narration: 'Cash received from Shri Patil', lines: [{ code: '1000', debit: 25_000 }, { code: '2100', credit: 25_000 }], ...over,
});

describe.skipIf(!hasTestDb)('ledger v2', () => {
  beforeEach(async () => {
    await resetDb();
    for (const role of ['ADMIN', 'BOOKING', 'ACCOUNTS', 'OPERATIONS'] as const) await seedUser(USER_IDS[role], role);
    await seedCustomer();
  });

  it('seeds the chart of accounts and posts a balanced entry with a journal number and audit row', async () => {
    const accounts = (await as('ACCOUNTS').get('/api/v2/ledger/accounts')).body;
    expect(accounts.length).toBeGreaterThan(20);
    expect(accounts.find((a: { code: string }) => a.code === '1010')).toMatchObject({ name: 'Bank account', type: 'ASSET', balance: 0 });

    const r = await as('ACCOUNTS').post('/api/v2/ledger/entries', entry());
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body).toMatchObject({ displayNumber: `JV-${new Date().getFullYear()}-0001`, date: '2026-04-10', sourceType: 'manual', amount: 25_000 });
    expect(r.body.lines.map((l: { code: string; debit: number; credit: number }) => [l.code, l.debit, l.credit])).toEqual([['1000', 25_000, 0], ['2100', 0, 25_000]]);

    const log = await prisma.activityLog.findFirstOrThrow({ where: { action: 'ledger_posted' } });
    expect(log.description).toContain('Cash received from Shri Patil');
    expect((await as('ACCOUNTS').get('/api/v2/ledger/accounts')).body.find((a: { code: string }) => a.code === '1000').balance).toBe(25_000);
  });

  it('refuses an entry that does not balance, has an unknown account or only one line', async () => {
    const bad = await as('ACCOUNTS').post('/api/v2/ledger/entries', entry({ lines: [{ code: '1000', debit: 25_000 }, { code: '2100', credit: 24_000 }] }));
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toMatch(/Debits \(25000.00\) and credits \(24000.00\) must be equal/);
    expect((await as('ACCOUNTS').post('/api/v2/ledger/entries', entry({ lines: [{ code: '9999', debit: 10 }, { code: '1000', credit: 10 }] }))).status).toBe(400);
    expect((await as('ACCOUNTS').post('/api/v2/ledger/entries', entry({ lines: [{ code: '1000', debit: 10 }] }))).status).toBe(400);
    expect((await as('ACCOUNTS').post('/api/v2/ledger/entries', entry({ lines: [{ code: '1000', debit: 10, credit: 10 }, { code: '4000', credit: 10 }] }))).status).toBe(400);
    expect(await prisma.ledgerTransaction.count()).toBe(0);
  });

  it('corrects a mistake by reversal, never by editing; a reversal cannot be reversed again', async () => {
    const posted = (await as('ACCOUNTS').post('/api/v2/ledger/entries', entry())).body;
    const rev = await as('ACCOUNTS').post(`/api/v2/ledger/entries/${posted.id}/reverse`, { reason: 'Entered against the wrong customer' });
    expect(rev.status, JSON.stringify(rev.body)).toBe(200);
    expect(rev.body.narration).toBe(`Reversal of ${posted.displayNumber}: Entered against the wrong customer`);
    expect(rev.body.lines.map((l: { code: string; debit: number; credit: number }) => [l.code, l.debit, l.credit])).toEqual([['1000', 0, 25_000], ['2100', 25_000, 0]]);
    expect(rev.body.reversalOf).toMatchObject({ id: posted.id });

    const again = await as('ACCOUNTS').post(`/api/v2/ledger/entries/${posted.id}/reverse`, { reason: 'twice' });
    expect(again.status).toBe(409);
    expect((await as('ACCOUNTS').post(`/api/v2/ledger/entries/${rev.body.id}/reverse`, { reason: 'undo the undo' })).status).toBe(409);

    // Both entries stay in the books and the accounts are back to zero.
    const original = (await as('ACCOUNTS').get(`/api/v2/ledger/entries/${posted.id}`)).body;
    expect(original.reversedBy).toMatchObject({ displayNumber: rev.body.displayNumber });
    const tb = (await as('ACCOUNTS').get('/api/v2/ledger/trial-balance')).body;
    expect(tb.difference).toBe(0);
    expect(tb.accounts.find((a: { code: string }) => a.code === '1000').balance).toBe(0);
    expect(await prisma.ledgerTransaction.count()).toBe(2);
    expect(await prisma.activityLog.count({ where: { action: 'ledger_reversed' } })).toBe(1);
  });

  it('trial balance and account statements read a period, with opening balance and running total', async () => {
    await seedTrip('GK-2026-0001', { customerId: 'CUS-2026-0001' });
    const post = (b: Record<string, unknown>) => as('ACCOUNTS').post('/api/v2/ledger/entries', b);
    await post(entry({ date: '2026-03-31', narration: 'Advance in March', lines: [{ code: '1010', debit: 10_000 }, { code: '2100', credit: 10_000 }] }));
    await post(entry({ date: '2026-04-05', narration: 'Advance for Kashi Yatra', tripId: 'GK-2026-0001', customerId: 'CUS-2026-0001', lines: [{ code: '1010', debit: 40_000 }, { code: '2100', credit: 40_000 }] }));
    await post(entry({ date: '2026-04-20', narration: 'Hotel bill paid', tripId: 'GK-2026-0001', lines: [{ code: '5000', debit: 18_000 }, { code: '1010', credit: 18_000 }] }));

    const april = (await as('ACCOUNTS').get('/api/v2/ledger/trial-balance?from=2026-04-01&to=2026-04-30')).body;
    expect(april.difference).toBe(0);
    expect(april.accounts.find((a: { code: string }) => a.code === '1010').balance).toBe(22_000);
    expect(april.byType).toMatchObject({ EXPENSE: 18_000, LIABILITY: 40_000 });

    const st = (await as('ACCOUNTS').get('/api/v2/ledger/accounts/1010/statement?from=2026-04-01&to=2026-04-30')).body;
    expect(st.account).toMatchObject({ code: '1010', name: 'Bank account' });
    expect(st.opening).toBe(10_000);                       // the March advance
    expect(st.rows.map((r: { balance: number }) => r.balance)).toEqual([50_000, 32_000]);
    expect(st.closing).toBe(32_000);

    const trip = (await as('ACCOUNTS').get('/api/v2/ledger/entries?tripId=GK-2026-0001')).body;
    expect(trip.items.map((e: { narration: string }) => e.narration)).toEqual(['Hotel bill paid', 'Advance for Kashi Yatra']);
    expect((await as('ACCOUNTS').get('/api/v2/ledger/entries?code=5000')).body.total).toBe(1);
    expect((await as('ACCOUNTS').get('/api/v2/ledger/entries?q=kashi')).body.total).toBe(1);
  });

  it('only finance roles reach the books', async () => {
    const posted = (await as('ADMIN').post('/api/v2/ledger/entries', entry())).body;
    for (const role of ['BOOKING', 'OPERATIONS'] as const) {
      expect((await as(role).get('/api/v2/ledger/accounts')).status, role).toBe(403);
      expect((await as(role).get('/api/v2/ledger/entries')).status, role).toBe(403);
      expect((await as(role).post('/api/v2/ledger/entries', entry())).status, role).toBe(403);
      expect((await as(role).post(`/api/v2/ledger/entries/${posted.id}/reverse`, { reason: 'no' })).status, role).toBe(403);
    }
    expect((await as('ACCOUNTS').get('/api/v2/ledger/entries')).status).toBe(200);
  });
});
