// Hard rule 7: identity numbers are encrypted at rest, masked on display and
// every reveal is audited — through v2, the legacy routes and the bootstrap.
import { describe, it, expect, beforeEach } from 'vitest';
import { hasTestDb, prisma, resetDb, seedUser } from './helpers/db';
import { as, USER_IDS } from './helpers/app';
import { encryptLegacyIdentityBatch } from '../../server/src/core/identity';

async function allAuditText(): Promise<string> {
  const rows = await prisma.activityLog.findMany();
  return JSON.stringify(rows);
}

describe.skipIf(!hasTestDb)('identity data protection', () => {
  beforeEach(async () => {
    await resetDb();
    for (const role of ['ADMIN', 'BOOKING', 'ACCOUNTS', 'OPERATIONS'] as const) await seedUser(USER_IDS[role], role);
  });

  it('stores passport and Aadhaar sealed, returns masks, finds duplicates and exact matches by blind index', async () => {
    const res = await as('BOOKING').post('/api/v2/travellers', { firstName: 'Shri Ramesh', lastName: 'Patil', passportNumber: 'k1234567', govtIdType: 'AADHAAR', govtIdNumber: '2341 2341 2346' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({ passportNumber: 'XXXX-XXXX-4567', govtIdNumber: 'XXXX-XXXX-2346' });
    expect(res.body).not.toHaveProperty('passportNumberEnc');

    const row = await prisma.traveller.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.passportNumber).toBeNull();
    expect(row.govtIdNumber).toBeNull();
    expect(row.passportNumberEnc).toMatch(/^v1:/);
    expect(row.govtIdNumberEnc).toMatch(/^v1:/);
    expect(JSON.stringify(row)).not.toContain('K1234567');
    expect(JSON.stringify(row)).not.toContain('234123412346');

    const dup = await as('BOOKING').post('/api/v2/travellers', { firstName: 'Other', passportNumber: ' K 123-4567 ' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.message).toContain('XXXX-XXXX-4567');
    expect(dup.body.error.message).not.toContain('K1234567');

    const found = (await as('OPERATIONS').get('/api/v2/travellers?q=K1234567')).body;
    expect(found.items.map((t: { id: string }) => t.id)).toEqual([res.body.id]);
    expect(found.items[0].passportNumber).toBe('XXXX-XXXX-4567');
    expect((await as('OPERATIONS').get('/api/v2/travellers?q=1234567')).body.total).toBe(0);
    expect((await as('OPERATIONS').get(`/api/v2/travellers/${res.body.id}`)).body.passportNumber).toBe('XXXX-XXXX-4567');

    expect(await allAuditText()).not.toContain('K1234567');
    expect(await allAuditText()).not.toContain('234123412346');
  });

  it('rejects an invalid Aadhaar and treats an echoed mask as unchanged', async () => {
    const bad = await as('BOOKING').post('/api/v2/travellers', { firstName: 'A', govtIdType: 'AADHAAR', govtIdNumber: '234123412345' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields.govtIdNumber).toMatch(/Aadhaar/);

    const t = (await as('BOOKING').post('/api/v2/travellers', { firstName: 'Smt Sunita', passportNumber: 'M7654321' })).body;
    const before = await prisma.traveller.findUniqueOrThrow({ where: { id: t.id } });
    const upd = await as('BOOKING').put(`/api/v2/travellers/${t.id}`, { passportNumber: 'XXXX-XXXX-4321', nationality: 'Indian' });
    expect(upd.status).toBe(200);
    const after = await prisma.traveller.findUniqueOrThrow({ where: { id: t.id } });
    expect(after.passportNumberEnc).toBe(before.passportNumberEnc);
    expect(after.nationality).toBe('Indian');

    const cleared = await as('BOOKING').put(`/api/v2/travellers/${t.id}`, { passportNumber: null });
    expect(cleared.body.passportNumber).toBeNull();
    expect((await prisma.traveller.findUniqueOrThrow({ where: { id: t.id } })).passportNumberHash).toBeNull();
  });

  it('reveals the full number only through the audited endpoint', async () => {
    const t = (await as('BOOKING').post('/api/v2/travellers', { firstName: 'Shri Anil', passportNumber: 'Z9988776' })).body;
    const r = await as('OPERATIONS').post(`/api/v2/travellers/${t.id}/reveal`, { field: 'passportNumber', reason: 'Airline APIS form' });
    expect(r.status).toBe(200);
    expect(r.body.value).toBe('Z9988776');
    expect(r.headers['cache-control']).toBe('no-store');
    const log = await prisma.activityLog.findFirstOrThrow({ where: { action: 'identity_revealed', entityId: t.id } });
    expect(log.userId).toBe(USER_IDS.OPERATIONS);
    expect(log.description).toContain('Airline APIS form');
    expect(JSON.stringify(log)).not.toContain('Z9988776');

    expect((await as('OPERATIONS').post(`/api/v2/travellers/${t.id}/reveal`, { field: 'govtIdNumber' })).status).toBe(400);
  });

  it('legacy routes and the bootstrap never return or overwrite with plaintext', async () => {
    const t = (await as('BOOKING').post('/api/v2/travellers', { firstName: 'Legacy', lastName: 'Screen', passportNumber: 'P1112223' })).body;
    const sealedBefore = (await prisma.traveller.findUniqueOrThrow({ where: { id: t.id } })).passportNumberEnc;

    const list = (await as('BOOKING').get('/api/passengers')).body;
    expect(list[0].passportNumber).toBe('XXXX-XXXX-2223');
    // The classic trip screen PUTs the whole passenger back, mask included.
    const put = await as('BOOKING').put(`/api/passengers/${t.id}`, { ...list[0], notes: 'window seat' });
    expect(put.status).toBe(200);
    const after = await prisma.traveller.findUniqueOrThrow({ where: { id: t.id } });
    expect(after.passportNumberEnc).toBe(sealedBefore);
    expect(after.notes).toBe('window seat');

    // A classic write of a new number is sealed too.
    await as('BOOKING').put(`/api/passengers/${t.id}`, { ...list[0], passportNumber: 'Q5556667' });
    const resealed = await prisma.traveller.findUniqueOrThrow({ where: { id: t.id } });
    expect(resealed.passportNumber).toBeNull();
    expect(resealed.passportLast4).toBe('6667');

    const c = await as('BOOKING').post('/api/customers', { id: 'CUS-2026-0901', name: 'Kulkarni', phone: '9800000001', passportNo: 'R1231231' });
    expect(c.body.passportNo).toBe('XXXX-XXXX-1231');
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: 'CUS-2026-0901' } })).passportNo).toBeNull();

    const boot = (await as('BOOKING').get('/api/data/all')).body;
    expect(JSON.stringify(boot)).not.toMatch(/Q5556667|R1231231|P1112223/);
    expect(boot.customers[0].passportNo).toBe('XXXX-XXXX-1231');
    expect(JSON.stringify(boot)).not.toContain('passportNumberEnc');
  });

  it('customers v2 seal the passport and reveal it with an audit row', async () => {
    const c = await as('BOOKING').post('/api/v2/customers', { name: 'Deshpande Family', phone: '9800000002', passportNo: 't7778889' });
    expect(c.status).toBe(201);
    expect(c.body.passportNo).toBe('XXXX-XXXX-8889');
    expect((await as('BOOKING').get(`/api/v2/customers/${c.body.id}`)).body.customer.passportNo).toBe('XXXX-XXXX-8889');
    const r = await as('ACCOUNTS').post(`/api/v2/customers/${c.body.id}/reveal`, {});
    expect(r.body.value).toBe('T7778889');
    expect(await prisma.activityLog.count({ where: { action: 'identity_revealed', entityId: c.body.id } })).toBe(1);
  });

  it('the legacy-plaintext job seals old rows once and is then a no-op', async () => {
    await prisma.traveller.create({ data: { id: 'PAX-OLD-1', firstName: 'Old', lastName: 'Row', passportNumber: 'J4445556', govtIdType: 'PAN', govtIdNumber: 'ABCDE1234F', createdDate: '2026-01-01' } });
    await prisma.customer.create({ data: { id: 'CUS-OLD-1', name: 'Old Customer', phone: '9000000009', createdDate: '2026-01-01', passportNo: 'H1212121' } });
    expect((await as('BOOKING').get('/api/v2/travellers/PAX-OLD-1')).body.passportNumber).toBe('XXXX-XXXX-5556');

    expect(await encryptLegacyIdentityBatch()).toEqual({ travellers: 1, customers: 1 });
    const t = await prisma.traveller.findUniqueOrThrow({ where: { id: 'PAX-OLD-1' } });
    expect(t).toMatchObject({ passportNumber: null, govtIdNumber: null, passportLast4: '5556', govtIdLast4: '234F' });
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: 'CUS-OLD-1' } })).passportNo).toBeNull();
    expect((await as('ADMIN').post('/api/v2/travellers/PAX-OLD-1/reveal', { field: 'govtIdNumber' })).body.value).toBe('ABCDE1234F');
    expect((await as('ADMIN').post('/api/v2/customers/CUS-OLD-1/reveal', {})).body.value).toBe('H1212121');
    expect(await encryptLegacyIdentityBatch()).toEqual({ travellers: 0, customers: 0 });
    expect(await prisma.activityLog.count({ where: { action: 'identity_encrypted' } })).toBe(1);
  });
});
